# 综合项目 03 — 实时语音助手（ASR 到 LLM 到 TTS）

> 一个体验良好的语音 Agent，端到端延迟低于 800ms，知道用户何时停止说话，支持插话打断，并且可以在不卡顿的情况下调用工具。Retell、Vapi、LiveKit Agents 和 Pipecat 在 2026 年都达到了这个标准。它们使用相同的形态：流式 ASR、语音轮次检测器、流式 LLM 和流式 TTS，全部通过 WebRTC 连接，每个环节都有严格的延迟预算。构建一个，测量 WER、MOS 和误切断率，并在丢包条件下运行。

**类型：** 综合项目
**语言：** Python（Agent + 管道），TypeScript（Web 客户端）
**前置知识：** 阶段 6（语音与音频）、阶段 7（Transformer）、阶段 11（LLM 工程）、阶段 13（工具）、阶段 14（Agent）、阶段 17（基础设施）
**涉及阶段：** P6 · P7 · P11 · P13 · P14 · P17
**时间：** 30 小时

## 问题

语音一直是 2025-2026 年发展最快的 AI 用户体验类别。技术天花板每季度都在下降。OpenAI Realtime API、Gemini 2.5 Live、Cartesia Sonic-2、ElevenLabs Flash v3、LiveKit Agents 1.0 和 Pipecat 0.0.70 都将首音频输出时间降到了 800ms 以下。标准不仅仅是延迟，更是交互感受：不要打断用户、不被用户打断、从中途打断中恢复、在对话中途调用工具而不卡顿音频、在有抖动的移动网络中存活。

你无法通过拼接三个 REST 调用来实现。架构必须是端到端的流水线流式传输。构建它，失败模式就会显现出来：为电话音频调优的 VAD 在背景电视上触发、等待标点符号但永远不会到来的语音轮次检测器、缓冲 400ms 才发出的 TTS。这个综合项目是在负载下逐一修复这些问题，并发布延迟和质量报告。

## 概念

管道包含五个流式阶段：**音频输入**（来自浏览器或 PSTN 的 WebRTC）、**ASR**（来自 Deepgram Nova-3 或 faster-whisper 的流式部分转录）、**语音轮次检测**（VAD 加上读取部分转录以判断完成线索的小型轮次检测模型）、**LLM**（一旦判定轮次完成就立即流式输出 token）、**TTS**（在第一个 LLM token 后约 200ms 内流式输出音频）。

三个横切关注点。**插话打断（Barge-in）**：当 Agent 说话时用户开始说话，TTS 立即取消，ASR 立刻接管。**工具使用**：对话中途的函数调用（天气、日历）必须在侧通道上运行，不卡顿音频；如果延迟超过 300ms，Agent 预填一个确认 token（"请稍等..."）。**背压**：在丢包情况下，部分转录被保留，VAD 提高语音门限，Agent 避免在未确认的消息上说话。

衡量标准是量化的。WER 低于 8%（在 15 dB SNR 的 Hamming VAD 基准上）。首音频输出 p50 低于 800ms（基于 100 次测量通话）。误切断率低于 3%。TTS 的 MOS 高于 4.2。单台 g5.xlarge 上支持 50 路并发通话。这些数字就是交付物。

## 架构

```
browser / Twilio PSTN
        |
        v
   WebRTC / SIP edge
        |
        v
  LiveKit Agents 1.0  (或 Pipecat 0.0.70)
        |
   +----+--------------+--------------+-----------------+
   |                   |              |                 |
   v                   v              v                 v
  ASR              VAD v5         turn-detector     side-channel
(Deepgram         (Silero)          (LiveKit)        tools
 Nova-3 /         speech-gate    completion score    (weather,
 Whisper-v3)      per 20ms        on partials        calendar)
   |                   |              |
   +--------+----------+--------------+
            v
        LLM (streaming)
     GPT-4o-realtime / Gemini 2.5 Flash /
     cascaded Claude Haiku 4.5
            |
            v
        TTS streaming
     Cartesia Sonic-2 / ElevenLabs Flash v3
            |
            v
     audio back to caller
            |
            v
   OpenTelemetry voice traces -> Langfuse
```

## 技术栈

- 传输：LiveKit Agents 1.0（WebRTC）加 Twilio PSTN 网关；Pipecat 0.0.70 作为备选框架
- ASR：Deepgram Nova-3（流式，首次部分转录低于 300ms）或自托管的 faster-whisper Whisper-v3-turbo
- VAD：Silero VAD v5 加 LiveKit 语音轮次检测器（读取部分转录的小型 Transformer）
- LLM：OpenAI GPT-4o-realtime 用于紧密集成，Gemini 2.5 Flash Live，或级联的 Claude Haiku 4.5（流式补全，独立音频路径）
- TTS：Cartesia Sonic-2（最低首字节延迟）、ElevenLabs Flash v3，或开源 Orpheus 用于自托管
- 工具：用于天气/日历/预订的 FastMCP 侧通道；如果工具耗时超过 300ms，Agent 预发填充音
- 可观测性：OpenTelemetry 语音 span，带音频回放的 Langfuse 语音追踪
- 部署：单台 g5.xlarge（24GB VRAM）用于自托管 Whisper + Orpheus；托管 API 用于最低延迟

## 构建步骤

1. **WebRTC 会话。** 搭建 LiveKit 房间和一个流式传输麦克风音频的 Web 客户端。在服务器上，附加一个加入房间的 Agent 工作进程。

