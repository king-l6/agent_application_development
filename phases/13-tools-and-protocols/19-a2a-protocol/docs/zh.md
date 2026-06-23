# A2A — 智能体间协议

> MCP 是智能体到工具。A2A（Agent2Agent）是智能体到智能体——一个开放协议，让构建在不同框架上的黑箱智能体能够协作。由 Google 于 2025 年 4 月发布，2025 年 6 月捐赠给 Linux 基金会，2026 年 4 月达到 v1.0，拥有 150+ 支持者，包括 AWS、Cisco、Microsoft、Salesforce、SAP 和 ServiceNow。它吸收了 IBM 的 ACP 并增加了 AP2 支付扩展。本课程介绍 Agent Card、Task 生命周期和两种传输绑定。

**类型：** 构建
**语言：** Python（标准库，Agent Card + Task 框架）
**前置知识：** 阶段 13 · 06（MCP 基础），阶段 13 · 08（MCP 客户端）
**时间：** 约 75 分钟

## 学习目标

- 区分智能体到工具（MCP）与智能体到智能体（A2A）的用例。
- 在 `/.well-known/agent.json` 发布带有技能和端点元数据的 Agent Card。
- 理解 Task 生命周期（submitted → working → input-required → completed / failed / canceled / rejected）。
- 使用带 Parts（text、file、data）的 Messages 和作为输出的 Artifacts。

## 问题

一个客户服务智能体需要将报告编写委托给专门的编写智能体。A2A 之前的选项：

- 自定义 REST API。可行但每次配对都是定制的。
- 共享代码库。要求两个智能体运行相同的框架。
- MCP。不适用：MCP 用于调用工具，而不是两个智能体在保持各自黑箱内部推理的同时进行协作。

A2A 填补了这个空白。它将交互建模为一个智能体向另一个智能体发送 Task，带有生命周期、消息和工件。被调用智能体的内部状态保持不透明——调用者只看到任务状态转换和最终输出。

A2A 是"让跨框架的智能体相互通信"的协议。它不取代 MCP；两者互补。

## 概念

### Agent Card

每个兼容 A2A 的智能体在 `/.well-known/agent.json` 发布卡片：

```json
{
  "schemaVersion": "1.0",
  "name": "research-agent",
  "description": "总结学术论文并起草引用。",
  "url": "https://research.example.com/a2a",
  "version": "1.2.0",
  "skills": [
    {
      "id": "summarize_paper",
      "name": "总结论文",
      "description": "阅读论文 PDF 并生成三段式摘要。",
      "inputModes": ["text", "file"],
      "outputModes": ["text", "artifact"]
    }
  ],
  "capabilities": {"streaming": true, "pushNotifications": true}
}
```

发现机制基于 URL：获取卡片，了解 A2A 端点的 URL，枚举技能。

### 签名 Agent Card（AP2）

AP2 扩展（2025 年 9 月）为 Agent Card 添加了加密签名。发布者用 JWT 签署自己的卡片；消费者验证。防止冒名顶替。

### Task 生命周期

```
submitted -> working -> completed | failed | canceled | rejected
             -> input_required -> working (loop via message)
```

客户端通过 `tasks/send` 发起请求。被调用智能体在状态之间转换；客户端通过 SSE 或轮询订阅状态更新。

### Messages 和 Parts

一条消息携带一个或多个 Parts：

- `text` — 纯文本内容。
- `file` — 带有 mimeType 的 base64 块。
- `data` — 类型化的 JSON 负载（给被调用智能体的结构化输入）。

示例：

```json
{
  "role": "user",
  "parts": [
    {"type": "text", "text": "总结这篇论文。"},
    {"type": "file", "file": {"name": "paper.pdf", "mimeType": "application/pdf", "bytes": "..."}},
    {"type": "data", "data": {"targetLength": "3 paragraphs"}}
  ]
}
```

### Artifacts

输出是 Artifacts，而不是原始字符串。Artifact 是一个命名的、类型化的输出：

```json
{
  "name": "summary",
  "parts": [{"type": "text", "text": "..."}],
  "mimeType": "text/markdown"
}
```

Artifacts 可以作为块流式传输。调用者累积。

### 两种传输绑定

1. **JSON-RPC over HTTP。** `/a2a` 端点，POST 用于请求，可选 SSE 用于流式传输。默认绑定。
2. **gRPC。** 适用于原生使用 gRPC 的企业环境。

两种绑定携带相同的逻辑消息形状。

### 不透明性保留

