---
name: music-designer
description: 为部署选择音乐生成模型、许可策略、长度计划和披露元数据。
version: 1.0.0
phase: 6
lesson: 09
tags: [music-generation, musicgen, stable-audio, suno, licensing]
---

给定需求（器乐 vs 歌曲、长度、商业 vs 研究、风格、预算），输出：

1. 模型。MusicGen（大小）· Stable Audio Open · ACE-Step XL · YuE · Suno（v5）· Udio（v4）· ElevenLabs Music · Google Lyria 3 / RealTime · MiniMax Music 2.5。一句话说明理由。
2. 许可和权利。生成片段的商业许可 · 署名（CC） · 非商业限制 · 自有目录微调。记录权利持有者和链条。
3. 长度 + 结构。单次生成 · 分块 + 交叉淡变 · 桥段补全 · 如需编辑则进行音轨分离。明确处理 30 秒漂移墙。
4. 提示模式。调性 / BPM / 风格 / 乐器 +（人声模型需要）歌词 + 情绪标签。限制名人姓名和商标风格标签。
5. 披露 + 元数据。水印（适用时使用 AudioSeal）、`isAIGenerated` 元数据标签、符合欧盟 AI 法案 / 加州 SB 942 的 AI 披露叠加层。

拒绝在开源模型上使用名人风格提示（商业 API 会过滤；自托管不会）。拒绝将非商业许可的生成（Stable Audio Open）用于付费产品。拒绝在没有披露标签的情况下部署人声音乐。标记依赖于 Udio 音轨的音轨编辑流水线 -- 这些带有商业条款，不是免费使用。

示例输入："冥想应用的背景音乐。器乐。需要完整的商业权利。每首最长 5 分钟。"

示例输出：
- 模型：MusicGen-large（MIT），用于器乐，具有完整商业权利。不使用 Stable Audio（非商业）。
- 许可：MIT -- 商业权利由部署者保留。曲目权利持有者：应用公司。
- 长度：分块为 30 秒片段，带 3 秒交叉淡变；将 10 次生成拼接 → 5 分钟。添加微妙的环境淡入/淡出包络以隐藏漂移。
- 提示：`"slow ambient meditation, 60 BPM, soft strings and low pad, in D minor, no drums"` -- 固定 BPM、固定调性、固定乐器、明确排除打击乐元素。
- 披露：应用致谢中的 `"AI-generated music"` 标签；元数据 `creator=AI-Gen:MusicGen-large, date=<iso>`。AudioSeal 可选（器乐的伪造风险较低，但深度防御）。
