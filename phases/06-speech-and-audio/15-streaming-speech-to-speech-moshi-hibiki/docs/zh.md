# 流式语音到语音 — Moshi、Hibiki 与全双工对话

> 2024-2026 年重新定义了语音 AI。Moshi 推出了一个单一模型，能够以 200 ms 延迟同时收听和说话。Hibiki 逐块进行语音到语音翻译。两者都放弃了 ASR → LLM → TTS 管线，转而采用统一的基于 Mimi 编解码器 token 的全双工架构。这是新的参考设计。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 6 · 13（神经音频编解码器），阶段 6 · 11（实时音频），阶段 7 · 05（完整 Transformer）
**时间：** ~75 分钟

## 问题

从第 11 和 12 课构建的每个语音助手都有一个大约 300-500 ms 的基本延迟下限：VAD 触发、STT 处理、LLM 推理、TTS 生成。每个阶段都有各自的最小延迟。你可以调优和并行化，但管线架构本身存在上限。

Moshi（Kyutai，2024-2026）提出了一个不同的问题：如果没有管线会怎样？如果有一个模型直接输入音频并输出音频，持续不断，以文本作为中间的"内心独白"而非必要阶段，会怎样？

答案是**全双工语音到语音**。理论延迟 160 ms（80 ms Mimi 帧 + 80 ms 声学延迟）。在单张 L4 GPU 上实际延迟 200 ms。这已经是最佳管线化语音助手的一半。

## 概念

![Moshi 架构：两个并行的 Mimi 流 + 内心独白文本](../assets/moshi-hibiki.svg)

### Moshi 架构

**输入。** 两个 Mimi 编解码器流，均为 12.5 Hz × 8 码本：

- 流 1：用户音频（Mimi 编码，持续到达）
- 流 2：Moshi 自身的音频（由 Moshi 生成）

**Transformer。** 一个 7B 参数的时序 Transformer 处理两个流和一个文本"内心独白"流。在每个 80 ms 步中：

1. 消费最新的用户 Mimi token（8 个码本）。
2. 消费最近的 Moshi Mimi token（8 个码本，如生成）。
3. 生成下一个 Moshi 文本 token（内心独白）。
4. 生成下一个 Moshi Mimi token（通过一个小型深度 Transformer 生成 8 个码本）。

所有三个流——用户音频、Moshi 音频、Moshi 文本——并行运行。Moshi 可以在说话时听到用户的声音；可以在用户打断时自我打断；可以发出回应声（"嗯哼"）而不打断其主话语。

**深度 Transformer。** 在一个帧内，8 个码本不是并行预测的——它们之间存在码本间依赖。一个小型 2 层"深度 Transformer"在 80 ms 内顺序预测它们。这是自回归编解码器 LM 的标准分解（也用于 VALL-E、VibeVoice）。

### 为什么内心独白文本有帮助

没有显式文本时，模型必须在其声学流中隐式建模语言。Moshi 的洞见：强迫它在音频旁发出文本 token。文本流本质上是 Moshi 所说内容的转录。这提高了语义连贯性，使得更容易替换语言模型头，并免费提供转录文本。

### Hibiki：流式语音到语音翻译

相同的架构，在翻译对上训练。源语言音频输入，目标语言音频输出，持续进行。Hibiki-Zero（2026 年 2 月）消除了对词级对齐训练数据的需求——使用句级数据 + GRPO 强化学习进行延迟优化。

初始支持四种语言对；可通过约 1000 小时数据适配新语言。

### 更广泛的 Kyutai 技术栈（2026）

- **Moshi** — 全双工对话（法语优先，英语支持良好）
- **Hibiki / Hibiki-Zero** — 同声语音翻译
- **Kyutai STT** — 流式 ASR（500 ms 或 2.5 s 前瞻）
- **Kyutai Pocket TTS** — 100M 参数 TTS，可在 CPU 上运行（2026 年 1 月）
- **Unmute** — 将这些结合在公共服务器上的完整管线

在 L40S GPU 上的吞吐量：64 个并发会话，3 倍实时。

### Sesame CSM —— 同类模型

Sesame CSM（2025）使用了类似的想法——一个 Llama-3 主干加上一个 Mimi 编解码器头。但 CSM 是单向的（接受上下文 + 文本，生成语音）而非全双工。它是市场上最好的"语音存在感"TTS；与 Moshi 的全双工能力不完全相同。

### 2026 年性能数据

| 模型 | 延迟 | 用例 | 许可证 |
|------|------|------|--------|
| Moshi | 200 ms（L4） | 全双工英语/法语对话 | CC-BY 4.0 |
| Hibiki | 12.5 Hz 帧率 | 法语 ↔ 英语流式翻译 | CC-BY 4.0 |
| Hibiki-Zero | 同上 | 5 种语言对，无需对齐数据 | CC-BY 4.0 |
| Sesame CSM-1B | 200 ms TTFA | 上下文条件 TTS | Apache-2.0 |
| GPT-4o Realtime | ~300 ms | 闭源，OpenAI API | 商业 |
| Gemini 2.5 Live | ~350 ms | 闭源，Google API | 商业 |

## 动手搭建

