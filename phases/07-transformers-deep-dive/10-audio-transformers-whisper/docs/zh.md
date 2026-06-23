# 音频 Transformer — Whisper 架构

> 音频是频率随时间变化的图像。Whisper 是一个吃进梅尔语谱图并说出来文本的 ViT。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 7 · 05（完整 Transformer），阶段 7 · 08（编码器-解码器），阶段 7 · 09（ViT）
**时间：** ~45 分钟

## 问题

在 Whisper（OpenAI，Radford 等人，2022）之前，最先进的自动语音识别（ASR）意味着 wav2vec 2.0 和 HuBERT——自监督特征提取器加上微调头部。高质量、昂贵的数据管道、领域脆弱。多语言语音识别需要每种语言家族使用单独的模型。

Whisper 下了三个赌注：

1. **在所有数据上训练。** 从互联网上抓取的 68 万小时弱标注音频，覆盖 97 种语言。没有干净的学术语料库。没有音素标签。
2. **多任务单模型。** 一个解码器通过任务 token 联合训练，处理转录、翻译、语音活动检测、语言识别和时间戳。
3. **标准编码器-解码器 Transformer。** 编码器消耗 log-mel 语谱图。解码器自回归生成文本 token。没有声码器、CTC 或 HMM。

结果：Whisper large-v3 在各种口音、噪声和零标注数据的语言上都很鲁棒。它是 2026 年每个开源语音助手和大多数商业解决方案的默认语音前端。

## 概念

![Whisper 流水线：音频 → mel → 编码器 → 解码器 → 文本](../assets/whisper.svg)

### 步骤 1 — 重采样 + 加窗

音频以 16 kHz 采样。裁剪/填充至 30 秒。计算 log-mel 语谱图：80 个 mel 频带，10 ms 步长 → 约 3,000 帧 × 80 个特征。这就是 Whisper 看到的"输入图像"。

### 步骤 2 — 卷积主干

两个 Conv1D 层，核大小为 3，步长为 2，将 3,000 帧减少到 1,500。在不增加大量参数的情况下将序列长度减半。

### 步骤 3 — 编码器

一个 24 层（large 版本）Transformer 编码器，处理 1,500 个时间步。正弦位置编码、自注意力、GELU FFN。生成 1,500 × 1,280 的隐藏状态。

### 步骤 4 — 解码器

一个 24 层的 Transformer 解码器。它自回归地从一个 BPE 词汇表生成 token，该词汇表是 GPT-2 的超集，并带有一些音频专用的特殊 token。

### 步骤 5 — 任务 token

解码器提示以控制 token 开头，告诉模型要做什么：

```
<|startoftranscript|>  <|en|>  <|transcribe|>  <|0.00|>
```

或

```
<|startoftranscript|>  <|fr|>  <|translate|>   <|0.00|>
```

模型是在这种约定下训练的。你通过前缀控制任务。这是 2026 年指令微调在语音领域的等价物。

### 步骤 6 — 输出

束搜索（宽度 5）结合对数概率阈值。当 `<|notimestamps|>` token 不存在时，每 0.02 秒音频预测一次时间戳。

### Whisper 规模

| 模型 | 参数 | 层数 | d_model | 头数 | VRAM（fp16） |
|-------|--------|--------|---------|-------|-------------|
| Tiny | 39M | 4 | 384 | 6 | ~1 GB |
| Base | 74M | 6 | 512 | 8 | ~1 GB |
| Small | 244M | 12 | 768 | 12 | ~2 GB |
| Medium | 769M | 24 | 1024 | 16 | ~5 GB |
| Large | 1550M | 32 | 1280 | 20 | ~10 GB |
| Large-v3 | 1550M | 32 | 1280 | 20 | ~10 GB |
| Large-v3-turbo | 809M | 32 | 1280 | 20 | ~6 GB（4 层解码器） |

Large-v3-turbo（2024）将解码器从 32 层削减到 4 层。解码速度提升 8 倍，WER 退化小于 1 个点。这种解码速度的提升就是为什么 Whisper-turbo 是 2026 年实时语音智能体的默认选择。

### Whisper 不做什么

- 无说话人分离（谁在说话）。与 pyannote 搭配使用。
- 原生不支持实时流式——30 秒窗口是固定的。现代封装（`faster-whisper`、`WhisperX`）通过 VAD + 重叠实现流式。
- 没有外部分块的话，无法处理超过 30 秒的长音频。在实践中效果很好，因为人类语音转录很少需要长程上下文。

### 2026 年格局

| 任务 | 模型 | 备注 |
|------|-------|-------|
| 英语 ASR | Whisper-turbo、Moonshine | Moonshine 在边缘设备上快 4 倍 |
| 多语言 ASR | Whisper-large-v3 | 97 种语言 |
| 流式 ASR | faster-whisper + VAD | 可实现 150 ms 延迟目标 |
| TTS | Piper、XTTS-v2、Kokoro | 编码器-解码器模式，但呈 Whisper 形态 |
| 音频 + 语言 | AudioLM、SeamlessM4T | 单个 Transformer 中的文本 token + 音频 token |

## 构建它

见 `code/main.py`。我们不训练 Whisper——我们构建 log-mel 语谱图流水线 + 任务 token 提示格式化器。这些是你在生产环境中实际会接触的部分。

### 步骤 1：合成音频

生成一个 1 秒的 440 Hz 正弦波，采样率为 16 kHz。16,000 个样本。

### 步骤 2：log-mel 语谱图（简化版）

