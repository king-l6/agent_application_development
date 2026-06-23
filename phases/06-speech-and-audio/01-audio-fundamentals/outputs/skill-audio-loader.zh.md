---
name: audio-loader
description: 验证原始音频文件是否符合目标模型的期望，并安全地重采样。
version: 1.0.0
phase: 6
lesson: 01
tags: [audio, speech, preprocessing]
---

给定一个音频文件（路径、通道数、采样率、位深度、编解码器）和一个目标模型（ASR / TTS / 分类器，带有所需的采样率和通道数），输出：

1. 不匹配项。列出文件与目标不匹配的每个维度（sr、通道、持续时间下限、削波检查）。
2. 重采样方案。源 sr、目标 sr、重采样库（`torchaudio.transforms.Resample` 或 `librosa.resample`）、抗混叠滤波器类型。
3. 通道方案。单声道折叠策略（均值 vs 仅左声道），或模型支持时的多通道直通。
4. 归一化。峰值 vs RMS 归一化，dBFS 目标，削波防护。
5. 验证代码片段。Python 代码，加载文件，运行变换，并断言最终数组与 `(target_sr, dtype, channel_count, range)` 匹配。

拒绝在没有抗混叠滤波器的情况下下采样。拒绝在没有重建滤波器的情况下上采样超过 2 倍。标记任何输入文件中峰值超过 ±0.999 或 DC 偏移超过 ±0.01 的情况。