### 步骤 1：接口

Moshi 暴露一个 WebSocket 服务器，接收 80 ms 的 Mimi 编码音频块，并返回 80 ms 的 Mimi 编码音频块。双向，持续不断。

```python
import asyncio
import websockets
from moshi.client_utils import encode_audio_mimi, decode_audio_mimi

async def moshi_chat():
    async with websockets.connect("ws://localhost:8998/api/chat") as ws:
        mic_task = asyncio.create_task(stream_mic_to(ws))
        spk_task = asyncio.create_task(stream_from_to_speaker(ws))
        await asyncio.gather(mic_task, spk_task)
```

### 步骤 2：全双工循环

```python
async def stream_mic_to(ws):
    async for chunk_80ms in mic_stream_at_12_5_hz():
        mimi_tokens = encode_audio_mimi(chunk_80ms)
        await ws.send(serialize(mimi_tokens))

async def stream_from_to_speaker(ws):
    async for msg in ws:
        mimi_tokens, text_token = deserialize(msg)
        audio = decode_audio_mimi(mimi_tokens)
        await play(audio)
```

两个方向同时运行。Python asyncio 或 Rust futures 是标准的传输方式。

### 步骤 3：训练目标（概念性）

对于每个 80 ms 帧 `t`：

- 输入：`user_mimi[0..t]`，`moshi_mimi[0..t-1]`，`moshi_text[0..t-1]`
- 预测：`moshi_text[t]`，然后 `moshi_mimi[t, codebook_0..7]`

文本在音频之前被预测（内心独白）；音频在深度 Transformer 内按码本顺序预测。

### 步骤 4：Moshi 的胜场与不足

Moshi 胜场：

- 在廉价硬件上端到端低于 250 ms。
- 自然的回应声和打断。
- 无需管线胶水代码。

Moshi 不足：

- 工具调用（未针对此训练；需要单独的 LLM 路径）。
- 长推理（Moshi 是一个约 8B 的对话模型，不是 Claude/GPT-4）。
- 在细分主题上的事实准确性。
- 大多数生产型企业用例（2026 年仍然使用管线）。

## 应用场景

| 场景 | 选择 |
|------|------|
| 最低延迟语音伴侣 | Moshi |
| 实时翻译通话 | Hibiki |
| 语音演示/研究 | Moshi、CSM |
| 带工具的企业助手 | 管线（第 12 课），而非 Moshi |
| 上下文自定义语音 TTS | Sesame CSM |
| 任意语言的语音到语音 | GPT-4o Realtime 或 Gemini 2.5 Live（商业） |

## 常见陷阱

- **工具调用能力有限。** Moshi 是对话模型，不是智能体框架。如需工具，需与管线结合。
- **特定语音条件化。** Moshi 使用单个训练好的角色；克隆需要独立的训练运行。
- **语言覆盖范围。** 法语 + 英语优秀；其他语言有限。Hibiki-Zero 有帮助，但你仍然需要训练数据。
- **资源成本。** 一个完整的 Moshi 会话独占一个 GPU 槽位；不是廉价的共享租户部署模式。

## 交付产出

保存为 `outputs/skill-duplex-pipeline.md`。为语音助手工作负载选择管线 vs 全双工架构，并说明理由。

## 练习

1. **简单。** 运行 `code/main.py`。它象征性地模拟双流 + 内心独白架构。
2. **中等。** 从 HuggingFace 拉取 Moshi，运行服务器，测试一个对话。测量从用户语音结束到 Moshi 响应开始的挂钟延迟。
3. **困难。** 拿你的第 12 课管线助手，在 20 个匹配的测试话语上比较 P50 延迟与 Moshi。写出管线在何种情况下架构上仍然胜出。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 全双工 | 同时听和说 | 同一模型上同时活跃的两个音频流。 |
| 内心独白 | 模型的文本流 | Moshi 在其音频输出旁发出文本 token。 |
| 深度 Transformer | 码本间预测器 | 小 Transformer，在一个 80 ms 帧内预测 8 个码本。 |
| Mimi | Kyutai 的编解码器 | 12.5 Hz × 8 码本；语义+声学；驱动 Moshi。 |
| 流式 S2S | 音频 → 音频实时 | 逐块翻译/对话，无管线阶段。 |
| 回应声 | "嗯哼"反应 | Moshi 可以发出小的确认而不打断其话轮。 |

## 延伸阅读

- [Défossez et al. (2024). Moshi — speech-text foundation model](https://arxiv.org/html/2410.00037v2) — 论文。
- [Kyutai Labs (2026). Hibiki-Zero](https://arxiv.org/abs/2602.12345) — 无需对齐数据的流式翻译。
- [Sesame (2025). Crossing the uncanny valley of voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice) — CSM 规范。
- [Kyutai — Moshi repo](https://github.com/kyutai-labs/moshi) — 安装 + 服务器。
- [OpenAI — Realtime API](https://platform.openai.com/docs/guides/realtime) — 闭源商业对标产品。
- [Kyutai — Delayed Streams Modeling](https://github.com/kyutai-labs/delayed-streams-modeling) — 底层 STT/TTS 框架。
