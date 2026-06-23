# MCP 采样 — 服务器请求的 LLM 补全与 Agent 循环

> 大多数 MCP 服务器是哑执行器：接收参数、运行代码、返回内容。采样让服务器反转方向：它请求客户端的 LLM 做出决策。这使得服务器托管 Agent 循环成为可能，而服务器本身无需拥有任何模型凭证。合并于 2025-11-25 的 SEP-1577 在采样请求中增加了工具支持，使循环可以包含更深层次的推理。漂移风险提示：SEP-1577 的采样内工具形态在 2026 年第一季度处于实验阶段，在 SDK API 中仍在稳定中。

**类型：** 构建
**语言：** Python（标准库，采样框架）
**前置知识：** 阶段 13 · 07（MCP 服务器），阶段 13 · 10（资源和提示）
**时间：** ~75 分钟

## 学习目标

- 解释 `sampling/createMessage` 解决了什么问题（服务器托管循环而无需服务器端 API 密钥）。
- 实现一个服务器，它请求客户端对多轮提示进行采样并返回补全结果。
- 使用 `modelPreferences`（成本/速度/智能优先级）指导客户端的模型选择。
- 构建一个 `summarize_repo` 工具，它内部通过采样进行迭代，而非硬编码行为。

## 问题

一个用于代码摘要工作流的实用 MCP 服务器需要：遍历文件树、选择要读取的文件、综合摘要并返回。LLM 推理发生在哪里？

选项 A：服务器调用自己的 LLM。需要一个 API 密钥，在服务器端计费，每个用户都很昂贵。

选项 B：服务器返回原始内容；客户端的 Agent 执行推理。可行，但将服务器逻辑移入了客户端提示，这很脆弱。

选项 C：服务器通过 `sampling/createMessage` 请求客户端的 LLM。服务器保留算法（读取哪些文件、执行多少轮），而客户端保留计费和模型选择权。服务器完全没有凭证。

采样就是选项 C。它是受信任的服务器托管 Agent 循环而无需成为完整 LLM 宿主本身的机制。

## 概念

### `sampling/createMessage` 请求

