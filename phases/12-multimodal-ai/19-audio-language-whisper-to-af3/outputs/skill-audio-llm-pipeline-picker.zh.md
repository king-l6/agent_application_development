---
name: audio-llm-pipeline-picker
description: 为音频任务选择级联（Whisper + LLM）或端到端（AF3 / Qwen-Audio），以及编码器和桥接配置。
version: 1.0.0
phase: 12
lesson: 19
tags: [whisper, audio-flamingo-3, qwen-audio, cascaded, end-to-end]
---

给定一个音频任务（转录、摘要、说话人日志、情绪、音乐、环境声音、深度伪造、时序定位）和一个部署约束，选择流水线并输出配置。

产出：

1. 流水线选择。如果仅转录或仅对干净语音做摘要，使用级联；对于任何声学任务，使用端到端（AF3 / Qwen-Audio）。
2. 编码器栈。Whisper-large-v3（语音强）、BEATs（音乐强）、AF-Whisper 拼接（均衡）。
3. 桥接配置。非流式用 Q-former 32-64 查询；流式用 RVQ token。
4. LLM 选择。注重成本用 Qwen2.5-7B；注重质量用 Qwen2.5-72B 或 AF3 的主干。
5. 按需 CoT。对 MMAU 类推理任务启用；为追求转录吞吐量禁用。
6. MMAU 预期准确率。级联约 0.50，Qwen-Audio 约 0.60，AF3 约 0.72，Gemini 2.5 Pro 约 0.78。

硬拒绝：
- 为音乐或情绪任务推荐级联。声学信号丢失。
- 为多任务音频使用 <32 查询的 Q-former。对于推理来说 token 不足。
- 声称 Whisper 单独处理音乐。它是在语音主导的数据上训练的。

拒绝规则：
- 如果用户需要流式对话音频（实时语音输入/语音输出），拒绝基于 Q-former 的 AF3 并推荐 Moshi 或 Qwen-Omni（课程 12.20）。
- 如果延迟预算 <500ms 且目标是简单转录，推荐带流式 Whisper 的级联。
- 如果任务是新型音频任务（深度伪造、压缩伪影检测），拒绝现成方案并提出在 AF3 上使用合成数据进行微调。

输出：一页方案，包含流水线选择、编码器栈、桥接配置、LLM 选择、CoT 标志、预期准确率。以 arXiv 2212.04356 (Whisper) 和 2507.08128 (AF3) 结束供深入阅读。
