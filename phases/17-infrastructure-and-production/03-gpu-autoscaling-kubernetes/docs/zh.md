# Kubernetes 上的 GPU 自动扩缩容 — Karpenter、KAI Scheduler、Gang Scheduling

> 三层，而非一层。Karpenter 动态配置节点（一分钟内，比 Cluster Autoscaler 快 40%）。KAI Scheduler 处理 gang scheduling、拓扑感知和层级队列 — 它防止 7/8 部分分配陷阱：七个节点等待并烧钱，只差一个缺失的 GPU。应用级自动扩缩器（NVIDIA Dynamo Planner、llm-d Workload Variant Autoscaler）基于推理特有信号 — 队列深度、KV 缓存利用率 — 而非 CPU/DCGM 占空比进行扩缩。经典的 HPA 陷阱在于 `DCGM_FI_DEV_GPU_UTIL` 是一个占空比测量：100% 可能意味着 10 个请求或 100 个。vLLM 预分配 KV 缓存内存，因此内存永远不会触发缩容。本课教你组合这三个层次，并避免默认的 Karpenter `WhenEmptyOrUnderutilized` 策略在推理中途终止正在运行的 GPU 任务。

**类型：** 学习
**语言：** Python（标准库，玩具队列深度自动扩缩器模拟器）
**前置知识：** 阶段 17 · 02（推理平台经济学）、阶段 17 · 04（vLLM 服务内部原理）
**时间：** ~75 分钟

## 学习目标

- 绘制三个自动扩缩容层次（节点配置、gang scheduling、应用级）并指出每层使用的工具。
- 解释为什么 `DCGM_FI_DEV_GPU_UTIL` 对于 vLLM 是错误的 HPA 信号，并指出两个替代信号（队列深度、KV 缓存利用率）。
- 描述 gang scheduling 以及 KAI Scheduler 防止的部分分配失败模式（7/8 GPU 空闲）。
- 指出会终止正在运行的 GPU 任务的 Karpenter 整合策略（`WhenEmptyOrUnderutilized`），并说明 2026 年的安全替代方案。

## 问题

你的团队在 Kubernetes 上部署了 LLM 服务。你设置了基于 `DCGM_FI_DEV_GPU_UTIL` 信号的 HPA。服务在工作时间固定在 100% 利用率。HPA 从未扩容 — 它已经认为你满了。你手动添加了一个副本；TTFT 下降了。HPA 仍然没有扩容。信号在欺骗你。

另外，你使用 Cluster Autoscaler 进行节点管理。凌晨 2 点一个 1M token 的提示到达；集群花了 3 分钟配置一个节点，请求超时。

再另外，你部署了一个需要跨 2 个节点使用 8 个 GPU 的 70B 模型。集群有 7 个空闲 GPU 和 1 个分布在 3 个节点上。Cluster Autoscaler 为那 1 个缺失的 GPU 配置了一个节点。七个节点等待了 4 分钟烧钱，同时 Kubernetes 让最后一个 GPU 就绪。

三层，三种不同的失败模式。2026 年的 GPU 感知自动扩缩容不是"打开 HPA"。它是组合节点配置、gang scheduling 和应用信号自动扩缩容。

## 概念

### 第 1 层 — 节点配置（Karpenter）

Karpenter 监视待处理的 pod 并在约 45-60 秒内配置节点（Cluster Autoscaler 通常需要 90-120 秒来处理 GPU 节点）。它根据 `NodePool` 约束动态选择实例类型 — 如果你的 pod 需要 8 个 H100 且集群没有匹配节点，Karpenter 直接配置一个，而不是扩展现有组。

**整合陷阱**：Karpenter 的默认 `consolidationPolicy: WhenEmptyOrUnderutilized` 对 GPU 池很危险。它会终止一个正在运行的 GPU 节点，将 pod 迁移到更便宜的合适实例。对于推理工作负载，这意味着驱逐正在运行的请求并在新节点上重新加载 70B 模型。损失是数分钟的容量加请求失败。

