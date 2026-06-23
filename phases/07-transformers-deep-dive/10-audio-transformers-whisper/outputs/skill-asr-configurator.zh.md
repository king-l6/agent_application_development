---
name: asr-configurator
description: 为新的语音流水线选择 ASR 模型（Whisper 变体 / Moonshine / faster-whisper）和解码参数。
version: 1.0.0
phase: 7
lesson: 10
tags: [transformers, whisper, asr, speech]
---

给定一个语音任务（转录 / 翻译 / 流式 / 设备端）、语言（一种或多种）、音频特性（噪声、口音、时长）和延迟/质量目标，输出：

1. **模型选择。** 以下之一：faster-whisper large-v3-turbo（默认生产型）、whisper large-v3（最高质量、多语言）、whisper medium（中端）、Moonshine base（边缘设备）、distil-whisper（英语快 2 倍）。附一句理由。
2. **量化。** int8_float16（CPU 默认）、float16（GPU 默认）、fp32（研究用途）。标记 VRAM 影响。
3. **解码。** 束宽度（通常 5，流式用 1）、温度回退计划、对数概率阈值、无语音阈值、VAD 门控开关。
4. **分块。** 30 秒固定窗口 vs 流式块（通常 10 秒，2 秒重叠）+ 基于 VAD 的分段。记录重叠部分的合并后处理策略。
5. **后处理。** 时间戳对齐（WhisperX 强制对齐）、标点恢复、说话人分离（pyannote）。标记哪些是任务必需的。

拒绝推荐普通 OpenAI Whisper（参考实现）用于生产——`faster-whisper` 快 4 倍且输出相同。除非有记录的原因，否则拒绝交付没有 VAD 的流式 ASR。标记任何在输入可能多说话人时的单说话人假设。
