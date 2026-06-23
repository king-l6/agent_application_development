# 音频生成

> 音频是一个 16-48 kHz 的一维信号。一段五秒的片段包含 80-240k 个采样点。没有 Transformer 能直接处理那么长的序列。2026 年每个生产级音频模型的解决方案都是一样的：神经编解码器（Encodec、SoundStream、DAC）将音频压缩为 50-75 Hz 的离散 token，再由 Transformer 或扩散模型生成 token。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 02（音频特征），阶段 6 · 04（ASR），阶段 8 · 06（DDPM）
**时间：** ~45 分钟

## 问题

三个音频生成任务：

1. **文本转语音（TTS）。** 给定文本，生成语音。干净的语音是窄带的，具有强烈的语音结构——通过 token 上的 Transformer 可以很好地解决。VALL-E（微软）、NaturalSpeech 3、ElevenLabs、OpenAI TTS。
2. **音乐生成。** 给定提示（文本、旋律、和弦进行、风格类型），生成音乐。分布要广泛得多。MusicGen（Meta）、Stable Audio 2.5、Suno v4、Udio、Riffusion。
3. **音效 / 声音设计。** 给定提示，生成环境音或拟音。AudioGen、AudioLDM 2、Stable Audio Open。

三者都运行在相同的基础之上：神经音频编解码器 + token-AR 或扩散生成器。

## 概念

![音频生成：编解码器 token + Transformer 或扩散](../assets/audio-generation.svg)

### 神经音频编解码器

Encodec（Meta，2022）、SoundStream（Google，2021）、Descript Audio Codec（DAC，2023）。卷积编码器将波形压缩为每时间步的向量；残差向量量化（RVQ）将每个向量转换为 K 个码本级联的索引。解码器将其逆向还原。24 kHz 音频在 2 kbps 下使用 8 个 75 Hz 的 RVQ 码本 = 600 tokens/sec。

```
波形（16000 采样点/秒）
    └─ 编码器卷积 ─┐
                     ├─ RVQ 第1层 → 75 Hz 索引
                     ├─ RVQ 第2层 → 75 Hz 索引
                     ├─ ...
                     └─ RVQ 第8层
```

### 两种生成范式

**Token 自回归。** 将 RVQ token 展平为序列，运行仅解码器的 Transformer。MusicGen 使用"延迟并行"（delayed parallel）方式，以每流偏移的方式并行输出 K 个码本流。VALL-E 根据文本提示 + 3 秒语音样本生成语音 token。

**潜在扩散。** 将编解码器 token 打包为连续潜变量，或用分类扩散对其进行建模。Stable Audio 2.5 对连续音频潜变量使用流匹配。AudioLDM 2 使用文本到梅尔谱再到音频的扩散。

2024-2026 年的趋势：流匹配正在赢得音乐领域（更快的推理、更干净的样本），而 token-AR 仍然主导语音领域，因为它天生因果且易于流式传输。

## 产品格局

| 系统 | 任务 | 主干架构 | 延迟 |
|--------|------|----------|---------|
| ElevenLabs V3 | TTS | Token-AR + 神经声码器 | ~300ms 首 token |
| OpenAI GPT-4o audio | 全双工语音 | 端到端多模态 AR | ~200ms |
| NaturalSpeech 3 | TTS | 潜在流匹配 | 非流式 |
| Stable Audio 2.5 | 音乐 / 音效 | DiT + 音频潜变量流匹配 | ~10s 每分钟片段 |
| Suno v4 | 完整歌曲 | 未公开；疑似 token-AR | ~30s 每首歌 |
| Udio v1.5 | 完整歌曲 | 未公开 | ~30s 每首歌 |
| MusicGen 3.3B | 音乐 | Encodec 32kHz 上的 Token-AR | 实时 |
| AudioCraft 2 | 音乐 + 音效 | 流匹配 | ~5s 每 5s 片段 |
| Riffusion v2 | 音乐 | 频谱扩散 | ~10s |

## 动手构建

`code/main.py` 模拟了核心思想：在从两种不同"风格"生成的合成"音频 token"序列上训练一个微小的下一个 token Transformer。以风格为条件进行采样。

### 第 1 步：合成音频 token

```python
def make_tokens(style, length, vocab_size, rng):
    if style == 0:  # "类似语音"：交替
        return [i % vocab_size for i in range(length)]
    # "类似音乐"：斜坡
    return [(i * 3) % vocab_size for i in range(length)]
```

### 第 2 步：训练一个微小的 token 预测器

一个以风格为条件的二元语法预测器。关键点在于这个模式：编解码器 token → 交叉熵训练 → 自回归采样。

### 第 3 步：条件采样

给定风格 token 和起始 token，从预测分布中采样下一个 token。持续生成 20-40 个 token。

## 陷阱