一个关键设计原则：被调用智能体的内部状态是不透明的。调用者看到任务状态和工件。被调用智能体的思维链、其工具调用、其子智能体委派——全部不可见。这与 MCP 不同，MCP 中工具调用是透明的。

理由：A2A 使竞争对手能够在不透露内部信息的情况下协作。A2A 可以"调用这个客户服务智能体"而无需调用者了解该智能体如何实现服务。

### 时间线

- **2025-04-09。** Google 宣布 A2A。
- **2025-06-23。** 捐赠给 Linux 基金会。
- **2025-08。** 吸收了 IBM 的 ACP。
- **2025-09。** AP2 扩展（Agent Payments）发布。
- **2026-04。** v1.0 发布，拥有 150+ 支持组织。

### 与 MCP 的关系

| 维度 | MCP | A2A |
|-------|-----|-----|
| 用例 | 智能体到工具 | 智能体到智能体 |
| 透明性 | 透明工具调用 | 不透明内部推理 |
| 典型调用者 | 智能体运行时 | 另一个智能体 |
| 状态 | 工具调用结果 | 带有生命周期的任务 |
| 授权 | OAuth 2.1（阶段 13 · 16）| JWT 签名 Agent Card（AP2）|
| 传输 | Stdio / Streamable HTTP | JSON-RPC over HTTP / gRPC |

当你想要调用特定工具时使用 MCP。当你想要将整个任务委派给另一个智能体时使用 A2A。许多生产系统同时使用两者：智能体使用 MCP 作为工具层，使用 A2A 作为协作层。

## 使用

`code/main.py` 实现了一个最小 A2A 框架：一个研究智能体发布其卡片，一个编写智能体接收带有 Parts（包括 PDF 和文本指令）的 `tasks/send`，经历 working → input_required → working → completed 的转换，并返回文本 artifact。全部使用标准库；使用内存传输以聚焦于消息形状。

需要关注的内容：

- Agent Card JSON 形状。
- Task id 分配和状态转换。
- 混合类型 Parts 的消息。
- 任务中间需要输入的暂停（input-required 分支）。
- 完成时的 artifact 返回。

## 交付

本课程产出 `outputs/skill-a2a-agent-spec.md`。对于一个新的、应能被其他智能体调用的智能体，该技能产生 Agent Card JSON、技能模式和端点蓝图。

## 练习

1. 运行 `code/main.py`。追踪完整的 Task 生命周期，包括被调用智能体要求澄清的 input-required 暂停。

2. 添加签名 Agent Card。使用 HMAC 在卡片的规范 JSON 上签名。编写验证器并确认变异的卡片验证失败。

3. 实现任务流式传输：编写智能体通过 SSE 发出三个增量工件块，调用者累积它们。

4. 设计一个封装 MCP 服务器的 A2A 智能体。将每个 MCP 工具映射到 A2A 技能。注意权衡——丢失了什么不透明性？

5. 阅读 A2A v1.0 公告，找出截至 2026 年 4 月尚未被任何框架实现的一个特性。（提示：与多跳任务委派有关。）

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| A2A | "智能体间协议" | 黑箱智能体协作的开放协议 |
| Agent Card | "`.well-known/agent.json`" | 描述智能体技能和端点的已发布元数据 |
| Skill | "可调用单元" | 智能体支持的命名操作（类似于 MCP 工具） |
| Task | "委派单位" | 具有生命周期和最终工件的工作项 |
| Message | "任务输入" | 携带 Parts（text、file、data） |
| Part | "类型化块" | 消息中的 `text` / `file` / `data` 元素 |
| Artifact | "任务输出" | 完成时返回的命名、类型化输出 |
| AP2 | "智能体支付协议" | 用于信任和支付的签名 Agent Card 扩展 |
| Opacity | "黑箱协作" | 被调用智能体的内部信息对调用者隐藏 |
| Input-required | "任务暂停" | 智能体需要更多信息时的生命周期状态 |

## 扩展阅读

- [a2a-protocol.org](https://a2a-protocol.org/latest/) — A2A 规范标准
- [a2aproject/A2A — GitHub](https://github.com/a2aproject/A2A) — 参考实现和 SDK
- [Linux Foundation — A2A 发布新闻稿](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents) — 2025 年 6 月治理移交
- [Google Cloud — A2A 协议升级](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade) — 路线图和合作伙伴动态
- [Google Dev — A2A 1.0 里程碑](https://discuss.google.dev/t/the-a2a-1-0-milestone-ensuring-and-testing-backward-compatibility/352258) — v1.0 发布说明和向后兼容指南
