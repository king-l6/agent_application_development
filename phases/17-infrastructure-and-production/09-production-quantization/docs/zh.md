# 生产量化 —— AWQ、GPTQ、GGUF K-quants、FP8、MXFP4/NVFP4

> 量化格式不是通用的选择——它是硬件、服务引擎和工作负载的函数。GGUF Q4_K_M 或 Q5_K_M 主导 CPU 和边缘场景，通过 llama.cpp 和 Ollama 交付。GPTQ 在 vLLM 中当你需要在同一基座上使用多 LoRA 时胜出。AWQ 配合 Marlin-AWQ 内核在 INT4 下为 7B 级模型提供约 741 tok/s 的吞吐量和最佳的 Pass@1——这是 2026 年数据中心生产的默认选择。FP8 在 Hopper、Ada 和 Blackwell 上仍然是中间地带——接近无损且被广泛支持。NVFP4 和 MXFP4（Blackwell 微缩放）是激进的，需要逐块验证。两个陷阱会困扰团队：校准数据集必须匹配部署领域，KV 缓存与权重量化是独立的——AWQ 的教训是"我的模型现在只有 4 GB"却忽略了生产批处理大小下的 10-30 GB KV 缓存。

**类型：** 学习
**语言：** Python（标准库，玩具跨格式内存和吞吐量比较器）
**前置知识：** 阶段 10 · 13（量化基础），阶段 17 · 04（vLLM 服务内部机制）
**时间：** 约 75 分钟

## 学习目标

- 说出 2026 年六种生产量化格式及其最佳应用场景。
- 根据硬件（CPU vs GPU，Hopper vs Blackwell）、引擎（vLLM、TRT-LLM、llama.cpp）和工作负载（常规聊天、推理、多 LoRA）选择格式。
- 计算所选格式节省的权重内存和未触及的 KV 缓存。
- 说出导致量化模型在领域流量上降级的校准数据集陷阱。

## 问题

量化减少了内存和 HBM 带宽，这正是解码所需要的。FP16 70B 模型是 140 GB 的权重。将权重量化为 INT4（AWQ 或 GPTQ）后，模型变成 35 GB——可以装进一个 H100 并留有 KV 缓存的空间，这很重要，因为在 128 个并发序列和 2k 上下文下，仅 KV 缓存就需要 20-30 GB。

但量化不是免费的。激进的量化会降低质量，特别是在推理密集型任务上。不同的格式与不同的引擎配合使用。不同的硬件原生支持不同的精度。2026 年的格式动物园是真实存在的，你不能复制别人的选择——你必须根据自己的技术栈来选择。

## 概念

### 六种格式

| 格式 | 位数 | 最佳场景 | 引擎 |
|------|------|---------|------|
| GGUF Q4_K_M / Q5_K_M | 4-5 | CPU、边缘、笔记本 | llama.cpp、Ollama |
| GPTQ | 4-8 | vLLM 上的多 LoRA | vLLM、TGI |
| AWQ | 4 | 数据中心 GPU 生产 | vLLM（Marlin-AWQ）、TGI |
| FP8 | 8 | Hopper/Ada/Blackwell 数据中心 | vLLM、TRT-LLM、SGLang |
| MXFP4 | 4 | Blackwell 多用户 | TRT-LLM |
| NVFP4 | 4 | Blackwell 多用户 | TRT-LLM |

### GGUF —— CPU/边缘默认

GGUF 是一种文件格式，本身不是量化方案——它将 K-quant 变体（Q2_K、Q3_K_M、Q4_K_M、Q5_K_M、Q6_K、Q8_0）打包在一个容器中。Q4_K_M 和 Q5_K_M 是生产默认值——在 4-5 位下接近 BF16 质量。CPU 或边缘服务的最佳选择，因为 llama.cpp 是迄今为止最快的 CPU 推理引擎。

在 vLLM 中的吞吐量代价：7B 上约 93 tok/s —— 该格式未针对 GPU 内核优化。当部署目标是 CPU/边缘时使用 GGUF。否则不用。

### GPTQ —— vLLM 中的多 LoRA

GPTQ 是一种带校准过程的训练后量化算法。Marlin 内核使其在 GPU 上快速（比非 Marlin GPTQ 快 2.6 倍）。7B 上约 712 tok/s。

独特的优势：GPTQ-Int4 在 vLLM 中支持 LoRA 适配器。如果你正在服务一个基础模型加上 10-50 个微调变体（每个作为 LoRA），GPTQ 是你的路径。截至 2026 年初，NVFP4 尚不支持 LoRA。

### AWQ —— 数据中心 GPU 默认

激活感知权重量化。在量化过程中保护大约 1% 最重要的权重。Marlin-AWQ 内核：相比朴素实现加速 10.9 倍。7B 上约 741 tok/s，INT4 格式中最佳 Pass@1。

对于新的 GPU 服务，除非你需要多 LoRA（GPTQ）或激进的 Blackwell FP4（NVFP4），否则选择 AWQ。

### FP8 —— 可靠的中间地带

8 位浮点数。接近无损。被广泛支持。Hopper Tensor Core 原生加速 FP8。Blackwell 继承。FP8 是 2026 年质量不可妥协时（推理、医疗、代码生成）的安全默认选择。内存节省是 INT4 的一半，但质量风险远低。

### MXFP4 / NVFP4 —— Blackwell 激进方案

