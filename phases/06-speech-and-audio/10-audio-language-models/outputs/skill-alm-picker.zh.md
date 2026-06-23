---
name: alm-picker
description: 为音频理解任务选择音频语言模型、基准测试子集、输出模态（文本 vs 语音）和安全防护。
version: 1.0.0
phase: 6
lesson: 10
tags: [alm, lalm, qwen-omni, audio-flamingo, gemini-audio, mmau]
---

给定任务（语音 / 声音 / 音乐 / 多音频 / 长音频、输出模态、延迟、许可），输出：

1. 模型。Qwen2.5-Omni-7B · Qwen3-Omni · SALMONN · Audio Flamingo 3 · AF-Next · LTU · GAMA · Gemini 2.5 Pro（API）· GPT-4o Audio（API）。一句话说明理由。
2. 用于验证的基准测试子集。MMAU-Pro 语音 / 声音 / 音乐 / 多音频 · LongAudioBench · AudioCaps · ClothoAQA。选择与用户任务匹配的维度。
3. 输出模态。仅文本 · 文本 + 语音（Qwen-Omni、GPT-4o Audio）。如果需要，为额外的语音解码器预留预算。
4. 安全防护。当模型的多音频分数 < 30%（接近随机）时，拒绝需要多音频比较的提示。对于 > 10 分钟的输入，先进行说话人日志再使用 LALM。
5. 升级路径。何时该任务应回退到专用模型 -- Whisper 用于转录，BEATs 用于分类，pyannote 用于说话人日志。LALM 在每个单项上并非最优。

拒绝在未验证模型在 MMAU-Pro 多音频子集上得分 > 40% 的情况下发布多音频比较任务。拒绝长音频（> 10 分钟）而没有上游说话人日志。标记任何使用供应商报告数字而不独立重新验证的部署。

示例输入："合规审计：转录 10 分钟的银行通话录音 + 检测座席是否阅读了强制性披露声明。"

示例输出：
- 模型：Whisper-large-v3-turbo 用于转录 + Gemini 2.5 Pro（通过 API）用于在转录文本上进行披露检查的 QA。直接在原始音频上使用 LALM 很诱人，但长音频 LALM 的准确率在 10 分钟后会下降。
- 基准测试子集：MMAU-Pro 语音子集（Gemini 2.5 Pro = 73.4%）-- 覆盖语音推理维度。同时在你自己的 50 通黄金标准电话集上进行抽查。
- 输出模态：仅文本。审计报告不需要语音输出。
- 安全防护：先用 pyannote 3.1 进行说话人日志；按说话人分别发送片段；记录每次通话的置信度分数。
- 升级路径：如果某通电话未能通过披露检查，转交人工审核员而非自主标记。
