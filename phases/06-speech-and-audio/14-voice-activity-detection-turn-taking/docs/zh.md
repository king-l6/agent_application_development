# 语音活动检测与话轮切换 — Silero、Cobra 与 Flush 技巧

> 每个语音助手都取决于两个关键判断：用户现在是否在说话，以及他们是否说完了？VAD 回答第一个问题。话轮检测（VAD + 静默延续 + 语义端点模型）回答第二个。任何一项判断出错，你的助手就会要么打断用户，要么说个没完没了。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 11（实时音频），阶段 6 · 12（语音助手）
**时间：** ~45 分钟

## 问题

语音助手在每个 20 ms 数据块上需要做出三个不同的决策：

1. **这一帧是语音吗？** — VAD。二分类，逐帧判断。
2. **用户开始新的话语了吗？** — 起始检测。
3. **用户说完了吗？** — 端点检测（话轮结束）。

简单方案（能量阈值）在任何噪声环境下都会失败——车辆声、键盘声、人群嘈杂声。2026 年的答案：Silero VAD（开源、深度学习）+ 话轮检测模型（语义端点检测）+ VAD 校准的静默延续。

## 概念

![VAD 级联：能量 → Silero → 话轮检测器 → flush 技巧](../assets/vad-turn-taking.svg)

### 三级 VAD 级联

**第一级：能量门控。** 最廉价。以 -40 dBFS 为 RMS 阈值。过滤明显的静音，但会在任何高于阈值的噪声触发。

**第二级：Silero VAD**（2020-2026，MIT）。1M 参数。在 6000 多种语言上训练。在单 CPU 线程上每 30 ms 块运行约 1 ms。在 5% 假阳性率下真阳性率为 87.7%。开源默认选择。

**第三级：语义话轮检测器。** LiveKit 的话轮检测模型（2024-2026）或你自己的小型分类器。区分"句中停顿"和"说话结束"。使用语言上下文（语调 + 最近的词汇），而不仅仅是静默。

### 关键参数及其默认值

- **阈值。** Silero 输出概率；在 &gt; 0.5（默认）或 &gt; 0.3（灵敏）处分类为语音。阈值越低，首字被切的可能性越小，但误报越多。
- **最小语音持续时间。** 拒绝短于 250 ms 的语音——通常是咳嗽或椅子噪音。
- **静默延续（端点检测）。** VAD 返回 0 后，等待 500-800 ms 再声明话轮结束。太短 → 打断用户。太久 → 感觉迟钝。
- **预卷缓冲。** 在 VAD 触发前保留 300-500 ms 的音频。防止"喂"字被切。

### Flush 技巧（Kyutai 2025）

流式 STT 模型有一个前瞻延迟（Kyutai STT-1B 为 500 ms，STT-2.6B 为 2.5 s）。通常你需要等待语音结束后这么长时间才能获得转录文本。Flush 技巧：当 VAD 检测到语音结束时，**向 STT 发送一个 flush 信号**，强制立即输出。STT 的处理速度约为实时速度的 4 倍，因此 500 ms 的缓冲在约 125 ms 内完成处理。

端到端：125 ms VAD + flush STT = 对话级延迟。

### 2026 年 VAD 对比

| VAD | 5% FPR 下的 TPR | 延迟 | 许可证 |
|-----|-----------------|------|--------|
| WebRTC VAD（Google，2013） | 50.0% | 30 ms | BSD |
| Silero VAD（2020-2026） | 87.7% | ~1 ms | MIT |
| Cobra VAD（Picovoice） | 98.9% | ~1 ms | 商业 |
| pyannote 分割 | 95% | ~10 ms | MIT-ish |

Silero 是合适的默认选择。Cobra 是合规性/准确性的升级选择。仅能量 VAD 在 2026 年的生产中不应存在。

## 动手搭建

### 步骤 1：能量门控

```python
def energy_vad(chunk, threshold_dbfs=-40.0):
    rms = (sum(x * x for x in chunk) / len(chunk)) ** 0.5
    dbfs = 20.0 * math.log10(max(rms, 1e-10))
    return dbfs > threshold_dbfs
```

### 步骤 2：Python 中的 Silero VAD

```python
from silero_vad import load_silero_vad, get_speech_timestamps

vad = load_silero_vad()
audio = torch.tensor(waveform_16k, dtype=torch.float32)
segments = get_speech_timestamps(
    audio, vad, sampling_rate=16000,
    threshold=0.5,
    min_speech_duration_ms=250,
    min_silence_duration_ms=500,
    speech_pad_ms=300,
)
for s in segments:
    print(f"{s['start']/16000:.2f}s - {s['end']/16000:.2f}s")
```

