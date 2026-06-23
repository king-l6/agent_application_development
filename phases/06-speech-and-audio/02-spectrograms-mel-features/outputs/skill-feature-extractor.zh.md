---
name: feature-extractor
description: 选择特征类型、Mel 数量、帧/步长和归一化方案，以匹配下游音频模型。
version: 1.0.0
phase: 6
lesson: 02
tags: [audio, features, spectrogram, mel]
---

给定一个目标模型（ASR / TTS / 分类器 / 说话人 / 音乐）和输入音频（采样率、领域），输出：

1. 特征类型。对数 Mel、Mel、MFCC、原始波形或离散编解码器（EnCodec、SoundStream）。一句话理由。
2. Mel 数量和频率范围。`n_mels`、`fmin`、`fmax`。理由与领域（语音 vs 音乐）和模型目标相关。
3. 帧和步长。`frame_len`、`hop_len`、窗口类型。理由与所需的时间分辨率相关。
4. 归一化。按话语均值/方差、全局统计量或带固定参考的 dB；在特征提取之前或之后。
5. 验证代码片段。Python 代码，在 1 秒参考片段上打印结果形状、min/max、mean/std，并断言它们与训练时匹配。

拒绝提供帧/步长/Mel 数量与目标模型已发布训练配置不同的特征流水线。标记任何基于 MFCC 的 Whisper 或 Parakeet 配置为错误 —— 这些模型消费对数 Mel。标记任何没有归一化断言的的特征提取器。
