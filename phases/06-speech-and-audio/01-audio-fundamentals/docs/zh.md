# 音频基础 —— 波形、采样、傅里叶变换

> 波形是原始信号。频谱图是表示形式。Mel 特征是适合机器学习的形式。每个现代 ASR 和 TTS 流水线都走这条阶梯，第一步是理解采样和傅里叶。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 1 · 06（向量与矩阵），阶段 1 · 14（概率分布）
**时间：** ~45 分钟

## 问题

麦克风产生一个压力随时间变化的信号。你的神经网络消费的是张量。两者之间有一系列约定，违反时会产生静默错误：模型正常训练但 WER 翻倍，或者 TTS 发出嘶嘶声，或者语音克隆系统记住的是麦克风而不是说话者。

语音系统中的每个 bug 都可以追溯到三个问题之一：

1. 数据以什么采样率录制，模型期望什么采样率？
2. 信号是否有混叠？
3. 你是在原始样本上操作还是在频率表示上操作？

弄对这些问题，阶段 6 其余部分即可驾驭。弄错了，即使是 Whisper-Large-v4 也会产生垃圾输出。

## 概念

![波形、采样、DFT 和频率 bins 可视化](../assets/audio-fundamentals.svg)

**波形。** 一个 `[-1.0, 1.0]` 范围内的一维浮点数数组。按样本编号索引。转换为秒：`t = n / sr`。一个 10 秒、16 kHz 的片段是 160,000 个浮点数的数组。

**采样率（sr）。** 每秒的样本数。2026 年的常见采样率：

| 采样率 | 用途 |
|------|-----|
| 8 kHz | 电话、传统 VOIP。奈奎斯特频率 4 kHz 会扼杀辅音。避免用于 ASR。 |
| 16 kHz | ASR 标准。Whisper、Parakeet、SeamlessM4T v2 都使用 16 kHz。 |
| 22.05 kHz | 旧模型的 TTS 声码器训练。 |
| 24 kHz | 现代 TTS（Kokoro、F5-TTS、xTTS v2）。 |
| 44.1 kHz | CD 音频、音乐。 |
| 48 kHz | 电影、专业音频、高保真 TTS（VALL-E 2、NaturalSpeech 3）。 |

**奈奎斯特-香农。** 采样率 `sr` 可以无歧义地表示最高 `sr/2` 的频率。`sr/2` 边界就是*奈奎斯特频率*。超过奈奎斯特的能量会发生*混叠* —— 折叠到较低的频率中 —— 从而破坏信号。下采样前始终使用低通滤波器。

**位深度。** 16 位 PCM（有符号 int16，范围 ±32,767）是通用交换格式。音乐使用 24 位，内部 DSP 使用 32 位浮点。`soundfile` 等库读取 int16，但输出 `[-1, 1]` 范围内的 float32 数组。

**傅里叶变换。** 任何有限信号都是不同频率正弦波的和。离散傅里叶变换（DFT）对 `N` 个样本计算 `N` 个复数系数 —— 每个频率 bin 一个。`bin k` 映射到频率 `k · sr / N` Hz。幅值是该频率的幅度，角度是相位。

**FFT。** 快速傅里叶变换：当 `N` 是 2 的幂时，一种 `O(N log N)` 的 DFT 算法。每个音频库底层都使用 FFT。16 kHz 下，1024 样本的 FFT 给出 512 个可用的频率 bin，覆盖 0-8 kHz，分辨率为 15.6 Hz。

**分帧 + 加窗。** 我们不对整个片段做 FFT。我们将其切分成重叠的*帧*（通常 25 ms，步长 10 ms），每帧乘以窗函数（汉宁窗、汉明窗）以消除边缘不连续性，然后对每帧做 FFT。这就是短时傅里叶变换（STFT）。第 2 课将从此处继续。

```figure
mel-scale
```

## 动手构建

### 步骤 1：读取片段并绘制波形

`code/main.py` 仅使用 stdlib 的 `wave` 模块以保持示例无依赖。生产环境你会使用 `soundfile` 或 `torchaudio.load`（两者都返回 `(waveform, sr)` 元组）：

```python
import soundfile as sf
waveform, sr = sf.read("clip.wav", dtype="float32")  # shape (T,), sr=int
```

### 步骤 2：从基本原理合成正弦波

```python
import math

def sine(freq_hz, sr, seconds, amp=0.5):
    n = int(sr * seconds)
    return [amp * math.sin(2 * math.pi * freq_hz * i / sr) for i in range(n)]
```

440 Hz 正弦波（音乐会 A），16 kHz，1 秒钟，就是 16,000 个浮点数。使用 `wave.open(..., "wb")` 以 16 位 PCM 编码写入。

### 步骤 3：手动计算 DFT