完整的 mel 语谱图需要 FFT。我们做一个简化的分帧 + 每帧能量版本，展示流水线而不需要 `librosa`：

```python
def frame_signal(x, frame_size=400, hop=160):
    frames = []
    for start in range(0, len(x) - frame_size + 1, hop):
        frames.append(x[start:start + frame_size])
    return frames
```

帧 = 25 ms，步长 = 10 ms。与 Whisper 的加窗一致。每帧能量在教学中代表 mel 频带。

### 步骤 3：填充至 30 秒

Whisper 总是处理 30 秒的块。将语谱图填充（或裁剪）到 3,000 帧。

### 步骤 4：构建提示 token

```python
def whisper_prompt(lang="en", task="transcribe", timestamps=True):
    tokens = ["<|startoftranscript|>", f"<|{lang}|>", f"<|{task}|>"]
    if not timestamps:
        tokens.append("<|notimestamps|>")
    return tokens
```

这就是整个任务控制接口。一个 4 token 的前缀。

## 使用它

```python
import whisper
model = whisper.load_model("large-v3-turbo")
result = model.transcribe("meeting.wav", language="en", task="transcribe")
print(result["text"])
print(result["segments"][0]["start"], result["segments"][0]["end"])
```

更快、OpenAI 兼容的方法：

```python
from faster_whisper import WhisperModel
model = WhisperModel("large-v3-turbo", compute_type="int8_float16")
segments, info = model.transcribe("meeting.wav", vad_filter=True)
for s in segments:
    print(f"{s.start:.2f} - {s.end:.2f}: {s.text}")
```

**2026 年何时选择 Whisper：**

- 使用一个模型处理多语言 ASR。
- 对嘈杂、多样化的音频进行稳健转录。
- 研究 / 原型 ASR——最快的起点。

**何时选择其他方案：**

- 边缘设备上的超低延迟流式——Moonshine 在同等质量下击败 Whisper。
- 需要 <200 ms 的实时对话 AI——专用的流式 ASR。
- 说话人分离——Whisper 不支持；搭配 pyannote 使用。

## 交付它

见 `outputs/skill-asr-configurator.md`。该技能为新的语音应用选择 ASR 模型、解码参数和预处理流水线。

## 练习

1. **简单。** 运行 `code/main.py`。确认 16 kHz 下 1 秒信号的帧数约为 100 帧（10 ms 步长）。30 秒：约 3,000 帧。
2. **中等。** 使用 `numpy.fft` 构建完整的 log-mel 语谱图。验证 80 个 mel 频带在数值误差范围内与 `librosa.feature.melspectrogram(n_mels=80)` 匹配。
3. **困难。** 实现流式推理：将音频分块为 10 秒窗口，2 秒重叠，在每个块上运行 Whisper，合并转录文本。在 5 分钟的播客样本上测量与单次处理的词错误率差异。

## 关键术语

| 术语 | 大家的说法 | 实际含义 |
|------|-----------------|-----------------------|
| Mel 语谱图 | "音频图像" | 二维表示：一个轴上为频率区间，另一个轴上为时间帧；每个格子的对数缩放能量。 |
| Log-mel | "Whisper 看到的" | 经过对数的 mel 语谱图；近似人类对响度的感知。 |
| 帧 | "一个时间切片" | 25 ms 的样本窗口；以 10 ms 步长重叠。 |
| 任务 token | "语音的提示前缀" | 解码器提示中的特殊 token，如 `<\|transcribe\|>` / `<\|translate\|>`。 |
| 语音活动检测（VAD） | "找到语音" | 在 ASR 之前去除静音的闸门；大幅降低成本。 |
| CTC | "连接主义时间分类" | 经典的 ASR 损失，用于无需对齐的训练；Whisper 不使用。 |
| Whisper-turbo | "小解码器，完整编码器" | large-v3 编码器 + 4 层解码器；解码速度快 8 倍。 |
| Faster-whisper | "生产级封装" | CTranslate2 重实现；int8 量化；比 OpenAI 参考实现快 4 倍。 |

## 延伸阅读

- [Radford et al. (2022). Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356) — Whisper 论文。
- [OpenAI Whisper 仓库](https://github.com/openai/whisper) — 参考代码 + 模型权重。阅读 `whisper/model.py` 以约 400 行代码从上到下查看 Conv1D 主干 + 编码器 + 解码器。
- [OpenAI Whisper — `whisper/decoding.py`](https://github.com/openai/whisper/blob/main/whisper/decoding.py) — 步骤 5-6 中描述的束搜索 + 任务 token 逻辑在此；500 行，完全可读。
- [Baevski et al. (2020). wav2vec 2.0: A Framework for Self-Supervised Learning of Speech Representations](https://arxiv.org/abs/2006.11477) — 前身；在某些设置下仍是最佳的 SOTA 特征。
- [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) — 生产级封装，比参考实现快 4 倍。
- [Jia et al. (2024). Moonshine: Speech Recognition for Live Transcription and Voice Commands](https://arxiv.org/abs/2410.15608) — 2024 年边缘设备友好的 ASR，Whisper 形状但更小。
- [HuggingFace 博客 — "Fine-Tune Whisper For Multilingual ASR with 🤗 Transformers"](https://huggingface.co/blog/fine-tune-whisper) — 权威微调方案，包括 mel 语谱图预处理和 token-时间戳处理。
- [HuggingFace `modeling_whisper.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/whisper/modeling_whisper.py) — 完整实现（编码器、解码器、交叉注意力、生成），与本课的架构图一致。
