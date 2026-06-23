---
name: voice-agent
description: 构建一个实时语音 Agent，具有低于 800ms 的首音频输出、插话打断处理和对话中途工具使用能力。
version: 1.0.0
phase: 19
lesson: 03
tags: [capstone, voice, webrtc, livekit, pipecat, asr, tts, streaming]
---

给定一个领域（客户支持、日程安排、零售助手），部署一个 WebRTC 语音 Agent，保持端到端首音频输出低于 800ms，同时处理插话打断、工具调用和丢包。

构建计划：

1. 搭建一个 LiveKit Agents 1.0 房间，带有一个流式传输麦克风音频的 Web 客户端。添加 Twilio PSTN 网关用于电话覆盖。
2. 运行流式 ASR（Deepgram Nova-3 托管或 g5.xlarge 上的 faster-whisper Whisper-v3-turbo）。订阅部分和最终转录。
3. 在 20ms 帧上运行 Silero VAD v5。在语音结束时，用 LiveKit 语音轮次检测器评分最新部分转录；仅在 VAD 静音 >= 500ms 且完成度评分 >= 0.6 时才确认轮次完成。
4. 流式 LLM（GPT-4o-realtime、Gemini 2.5 Flash Live 或级联的 Claude Haiku 4.5）。在 200ms 内将第一个 token 交给 TTS。
5. 流式 TTS（Cartesia Sonic-2 或 ElevenLabs Flash v3）。第一个音频块必须在第一个 LLM token 后的 200ms 内离开服务器。
6. 插话打断：当 VAD 在 SPEAKING 或 THINKING 状态检测到新用户语音时，取消 TTS，丢弃剩余 LLM 输出，重新武装 ASR。发布 `tts_canceled` span。
7. 工具侧通道：并发运行函数调用；如果延迟 > 300ms 则发出确认填充音，使音频流永不卡顿。
8. 录制 100 次通话。测量 WER（对照保留转录）、Hamming VAD 基准上的误切断率、首音频输出 p50、NISQA MOS 以及在 3% 丢包下的行为。
9. 使用合成呼叫者在单台 g5.xlarge 上负载测试 50 路并发通话；报告持续的首音频输出 p95。

评估标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 端到端延迟 | 100 次录制通话中 p50 首音频输出低于 800ms |
| 20 | 轮次切换质量 | Hamming VAD 基准上误切断率低于 3% |
| 20 | 工具使用正确性 | 对话中途的工具调用返回正确数据且不卡顿音频 |
| 20 | 丢包下的可靠性 | 注入 3% 丢包时的 WER 和轮次切换稳定性 |
| 15 | 评估框架完整性 | 可复现的测量，带公共配置 |

硬性拒绝：

- 非流式管道（批量 ASR、批量 TTS）无法达到延迟目标。
- 任何不立即取消 TTS 缓冲区的插话打断策略。延迟取消会产生最差的用户体验退化。
- 同步阻塞 LLM 流的工具调用。它们必须在侧通道上运行。

拒绝规则：

- 拒绝在没有 VAD 或语音轮次检测器的情况下部署。固定超时的轮次切换会产生不可接受的切断率。
- 拒绝报告 MOS 时不说明是人工评分还是 NISQA 代理评分。
- 拒绝报告"p50 延迟低于 X"而不提供至少 100 次录制通话并公布通话追踪。

输出：包含 LiveKit Agent 工作进程、PSTN 网关配置、100 次通话评估框架、公共 Langfuse 语音仪表盘、与一个托管竞争对手（Retell、Vapi 或 OpenAI Realtime API）的并列比较、以及一份报告。报告说明你观察到的三大轮次切换失败以及修复每个问题的检测器调优。
