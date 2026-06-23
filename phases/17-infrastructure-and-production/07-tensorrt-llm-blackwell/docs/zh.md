# TensorRT-LLM 在 Blackwell 上的 FP8 与 NVFP4

> TensorRT-LLM 是 NVIDIA 独占技术，但在 Blackwell 上表现卓越。在 GB200 NVL72 上结合 Dynamo 编排，SemiAnalysis InferenceX 测得 2026 年 Q1-Q2 期间 120B 模型每百万 token 成本为 $0.012，而 H100 + vLLM 为 $0.09/M —— 差距达 7 倍。该技术栈由三种浮点格式叠加而成：FP8 因其所需的动态范围而仍然是 KV 缓存和注意力核的关键；NVFP4（4 位微缩放）处理权重和激活值；多 token 预测（MTP）和解耦的预填充/解码在此基础上再提升 2-3 倍。Day-0 模型支持直接加载 FP4 权重，无需训练后转换。2026 年工程团队的困境：TRT-LLM 是闭源的 NVIDIA 技术栈，采用它意味着用可移植性换取吞吐量。在承诺之前，先根据你的模型和硬件组合计算清楚。

**类型：** 学习
**语言：** Python（标准库，玩具 FP8/NVFP4 内存和成本计算器）
**前置知识：** 阶段 17 · 04（vLLM 服务内部机制），阶段 10 · 13（量化）
**时间：** 约 75 分钟

## 学习目标

- 解释为什么即使权重使用 NVFP4，FP8 仍然是 KV 缓存和注意力的关键。
- 计算前沿模型在 BF16、FP8 和 NVFP4 下的 HBM 占用空间，并推理节省来自何处。
- 列举 TRT-LLM 利用的 Blackwell 特性（day-0 FP4、MTP、解耦服务、all-to-all 原语）。
- 判断在什么情况下，与 vLLM on Hopper 相比，TRT-LLM 的 NVIDIA 锁定值得 7 倍成本差距。

## 问题

2026 年推理经济学的核心问题是"每美元能产生多少 token"。答案取决于四个叠加的选择：硬件代际（Hopper H100/H200 vs Blackwell B200/GB200）、精度（BF16 → FP8 → NVFP4）、服务引擎（vLLM vs SGLang vs TRT-LLM）和编排（普通 vs 解耦 vs Dynamo）。

在 Hopper 上使用 vLLM，120B MoE 的运行成本约为每百万 token $0.09。在 Blackwell 上使用 TRT-LLM + Dynamo，同一模型的运行成本为 $0.012 —— 便宜 7 倍。部分差距来自硬件（Blackwell 每 GPU LLM 吞吐量是 Hopper 的 11-15 倍）。部分来自技术栈：FP4 权重、MTP 草稿、解耦的预填充/解码，以及用于 MoE 专家通信的 NVLink 5 all-to-all。

在 NVIDIA 技术栈之外无法复现这种性能。这就是权衡 —— 用可移植性换取经济效益。理解每个技术栈选择对差距的贡献比例是本节课的重点。

## 概念

### 为什么 FP8 仍然是 KV 缓存的最低要求

2026 年一个常见的错误：认为 NVFP4 适用于所有场景。事实并非如此。KV 缓存需要 FP8（8 位浮点数），因为它存储的注意力的键和值跨越很宽的动态范围。将 KV 量化为 FP4 会导致灾难性的精度损失 —— 分布的尾部会消失，注意力分数会崩溃。FP8 的指数位为 KV 缓存提供了所需的动态范围。

NVFP4（2025-2026）适用于权重和激活值。微缩放：每个权重块有自己的缩放因子，因此小块可以跨越不同的动态范围而不会出现逐张量缩放损失。对于激活值，FP4 可以胜任，因为激活值在层内范围较小。

典型的 Blackwell 配置：

- 权重：NVFP4（4 位微缩放）。
- 激活值：NVFP4。
- KV 缓存：FP8。
- 注意力累加器：FP32（softmax 稳定性）。

### TRT-LLM 使用的 Blackwell 特有原语

- **Day-0 FP4 权重**：模型提供商直接提供 FP4 权重；TRT-LLM 加载时无需训练后转换。无需 FP4 的 AWQ/GPTQ 步骤。
- **多 token 预测（MTP）**：与 EAGLE（阶段 17 · 05）相同的概念，但集成在 TRT-LLM 构建中。
- **解耦服务**：在独立的 GPU 池上进行预填充和解码，KV 缓存通过 NVLink 或 InfiniBand 传输。与 Dynamo（阶段 17 · 20）概念相同。
- **All-to-all 通信原语**：NVLink 5 将 MoE 专家通信延迟降低到 Hopper 的 1/3。TRT-LLM 的 MoE 核为此进行了调优。
- **NVFP4 + MXFP8 微缩放**：Blackwell Tensor Core 上的硬件加速缩放因子处理。

### 你应该记住的数字

- HGX B200 在 GPT-OSS-120B 上通过 TRT-LLM 每百万 token $0.02。
- GB200 NVL72 通过 Dynamo（编排 TRT-LLM）每百万 token $0.012。
- H100 + vLLM 在类似工作负载上约 $0.09/M。
- TRT-LLM 更新三个月内吞吐量提升 2.8 倍（2026 年）。
- Blackwell vs Hopper 每 GPU LLM 吞吐量提升 11-15 倍。
- MLPerf 推理 v6.0（2026 年 4 月）：Blackwell 主导所有提交的任务。

