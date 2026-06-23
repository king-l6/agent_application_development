# 分离式预填充/解码 —— NVIDIA Dynamo 和 llm-d

> 预填充是计算密集型的；解码是内存密集型的。在同一 GPU 上运行两者会浪费一种资源。分离将它们拆分到独立的池中，并通过 NIXL（RDMA/InfiniBand 或 TCP 回退）在它们之间传输 KV 缓存。NVIDIA Dynamo（GTC 2025 宣布，1.0 正式版）位于 vLLM/SGLang/TRT-LLM 之上——其 Planner Profiler + SLA Planner 自动匹配预填充:解码比率以满足 SLO。NVIDIA 公布了这个量级的吞吐量提升——developer.nvidia.com（2025年6月）显示 DeepSeek-R1 MoE 在 GB200 NVL72 + Dynamo 上的中延迟场景中实现了约6倍的改进，而 Dynamo 产品页面（developer.nvidia.com，日期不详）宣传 GB300 NVL72 + Dynamo 相比 Hopper 的 MoE 吞吐量提升高达50倍。"30倍"的数据是社区对全栈 Blackwell + Dynamo + DeepSeek-R1 报告的汇总；我们尚未找到明确说明正好30倍的单一主要来源，因此请将其视为方向性声明。llm-d（Red Hat + AWS）是 Kubernetes 原生的：预填充/解码/路由器作为独立的 Service，具有按角色 HPA。llm-d 0.5 增加了分层 KV 卸载、缓存感知 LoRA 路由、UCCL 网络、缩放到零。经济学：多个客户披露的内部汇总表明，在保持相同 SLA 的情况下，从共置服务切换到使用 Dynamo 的分离式服务后，200万美元级别的推理支出可节省30-40%（即每年60-80万美元）；具体的200万美元 → 60-80万美元的数字是内部综合数据，而非单个已发布的案例研究——将其视为数量级参考，而非可引用的来源。短提示（<512 tokens，短输出）不值得传输成本。

**类型：** 学习
**语言：** Python（标准库，玩具级分离式 vs 共置模拟器）
**前置知识：** 第17阶段·04（vLLM 服务内部原理），第17阶段·08（推理指标）
**时间：** 约75分钟

## 学习目标

- 解释为什么预填充和解码需要不同的最佳 GPU 分配，并量化共置下的浪费。
- 绘制分离式架构图：预填充池、解码池、通过 NIXL 的 KV 传输、路由器。
- 指出分离式部署何时不划算（短提示、短输出）。
- 区分 NVIDIA Dynamo（栈上层）与 llm-d（Kubernetes 原生），并将每个匹配到相应的运营上下文。

## 问题

你在8个 H100 上运行 Llama 3.3 70B。在混合工作负载（长提示 + 短输出）下，GPU 在解码期间空闲，因为大部分计算已用于预填充。在不同的工作负载（短提示 + 长输出）下，情况相反。共置预填充 + 解码意味着你过度配置了两种资源。

预算影响：20-40%的 GPU 时间浪费在错误的资源上。你购买 H100 计算资源来运行内存密集型解码，或者购买 H100 HBM 带宽来运行计算密集型预填充。两者都是昂贵的浪费。

分离将预填充和解码拆分到各自独立、针对各自瓶颈进行规模调整的池中。KV 缓存通过高带宽互连从预填充池传输到解码池。

## 概念

### 为什么瓶颈不同

**预填充** —— 在一次前向传播中在整个输入提示上运行 transformer。矩阵乘法占主导地位；计算密集型。H100 FP8 提供约2000 TFLOPS 的有效吞吐量。批处理效率良好——一次前向可处理许多 token。

**解码** —— 一次生成一个 token，每次迭代读取全部权重。受内存带宽限制。HBM3 提供约3 TB/s。批处理效率仅在高度并发时良好——权重读取在批次中分摊。

共置两者：你购买的 GPU 需要为两者优化。H100 在两者上都表现出色，但无论哪种方式成本相同。大规模部署时，你需要预填充池使用 H100 / 计算密集型；解码池使用 H200 / 内存密集型，或采用激进量化。

