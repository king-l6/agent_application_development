# 频谱图、Mel 尺度与音频特征

> 神经网络不能很好地消费原始波形。它们消费频谱图。它们消费 Mel 频谱图效果更好。2026 年的每个 ASR、TTS 和音频分类器都因这一个预处理选择而成败攸关。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 01（音频基础）
**时间：** ~45 分钟

## 问题

拿一个 10 秒的 16 kHz 片段。那是 160,000 个浮点数，都在 `[-1, 1]` 范围内，与"狗叫"或"猫这个词"的标签几乎完全不相关。原始波形包含信息，但形式让模型难以提取。两个相同的音素相隔 100 毫秒发出，其原始样本完全不同。

频谱图解决了这个问题。它压缩了人类感知忽略的时间细节（微秒级抖动），同时保留了感知关注的结构（哪些频率有能量，在约 10-25 毫秒的时间窗口内）。

Mel 频谱图更进一步。人类对数地感知音高：100 Hz 与 200 Hz 的差异听起来与 1000 Hz 与 2000 Hz 的差异"距离相同"。Mel 尺度将频率轴按此扭曲。经过 Mel 缩放的频谱图是从 2010 年到 2026 年语音机器学习中最重要的单一特征。

## 概念

![波形到 STFT 到 Mel 频谱图到 MFCC 的阶梯](../assets/mel-features.svg)

**STFT（短时傅里叶变换）。** 将波形切分成重叠的帧（典型：25 ms 窗口、10 ms 步长 = 16 kHz 下 400 样本 / 160 样本）。每帧乘以窗函数（汉宁窗是默认值；汉明窗略微不同的权衡）。对每帧做 FFT。将幅度谱堆叠成一个形状为 `(n_frames, n_freq_bins)` 的矩阵。这就是你的频谱图。

**对数幅度。** 原始幅度跨越 5-6 个数量级。取 `log(|X| + 1e-6)` 或 `20 * log10(|X|)` 来压缩动态范围。每个生产流水线都使用对数幅度，而不是原始幅度。

**Mel 尺度。** 频率 `f`（以 Hz 为单位）映射到 Mel `m`，公式为 `m = 2595 * log10(1 + f / 700)`。该映射在 1 kHz 以下大致线性，在 1 kHz 以上大致对数。80 个 Mel bins 覆盖 0-8 kHz 是标准的 ASR 输入。

**Mel 滤波器组。** 一组在 Mel 尺度上等间距排列的三角滤波器。每个滤波器是相邻 FFT bins 的加权和。将 STFT 幅度乘以滤波器组矩阵，一次矩阵乘法即可得到 Mel 频谱图。

**对数 Mel 频谱图。** `log(mel_spec + 1e-10)`。Whisper 的输入。Parakeet 的输入。SeamlessM4T 的输入。2026 年通用的音频前端。

**MFCC。** 取对数 Mel 频谱图，应用 DCT（II 型），保留前 13 个系数。去相关特征并进一步压缩。从约 2015 年之前的主导特征，之后 CNN/Transformer 在处理原始对数 Mel 上迎头赶上。仍用于说话人识别（x-vectors、ECAPA）。

**分辨率权衡。** 更大的 FFT = 更好的频率分辨率但更差的时间分辨率。25 ms / 10 ms 是音频机器学习的默认值；音乐使用 50 ms / 12.5 ms；瞬态检测（鼓点、爆破音）使用 5 ms / 2 ms。

```figure
spectrogram-window
```

## 动手构建

### 步骤 1：分帧

```python
def frame(signal, frame_len, hop):
    n = 1 + (len(signal) - frame_len) // hop
    return [signal[i * hop : i * hop + frame_len] for i in range(n)]
```

一个 10 秒的 16 kHz 片段，`frame_len=400, hop=160`，产生 998 帧。

### 步骤 2：汉宁窗

```python
import math

def hann(N):
    return [0.5 * (1 - math.cos(2 * math.pi * n / (N - 1))) for n in range(N)]
```

在 FFT 之前逐元素相乘。消除因在非零端点截断引起的频谱泄漏。

### 步骤 3：STFT 幅度

```python
def stft_magnitude(signal, frame_len=400, hop=160):
    win = hann(frame_len)
    frames = frame(signal, frame_len, hop)
    return [magnitudes(dft([w * s for w, s in zip(win, f)])) for f in frames]
```

生产环境使用 `torch.stft` 或 `librosa.stft`（基于 FFT，向量化）。这里的循环是教学性的；在 `code/main.py` 中的短片段上运行。

### 步骤 4：Mel 滤波器组

```python
def hz_to_mel(f):
    return 2595.0 * math.log10(1.0 + f / 700.0)

def mel_to_hz(m):
    return 700.0 * (10 ** (m / 2595.0) - 1)

def mel_filterbank(n_mels, n_fft, sr, fmin=0, fmax=None):
    fmax = fmax or sr / 2
    mels = [hz_to_mel(fmin) + (hz_to_mel(fmax) - hz_to_mel(fmin)) * i / (n_mels + 1)
            for i in range(n_mels + 2)]
    hzs = [mel_to_hz(m) for m in mels]
    bins = [int(h * n_fft / sr) for h in hzs]
    fb = [[0.0] * (n_fft // 2 + 1) for _ in range(n_mels)]
    for m in range(n_mels):
        for k in range(bins[m], bins[m + 1]):
            fb[m][k] = (k - bins[m]) / max(1, bins[m + 1] - bins[m])
        for k in range(bins[m + 1], bins[m + 2]):
            fb[m][k] = (bins[m + 2] - k) / max(1, bins[m + 2] - bins[m + 1])
    return fb
```

