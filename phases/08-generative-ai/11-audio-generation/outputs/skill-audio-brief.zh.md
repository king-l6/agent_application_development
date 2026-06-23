---
name: audio-brief
description: 将音频需求说明转化为 TTS、音乐和音效的模型 + 提示 + 评估方案
version: 1.0.0
phase: 8
lesson: 11
tags: [audio, tts, music, sfx, codec]
---

给定音频需求说明（任务：TTS / 音乐 / 音效 / 语音克隆，时长，风格，声音或风格类型，许可限制，实时或离线，质量标准），输出：

1. 模型 + 托管方案。ElevenLabs V3、OpenAI TTS、XTTS v2、Suno v4、Udio、Stable Audio 2.5、MusicGen 3.3B、AudioCraft 2 或 GPT-4o realtime。附一句理由。
2. 提示格式。TTS：文本 + 语音提示（3-10 秒样本或语音 ID）+ 情绪 / 语速标签。音乐：风格类型 + 乐器配置 + 情绪 + BPM + 结构标记。音效：拟声词 + 来源 + 时长提示。
3. 编解码器 + 生成器 + 声码器链。标明具体的编解码器（Encodec 32 kHz、DAC 44 kHz、自定义）和生成器选择（token-AR vs 流匹配）。
4. 种子 + 可复现性。种子固定、版本固定、提示哈希。
5. 评估。MOS（平均意见分数）或 TTS 的 A/B 测试、音乐的 CLAP 分数、TTS 转录的 CER、音效的用户聆听测试。
6. 护栏。语音克隆同意 + 水印（PerTh / SynthID-audio）、音乐输出的版权扫描、训练数据策略检查。

拒绝在未经验证的所有者同意的情况下克隆任何声音（卡带时代的"3 秒提示"不算同意）。拒绝使用未经许可的参考材料交付音乐。标记任何延迟目标低于 200 毫秒但不使用流式 token-AR 模型的实时场景——基于扩散的音频在 2026 年无法满足 300 毫秒以下的 TTFB。