微缩放 FP4。每个权重块有自己的缩放因子。激进但在 Blackwell Tensor Core 上硬件加速。每 token 的字节数比 FP8 少一半——阶段 17 · 07 中的经济效益优势。

注意事项：
- 尚不支持 LoRA（2026 年初）。
- 对推理密集型工作负载质量下降明显。
- 在每个模型上使用你的评估集验证。

### 校准陷阱

AWQ 和 GPTQ 需要校准数据集——通常是 C4 或 WikiText。对于领域模型（代码、医疗、法律），在通用网页文本上校准会让算法对哪些权重需要保护做出错误决策。HumanEval 上的 Pass@1 可能下降几个点。

解决方案：在领域内数据上校准。几百个领域样本通常就足够了。在发布前在评估集上测试。

### KV 缓存陷阱

AWQ 将权重缩小到 4 位。KV 缓存是独立的，保持在 FP16/FP8。对于使用 AWQ 的 70B 模型：

- 权重：约 35 GB（从 140 GB 的 INT4）。
- 128 并发 × 2k 上下文下的 KV 缓存：约 20 GB。
- 激活值：约 5 GB。
- 总计：约 60 GB —— 可装进 H100 80GB。

简单地认为"我将模型量化到了 4 GB"却忽略了另外 30-50 GB。全面规划 HBM 预算。

另外，KV 缓存量化（FP8 KV 或 INT8 KV）是一个不同的选择，有其自身的权衡——它直接影响注意力精度，不是免费的收益。

### AWQ INT4 对推理有风险

思维链、数学、长上下文的代码生成——这些任务在激进的量化下明显受损。AWQ INT4 在 MATH 上损失约 3-5 个百分点。对于推理密集型工作负载，使用 FP8 或 BF16；接受内存成本。

### 2026 年选择指南

- CPU/边缘服务：GGUF Q4_K_M。搞定。
- GPU 服务、常规聊天、无 LoRA：AWQ。
- GPU 服务、多 LoRA：使用 Marlin 的 GPTQ。
- 推理工作负载：FP8。
- Blackwell 数据中心、已验证质量：NVFP4 + FP8 KV。
- 不确定：对每个候选格式运行 1,000 样本评估。

```figure
gpu-memory-breakdown
```

## 使用它

`code/main.py` 计算六种格式在不同模型规模下的内存占用（权重 + KV + 激活值）和相对吞吐量。展示 KV 缓存何时占主导，权重压缩何时有益，以及 FP8 何时是安全选择。

## 交付物

本节课生成 `outputs/skill-quantization-picker.zh.md`。给定硬件、模型规模、工作负载类型和质量容忍度，选择格式并生成校准/验证计划。

## 练习

1. 运行 `code/main.py`。对于一个在 128 并发和 2k 上下文下的 70B 模型，计算每种格式的总 HBM。哪种格式能装进一块 H100 80GB？
2. 你有一个 7B 代码模型。选择一种格式并说明理由。如果你对质量容忍度的判断错误，恢复路径是什么？
3. 计算校准 AWQ 用于医疗领域模型所需的校准数据集大小。为什么更多数据并不总是更好？
4. 阅读 Marlin-AWQ 内核论文或发布说明。用三句话解释为什么 AWQ 在 7B 上达到 741 tok/s 而原始 GPTQ 约为 712 tok/s。
5. 什么时候将 AWQ 权重与 FP8 KV 缓存结合使用是有意义的，而不是将 KV 保持在 BF16？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| GGUF | "llama.cpp 格式" | 打包 K-quant 变体的文件格式；CPU/边缘默认 |
| Q4_K_M | "Q4 K M" | 4 位 K-quant 中等；生产 GGUF 默认值 |
| GPTQ | "gee pee tee q" | 带校准的训练后 INT4；在 vLLM 中支持 LoRA |
| AWQ | "a w q" | 激活感知 INT4；Marlin 内核；INT4 下最佳 Pass@1 |
| Marlin 内核 | "快速 INT4 内核" | Hopper 上 INT4 的自定义 CUDA 内核；10 倍加速 |
| FP8 | "八位浮点" | Hopper/Ada/Blackwell 上的安全精度默认值 |
| MXFP4 / NVFP4 | "微缩放四" | Blackwell 4 位 FP，带逐块缩放因子 |
| 校准数据集 | "校准数据" | 用于选择量化参数的输入文本；必须匹配领域 |
| KV 缓存量化 | "KV INT8" | 与权重分开的选择；影响注意力精度 |

## 延伸阅读

- [VRLA Tech — LLM Quantization 2026](https://vrlatech.com/llm-quantization-explained-int4-int8-fp8-awq-and-gptq-in-2026/) — 对比基准测试。
- [Jarvis Labs — vLLM Quantization Complete Guide](https://jarvislabs.ai/blog/vllm-quantization-complete-guide-benchmarks) — 按格式分的吞吐量数据。
- [PremAI — GGUF vs AWQ vs GPTQ vs bitsandbytes 2026](https://blog.premai.io/llm-quantization-guide-gguf-vs-awq-vs-gptq-vs-bitsandbytes-compared-2026/) — 逐格式选择指南。
- [vLLM docs — Quantization](https://docs.vllm.ai/en/latest/features/quantization/index.html) — 支持的格式和标志。
- [AWQ 论文 (arXiv:2306.00978)](https://arxiv.org/abs/2306.00978) — AWQ 原始表述。
- [GPTQ 论文 (arXiv:2210.17323)](https://arxiv.org/abs/2210.17323) — GPTQ 原始表述。