2. **ASR 流式传输。** 将 20ms PCM 帧送入 Deepgram Nova-3（或 GPU 上的 faster-whisper）。订阅部分和最终转录。记录每次部分转录的延迟。

3. **VAD 和语音轮次检测。** 在帧流上运行 Silero VAD v5。在语音结束事件上，对最新的部分转录触发 LiveKit 语音轮次检测器。仅在 VAD 检测到静音持续 500ms 且轮次检测器完成度评分 > 0.6 时，才判定"轮次完成"。

4. **LLM 流。** 轮次完成后，使用运行中的对话加上最终转录启动 LLM 调用。流式输出 token。在第一个 token 处，移交给 TTS。

5. **TTS 流。** Cartesia Sonic-2 流式返回音频块。第一个块必须在第一个 LLM token 后的 200ms 内离开服务器。将块发送到 LiveKit 房间；客户端通过 WebRTC 抖动缓冲区播放。

6. **插话打断。** 当 VAD 在 TTS 播放时检测到新的用户语音，立即取消 TTS 流，丢弃剩余的 LLM 输出，并重新武装 ASR。发布一个 `tts_canceled` span。

7. **工具侧通道。** 注册天气和日历作为函数调用工具。调用时，并发触发调用；如果在 300ms 内未解决，让 LLM 发出"请稍等，让我查一下"作为填充音；工具返回后恢复。

8. **评估框架。** 录制 100 次通话。计算 WER（对照保留转录文本）、误切断率（用户话说到一半时 TTS 被取消）、首音频输出 p50、TTS MOS（人工或 NISQA）、以及抖动丢包测试（丢弃 3% 的数据包）。

9. **负载测试。** 使用合成呼叫者在单台 g5.xlarge 上驱动 50 路并发通话。测量持续的首音频输出 p95。

## 使用方式

```
caller: "what is the weather in tokyo tomorrow"
[asr  ] partial @280ms: "what is the"
[asr  ] partial @540ms: "what is the weather"
[turn ] completion score 0.82 at @820ms; commit
[llm  ] first token @960ms
[tool ] weather.tokyo tomorrow -> 68/52 partly cloudy @1140ms
[tts  ] first audio-out @1040ms: "Tokyo tomorrow will be partly cloudy..."
turn latency: 1040ms user-stop -> audio-out
```

## 交付物

`outputs/skill-voice-agent.md` 是可交付的技能文件。给定一个领域（客户支持、日程安排或自助服务终端），它搭建一个 LiveKit Agent，配置 ASR/VAD/LLM/TTS 管道，达到衡量标准。评分标准：

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | 端到端延迟 | 100 次录制通话中 p50 首音频输出低于 800ms |
| 20 | 轮次切换质量 | Hamming VAD 基准上误切断率低于 3% |
| 20 | 工具使用正确性 | 对话中途的工具调用返回正确数据且不卡顿音频 |
| 20 | 丢包下的可靠性 | 注入 3% 丢包时的 WER 和轮次切换稳定性 |
| 15 | 评估框架完整性 | 可复现的测量，带公共配置 |
| **100** | | |

## 练习

1. 将 Deepgram Nova-3 替换为 g5.xlarge 上的 faster-whisper v3 turbo。测量延迟和 WER 差距。确定 CPU 与 GPU 决策的关键点。

2. 添加打断仲裁策略：用户在工具调用期间插话时 Agent 应该做什么？比较三种策略（硬取消、完成工具再停止、排队下一轮）。

3. 运行对抗性轮次检测器测试：让用户在句子中间有长时间停顿。调优 VAD 静音阈值和轮次检测器评分阈值，在不超过 900ms 的前提下实现最低误切断。

4. 通过 Twilio 在 PSTN 上部署相同的 Agent。比较 PSTN 与 WebRTC 的首音频输出时间。解释抖动缓冲区和编码器差异。

5. 为非英语语言（日语、西班牙语）添加语音活动检测。测量 Silero VAD v5 误触发率与语言特定微调模型的对比。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 语音轮次检测 | "话语结束" | 分类器，根据 VAD 静音和部分转录，判断用户是否已说完 |
| 插话打断 | "打断处理" | VAD 检测到新用户语音时取消 TTS 播放 |
| 首音频输出 | "延迟" | 从用户停止说话到第一个音频包离开服务器的时间 |
| VAD | "语音门控" | 将音频帧分类为语音 vs 静音的模型；Silero VAD v5 是 2026 年默认选择 |
| 抖动缓冲区 | "音频平滑" | 客户端缓冲区，短暂持有数据包以吸收网络波动 |
| 填充音 | "确认 token" | Agent 发出的短短语，以避免工具慢时的静音 |
| MOS | "平均意见得分" | 感知语音质量评分；NISQA 是自动化代理指标 |

## 延伸阅读

- [LiveKit Agents 1.0](https://github.com/livekit/agents) — 参考 WebRTC Agent 框架
- [Pipecat](https://github.com/pipecat-ai/pipecat) — 备选 Python 优先流式 Agent 框架
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) — 集成语音模型的参考
- [Deepgram Nova-3 文档](https://developers.deepgram.com/docs) — 流式 ASR 参考
- [Silero VAD v5](https://github.com/snakers4/silero-vad) — VAD 参考模型
- [Cartesia Sonic-2](https://docs.cartesia.ai) — 低延迟 TTS 参考
- [Retell AI 架构](https://docs.retellai.com) — 生产级语音 Agent 架构
- [Vapi.ai 生产栈](https://docs.vapi.ai) — 备选生产参考