GPU 池的安全设置：

```yaml
disruption:
  consolidationPolicy: WhenEmpty
  consolidateAfter: 1h
```

让 Karpenter 在一小时后整合真正空的节点，但绝不驱逐正在运行的任务。

### 第 2 层 — Gang Scheduling（KAI Scheduler）

KAI Scheduler（项目名"Karp"后改名）处理默认 kube-scheduler 做不到的事情：

**Gang scheduling** — 全有或全无调度。一个需要 8 个 GPU 的分布式推理 pod 要么全部 8 个一起启动，要么一个都不启动。没有这个机制，就会出现部分分配陷阱：7/8 的 pod 启动，无限等待，烧钱。

**拓扑感知** — 知道哪些 GPU 共享 NVLink，哪些位于同一机架，哪些之间有 InfiniBand。相应地放置 pod。DeepSeek-V3 67B 张量并行工作负载必须停留在一个 NVLink 域内；KAI Scheduler 尊重这一点。

**层级队列** — 多个团队竞争同一个 GPU 池，具有优先级和配额。团队 A 的生产急单只有在优先级规则允许时才被团队 B 的训练任务抢占。

KAI 作为辅助调度器与 kube-scheduler 一起部署；你在工作负载上添加注解以使用它。Ray 和 vLLM 生产栈都集成。

### 第 3 层 — 应用级信号

**HPA 陷阱**：`DCGM_FI_DEV_GPU_UTIL` 是一个占空比指标 — 它测量 GPU 在每个采样间隔是否在做工作。100% 利用率可能意味着 10 个并发请求或 100 个；无论哪种方式 GPU 都是忙的。基于占空比扩缩是盲目扩缩。

更糟糕的是，vLLM 和类似引擎预分配 KV 缓存内存（最高到 `--gpu-memory-utilization`）。即使只有一个请求，内存使用也保持在 90% 附近。基于内存的 HPA 永远不会缩容。

**2026 年替代信号**：

- 队列深度（等待预填充的请求数）。
- KV 缓存利用率（分配给活动序列的块的比例）。
- 每副本 P99 TTFT（你的 SLA 信号）。
- Goodput（每秒满足所有 SLO 的请求数）。

NVIDIA Dynamo Planner 和 llm-d Workload Variant Autoscaler 使用这些信号并扩缩副本。它们完全替代了 LLM 服务中的 HPA。

### 何时使用什么

| 扩缩决策 | 工具 |
|-----------|------|
| 添加/移除节点 | Karpenter |
| 调度多 GPU 任务 | KAI Scheduler |
| 添加/移除副本 | Dynamo Planner / llm-d WVA（或基于队列深度的自定义 HPA） |
| 选择 GPU 类型 | Karpenter NodePool |
| 抢占低优先级 | KAI Scheduler 队列 |

### 分离式预填充/解码使一切更复杂

如果你运行分离式预填充/解码（阶段 17 · 17），你有两种具有不同扩缩触发器的 pod 类别：预填充 pod 基于队列深度扩缩，解码 pod 基于 KV 缓存压力扩缩。llm-d 将这些作为带有按角色 HPA 的独立 `Services` 暴露。不要尝试在两者前面放置单个 HPA。

### 冷启动在这里也很重要

冷启动缓解（阶段 17 · 10）是节点配置时间变得用户可见的地方。Karpenter 的 45-60 秒预热加上 20GB 模型加载加上引擎初始化意味着从零开始的请求需要 2-5 分钟。为 SLO 关键路径保留一个热池（`min_workers=1`），或在应用层使用 Modal 风格的检查点。

### 你应该记住的数字

- Karpenter 节点配置：~45-60s vs Cluster Autoscaler ~90-120s（GPU 节点）。
- KAI Scheduler 防止部分分配浪费 — 7/8 陷阱。
- `DCGM_FI_DEV_GPU_UTIL` 作为 HPA 信号：有缺陷；应使用队列深度或 KV 利用率。
- Karpenter `WhenEmptyOrUnderutilized`：终止正在运行的 GPU 任务。对推理使用 `WhenEmpty + consolidateAfter: 1h`。