```python
def dft(x):
    N = len(x)
    out = []
    for k in range(N):
        re = sum(x[n] * math.cos(-2 * math.pi * k * n / N) for n in range(N))
        im = sum(x[n] * math.sin(-2 * math.pi * k * n / N) for n in range(N))
        out.append((re, im))
    return out
```

`O(N²)` —— 对于 `N=256` 确认正确性没问题，但对真实音频无用。真实代码调用 `numpy.fft.rfft` 或 `torch.fft.rfft`。

### 步骤 4：找到主频

幅度峰值索引 `k_star` 映射到频率 `k_star * sr / N`。对 440 Hz 正弦波运行此代码，应该会在 bin `440 * N / sr` 处出现峰值。

### 步骤 5：演示混叠

以 10 kHz 采样 7 kHz 正弦波（奈奎斯特 = 5 kHz）。7 kHz 音调高于奈奎斯特并折叠到 `10 - 7 = 3 kHz`。FFT 峰值出现在 3 kHz。这是经典的混叠演示，也是每个 DAC/ADC 都配备砖墙低通滤波器的原因。

## 场景应用

2026 年你会实际交付的技术栈：

| 任务 | 库 | 原因 |
|------|---------|------|
| 读取/写入 WAV/FLAC/OGG | `soundfile`（libsndfile 封装） | 最快、稳定、返回 float32。 |
| 重采样 | `torchaudio.transforms.Resample` 或 `librosa.resample` | 内置正确的抗混叠。 |
| STFT / Mel | `torchaudio` 或 `librosa` | GPU 友好；PyTorch 生态。 |
| 实时流式 | `sounddevice` 或 `pyaudio` | 跨平台 PortAudio 绑定。 |
| 检查文件 | `ffprobe` 或 `soxi` | CLI，快速，报告 sr/通道/编解码器。 |

决策规则：**先匹配采样率，再匹配其他任何东西**。Whisper 期望 16 kHz 单声道 float32。给它 44.1 kHz 立体声，你会得到看起来像是模型 bug 的垃圾输出。

## 交付物

保存为 `outputs/skill-audio-loader.zh.md`。该技能帮助你检查音频输入是否符合下游模型的期望，并在不符合时正确重采样。

## 练习

1. **简单。** 以 16 kHz 合成 220 Hz + 440 Hz + 880 Hz 的 1 秒混合音。运行 DFT。确认三个峰值出现在预期的 bins。
2. **中等。** 以 48 kHz 录制一段 3 秒的你自己的声音 WAV。使用 `torchaudio.transforms.Resample`（带抗混叠）下采样到 16 kHz，然后使用朴素抽取（每三个样本取一）下采样到 16 kHz。对两者做 FFT。混叠出现在哪里？
3. **困难。** 仅使用 `math` 和第 3 步的 DFT 从头构建 STFT。帧大小 400，步长 160，汉宁窗。使用 `matplotlib.pyplot.imshow` 绘制幅度图。这就是第 2 课的频谱图。

## 关键术语

| 术语 | 人们说 | 实际含义 |
|------|-----------------|-----------------------|
| 采样率 | 每秒多少样本 | ADC 测量信号的频率，单位为 Hz。 |
| 奈奎斯特 | 你能表示的最大频率 | `sr/2`；超过它的能量会混叠回来。 |
| 位深度 | 每个样本的分辨率 | `int16` = 65,536 级；`float32` = `[-1, 1]` 中的 24 位精度。 |
| DFT | 序列的傅里叶变换 | `N` 个样本 → `N` 个复数频率系数。 |
| FFT | 快速 DFT | `O(N log N)` 算法，要求 `N` = 2 的幂。 |
| Bin | 频率列 | `k · sr / N` Hz；分辨率 = `sr / N`。 |
| STFT | 频谱图的底层 | 加窗分帧 FFT 随时间变化。 |
| 混叠 | 奇怪的频率幽灵 | 高于奈奎斯特的能量镜像到较低的 bins。 |

## 延伸阅读

- [Shannon (1949). Communication in the Presence of Noise](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf) — 采样定理背后的论文。
- [Smith — The Scientist and Engineer's Guide to Digital Signal Processing](https://www.dspguide.com/ch8.htm) — 免费、经典的 DSP 教科书。
- [librosa docs — audio primer](https://librosa.org/doc/latest/tutorial.html) — 带代码的实践教程。
- [Heinrich Kuttruff — Room Acoustics (6th ed.)](https://www.routledge.com/Room-Acoustics/Kuttruff/p/book/9781482260434) — 解释真实音频为什么不是干净正弦波的参考书。
- [Steve Eddins — FFT Interpretation notebook](https://blogs.mathworks.com/steve/2020/03/30/fft-spectrum-and-spectral-densities/) — 10 分钟厘清频率 bin 直觉。
