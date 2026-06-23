# 自托管推理引擎选择 — llama.cpp、Ollama、TGI、vLLM、SGLang

> 2026 年有四个引擎主导自托管推理。根据硬件、规模和生态系统进行选择。**llama.cpp** 在 CPU 上最快 — 最广泛的模型支持，完全控制量化和线程。**Ollama** 是开发笔记本电脑的一键安装，比 llama.cpp 慢约 15-30%（Go + CGo + HTTP 序列化），在生产级负载下吞吐量差距达 3 倍。**TGI 于 2025 年 12 月 11 日进入维护模式** — 仅修复 bug，原始吞吐量比 vLLM 慢约 10%，但历史上具有顶级可观测性和 HF 生态系统集成。该维护状态使其成为有风险的长线选择 — SGLang 或 vLLM 是新项目更安全的默认选择。**vLLM** 是通用生产默认选择 — v0.15.1（2026 年 2 月）添加了 PyTorch 2.10、RTX Blackwell SM120、H200 优化。**SGLang** 是智能体多轮 / 前缀重负载的专家 — 生产中超过 400,000 个 GPU（xAI、LinkedIn、Cursor、Oracle、GCP、Azure、AWS）。硬件约束：仅 CPU → 仅限 llama.cpp。AMD / 非 NVIDIA → 仅限 vLLM（TRT-LLM 被 NVIDIA 锁定）。2026 年流水线模式：开发 = Ollama，预演 = llama.cpp，生产 = vLLM 或 SGLang。全程使用相同的 GGUF/HF 权重。

**类型：** 学习
**语言：** Python（标准库，引擎决策树遍历器）
**前置要求：** 所有涉及引擎的第 17 阶段课程（04、06、07、09、18）
**时间：** 约 45 分钟

## 学习目标

- 根据硬件（CPU / AMD / NVIDIA Hopper / Blackwell）、规模（1 个用户 / 100 / 10,000）和工作负载（通用聊天 / 智能体 / 长上下文）选择引擎。
- 说出 2026 年 TGI 维护模式状态（2025 年 12 月 11 日）以及它为何使新项目偏向 vLLM 或 SGLang。
- 描述使用相同 GGUF 或 HF 权重贯穿始终的开发/预演/生产流水线。
- 解释为什么"仅 CPU"强制使用 llama.cpp，而"AMD"排除了 TRT-LLM。

## 问题

你的团队启动了一个新的自托管 LLM 项目。一位工程师说用 Ollama，另一位说用 vLLM，第三位说"TGI 不是开箱即用吗？"所有三个在不同的上下文中都是对的。但没有一个在所有情况下都正确。

2026 年的选择树很重要：硬件优先，规模其次，工作负载第三。而且一个特定的 2025 年事件 — TGI 于 12 月 11 日进入维护模式 — 改变了新项目的默认选择。

## 概念

### 五个引擎

| 引擎 | 最适合 | 备注 |
|--------|----------|-------|
| **llama.cpp** | CPU / 边缘 / 最小依赖 / 最广泛模型支持 | CPU 上最快，完全控制 |
| **Ollama** | 开发笔记本电脑，单用户，一键安装 | 比 llama.cpp 慢 15-30%；生产吞吐量差距 3 倍 |
| **TGI** | HF 生态系统，受监管行业 | **2025 年 12 月 11 日进入维护模式** |
| **vLLM** | 通用生产，100+ 用户 | 广泛的生产默认选择；v0.15.1 2026 年 2 月 |
| **SGLang** | 智能体多轮，前缀重负载工作负载 | 生产中超过 400,000 个 GPU |

### 硬件优先决策

**仅 CPU** → llama.cpp。Ollama 也可用但更慢。没有其他引擎在 CPU 上有竞争力。

**AMD GPU** → vLLM（AMD ROCm 支持）。SGLang 也可用。TRT-LLM 被 NVIDIA 锁定，因此排除。

**NVIDIA Hopper (H100 / H200)** → vLLM 或 SGLang 或 TRT-LLM。三者都是顶级选择。

**NVIDIA Blackwell (B200 / GB200)** → TRT-LLM 是吞吐量领导者（第 17 阶段 · 07）。vLLM 和 SGLang 紧随其后。

**Apple Silicon (M 系列)** → llama.cpp（Metal）。Ollama 封装了它。

### 规模其次决策

**1 个用户 / 本地开发** → Ollama。一条命令，数秒内获得第一个 token。

**10-100 个用户 / 小团队** → vLLM 单 GPU。

**100-10k 个用户 / 生产环境** → vLLM 生产栈（第 17 阶段 · 18）或 SGLang。

**10k+ 用户 / 企业** → vLLM 生产栈 + 分离式（第 17 阶段 · 17）+ LMCache（第 17 阶段 · 18）。

### 工作负载第三决策

**通用聊天 / Q&A** → vLLM 在广泛的默认选择上胜出。