### 架构

```
            ┌──────────────┐
  Request → │    Router    │ ───────────────────────┐
            └──────┬───────┘                        │
                   │                                │
                   ▼ (prompt only)                  │
            ┌──────────────┐    KV cache    ┌───────▼──────┐
            │ Prefill pool │ ─── NIXL ────► │ Decode pool  │
            │  (compute)   │                │  (memory)    │
            └──────────────┘                └──────┬───────┘
                                                   │ tokens
                                                   ▼
                                                 Client
```

NIXL 是 NVIDIA 的节点间传输。在可用时使用 RDMA/InfiniBand，否则使用 TCP 回退。传输延迟是真实存在的——对于70B FP8 上4K token 提示的 KV 缓存，通常为20-80毫秒。这就是为什么短提示不值得分离：传输成本超过了节省。

### Dynamo vs llm-d

**NVIDIA Dynamo**（GTC 2025 宣布，1.0 正式版）：
- 位于 vLLM、SGLang、TRT-LLM 之上作为编排器。
- Planner Profiler 测量工作负载，SLA Planner 自动配置预填充:解码比率。
- Rust 核心，Python 可扩展性。
- 吞吐量提升：NVIDIA 报告 DeepSeek-R1 MoE 在 GB200 NVL72 + Dynamo 上的中延迟场景中实现约6倍改进（developer.nvidia.com，2025年6月）；社区关于"全栈 Blackwell + Dynamo + DeepSeek-R1 可达30倍"的报告缺乏单一主要来源，应视为方向性声明。
- GB300 NVL72 + Dynamo：根据 Dynamo 产品页面（developer.nvidia.com，日期不详），MoE 吞吐量相比 Hopper 提升高达50倍。

**llm-d**（Red Hat + AWS，Kubernetes 原生）：
- 预填充/解码/路由器作为独立的 Kubernetes Service。
- 按角色 HPA，使用队列深度（预填充）/ KV 利用率（解码）信号。
- `topologyConstraint packDomain: rack` 将预填充+解码派系打包在同一机架上，以实现高带宽 KV 传输。
- llm-d 0.5（2026年）：分层 KV 卸载、缓存感知 LoRA 路由、UCCL 网络、缩放到零。

需要托管式栈上层编排器时使用 Dynamo。需要 Kubernetes 原生原语并致力于 CNCF 生态系统时使用 llm-d。

### 经济学

内部综合数据（非单个已发布的案例研究——数量级参考）：

- 共置服务的推理支出为每年200万美元。
- 切换到使用 Dynamo 的分离式服务。
- 相同的请求量，相同的 P99 延迟 SLA。
- 报告节省：每年60-80万美元（减少30-40%）。
- 无需新硬件。

我们综合多个客户披露而非单个可引用案例研究得出此数据；最接近的已发布数据点是 Baseten 通过 Dynamo KV 路由实现2倍更快的 TTFT / 61%更高的吞吐量（baseten.co，2025年10月），以及 VAST + CoreWeave 在40-60% KV 命中率下预测的60-130%更多 tokens/美元（vastdata.com，2025年12月）。节省来自合理调整每个池的规模；预填充重的工作负载（RAG 带有8K+前缀）比平衡的工作负载获益更多。

### 何时不分离

- 提示 < 512 tokens 且输出 < 200 tokens：传输成本主导收益。
- 小型集群（< 4 GPU）：池多样性不足。
- 团队无法运营两个具有按角色扩展的 GPU 池：Dynamo 有帮助但不简单。
- 没有 RDMA 网络：TCP 传输成本更重。

### 路由器与第17阶段·11集成

分离式路由器是 KV 缓存感知的（第17阶段·11）。请求落在持有其前缀的解码池上——如果没有匹配，则走预填充→解码流程。命中率和分离相辅相成——缓存感知路由器决定是否甚至需要新的预填充。

### Blackwell 上的 MoE 才是真正的数字所在

