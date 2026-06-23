# 语音智能体：Pipecat 和 LiveKit

> 语音智能体在2026年是一等生产类别。Pipecat为你提供基于Python的帧管道（VAD → STT → LLM → TTS → 传输）。LiveKit Agents通过WebRTC将AI模型与用户连接。生产延迟目标为高级堆栈的端到端450-600毫秒。

**类型：** 学习
**语言：** Python（标准库）
**前置知识：** 第14阶段·01（智能体循环），第14阶段·12（工作流模式）
**时间：** 约60分钟

## 学习目标

- 描述Pipecat基于帧的管道：DOWNSTREAM（源到汇）和UPSTREAM（控制）。
- 说出标准语音管道阶段以及Pipecat支持哪些传输方式。
- 解释LiveKit Agents的两个语音智能体类（MultimodalAgent、VoicePipelineAgent）以及各自适合的场景。
- 总结2026年生产延迟预期以及它们如何驱动架构选择。

## 问题

语音智能体不是简单地在文本循环上添加TTS。延迟预算很苛刻（约600毫秒），部分音频是默认情况，话轮检测是一个模型，传输方式从电话SIP到WebRTC。你要么构建基于帧的管道（Pipecat），要么依赖平台（LiveKit）。

## 概念

### Pipecat（pipecat-ai/pipecat）

- 基于Python的帧管道框架。
- `Frame` → `FrameProcessor`链。
- 两个流向：
  - **DOWNSTREAM** — 源到汇（音频输入，TTS输出）。
  - **UPSTREAM** — 反馈和控制（取消、指标、打断）。
- `PipelineTask`通过事件（`on_pipeline_started`、`on_pipeline_finished`、`on_idle_timeout`）和用于指标/追踪/RTVI的观察者管理生命周期。

典型管道：

```
VAD（Silero）→ STT → LLM（上下文交替用户/助手）→ TTS → 传输
```

传输方式：Daily、LiveKit、SmallWebRTCTransport、FastAPI WebSocket、WhatsApp。

Pipecat Flows增加了结构化对话（状态机）。Pipecat Cloud是托管运行时。

### LiveKit Agents（livekit/agents）

- 通过WebRTC将AI模型与用户连接。
- 关键概念：`Agent`、`AgentSession`、`entrypoint`、`AgentServer`。
- 两个语音智能体类：
  - **MultimodalAgent** — 通过OpenAI Realtime或等效方案直接音频。
  - **VoicePipelineAgent** — STT → LLM → TTS级联；给予文本级控制。
- 通过transformer模型进行语义话轮检测。
- 原生MCP集成。
- 通过SIP的电话功能。
- 通过LiveKit Inference提供50多个无需API密钥的模型；通过插件提供200多个。

### 商业平台

Vapi（优化高级堆栈上约450-600毫秒）和Retell（跨180次测试通话约600毫秒端到端）构建在这些技术之上。当你想要没有WebRTC团队的托管语音堆栈时，选择平台。

### 这种模式失败的地方

- **无打断处理。** 用户打断；智能体继续说话。需要在Pipecat中使用UPSTREAM取消帧，LiveKit中需要等效方案。
- **忽略STT置信度。** 低置信度转录被当作真理输入给LLM。在置信度上设门控或请求确认。
- **TTS句中截断。** 当管道在说话中途取消时，TTS需要知道或截断音频。
- **忽略延迟预算。** 每个组件增加50-200毫秒。在发布前汇总你的链路。

### 2026年典型延迟

- VAD：20-60毫秒
- STT部分：100-250毫秒
- LLM首个token：150-400毫秒
- TTS首个音频：100-200毫秒
- 传输RTT：30-80毫秒

端到端450-600毫秒是高级。800-1200毫秒很常见。超过1500毫秒感觉是坏的。

## 动手构建

`code/main.py` 是一个基于帧的玩具管道，包含：

- `Frame`类型（音频、转录、文本、tts_audio、控制）。
- 带有`process(frame)`的`Processor`接口。
- 一个五阶段管道（VAD → STT → LLM → TTS → 传输）作为脚本化处理器。
- 一个UPSTREAM取消帧以演示打断功能。

运行它：

```
python3 code/main.py
```

追踪显示正常流程和一个在TTS说话中途停止的打断取消。

## 使用建议

- **Pipecat** 用于完全控制 — 自定义处理器、Python优先、可插拔提供者。
- **LiveKit Agents** 用于WebRTC优先部署和电话功能。
- **Vapi / Retell** 用于没有WebRTC团队的托管语音智能体。
- **OpenAI Realtime / Gemini Live** 用于直接音频输入/音频输出（MultimodalAgent）。

## 交付产出

`outputs/skill-voice-pipeline.zh.md` 搭建Pipecat风格的语音管道，包含VAD + STT + LLM + TTS + 传输以及打断处理。

## 练习

1. 为你的玩具管道添加指标观察者：每秒统计每阶段的帧数。延迟在哪里累积？
2. 实现置信度门控的STT：低于阈值时请求"你能重复一遍吗？"
3. 添加语义话轮检测：简单规则——如果转录以"？"结尾，话轮结束。
4. 阅读Pipecat的传输文档。将stdlib传输替换为SmallWebRTCTransport配置（桩代码）。
5. 在相同查询上测量OpenAI Realtime与STT+LLM+TTS级联。文本级控制带来了多少延迟成本？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 帧 | "事件" | 管道中类型化的数据单元（音频、转录、文本、控制） |
| 处理器 | "管道阶段" | 带有process(frame)的处理程序 |
| DOWNSTREAM | "前向流" | 源到汇：音频输入，语音输出 |
| UPSTREAM | "反馈流" | 控制：取消、指标、打断 |
| VAD | "语音活动检测" | 检测用户是否在说话 |
| 语义话轮检测 | "智能话轮结束" | 基于模型的用户说完判断 |
| MultimodalAgent | "直接音频智能体" | 音频输入，音频输出；中间无文本 |
| VoicePipelineAgent | "级联智能体" | STT + LLM + TTS；文本级控制 |

## 延伸阅读

- [Pipecat文档](https://docs.pipecat.ai/getting-started/introduction) — 基于帧的管道、处理器、传输
- [LiveKit Agents文档](https://docs.livekit.io/agents/) — WebRTC + 语音原语
- [Vapi](https://vapi.ai/) — 托管语音平台
- [Retell AI](https://www.retellai.com/) — 托管语音，延迟基准测试
