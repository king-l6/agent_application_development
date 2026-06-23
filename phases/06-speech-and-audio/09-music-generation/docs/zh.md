# 音乐生成 -- MusicGen、Stable Audio、Suno 与许可地震

> 2026 年的音乐生成：Suno v5 和 Udio v4 主导商业领域；MusicGen、Stable Audio Open 和 ACE-Step 引领开源。技术问题基本已解决。法律问题（华纳音乐 5 亿美元和解、环球音乐集团和解）在 2025-2026 年重塑了该领域。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 02（频谱图），阶段 4 · 10（扩散模型）
**时间：** ~75 分钟

## 问题

文本 → 30 秒到 4 分钟的音乐片段，带歌词、人声和结构。三个子问题：

1. **器乐生成。** 像"低保真嘻哈鼓加温暖键盘"这样的文本 → 音频。MusicGen、Stable Audio、AudioLDM。
2. **歌曲生成（带人声 + 歌词）。** "关于德州雨夜的乡村歌曲" → 完整歌曲。Suno、Udio、YuE、ACE-Step。
3. **条件 / 可控。** 扩展现有片段、重新生成桥段、切换风格、分离音轨或补全。Udio 的补全 + 音轨分离是 2026 年需要对标的功能。

## 概念

![音乐生成：词元语言模型 vs 扩散，2026 年模型地图](../assets/music-generation.svg)

### 基于神经编解码器词元的词元语言模型

Meta 的 **MusicGen**（2023，MIT）及其众多衍生模型：以文本/旋律嵌入为条件，自回归预测 EnCodec 词元（32 kHz，4 个码本），用 EnCodec 解码。300M - 3.3B 参数。强基线；超过 30 秒时表现不佳。

**ACE-Step**（开源，4B XL 于 2026 年 4 月发布）将其扩展到全歌曲歌词条件生成。开源社区最接近 Suno 的方案。

### 在梅尔谱或潜在空间上的扩散

**Stable Audio（2023）** 和 **Stable Audio Open（2024）**：在压缩音频上的潜在扩散。在循环、声音设计、环境纹理方面表现出色。在结构化完整歌曲方面不佳。

**AudioLDM / AudioLDM2**：通过类似 T2I 的潜在扩散进行文本到音频生成，泛化到音乐、音效和语音。

### 混合（生产级）-- Suno、Udio、Lyria

闭源权重。可能是 AR 编解码器语言模型 + 基于扩散的声码器，配有专门的声乐/鼓/旋律头部。Suno v5（2026）是 ELO 1293 质量领导者。Udio v4 增加了补全 + 音轨分离（贝斯、鼓、人声可单独下载）。

### 评估

- **FAD（弗雷歇音频距离）。** 使用 VGGish 或 PANNs 特征计算的生成与真实音频分布之间的嵌入级距离。越低越好。MusicGen small：在 MusicCaps 上 FAD 为 4.5；SOTA 约为 3.0。
- **音乐性（主观）。** 人类偏好。Suno v5 ELO 1293 领先。
- **文本-音频对齐。** 提示与输出之间的 CLAP 分数。
- **音乐性伪影。** 节拍错位的过渡、人声短语漂移、超过 30 秒后结构丧失。

## 2026 年模型地图

| 模型 | 参数 | 长度 | 人声 | 许可 |
|-------|--------|--------|--------|---------|
| MusicGen-large | 3.3B | 30 秒 | 无 | MIT |
| Stable Audio Open | 1.2B | 47 秒 | 无 | Stability 非商业 |
| ACE-Step XL（2026 年 4 月） | 4B | > 2 分钟 | 有 | Apache-2.0 |
| YuE | 7B | > 2 分钟 | 有，多语言 | Apache-2.0 |
| Suno v5（闭源） | ？ | 4 分钟 | 有，ELO 1293 | 商业 |
| Udio v4（闭源） | ？ | 4 分钟 | 有 + 音轨 | 商业 |
| Google Lyria 3（闭源） | ？ | 实时 | 有 | 商业 |
| MiniMax Music 2.5 | ？ | 4 分钟 | 有 | 商业 API |

## 法律环境（2025-2026）

- **华纳音乐 vs Suno 和解。** 5 亿美元。WMG 现在监督 Suno 上的 AI 肖像、音乐权利和用户生成曲目。Udio 上也达成了类似的环球音乐集团和解。
- **欧盟 AI 法案** + **加利福尼亚州 SB 942**：AI 生成音乐必须披露。
- **Riffusion / MusicGen** 在 MIT 许可下没有合规负担，但也没有商业人声。

安全可发布的模式：

1. 仅生成器乐（MusicGen、Stable Audio Open，MIT/CC0 输出）。
2. 使用商业 API（Suno、Udio、ElevenLabs Music），每次生成单独授权。
3. 在自有或授权目录上训练（大多数企业最终选择此路）。
4. 在生成内容上标记水印 + 元数据。

## 构建

### 第 1 步：使用 MusicGen 生成