**智能体多轮（工具、规划、记忆）** → SGLang 的 RadixAttention（第 17 阶段 · 06）占主导地位。

**大量前缀重用的 RAG** → SGLang。

**代码生成** → vLLM 可以；SGLang 在缓存方面略好。

**长上下文（128K+）** → vLLM + 分块预填充；SGLang + 分层 KV。

### TGI 维护陷阱

Hugging Face TGI 于 2025 年 12 月 11 日进入维护模式 — 今后仅修复 bug。历史上：顶级可观测性，最佳 HF 生态系统集成（模型卡、安全工具），在原始吞吐量上略逊于 vLLM。

对于 2026 年的新项目：默认远离 TGI。现有的 TGI 部署可以继续，但应最终迁移。SGLang 和 vLLM 是更安全的默认选择。

### 流水线模式

开发（Ollama）→ 预演（llama.cpp）→ 生产（vLLM）。全程使用相同的 GGUF 或 HF 权重。工程师在笔记本电脑上快速迭代；预演镜像生产量化；生产是服务目标。

### Ollama 注意事项

Ollama 适合开发。不适合共享生产环境：Go HTTP 序列化增加开销，并发管理比 vLLM 简单，OpenTelemetry 支持落后。在 Ollama 的强项使用它 — 一个用户，一条命令 — 共享环境时切换到 vLLM。

### 自托管与托管是单独的决策

第 17 阶段 · 01（托管超大规模服务）、· 02（推理平台）涵盖了托管方案。本课程假设你已经决定自托管。自托管的理由：数据驻留、自定义微调、规模下的总拥有成本、托管服务上不可用的领域模型。

### 你应该记住的数字

- TGI 维护模式：2025 年 12 月 11 日。
- vLLM v0.15.1：2026 年 2 月；PyTorch 2.10；Blackwell SM120 支持。
- SGLang 生产部署规模：超过 400,000 个 GPU。
- Ollama 与 llama.cpp 的吞吐量差距：慢 15-30%；生产负载下差距 3 倍。

```figure
data-parallel
```

## 使用它

`code/main.py` 是一个决策树遍历器：给定硬件 + 规模 + 工作负载，选择一个引擎并解释原因。

## 交付它

本课程生成 `outputs/skill-engine-picker.md`。给定约束，选择一个引擎并编写迁移计划。

## 练习

1. 使用你的硬件 / 规模 / 工作负载运行 `code/main.py`。输出是否符合你的直觉？
2. 你的基础设施有 12 个 H100 和 8 个 MI300X AMD。选择什么引擎？为什么 TRT-LLM 不在考虑范围内？
3. 一个团队想要在 2026 年使用 TGI，因为"这是我们熟悉的"。论证迁移的理由。
4. Ollama 开发到 vLLM 生产：量化、配置和可观测性方面有哪些变化？
5. RAG 产品，P99 前缀长度为 8K，且跨租户重用率高。选择一个引擎并将其与第 17 阶段 · 11 + 18 叠加。

## 关键术语

| 术语 | 人们说的意思 | 实际含义 |
|------|----------------|------------------------|
| llama.cpp | "那个 CPU 的" | 最广泛的模型支持，CPU 上最快 |
| Ollama | "那个笔记本电脑的" | 一键安装，开发级吞吐量 |
| TGI | "HF 的服务" | 自 2025 年 12 月起进入维护模式 |
| vLLM | "默认选择" | 2026 年广泛的生产基线 |
| SGLang | "那个智能体的" | 前缀重负载，RadixAttention |
| TRT-LLM | "NVIDIA 锁定" | Blackwell 吞吐量领导者，仅限 NVIDIA |
| GGUF | "llama.cpp 格式" | 捆绑的 K-quant 变体 |
| 生产栈 | "vLLM K8s" | 第 17 阶段 · 18 参考部署 |
| 流水线模式 | "开发→预演→生产" | 相同权重上的 Ollama → llama.cpp → vLLM |

## 进一步阅读

- [AI Made Tools — vLLM vs Ollama vs llama.cpp vs TGI 2026](https://www.aimadetools.com/blog/vllm-vs-ollama-vs-llamacpp-vs-tgi/)
- [Morph — llama.cpp vs Ollama 2026](https://www.morphllm.com/comparisons/llama-cpp-vs-ollama)
- [n1n.ai — Comprehensive LLM Inference Engine Comparison](https://explore.n1n.ai/blog/llm-inference-engine-comparison-vllm-tgi-tensorrt-sglang-2026-03-13)
- [PremAI — 10 Best vLLM Alternatives 2026](https://blog.premai.io/10-best-vllm-alternatives-for-llm-inference-in-production-2026/)
- [TGI maintenance announcement](https://github.com/huggingface/text-generation-inference) — 发布说明。
- [vLLM v0.15.1 release notes](https://github.com/vllm-project/vllm/releases)
