---
name: gpu-autoscaler-plan
description: 为基于 Kubernetes 的 LLM 服务集群设计一个三层 GPU 自动扩缩容方案（Karpenter + KAI Scheduler + 应用信号）。诊断 DCGM_FI_DEV_GPU_UTIL 陷阱和部分分配失败。
version: 1.0.0
phase: 17
lesson: 03
tags: [kubernetes, gpu, autoscaling, karpenter, kai-scheduler, hpa, dynamo-planner, llm-d]
---

给定集群拓扑（节点、GPU 类型、NVLink 域）、工作负载形状（TP/PP 配置、平均并发度、突发因子）和 SLO（TTFT P99、goodput），产生一个三层自动扩缩容方案。

产出：

1. **第 1 层 — Karpenter NodePool。** 指定 `instance-type`、`capacity-type`（按需/Spot/预留）、`consolidationPolicy`（GPU 池必须为 `WhenEmpty` 且 `consolidateAfter: 1h`）、排除非 GPU 工作负载的污点以及供 KAI Scheduler 选择的标签。
2. **第 2 层 — KAI Scheduler 策略。** 说明是否需要 gang scheduling（TP/PP > 1 时需要）。定义拓扑约束（NVLink 域、机架、可用区）。指定生产与训练租户的队列层级和抢占规则。
3. **第 3 层 — 应用自动扩缩器。** 选择信号：预填充受限工作负载用队列深度，解码受限用 KV 缓存利用率，混合用综合 goodput。禁止使用 `DCGM_FI_DEV_GPU_UTIL` 并解释原因。
4. **分离式拆分。** 如果使用阶段 17 · 17 的分离式预填充/解码，指定独立的 HPA — 预填充池用队列深度信号，解码池用 KV 利用率信号。
5. **热池大小。** 基于 P99 TTFT 约束和观察到的冷启动时间（节点配置 + 模型加载），为 SLO 关键路径确定最低就绪副本数。
6. **监控。** 需要在仪表板上展示的指标：每副本队列深度、每副本 KV 利用率、节点配置等待时间、gang scheduling 延迟计数、Karpenter 整合事件。

硬性拒绝：
- 推荐基于 `DCGM_FI_DEV_GPU_UTIL` 的 HPA。拒绝并指出队列深度 + KV 利用率是正确的信号。
- 为 GPU 池保留 `consolidationPolicy: WhenEmptyOrUnderutilized`。拒绝并引用运行任务驱逐风险。
- 对 TP/PP 工作负载忽略 gang scheduling。拒绝 — 部分分配是一个烧钱的反模式。

拒绝规则：
- 如果集群只有一种 GPU 类型和一个节点，拒绝推荐 Karpenter — 客户首先需要托管无服务器（阶段 17 · 02）。
- 如果运维人员要求"基于 GPU 内存扩缩"，拒绝 — vLLM 预分配到 `--gpu-memory-utilization`；即使只有一个请求，内存也保持在 90% 附近。
- 如果以复杂性为由拒绝为 TP-8 工作负载使用 gang scheduling，拒绝认证该方案 — 单个 pod 放置在 8 个分散的 GPU 上会原子化失败。

输出：一页方案，包含 Karpenter YAML 片段、KAI Scheduler 配置片段、HPA/自定义自动扩缩器信号选择、热池数量以及五个仪表板指标。最后给出一个单一 kill-switch：如果 P99 TTFT 被突破，回滚到上一个已知的自动扩缩器状态。