### FP4 实际带来的质量代价

NVFP4 是激进的。在推理密集型任务（思维链、数学、长上下文的代码生成）上，FP4 权重会明显降质。逐块校准可以缓解但无法消除。部署推理模型的团队通常使用 FP8 权重 + FP4 激活值作为折衷方案，或者坚持使用 H200 全 FP8。

规则：在承诺使用 NVFP4 权重之前，务必在你的评估集上验证任务质量。

### 为什么这是一个 NVIDIA 锁定决策

TRT-LLM 是 C++ + CUDA + 闭源内核。模型需要针对特定的 GPU SKU 进行编译。不支持 AMD、Intel 或 ARM。如果你的基础设施策略是多厂商的，TRT-LLM 对于 TRT-LLM 服务层来说是不可行的 —— 你仍然可以在混合硬件上使用 vLLM 服务。如果你只使用 NVIDIA，7 倍差距足以弥补锁定的成本。

### 2026 年实用方案

对于年推理账单超过 1 亿美元的工作负载，在 Hopper + vLLM 上运行会浪费 7-10 倍的潜力。将成本主导的工作负载迁移到 Blackwell + TRT-LLM + Dynamo。将实验层保留在 H100 + vLLM 上以获得模型迭代速度。在每个 NVFP4 转换的模型上线前验证其质量。

### 解耦的额外收益

TRT-LLM 的解耦服务（独立的预填充和解码池）在阶段 17 · 20 中有深入介绍。在 Blackwell 上，乘数效应叠加：FP4 权重 × MTP 加速 × 解耦放置 × 缓存感知路由。7 倍的数字假设了这一完整技术栈。

```figure
pipeline-parallel
```

## 使用它

`code/main.py` 计算一个模型在三种技术栈上的 HBM 占用空间、解码吞吐量（内存受限模式）和每百万 token 成本：H100 + BF16 + vLLM、H100 + FP8 + vLLM、B200 + NVFP4/FP8 + TRT-LLM。运行它来观察叠加效应以及每个变化对差距的贡献。

## 交付物

本节课生成 `outputs/skill-trtllm-blackwell-advisor.zh.md`。给定工作负载、模型规模和年 token 量，判断 Blackwell + TRT-LLM 技术栈是否值得 NVIDIA 锁定。

## 练习

1. 运行 `code/main.py`。对于一个 120B MoE（30% 活跃参数），计算 H100 BF16、H100 FP8 和 B200 NVFP4/FP8 上的内存带宽限制解码吞吐量。最大的提升来自哪里？
2. 一个客户每年在 H100 + vLLM 上花费 200 万美元。在 7 倍经济差距下，他们需要购买多少 Blackwell GPU 才能在 12 个月内摊销迁移到 TRT-LLM 的成本？
3. 在 NVFP4 权重转换后，你发现 MATH 上的准确率下降了 3 个百分点。说出两种恢复路径：一种质量优先（保留 FP8 权重），一种成本优先（使用领域内数据校准）。
4. 阅读 MLPerf v6.0 推理结果。哪个任务的 Blackwell 相比 Hopper 提升最小，为什么？
5. 计算 405B 模型在 NVFP4 权重 + FP8 KV 缓存 + 128k 上下文下所需的 HBM。它能装进单个 GB200 NVL72 节点吗？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| FP8 | "八位浮点" | 8 位浮点数；因动态范围需求用于 KV 缓存和注意力 |
| NVFP4 | "四位微" | NVIDIA 的 4 位微缩放 FP 格式；Blackwell 上的权重和激活值 |
| MXFP8 | "MX 八" | 微缩放 FP8 变体；Blackwell Tensor Core 上硬件加速 |
| Day-0 FP4 | "直接提供 FP4 权重" | 模型提供商发布已经是 FP4 格式的权重；无需训练后转换步骤 |
| MTP | "多 token 预测" | TRT-LLM 集成的推测解码草稿（阶段 17 · 05） |
| 解耦服务 | "分离预填充/解码" | 在独立的 GPU 池上进行预填充和解码；KV 通过 NVLink/IB 传输 |
| All-to-all | "MoE 专家通信" | 将 token 路由到专家 GPU 的通信模式；NVLink 5 降低 3 倍延迟 |
| InferenceX | "SemiAnalysis 推理基准" | 2026 年行业公认的每 token 成本基准测试 |

## 延伸阅读

- [NVIDIA — Blackwell Ultra MLPerf Inference v6.0](https://developer.nvidia.com/blog/nvidia-blackwell-ultra-sets-new-inference-records-in-mlperf-debut/) — 2026 年 4 月 MLPerf 结果。
- [NVIDIA — MoE Inference on Blackwell](https://developer.nvidia.com/blog/delivering-massive-performance-leaps-for-mixture-of-experts-inference-on-nvidia-blackwell/) — NVLink 5 all-to-all 和 MoE 内核。
- [TensorRT-LLM 概述](https://nvidia.github.io/TensorRT-LLM/overview.html) — 官方引擎文档。
- [NVIDIA — Introducing Dynamo](https://developer.nvidia.com/blog/introducing-nvidia-dynamo-a-low-latency-distributed-inference-framework-for-scaling-reasoning-ai-models/) — TRT-LLM 之上的解耦编排。
- [MLPerf Inference](https://mlcommons.org/benchmarks/inference-datacenter/) — 发布 Blackwell 数据的基准测试套件。