- **编解码器质量限制输出质量。** 如果编解码器无法忠实地表示某个声音，再多的生成器质量也无济于事。DAC 是目前最好的开源编解码器。
- **RVQ 错误累积。** 每个 RVQ 层对前一层的残差进行建模。第 1 层上的错误会传播。在更高层上使用温度为 0 的采样有所帮助。
- **音乐结构。** 30 秒的 token 在 75 Hz 下超过 20k 个 token。对 Transformer 来说很困难。MusicGen 使用滑动窗口 + 提示延续；Stable Audio 使用较短的片段 + 交叉淡入淡出。
- **边界伪影。** 生成片段之间的交叉淡入淡出需要仔细的重叠相加处理。
- **对干净数据的渴求。** 音乐生成器需要数万小时的授权音乐。Suno / Udio 与 RIAA 的诉讼（2024）将这一点摆上了台面。
- **语音克隆伦理。** 3 秒样本加上文本提示就足以让 VALL-E / XTTS / ElevenLabs 克隆一个声音。每个生产模型都需要滥用检测 + 退出名单。

## 使用建议

| 任务 | 2026 年推荐方案 |
|------|------------|
| 商业 TTS | ElevenLabs、OpenAI TTS 或 Azure Neural |
| 语音克隆（已确认同意） | XTTS v2（开源）或 ElevenLabs Pro |
| 背景音乐，快速生成 | Stable Audio 2.5 API、Suno 或 Udio |
| 带歌词的音乐 | Suno v4 或 Udio v1.5 |
| 音效 / 拟音 | AudioCraft 2、ElevenLabs SFX 或 Stable Audio Open |
| 实时语音助手 | GPT-4o realtime 或 Gemini Live |
| 开源权重音乐研究 | MusicGen 3.3B、Stable Audio Open 1.0、AudioLDM 2 |
| 配音 / 翻译 | HeyGen、ElevenLabs Dubbing |

## 交付技能

保存 `outputs/skill-audio-brief.md`。技能接收音频简要说明（任务、时长、风格、声音、许可证）并输出：模型 + 托管方案、提示格式（风格标签、风格描述符、结构标记）、编解码器 + 生成器 + 声码器链、种子协议和评估计划（MOS / CLAP 分数 / TTS 的 CER / 用户 A/B 测试）。

## 练习

1. **简单。** 运行 `code/main.py` 并显式设置风格。验证生成的序列是否符合该风格的模式。
2. **中等。** 添加延迟并行解码：模拟 2 个必须保持 1 步偏移的 token 流。训练一个联合预测器。
3. **困难。** 使用 HuggingFace transformers 在本地运行 MusicGen-small。用三个不同的提示生成一个 10 秒片段；对风格一致性进行 A/B 测试。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| Codec | "神经压缩" | 音频的编码器/解码器；典型输出为 50-75 Hz 的 token。 |
| RVQ | "残差 VQ" | K 个量化器的级联；每个对前一个的残差进行建模。 |
| Token | "一个编解码器符号" | 码本中的离散索引；通常为 1024 或 2048。 |
| Delayed parallel | "偏移码本" | 以交错偏移发射 K 个 token 流以缩短序列长度。 |
| Flow matching | "2024 年音频领域的赢家" | 比扩散更直的路径；更快的采样。 |
| Voice prompt | "3 秒样本" | 引导克隆声音的说话人嵌入或 token 前缀。 |
| Mel spectrogram | "视觉表示" | 对数幅度感知频谱；被许多 TTS 系统使用。 |
| Vocoder | "梅尔谱转波形" | 将梅尔频谱转换回音频的神经组件。 |

## 生产注意事项：音频是一个流式问题

音频是用户期望*在生成时就能听到*的输出模态，而不是一次性全部输出。在生产层面，这意味着 TPOT（每输出 token 时间）很重要，因为用户的收听速度是目标吞吐量——而不是他们的阅读速度。对于以 ~75 tokens/秒（Encodec）进行 token 化的 16kHz 音频，服务器必须为每个用户生成 ≥75 tokens/秒才能保持播放流畅。

两个架构后果：

- **流匹配音频模型无法轻易流式传输。** Stable Audio 2.5 和 AudioCraft 2 一次性渲染固定长度的片段。要进行流式传输，你需要对片段进行分块并重叠边界——可以想象为滑动窗口扩散——这比编解码器 AR 模型增加了 100-300ms 的延迟开销。

如果产品是"实时语音聊天"或"实时音乐续奏"，选择编解码器 AR 路径。如果是"提交后渲染一个 30 秒片段"，流匹配在质量和总延迟上胜出。

## 延伸阅读

- [Defossez et al. (2022). Encodec: High Fidelity Neural Audio Compression](https://arxiv.org/abs/2210.13438) — 编解码器标准。
- [Zeghidour et al. (2021). SoundStream](https://arxiv.org/abs/2107.03312) — 第一个广泛使用的神经音频编解码器。
- [Kumar et al. (2023). High-Fidelity Audio Compression with Improved RVQGAN (DAC)](https://arxiv.org/abs/2306.06546) — DAC。
- [Wang et al. (2023). Neural Codec Language Models are Zero-Shot Text to Speech Synthesizers (VALL-E)](https://arxiv.org/abs/2301.02111) — VALL-E。
- [Copet et al. (2023). Simple and Controllable Music Generation (MusicGen)](https://arxiv.org/abs/2306.05284) — MusicGen。
- [Liu et al. (2023). AudioLDM 2: Learning Holistic Audio Generation with Self-supervised Pretraining](https://arxiv.org/abs/2308.05734) — AudioLDM 2。
- [Stability AI (2024). Stable Audio 2.5](https://stability.ai/news/introducing-stable-audio-2-5) — 2025 使用流匹配的文本到音乐。
