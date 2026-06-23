---
name: audio-evaluator
description: 为任何音频模型发布选择指标、基准、标准化规则和报告格式。
version: 1.0.0
phase: 6
lesson: 17
tags: [evaluation, wer, mos, utmos, eer, der, fad, mmau, leaderboard]
---

给定任务（ASR / TTS / 克隆 / 说话人验证 / 说话人分离 / 分类 / 音乐 / LALM / 流式 S2S），输出：

1. **主要指标。** WER · MOS · UTMOS · SECS · EER · DER · mAP · FAD · MMAU-Pro 准确率 · 延迟 P95。选择一个。
2. **辅助指标。** 1-3 个额外维度（速度、多样性、鲁棒性）及理由。
3. **标准化规则。** 小写化、去标点、数字展开、空白折叠。使用 Whisper-normalizer 或自定义，记录之。
4. **公开基准。** 要报告的规范排行榜（Open ASR、TTS Arena、MMAU-Pro、VoxCeleb1-O、AudioSet、LongAudioBench 等）。
5. **内部测试集。** 保留的领域数据，含 N 个样本；人口统计/声学分片细分。
6. **报告格式。** 分布（延迟的 P50/P95/P99；分类的每类召回率；MMAU 的每类别）。发布说明模板。

拒绝延迟的单一数值评估（报告百分位数）。拒绝分类的仅聚合评估（按类报告）。拒绝没有 MOS/UTMOS 和 SECS（涉及克隆时）的 TTS 发布。拒绝没有 WER 标准化规范的 ASR 发布。拒绝仅用 FAD 的音乐发布——始终搭配人工 MOS 小组。

示例输入："发布一个新的英西对话式 TTS。需要说服团队它优于现有的 Cartesia-Sonic 基线。"

示例输出：
- 主要指标：UTMOS（每种语言 50 个提示的配对音频样本）+ 人工小组 MOS（每种语言 20 个听者，盲测 A/B 对比基线）。
- 辅助指标：TTFA 中位数及 P95（必须匹配基线）；SECS &gt; 0.80 与固定语音参考对比（无说话人退化）；往返 ASR 的 CER（Whisper-large-v3-turbo）&lt; 2%。
- 标准化：往返 WER 使用 Whisper-normalizer 英语 + Hugging Face 多语言标准化器西班牙语。
- 公开基准：TTS Arena（英语）和 Artificial Analysis Speech 用于相对 ELO 定位。目标：与最接近的竞争对手 ELO 差距在 50 以内。
- 内部测试集：200 个保留提示（每种语言 100 个），涵盖金钱、日期、产品名、两句话叙述、情感朗读、代码切换。10 个不同人口统计特征的声音。
- 报告：发布说明包含标题数据（UTMOS + MOS）、P50/P95 TTFA 直方图、SECS 累积分布函数、每类别 CER 细分、失败模式标注（代码切换提示在 X% 失败）。
