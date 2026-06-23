---
name: voice-pipeline
description: 搭建Pipecat风格的语音管道（VAD + STT + LLM + TTS + 传输），带有打断、置信度门控和延迟预算强制。
version: 1.0.0
phase: 14
lesson: 22
tags: [voice, pipecat, livekit, webrtc, latency]
---

给定一个语音产品规格（语言、传输、提供商），搭建一个基于帧的管道。

产出：

1. `Frame`类型，包含`kind`、`payload`、`direction`（下游/上游）。
2. 处理器：`VAD`、`STT`、`LLM`、`TTS`、`Transport`。每个都有`process(frame)`。
3. `link()`辅助函数，向前和向后链接处理器。
4. 取消帧处理：从传输到TTS到LLM到STT的UPSTREAM路径，在每个阶段丢弃待处理工作。
5. 观察者：每阶段延迟指标；为每个跨越处理器的帧发出OTel跨度（第23课）。
6. STT上的置信度门控：低于阈值时，发出"请重复"文本帧而不是转录。

硬性拒绝：

- 没有UPSTREAM处理的管道。打断对语音来说不是可选项。
- 没有流式传输的LLM调用。首个token延迟占主导；必须流式传输。
- 置信度盲STT。将错误转录输入给LLM会产生错误回复。

拒绝规则：

- 如果冷启动时端到端延迟超过1500毫秒，拒绝发布。优化链路或使用MultimodalAgent（LiveKit直接音频）。
- 如果产品以电话为主且管道没有SIP适配器，拒绝。通过LiveKit SIP或平台（Vapi/Retell）路由。
- 如果产品携带PII音频且传输中未加密，拒绝。

输出：`frames.py`、`processors.py`、`pipeline.py`、`observers.py`、`README.md`，解释延迟预算、打断设计和传输选择。以"接下来阅读"指向第23课（OTel）、第24课（可观测性后端）或LiveKit文档（WebRTC细节）结束。