80 个 Mels 覆盖 0-8 kHz，`n_fft=400`，得到一个 `(80, 201)` 矩阵。将 `(n_frames, 201)` STFT 幅度乘以转置矩阵，得到 `(n_frames, 80)` Mel 频谱图。

### 步骤 5：对数 Mel

```python
def log_mel(mel_spec, eps=1e-10):
    return [[math.log(max(v, eps)) for v in frame] for frame in mel_spec]
```

常见替代方案：`librosa.power_to_db`（参考归一化的 dB）、`10 * log10(power + eps)`。Whisper 使用更复杂的裁剪 + 归一化例程（参见 Whisper 的 `log_mel_spectrogram`）。

### 步骤 6：MFCC

```python
def dct_ii(x, n_coeffs):
    N = len(x)
    return [
        sum(x[n] * math.cos(math.pi * k * (2 * n + 1) / (2 * N)) for n in range(N))
        for k in range(n_coeffs)
    ]
```

对每个对数 Mel 帧应用 DCT，保留前 13 个系数。这就是你的 MFCC 矩阵。第一个系数通常被丢弃（它编码整体能量）。

## 场景应用

2026 年的技术栈：

| 任务 | 特征 |
|------|----------|
| ASR（Whisper、Parakeet、SeamlessM4T） | 80 对数 Mels，10 ms 步长，25 ms 窗口 |
| TTS 声学模型（VITS、F5-TTS、Kokoro） | 80 Mels，5-12 ms 步长用于精细时间控制 |
| 音频分类（AST、PANNs、BEATs） | 128 对数 Mels，10 ms 步长 |
| 说话人嵌入（ECAPA-TDNN、WavLM） | 80 对数 Mels 或原始波形 SSL |
| 音乐（MusicGen、Stable Audio 2） | EnCodec 离散 token（非 Mels） |
| 关键词检测 | 40 个 MFCC（适用于小型设备） |

经验法则：**如果你不是在处理音乐，从 80 对数 Mels 开始。** 任何偏离都需要举证责任。

## 2026 年仍然存在的陷阱

- **Mel 数量不匹配。** 训练时用 80 个 Mels，推理时用 128 个 Mels。静默失败。在两端记录特征形状。
- **上游采样率不匹配。** 在 22.05 kHz 下计算的 Mels 看起来与 16 kHz 的不同。在特征提取*之前*修正采样率。
- **dB vs 对数。** Whisper 期望对数 Mel，而不是 dB Mel。一些 Hugging Face 流水线自动检测；你的自定义代码不会。
- **归一化漂移。** 训练时按话语归一化，推理时使用全局归一化。这是一个会使 WER 翻倍的生产 bug。
- **来自填充的泄漏。** 在片段末尾补零会在末尾帧产生平坦频谱。对称填充或复制边缘。

## 交付物

保存为 `outputs/skill-feature-extractor.zh.md`。该技能为给定的模型目标选择特征类型、Mel 数量、帧/步长和归一化方案。

## 练习

1. **简单。** 运行 `code/main.py`。它合成一个啁啾声（频率从 200 Hz 扫到 4000 Hz）并打印每帧的 argmax Mel bin。可选地绘制图形并确认它与扫描匹配。
2. **中等。** 用 `n_mels` 在 `{40, 80, 128}` 和 `frame_len` 在 `{200, 400, 800}` 重新运行。在时间轴上测量尖锐峰值带宽。哪种组合最能解析啁啾声？
3. **困难。** 实现 `power_to_db` 并比较使用 (a) 原始对数 Mel、(b) 带 `ref=max` 的 dB Mel、(c) MFCC-13 + delta + delta-delta 时，一个微型 CNN 分类器在 AudioMNIST 上的 ASR 准确率。报告 top-1 准确率。

## 关键术语

| 术语 | 人们说 | 实际含义 |
|------|-----------------|-----------------------|
| 帧 | 一个切片 | 25 ms 的波形片段，送入一个 FFT。 |
| 步长 | 跨度 | 连续帧之间的样本数；10 ms 是 ASR 默认值。 |
| 窗函数 | 汉宁/汉明之类的东西 | 逐点乘子，将帧边缘渐变为零。 |
| STFT | 频谱图生成器 | 加窗分帧 FFT；产生时间 × 频率矩阵。 |
| Mel | 扭曲后的频率 | 对数感知尺度；`m = 2595·log10(1 + f/700)`。 |
| 滤波器组 | 矩阵 | 将 STFT 投影到 Mel bins 的三角滤波器。 |
| 对数 Mel | Whisper 的输入 | `log(mel_spec + eps)`；2026 年标准化。 |
| MFCC | 老派特征 | 对数 Mel 的 DCT；13 个系数，去相关。 |

## 延伸阅读

- [Davis, Mermelstein (1980). Comparison of parametric representations for monosyllabic word recognition](https://ieeexplore.ieee.org/document/1163420) — MFCC 论文。
- [Stevens, Volkmann, Newman (1937). A Scale for the Measurement of the Psychological Magnitude Pitch](https://pubs.aip.org/asa/jasa/article-abstract/8/3/185/735757/) — 原始的 Mel 尺度。
- [OpenAI — Whisper source, log_mel_spectrogram](https://github.com/openai/whisper/blob/main/whisper/audio.py) — 阅读参考实现。
- [librosa feature extraction docs](https://librosa.org/doc/main/feature.html) — `mfcc`、`melspectrogram` 和步长/窗口的参考。
- [NVIDIA NeMo — audio preprocessing](https://docs.nvidia.com/deeplearning/nemo/user-guide/docs/en/main/asr/asr_all.html#featurizers) — Parakeet + Canary 模型的生产级流水线。
