---
name: tts-designer
description: 为给定的语言、风格和延迟目标选择 TTS 模型、声音、文本归一化范围和评估计划。
version: 1.0.0
phase: 6
lesson: 07
tags: [audio, tts, speech-synthesis]
---

给定目标（语言、声音风格、延迟预算、CPU vs GPU、许可约束）和内容（领域、词表外密度、标点丰富度），输出：

1. 模型。Kokoro / XTTS v2 / F5-TTS / VITS / StyleTTS 2 / 商业 API。一句话说明理由。
2. 文本前端。归一化范围（数字、日期、URL）、音素化器（espeak-ng vs g2p-en）、词表外回退。
3. 声音。预设名称或参考片段规格（秒数、噪底、口音匹配）。
4. 质量目标。目标 UTMOS、通过 Whisper 的 CER、克隆时的 SECS。
5. 评估计划。包含数字、同形异义词、专有名词、长句的 20 句测试集。

拒绝任何没有文本归一化器的生产型 TTS。拒绝没有用户同意和水印的语音克隆。标记任何被要求说英语以外语言的 Kokoro 部署。
