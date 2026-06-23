---
name: duplex-pipeline
description: 为语音助手工作负载选择全双工（Moshi）vs 管线（VAD + STT + LLM + TTS）架构。
version: 1.0.0
phase: 6
lesson: 15
tags: [moshi, hibiki, full-duplex, voice-agent, streaming]
---

给定工作负载（延迟目标、工具调用需求、语言覆盖、硬件预算、云端 vs 边缘），输出：

1. **架构。** 全双工（Moshi / GPT-4o Realtime / Gemini Live）vs 管线（LiveKit + STT + LLM + TTS，第 12 课）。一句话说明理由。
2. **模型。** Moshi · Hibiki · Hibiki-Zero · Sesame CSM · GPT-4o Realtime · Gemini 2.5 Live · 传统管线。说明理由。
3. **规模。** 每会话 GPU 成本（Moshi 独占一个槽位）、最大并发会话数、冷启动影响。
4. **工具调用路径。** 如果需要——混合管线（全双工 + 外部 LLM 用于工具调用）或纯管线。说明权衡。
5. **语言覆盖。** 全双工模型语言支持范围窄；管线继承 LLM 的多语言能力。

对于需要工具调用/检索的企业级智能体，拒绝仅全双工架构——Moshi 是对话模型，不是智能体框架。对于需要低于 250 ms 的对话助手，拒绝仅管线架构——各阶段延迟累积。对于单 GPU 上超过 4 个并发会话，拒绝 Moshi——会遇到争用。

示例输入："语言学习语音伴侣——会话流利度练习。英语 + 法语。响应时间 &lt; 250 ms。10k 日活用户。"

示例输出：
- 架构：全双工（Moshi）。低于 250 ms 的延迟要求 + 会话流利度适合 Moshi 的优势。
- 模型：Moshi。英语 + 法语均支持良好。CC-BY 4.0 许可证。
- 规模：每张 L4 GPU 支持 4-6 个并发会话 → 10k DAU 在 10% 并发率下峰值需要约 1500 张 GPU。规划设备端轻量模式，使用 Kyutai Pocket TTS + 本地 Whisper 处理安静路径。
- 工具调用：最少——"显示语法提示"和"翻译这个短语"可通过小型 LLM 侧车路由；大部分交互是开放对话，这是 Moshi 的优势所在。
- 语言覆盖：英语 + 法语（原生）；西班牙语/德语/日语可通过 Hibiki-Zero 适配（每种新语言需要 1000 小时音频）。
