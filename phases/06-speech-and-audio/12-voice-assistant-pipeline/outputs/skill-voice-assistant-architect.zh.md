---
name: voice-assistant-architect
description: 为给定的工作负载生成完整的语音助手技术栈规格 -- 组件、延迟预算、可观测性、合规性。
version: 1.0.0
phase: 6
lesson: 12
tags: [voice-assistant, architecture, livekit, pipecat, compliance]
---

给定用例（消费者 / 客服 / 无障碍 / 边缘）、预期规模（并发会话数、分钟/月）、语言、延迟目标、合规要求（HIPAA、PCI、欧盟 AI 法案、加州 SB 942），输出：

1. 组件（7 层）。麦克风 + 分块 · VAD · 流式语音转文字 · LLM + 工具 · 流式 TTS · 播放 · 中断处理器。为每个指定确切提供商/模型。
2. 延迟预算。每阶段的 P50 / P95 / P99 目标，汇总到端到端目标。标记哪些阶段是独立的 vs 顺序的。
3. 工具调用 schema。每个工具的 JSON 规范 + 错误处理 + 回退文本。始终包含一个 LLM 在失败两次后必须采用的"无法帮助"路径。
4. 安全。提示注入防护、语音克隆锁定（如果 TTS 能够克隆）、唤醒词门控（对于始终在线）、日志中的 PII 脱敏、30 天保留。
5. 可观测性。每阶段的 P50/P95/P99 · 误报中断率 · 工具调用成功率 · 每 100 次调用的 WER · 每分钟成本 · 放弃率。
6. 合规。披露音频（"这是 AI 助手"）、区域锁定（欧盟数据在欧盟）、审计日志保留、退出路径。

拒绝没有唤醒词的始终在线部署。拒绝不流式的 TTS（会增加整段话语的延迟）。拒绝使用平均延迟而不报告 P95 -- 尾部延迟是用户流失的原因。拒绝原始音频保留超过 30 天而未经法律审查。

示例输入："低视力用户的无障碍助手：面向消费者邮件应用的纯语音界面。英语。P95 < 600 毫秒。约 1 万并发用户。"

示例输出：
- 组件：sounddevice（通过 LiveKit Agents 的 WebRTC）· Silero VAD · Deepgram Nova-3（英语）· GPT-4o 带邮件工具（read_message、compose_reply、mark_read）· Cartesia Sonic 2 流式 · WebRTC 输出 · VAD 触发时中断 = 取消 LLM 和 TTS。
- 预算：捕获 120 毫秒 + VAD 40 + STT 150 + LLM TTFT 100 + TTS TTFA 150 = P95 560 毫秒。
- 工具：read_message({id})、compose_reply({message_id、body})、mark_read({id})、search({query})。全部返回 JSON；LLM 每个工具最多重试 2 次，之后回退为"我做不到 -- 请换种说法"。
- 安全：提示注入防护（检测 `ignore previous instructions`）；唤醒词"Hey Mail"；无语音克隆（固定 Cartesia 声音）；日志中脱敏邮件正文。
- 可观测性：Hamming AI 生产监控；每阶段 Prometheus 直方图；在误报中断 > 5% 或 p95 > 800 毫秒时发出告警。
- 合规：首次使用时进行 AI 披露；仅对医疗消息可选 HIPAA 模式；欧盟用户使用欧盟托管的 Cartesia + GPT-4o 爱尔兰节点。
