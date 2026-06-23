---
name: realtime-voice-pipeline
description: 为目标的端到端延迟选择传输、VAD、流式语音转文字、LLM、流式 TTS 和编排方案。
version: 1.0.0
phase: 6
lesson: 11
tags: [voice-agent, livekit, pipecat, silero, streaming, latency]
---

给定目标（延迟 P50/P95、语言、信道、离线 vs 云端、通话量），输出：

1. 传输。WebRTC（LiveKit / Daily）· WebSocket · SIP 中继（Twilio / Telnyx）。理由与抖动容限和用例相关。
2. VAD + 轮流。Silero VAD（开源，99.5% TPR）· Cobra（商业）· LiveKit 轮流检测器。阈值、最小语音时长、静音挂起时间。
3. 流式语音转文字。Parakeet TDT（最快的开源）· Kyutai STT（带刷新技巧）· Deepgram Nova-3（API，~150 毫秒）· Whisper-streaming。说明理由。
4. LLM + 流式。在 TTS 启动前锁定前 20 个词元。模型 + 流式配置 + 提示注入防护。
5. 流式 TTS。Kokoro-82M（~100 毫秒 TTFA）· Orpheus · Cartesia Sonic · ElevenLabs Turbo。语音包或克隆防护（第 8 课）。
6. 编排。LiveKit Agents · Pipecat · Vapi · Retell · 自定义 Rust。理由与团队技能和规模相关。
7. 可观测性。每阶段的 P50/P95/P99 直方图；误报中断率；通话掉线率；通话样本上的 WER。

拒绝在语音转文字之前缓冲整个话语的部署。拒绝不流式的 TTS。拒绝以平均延迟进行评估 -- 要求 P95。拒绝在超过 10 万分钟/月的情况下使用托管平台（Vapi / Retell）而不与自建方案进行成本比较。

示例输入："汽车保险报价语音代理。P95 < 500 毫秒。英语，美国。每周 5 万分钟。合规：接近 HIPAA（日志中无 PII）。"

示例输出：
- 传输：LiveKit Agents + Twilio SIP。在呼叫中心规模经过验证，可选择 HIPAA 模式。
- VAD：Silero VAD @ 阈值 0.45，最小语音 220 毫秒，静音挂起 400 毫秒。叠加 LiveKit 轮流检测器。
- 语音转文字：Deepgram Nova-3 英语（~150 毫秒 P95）；如需本地审计则回退到 Parakeet-TDT。
- LLM：通过 OpenAI 实时 API 的 GPT-4o 流式；使用后过滤器防止提示注入；将前 20 个词元锁定到 TTS。
- TTS：Cartesia Sonic 2（~150 毫秒 TTFA，不使用语音克隆 -- 预定义声音）。
- 编排：LiveKit Agents。通过 Hamming AI 实现生产可观测性。
- 日志：在持久化之前通过正则 + NER 过消除 CVV / SSN / DOB。保留 30 天。