服务器发送：

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "sampling/createMessage",
  "params": {
    "messages": [{"role": "user", "content": {"type": "text", "text": "..."}}],
    "systemPrompt": "...",
    "includeContext": "none",
    "modelPreferences": {
      "costPriority": 0.3,
      "speedPriority": 0.2,
      "intelligencePriority": 0.5,
      "hints": [{"name": "claude-3-5-sonnet"}]
    },
    "maxTokens": 1024
  }
}
```

客户端运行其 LLM，返回：

```json
{"jsonrpc": "2.0", "id": 42, "result": {
  "role": "assistant",
  "content": {"type": "text", "text": "..."},
  "model": "claude-3-5-sonnet-20251022",
  "stopReason": "endTurn"
}}
```

### `modelPreferences`

三个浮点数，总和为 1.0：

- `costPriority`：偏好更便宜的模型。
- `speedPriority`：偏好更快的模型。
- `intelligencePriority`：偏好能力更强的模型。

以及 `hints`：服务器偏好的已命名模型。客户端可能遵守也可能不遵守提示；客户端的用户配置始终优先。

### `includeContext`

三个值：

- `"none"` — 仅包含服务器提供的消息。默认值。
- `"thisServer"` — 包含此前来自该服务器会话的消息。
- `"allServers"` — 包含所有会话上下文。

`includeContext` 自 2025-11-25 起已被软弃用，因为它会泄漏跨服务器上下文，存在安全隐患。优先使用 `"none"` 并在消息中显式传递上下文。

### 带工具的采样（SEP-1577）

2025-11-25 中的新功能：采样请求可以包含一个 `tools` 数组。客户端使用这些工具运行一个完整的工具调用循环。这允许服务器通过客户端的模型托管 ReAct 风格的 Agent 循环。

```json
{
  "messages": [...],
  "tools": [
    {"name": "fetch_url", "description": "...", "inputSchema": {...}}
  ]
}
```

客户端循环：采样、执行被调用的工具、再次采样、返回最终助手消息。这在 2026 年第一季度仍处于实验阶段；SDK 签名可能仍有变化。实现时请确认 2025-11-25 规范的 client/sampling 部分。

### 人类参与循环

客户端必须在使用采样之前向用户展示服务器要求模型做什么。恶意服务器可能利用采样操控用户的会话（"对用户说 X 以便他们点击 Y"）。Claude Desktop、VS Code 和 Cursor 将采样请求显示为用户可拒绝的确认对话框。

2026 年的共识：未经人类确认的采样是一个危险信号。网关（阶段 13 · 17）可以自动批准低风险采样，并自动拒绝任何可疑请求。

### 无需 API 密钥的服务器托管循环

典型用例：一个代码摘要 MCP 服务器，自身没有 LLM 访问权限。它执行：

1. 遍历仓库结构。
2. 调用 `sampling/createMessage`，内容为"挑选最可能描述此仓库用途的五个文件。"
3. 读取这些文件。
4. 调用 `sampling/createMessage`，内容是这些文件的内容和"用三段话总结该仓库。"
5. 将摘要作为 `tools/call` 结果返回。

服务器从不接触 LLM API。客户端的用户使用自己的凭证为补全付费。

### 安全风险（Unit 42 披露，2026 年第一季度）

- **隐蔽采样。** 一个总是调用采样并指示"从会话上下文中获取用户的电子邮件"的工具。阶段 13 · 15 涵盖了攻击向量。
- **通过采样窃取资源。** 服务器请求客户端对攻击者的载荷进行摘要，向用户收费。
- **循环炸弹。** 服务器在紧密循环中调用采样。客户端必须强制实施每个会话的速率限制。

## 使用

`code/main.py` 提供了一个伪造的服务器到客户端采样框架。一个模拟的 `summarize_repo` 工具调用两轮采样（选择文件，然后摘要），伪造的客户端返回预设响应。该框架展示了：

- 服务器发送带有 `modelPreferences` 的 `sampling/createMessage`。
- 客户端返回补全结果。
- 服务器继续其循环。
- 速率限制器限制每次工具调用的总采样次数。

注意要点：

- 服务器只暴露一个工具（`summarize_repo`）；所有推理都在采样调用中完成。
- 模型偏好加权指导客户端的模型选择；提示列出了偏好的模型。
- 循环在 `stopReason: "endTurn"` 时终止。
- `max_samples_per_tool = 5` 的限制捕获了失控循环。

## 交付

本课程产出 `outputs/skill-sampling-loop-designer.md`。给定一个需要 LLM 调用（研究、摘要、规划、分类）的服务器端算法，该技能会设计一个基于采样的实现，包含正确的 modelPreferences、速率限制和安全确认。

## 练习

1. 运行 `code/main.py`。将 `max_samples_per_tool` 改为 2，观察速率限制截断效果。

2. 实现 SEP-1577 的采样内工具变体：在采样请求中携带一个 `tools` 数组。验证客户端侧循环在返回最终补全之前执行了这些工具。注意漂移风险：SDK 签名在 2026 年上半年可能仍有变化。

3. 添加人类参与循环确认：在服务器的第一次 `sampling/createMessage` 之前，暂停并等待用户批准。被拒绝的调用返回一个带类型的拒绝信息。

4. 添加一个以客户端会话为键的每用户速率限制器。同一用户的同一服务器循环应共享一个预算。

5. 设计一个使用采样来选择要包含的块的 `summarize_pdf` 工具。勾画出发送的消息。当 `modelPreferences.intelligencePriority` 为 0.1 和 0.9 时，行为有何不同？

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 采样 | "服务器到客户端的 LLM 调用" | 服务器请求客户端的模型进行补全 |
| `sampling/createMessage` | "方法" | 采样请求的 JSON-RPC 方法 |
| `modelPreferences` | "模型优先级" | 成本/速度/智能权重加名称提示 |
| `includeContext` | "跨会话泄漏" | 已软弃用的上下文包含模式 |
| SEP-1577 | "采样中的工具" | 允许在采样中使用工具，以支持服务器托管的 ReAct |
| 人类参与循环 | "用户确认" | 客户端在执行前向用户展示采样请求 |
| 循环炸弹 | "失控采样" | 服务器端无限采样循环；客户端必须进行速率限制 |
| 隐蔽采样 | "隐藏推理" | 恶意服务器在采样提示中隐藏意图 |
| 资源窃取 | "使用用户的 LLM 预算" | 服务器强制客户端为其不想要的采样付费 |
| `stopReason` | "生成停止原因" | `endTurn`、`stopSequence` 或 `maxTokens` |

## 延伸阅读

- [MCP — Concepts: Sampling](https://modelcontextprotocol.io/docs/concepts/sampling) — 采样高层概述
- [MCP — Client sampling spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling) — `sampling/createMessage` 的标准形态
- [MCP — GitHub SEP-1577](https://github.com/modelcontextprotocol/modelcontextprotocol) — 采样内工具的规范演进提案（实验性）
- [Unit 42 — MCP attack vectors](https://unit42.paloaltonetworks.com/model-context-protocol-attack-vectors/) — 隐蔽采样和资源窃取模式
- [Speakeasy — MCP sampling core concept](https://www.speakeasy.com/mcp/core-concepts/sampling) — 带客户端代码示例的逐步解析