GB300 NVL72 + Dynamo 显示 MoE 吞吐量比 Hopper 基线提升50倍。MoE 专家路由在预填充阶段是计算密集型，但在解码阶段是内存密集型（专家缓存），因此分离是双重收益。2026年前沿模型服务以 MoE 为主（DeepSeek-V3、未来的 GPT-5 变体）。

### 你应该记住的数字

基准测试数字会漂移——NVIDIA 和推理栈每季度发布更新的结果。在引用前请重新核实。

- DeepSeek-R1 在 GB200 NVL72 + Dynamo 上：中延迟场景相比基线约6倍吞吐量（developer.nvidia.com，2025年6月）；社区关于全栈 Blackwell + Dynamo "高达30倍"的声明是方向性汇总，没有单一主要来源。
- GB300 NVL72 + Dynamo：MoE 吞吐量相比 Hopper 提升高达50倍（developer.nvidia.com，日期不详）。
- 节省参考（内部综合数据，非单个案例研究）：在保持 SLA 不变的2百万美元年度支出中节省60-80万美元/年。
- 分离阈值：提示 >512 tokens + 输出 >200 tokens。
- 通过 NIXL 的 KV 传输：70B FP8 上4K 提示的 KV 为20-80毫秒。

## 使用

`code/main.py` 模拟共置 vs 分离式服务。报告吞吐量、每次请求成本以及提示长度交叉点。

## 交付

本课程产出 `outputs/skill-disaggregation-decider.md`。根据工作负载和集群，决定是否要进行分离。

## 练习

1. 运行 `code/main.py`。在什么提示长度下，分离式超过共置？
2. 为一个 RAG 服务设计预填充池和解码池，要求 P99 前缀长度为8K，输出为300。
3. Dynamo vs llm-d：为一个纯 Kubernetes 环境且没有 Python 运行时偏好的场景选择一个。
4. 计算 KV 传输成本：70B FP8 上的4K 预填充 = 约500 MB KV。在 RDMA 100 GB/s 下，传输 = 5毫秒。在 TCP 10 GB/s 下 = 50毫秒。哪个对你的 SLA 重要？
5. MoE 专家路由改变了 KV 访问模式。对于每次 token 激活不同专家的 MoE，分离式表现如何？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| 分离式服务 | "拆分预填充/解码" | 每个阶段使用独立的 GPU 池 |
| NIXL | "NVIDIA 传输" | Dynamo 的节点间 KV 传输（RDMA/TCP） |
| NVIDIA Dynamo | "编排器" | vLLM/SGLang/TRT-LLM 的栈上层协调器 |
| llm-d | "Kubernetes 原生" | Red Hat + AWS 的 K8s 分离式栈 |
| Planner Profiler | "Dynamo 自动配置" | 测量工作负载，配置池比率 |
| SLA Planner | "Dynamo 策略" | 自动匹配预填充:解码以满足 SLO |
| `packDomain: rack` | "llm-d 拓扑" | 将预填充+解码打包在同一机架上以实现快速 KV 传输 |
| UCCL | "统一集合通信" | llm-d 0.5 的网络层，支持缩放到零 |
| MoE 专家路由 | "每次 token 选专家" | DeepSeek-V3 模式；分离式有帮助 |

## 延伸阅读

- [NVIDIA —— 介绍 Dynamo](https://developer.nvidia.com/blog/introducing-nvidia-dynamo-a-low-latency-distributed-inference-framework-for-scaling-reasoning-ai-models/)
- [NVIDIA —— 在 Kubernetes 上部署分离式 LLM 推理](https://developer.nvidia.com/blog/deploying-disaggregated-llm-inference-workloads-on-kubernetes/)
- [TensorRT-LLM 分离式服务博客](https://nvidia.github.io/TensorRT-LLM/blogs/tech_blog/blog5_Disaggregated_Serving_in_TensorRT-LLM.html)
- [llm-d GitHub](https://github.com/llm-d/llm-d)
- [llm-d 0.5 发布说明](https://github.com/llm-d/llm-d/releases)