```python
from audiocraft.models import MusicGen
import torchaudio

model = MusicGen.get_pretrained("facebook/musicgen-small")
model.set_generation_params(duration=10)
wav = model.generate(["upbeat synthwave with driving drums, 128 BPM"])
torchaudio.save("out.wav", wav[0].cpu(), 32000)
```

三种大小：`small`（300M，快）、`medium`（1.5B）、`large`（3.3B）。对于"这个想法是否成立"的验证，Small 已足够。

### 第 2 步：旋律条件生成

```python
melody, sr = torchaudio.load("humming.wav")
wav = model.generate_with_chroma(
    ["jazz piano cover"],
    melody.squeeze(),
    sr,
)
```

MusicGen-melody 接收色度图，在保留旋律的同时交换音色。适用于"把这段旋律变成弦乐四重奏"。

### 第 3 步：FAD 评估

```python
from frechet_audio_distance import FrechetAudioDistance
fad = FrechetAudioDistance()

fad.get_fad_score("generated_folder/", "reference_folder/")
```

计算 VGGish 嵌入距离。适用于风格级别的回归测试；不能替代人类听众。

### 第 4 步：集成到 LLM 音乐工作流

结合第 7-8 课的想法：

```python
prompt = "写一段 30 秒的爵士循环。描述鼓、贝斯和钢琴的声部。"
description = llm.complete(prompt)
music = musicgen.generate([description], duration=30)
```

## 使用

| 目标 | 技术栈 |
|------|-------|
| 器乐声音设计 | Stable Audio Open |
| 游戏 / 自适应音乐 | Google Lyria RealTime（闭源） |
| 带人声的完整歌曲（商业） | Suno v5 或 Udio v4，需明确授权 |
| 带人声的完整歌曲（开源） | ACE-Step XL 或 YuE |
| 短广告配乐 | MusicGen 在哼唱参考上的旋律条件生成 |
| 音乐视频背景 | MusicGen + Stable Video Diffusion |

## 2026 年仍然存在的陷阱

- **版权洗白提示。** "模仿 Taylor Swift 风格的歌曲" -- 商业版 Suno/Udio 现在会过滤这些，开源模型不会。添加你自己的过滤列表。
- **超过 30 秒的重复 / 漂移。** AR 模型会循环。对多个生成结果进行交叉淡变，或使用 ACE-Step 实现结构一致性。
- **节奏漂移。** 模型会偏离 BPM。在提示中使用 BPM 标签，并用 librosa 的 `beat_track` 进行后过滤。
- **人声清晰度。** Suno 效果出色；开源模型在词汇上通常含糊不清。如果歌词重要，使用商业 API 或微调。
- **单声道输出。** 开源模型生成单声道或伪立体声。通过适当的立体声重建（ezst、Cartesia 的立体声扩散）进行升级。

## 交付

保存为 `outputs/skill-music-designer.md`。为音乐生成部署选择模型、许可策略、长度/结构计划和披露元数据。

## 练习

1. **简单。** 运行 `code/main.py`。它以 ASCII 符号生成"生成式"和弦进行 + 鼓点模式 -- 一个音乐生成的卡通版本。如果你愿意，可以通过任何 MIDI 渲染器播放。
2. **中等。** 安装 `audiocraft`，使用 MusicGen-small 在 4 个不同风格提示下生成 10 秒片段，对照参考风格集测量 FAD。
3. **困难。** 使用 ACE-Step（或 MusicGen-melody），用不同的音色提示生成同一旋律的三个变体。计算与提示的 CLAP 相似度以验证对齐。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| FAD | 音频 FID | 真实与生成嵌入分布之间的弗雷歇距离。 |
| 色度图 | 旋律作为音高 | 12 维逐帧向量；旋律条件生成的输入。 |
| 音轨 | 乐器轨道 | 分离的贝斯 / 鼓 / 人声 / 旋律，WAV 格式。 |
| 补全 | 重写某个段落 | 遮盖一个时间窗口；模型只重新生成该部分。 |
| CLAP | 文本-音频 CLIP | 对比性音频-文本嵌入；评估文本-音频对齐。 |
| EnCodec | 音乐编解码器 | Meta 的神经编解码器，被 MusicGen 使用；32 kHz，4 个码本。 |

## 进一步阅读

- [Copet et al. (2023). MusicGen](https://arxiv.org/abs/2306.05284) -- 开源自回归基准。
- [Evans et al. (2024). Stable Audio Open](https://arxiv.org/abs/2407.14358) -- 声音设计的默认选择。
- [ACE-Step](https://github.com/ace-step/ACE-Step) -- 开源 4B 全歌曲生成器，2026 年 4 月。
- [Suno v5 平台文档](https://suno.com) -- 商业质量领导者。
- [AudioLDM2](https://arxiv.org/abs/2308.05734) -- 用于音乐 + 音效的潜在扩散。
- [WMG-Suno 和解报道](https://www.musicbusinessworldwide.com/suno-warner-music-settlement/) -- 2025 年 11 月先例。