```figure
autoscaling
```

## 使用它

`code/main.py` 在突发 GPU 工作负载上模拟一个三层自动扩缩器。比较朴素 HPA（占空比）、队列深度 HPA 和 KAI gang 调度扩缩。报告未满足的请求、空闲 GPU 分钟数和综合评分。

## 交付物

本课产出 `outputs/skill-gpu-autoscaler-plan.md`。给定集群拓扑、工作负载形状和 SLO，设计一个三层自动扩缩容计划。

## 练习

1. 运行 `code/main.py`。在突发工作负载下，朴素占空比 HPA 丢掉了多少队列深度 HPA 能够接住的请求？差异来自哪里？
2. 为在 H100 SXM5 上服务 Llama 3.3 70B FP8 的集群设计一个 Karpenter NodePool。指定 `capacity-type`、`disruption.consolidationPolicy`、`consolidateAfter` 和一个让非 GPU 工作负载远离这些节点的污点。
3. 你的团队报告部署卡在 Pending 状态，原因是"GPU 可用但 pod 无法调度"。诊断 — 这是 Karpenter、kube-scheduler 还是 KAI Scheduler 的问题？哪些指标可以确认？
4. 选择用于自动扩缩分离式预填充 pod 的信号和用于解码 pod 的不同信号。证明两者合理。
5. 计算一个 24x7 生产服务上 `WhenEmptyOrUnderutilized` 整合陷阱的成本，该服务平均每天发生 60 次请求丢弃事件，P99 TTFT > 10s。

## 关键术语

| 术语 | 人们说的是 | 实际含义 |
|------|-----------|---------|
| Karpenter | "节点配置器" | Kubernetes 节点自动扩缩器；亚分钟级配置 |
| Cluster Autoscaler | "旧版扩缩器" | Kubernetes 节点自动扩缩器前身；较慢，基于组 |
| KAI Scheduler | "GPU 调度器" | 用于 gang + 拓扑 + 队列的辅助调度器 |
| Gang scheduling | "全有或全无" | 原子化调度 N 个 pod，否则全部推迟 |
| 拓扑感知 | "机架感知" | 基于 NVLink/IB/机架放置 pod |
| `DCGM_FI_DEV_GPU_UTIL` | "GPU 利用率" | 占空比指标；不是 LLM 的扩缩信号 |
| 队列深度 | "等待请求数" | 预填充受限扩缩的正确 HPA 信号 |
| KV 缓存利用率 | "内存压力" | 解码受限扩缩的正确 HPA 信号 |
| 整合 | "Karpenter 整合" | 终止节点以迁移到更便宜的实例类型 |
| `WhenEmpty + 1h` | "安全整合" | 不驱逐正在运行的 GPU 任务的策略 |

## 进一步阅读

- [KAI Scheduler GitHub](https://github.com/kai-scheduler/KAI-Scheduler) — 设计文档和配置示例。
- [Karpenter 中断控制](https://karpenter.sh/docs/concepts/disruption/) — 整合策略语义和 GPU 安全默认值。
- [NVIDIA — Kubernetes 上的分离式 LLM 推理](https://developer.nvidia.com/blog/deploying-disaggregated-llm-inference-workloads-on-kubernetes/) — Dynamo Planner 扩缩信号。
- [Ray 文档 — RayClusters 的 KAI Scheduler](https://docs.ray.io/en/latest/cluster/kubernetes/k8s-ecosystem/kai-scheduler.html) — Ray 集成模式。
- [AWS EKS 计算和自动扩缩最佳实践](https://docs.aws.amazon.com/eks/latest/best-practices/aiml-compute.html) — 托管 Kubernetes 特定指南。
- [llm-d GitHub](https://github.com/llm-d/llm-d) — Workload Variant Autoscaler 设计。
