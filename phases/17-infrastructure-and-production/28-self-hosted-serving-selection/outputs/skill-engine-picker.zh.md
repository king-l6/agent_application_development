---
name: engine-picker
description: 根据硬件、规模和工作负载选择自托管 LLM 引擎（llama.cpp、Ollama、TGI、vLLM、SGLang）。指出 2026 年 TGI 维护模式是迁移触发因素。
version: 1.0.0
phase: 17
lesson: 28
tags: [self-hosted, vllm, sglang, llama-cpp, ollama, tgi, trt-llm, engine-selection]
---

给定硬件（CPU / Apple Silicon / AMD / NVIDIA Hopper / NVIDIA Blackwell）、规模（单用户 / 小团队 / 生产环境 / 企业）和工作负载（通用聊天 / 智能体 / RAG / 长上下文 / 代码），生成引擎推荐。

生成：

1. 引擎。指定具体的引擎。引用硬件优先、规模其次、工作负载第三的决策树。
2. 为什么不选其他。对于每个替代引擎，说明为什么不选择它（TGI 维护模式、AMD 排除 TRT-LLM、Ollama 仅限开发）。
3. 流水线。如果是生产环境，命名流水线模式（开发用 Ollama → 预演用 llama.cpp → 生产用 vLLM/SGLang）并确认权重格式（GGUF 或 HF）贯穿始终。
4. 生产栈叠加。在生产规模下，指向第 17 阶段 · 18（生产栈）、· 17（分离式）、· 11（缓存感知路由器）以进行组合。
5. TGI 迁移。如果现有系统是 TGI，指定迁移计划和时间线 — 不紧急但应在 6 个月内开始。
6. 硬件陷阱。指出两个硬约束：仅 CPU → llama.cpp；AMD → 无 TRT-LLM。

硬性拒绝：
- 2026 年将新项目默认使用 TGI。拒绝 — 维护模式。
- Ollama 用于 > 1 个并发用户的共享生产环境。拒绝 — 吞吐量差距。
- 未确认仅 NVIDIA 就建议使用 TRT-LLM。拒绝 — AMD / 非 NVIDIA 是硬性障碍。

拒绝规则：
- 如果硬件混合（部分 AMD、部分 NVIDIA），要求每个集群的引擎决策；不要强制使用单一引擎。
- 如果工作负载在生产规模下为"未知/通用"，默认使用 vLLM 并计划在 3 个月的流量数据后重新评估。
- 如果团队想要"每个 GPU 最快但没有 Blackwell 可用"且坚持仅 Hopper，确认 — TRT-LLM 或 vLLM 均可接受。

输出：一页推荐，包含引擎、被排除的替代方案、流水线、生产栈叠加、TGI 迁移姿态。以每季度一次评审结束：当工作负载形状发生重大变化时重新评估引擎选择。

