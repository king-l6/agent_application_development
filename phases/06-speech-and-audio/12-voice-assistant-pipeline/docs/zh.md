# 构建语音助手流水线 -- 阶段 6 的收官项目

> 将第 01-11 课的所有内容整合在一起。构建一个能听、能推理、能回应的语音助手。在 2026 年，这是一个已解决的工程问题，而不是研究问题 -- 但集成的细节决定了它能否交付。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 6 · 04、05、06、07、11；阶段 11 · 09（函数调用）；阶段 14 · 01（代理循环）
**时间：** ~120 分钟

## 问题

构建一个端到端的助手：

1. 捕获麦克风输入（16 kHz 单声道）。
2. 检测用户语音的开始/结束。
3. 流式转录。
4. 将转录文本传递给可以调用工具（计时器、天气、日历）的 LLM。
5. 将 LLM 文本流式传输到 TTS。
6. 将音频播放回用户。
7. 如果用户在回应中途打断，则停止。

延迟目标：在笔记本电脑 CPU 上，从用户完成话语到第一个 TTS 音频字节在 800 毫秒内。质量目标：无漏词、无静音上的幻觉字幕、无语音克隆泄漏、无提示注入成功。

## 概念

![语音助手流水线：麦克风 → VAD → STT → LLM+工具 → TTS → 扬声器](../assets/voice-assistant.svg)

### 七个组件

1. **音频捕获。** 麦克风 → 16 kHz 单声道 → 20 毫秒块。通常在 Python 中使用 `sounddevice`，在生产中使用原生 AudioUnit/ALSA/WASAPI。
2. **VAD（第 11 课）。** Silero VAD @ 阈值 0.5，最小语音 250 毫秒，静音挂起 500 毫秒。发出"开始"和"结束"信号。
3. **流式 STT（第 4-5 课）。** Whisper-streaming、Parakeet-TDT 或 Deepgram Nova-3（API）。部分 + 最终转录。
4. **带工具调用的 LLM。** GPT-4o / Claude 3.5 / Gemini 2.5 Flash。工具的 JSON schema。流式词元。
5. **流式 TTS（第 7 课）。** Kokoro-82M（最快的开源）或 Cartesia Sonic（商业）。在收到 20 个 LLM 词元后开始 TTS。
6. **播放。** 扬声器输出；对低带宽网络进行 opus 编码。
7. **中断处理器。** 如果在 TTS 播放期间 VAD 触发，停止播放、取消 LLM、重新启动 STT。

### 你会遇到的三种故障模式

1. **首词截断。** VAD 晚了一拍开始。用户的"嘿"丢失了。将起始阈值设为 0.3 而不是 0.5。
2. **中响应中断混乱。** 用户打断后 LLM 继续生成；助手与用户同时说话。将 VAD → 取消 LLM 连接起来。
3. **静音幻觉。** Whisper 在静音预热帧上输出"感谢观看"。始终使用 VAD 门控。

### 2026 年生产参考技术栈

| 技术栈 | 延迟 | 许可 | 备注 |
|-------|---------|---------|-------|
| LiveKit + Deepgram + GPT-4o + Cartesia | 350-500 毫秒 | 商业 API | 2026 年行业默认 |
| Pipecat + Whisper-streaming + GPT-4o + Kokoro | 500-800 毫秒 | 大部分开源 | 适合 DIY |
| Moshi（全双工） | 200-300 毫秒 | CC-BY 4.0 | 单一模型；不同架构，第 15 课 |
| Vapi / Retell（托管） | 300-500 毫秒 | 商业 | 最快启动；定制有限 |
| Whisper.cpp + llama.cpp + Kokoro-ONNX | 离线 | 开源 | 隐私 / 边缘设备 |

## 构建

### 第 1 步：带分块的麦克风捕获（伪代码）

```python
import sounddevice as sd

def mic_stream(chunk_ms=20, sr=16000):
    q = queue.Queue()
    def cb(indata, frames, time, status):
        q.put(indata.copy().flatten())
    with sd.InputStream(channels=1, samplerate=sr, blocksize=int(sr * chunk_ms/1000), callback=cb):
        while True:
            yield q.get()
```

### 第 2 步：VAD 门控的轮次捕获