### 步骤 3：话轮结束状态机

```python
class TurnDetector:
    def __init__(self, silence_hangover_ms=500, min_speech_ms=250):
        self.state = "idle"
        self.speech_ms = 0
        self.silence_ms = 0
        self.silence_hangover_ms = silence_hangover_ms
        self.min_speech_ms = min_speech_ms

    def update(self, is_speech, chunk_ms=20):
        if is_speech:
            self.speech_ms += chunk_ms
            self.silence_ms = 0
            if self.state == "idle" and self.speech_ms >= self.min_speech_ms:
                self.state = "speaking"
                return "START"
        else:
            self.silence_ms += chunk_ms
            if self.state == "speaking" and self.silence_ms >= self.silence_hangover_ms:
                self.state = "idle"
                self.speech_ms = 0
                return "END"
        return None
```

### 步骤 4：Flush 技巧框架

```python
def flush_on_end(stt_client, audio_buffer):
    stt_client.send_audio(audio_buffer)
    stt_client.send_flush()
    return stt_client.recv_transcript(timeout_ms=150)
```

STT（Kyutai、Deepgram、AssemblyAI）必须支持 flush 才能生效。Whisper 流式不支持——它基于块处理，总是等待数据块。

## 应用场景

| 场景 | VAD 选择 |
|------|---------|
| 开源、快速、通用 | Silero VAD |
| 商业呼叫中心 | Cobra VAD |
| 设备端（手机） | Silero VAD ONNX |
| 研究/说话人分离 | pyannote 分割 |
| 零依赖后备方案 | WebRTC VAD（传统） |
| 需要话轮结束质量 | Silero + LiveKit 话轮检测器分层 |

经验法则：除非你真的别无选择，否则永远不要在线上部署仅能量 VAD。

## 常见陷阱

- **固定阈值。** 在安静环境下可行，噪声环境下失败。要么在设备上校准，要么切换到 Silero。
- **静默延续太短。** 助手在句中打断用户。500-800 ms 是对话语音的甜区。
- **静默延续太长。** 感觉迟钝。与目标用户进行 A/B 测试。
- **没有预卷缓冲。** 用户音频的前 200-300 ms 丢失。始终保持滚动预卷缓冲。
- **忽略语义端点检测。** "嗯，让我想想……"包含长停顿。用户讨厌在思考时被打断。使用 LiveKit 的话轮检测器或类似方案。

## 交付产出

保存为 `outputs/skill-vad-tuner.md`。为特定工作负载选择 VAD 模型、阈值、静默延续、预卷缓冲和话轮检测策略。

## 练习

1. **简单。** 运行 `code/main.py`。它模拟一个语音 + 静音 + 语音 + 咳嗽序列，并测试三个 VAD 层级。
2. **中等。** 安装 `silero-vad`，处理一个 5 分钟的录音，调整阈值以最小化首字被切和误触发。报告精确率/召回率。
3. **困难。** 构建一个小型话轮检测器：Silero VAD + 一个在最后 10 个词汇嵌入上的 3 层 MLP（使用 sentence-transformers）。在人工标注的话轮结束数据集上训练。比仅使用 Silero 提升 10% F1。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| VAD | 语音检测器 | 逐帧二分类：这是语音吗？ |
| 话轮检测 | 端点检测 | VAD + 静默延续 + 语义端点检测。 |
| 静默延续 | 说话后等待 | 声明话轮结束前等待的时间；500-800 ms。 |
| 预卷缓冲 | 语音前缓冲 | 在 VAD 触发前保留 300-500 ms 音频。 |
| Flush 技巧 | Kyutai 技巧 | VAD → flush-STT → 125 ms 而非 500 ms 延迟。 |
| 语义端点 | "他们打算停吗？" | 查看词汇而不仅仅是静默的机器学习分类器。 |
| 5% FPR 下的 TPR | ROC 点 | 标准 VAD 基准；Silero 87.7%，WebRTC 50%。 |

## 延伸阅读

- [Silero VAD](https://github.com/snakers4/silero-vad) — 参考开源 VAD。
- [Picovoice Cobra VAD](https://picovoice.ai/products/cobra/) — 商业准确性领先者。
- [Kyutai — Unmute + flush 技巧](https://kyutai.org/stt) — 亚 200 ms 工程技巧。
- [LiveKit — 话轮检测](https://docs.livekit.io/agents/logic/turns/) — 生产中的语义端点检测。
- [WebRTC VAD](https://webrtc.googlesource.com/src/) — 传统基线。
- [pyannote 分割](https://github.com/pyannote/pyannote-audio) — 分离级别的分割。