```python
def capture_turn(stream, vad, pre_roll_ms=300, silence_ms=500):
    buf, pre, triggered = [], collections.deque(maxlen=pre_roll_ms // 20), False
    silent = 0
    for chunk in stream:
        pre.append(chunk)
        if vad(chunk):
            if not triggered:
                buf = list(pre)
                triggered = True
            buf.append(chunk)
            silent = 0
        elif triggered:
            silent += 20
            buf.append(chunk)
            if silent >= silence_ms:
                return b"".join(buf)
```

### 第 3 步：流式 STT → LLM → TTS

```python
async def turn(audio_bytes):
    transcript = await stt.transcribe(audio_bytes)
    async for token in llm.stream(transcript):
        async for audio in tts.stream(token):
            await speaker.play(audio)
```

### 第 4 步：在 LLM 循环内调用工具

```python
tools = [
    {"name": "get_weather", "parameters": {"location": "string"}},
    {"name": "set_timer", "parameters": {"seconds": "int"}},
]

async for chunk in llm.stream(user_text, tools=tools):
    if chunk.type == "tool_call":
        result = dispatch(chunk.name, chunk.args)
        continue_streaming(result)
    if chunk.type == "text":
        await tts.stream(chunk.text)
```

### 第 5 步：中断处理

```python
tts_task = asyncio.create_task(tts_loop())
while True:
    chunk = await mic.get()
    if vad(chunk):
        tts_task.cancel()
        await speaker.stop()
        await new_turn()
        break
```

## 使用

参见 `code/main.py` 获取一个可运行的模拟程序，它用存根模型连接所有七个组件，这样即使没有硬件也能看到流水线的形状。对于真实实现，将存根替换为：

- `silero-vad`（`pip install silero-vad`）
- `deepgram-sdk` 或 `openai-whisper`
- `openai`（`gpt-4o`）或 `anthropic`
- `kokoro` 或 `cartesia`
- `sounddevice` 用于 I/O

## 陷阱

- **永远记录 PII。** 完整轮次的音频在大多数司法管辖区属于 PII。保留 30 天，静态加密。
- **没有打断功能。** 用户会打断。你的助手必须停止说话。
- **阻塞的 TTS。** 同步 TTS 会阻塞事件循环。使用异步或单独的线程。
- **没有工具调用错误处理。** 工具会失败。LLM 必须接收到错误 + 重试一次，然后优雅降级。
- **过度积极的幻觉过滤器。** 过滤过度，助手会重复说"我无法帮助解决这个问题"。过滤不足，它会什么都敢说。在保留集上校准。
- **没有唤醒词选项。** 始终监听是一个隐私风险。添加唤醒词门控（Porcupine 或 openWakeWord）。

## 交付

保存为 `outputs/skill-voice-assistant-architect.md`。根据预算 + 规模 + 语言 + 合规约束，生成完整的技术栈规格。

## 练习

1. **简单。** 运行 `code/main.py`。它用存根模块端到端模拟一个完整的轮次，并打印每阶段延迟。
2. **中等。** 用预录的 `.wav` 上的真实 Whisper 模型替换 STT 存根。测量 WER 和端到端延迟。
3. **困难。** 添加工具调用：实现 `get_weather`（任意 API）和 `set_timer`。让 LLM 通过工具路由，并验证当用户说"设定一个 5 分钟的定时器"时，正确的函数被触发，且口语回复确认了该操作。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| 轮次 | 用户 + 助手一次往返 | 一次 VAD 边界内的用户语音 + 一次 LLM-TTS 响应。 |
| 打断 | 中断 | 用户在助手说话时说话；助手停止。 |
| 唤醒词 | "嘿助手" | 短关键词检测器；Porcupine、Snowboy、openWakeWord。 |
| 结束点检测 | 轮次结束 | VAD + 最小静音决策，判断用户是否已说完。 |
| 预卷 | 语音前缓冲区 | 保留 VAD 触发前 200-400 毫秒的音频，避免首词截断。 |
| 工具调用 | 函数调用 | LLM 发出 JSON；运行时调度；结果反馈回循环中。 |

## 进一步阅读

- [LiveKit -- 语音代理快速入门](https://docs.livekit.io/agents/) -- 生产级参考。
- [Pipecat -- 语音代理示例](https://github.com/pipecat-ai/pipecat) -- 适合 DIY 的框架。
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) -- 托管的语音原生路径。
- [Kyutai Moshi](https://github.com/kyutai-labs/moshi) -- 全双工参考（第 15 课）。
- [Porcupine 唤醒词](https://picovoice.ai/products/porcupine/) -- 唤醒词门控。
- [Anthropic -- 工具使用指南](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) -- LLM 函数调用。
