# MCP 基础——原语、生命周期、JSON-RPC 基础

> MCP 之前的每个集成都是定制的。模型上下文协议，由 Anthropic 于 2024 年 11 月首次发布，现在由 Linux 基金会旗下的 Agentic AI 基金会管理，标准化了发现和调用，使得任何客户端都可以与任何服务器通信。2025-11-25 规范命名了六种原语（三种服务器端，三种客户端端）、一个三阶段生命周期和一个 JSON-RPC 2.0 网络格式。掌握了这些，本阶段 MCP 章节的其余部分就会变成轻松的阅读。

**类型：** 学习
**语言：** Python（标准库，JSON-RPC 解析器）
**前置知识：** 第 13 阶段第 01 至 05 课（工具接口和函数调用）
**时间：** 约 45 分钟

## 学习目标

- 命名所有六种 MCP 原语（服务器端：工具、资源、提示；客户端端：根、采样、诱导）并为每种给出一个用例。
- 走通三阶段生命周期（初始化、运行、关闭），并说明在每个阶段谁发送什么消息。
- 解析和发出 JSON-RPC 2.0 请求、响应和通知封装。
- 解释 `initialize` 时的能力协商是什么以及没有它会出什么问题。

## 问题

在 MCP 之前，每个使用工具的 agent 都有自己的协议。Cursor 有一个 MCP 形状但不兼容的工具系统。Claude Desktop 使用了另一种不同的方式。VS Code 的 Copilot 扩展是第三种。一个构建"Postgres 查询"工具的团队将同一个工具写了三遍，每次适配不同主机的 API。复用需要复制代码。

结果是定制集成的大爆发，以及生态系统发展速度的天花板。

MCP 通过标准化网络格式解决了这个问题。一个单一的 MCP 服务器可以在每个 MCP 客户端中工作：Claude Desktop、ChatGPT、Cursor、VS Code、Gemini、Goose、Zed、Windsurf，截至 2026 年 4 月已有超过 300 个客户端。1.1 亿月 SDK 下载量。超过 10,000 个公开服务器。Linux 基金会在 2025 年 12 月通过新的 Agentic AI 基金会接管了管理。

本阶段使用的规范修订版是 **2025-11-25**。它增加了异步任务（SEP-1686）、URL 模式诱导（SEP-1036）、带工具的采样（SEP-1577）、增量作用域同意（SEP-835）和 OAuth 2.1 资源指示器语义。第 13 阶段第 09 至 16 课涵盖了这些扩展。本课停留在基础部分。

## 概念

### 三种服务器原语

1. **工具。** 可调用的动作。与第 13 阶段第 01 课相同的四步循环。
2. **资源。** 暴露的数据。通过 URI 可寻址的只读内容：`file:///path`、`db://query/...`、自定义方案。
3. **提示。** 可重用的模板。宿主 UI 中的斜杠命令；服务器提供模板，客户端填充参数。

### 三种客户端原语

4. **根。** 服务器允许接触的 URI 集合。客户端声明；服务器遵守。
5. **采样。** 服务器请求客户端的模型执行一次补全。支持服务器托管的 agent 循环，无需服务器端 API 密钥。
6. **诱导。** 服务器在运行过程中请求客户端的用户提供结构化输入。表单或 URL（SEP-1036）。

MCP 中的每个能力都恰好属于这六种之一。第 13 阶段第 10 至 14 课深入涵盖了每一种。

### 网络格式：JSON-RPC 2.0

每条消息都是一个 JSON 对象，包含以下字段：

- 请求：`{jsonrpc: "2.0", id, method, params}`。
- 响应：`{jsonrpc: "2.0", id, result | error}`。
- 通知：`{jsonrpc: "2.0", method, params}`——无 `id`，不期待响应。

基本规范约有 15 个方法，按原语分组。重要的有：

- `initialize` / `initialized`（握手）
- `tools/list`、`tools/call`
- `resources/list`、`resources/read`、`resources/subscribe`
- `prompts/list`、`prompts/get`
- `sampling/createMessage`（服务器到客户端）
- `notifications/tools/list_changed`、`notifications/resources/updated`、`notifications/progress`

### 三阶段生命周期

**阶段 1：初始化。**

客户端发送带有其 `capabilities` 和 `clientInfo` 的 `initialize`。服务器以其自己的 `capabilities`、`serverInfo` 和其支持的规范版本进行响应。客户端在消化响应后发送 `notifications/initialized`。从此时起，任何一方都可以根据协商的能力发送请求。

**阶段 2：运行。**

双向。客户端调用 `tools/list` 进行发现，然后 `tools/call` 进行调用。如果服务器声明了该能力，它可以发送 `sampling/createMessage`。当工具集发生变化时，服务器可以发送 `notifications/tools/list_changed`。当用户更改根作用域时，客户端可以发送 `notifications/roots/list_changed`。

**阶段 3：关闭。**

任何一方关闭传输。MCP 中没有结构化的关闭方法；传输（stdio 或 Streamable HTTP，第 13 阶段第 09 课）携带连接结束信号。

### 能力协商

`initialize` 握手时的 `capabilities` 就是契约。来自服务器的示例：

```json
{
  "tools": {"listChanged": true},
  "resources": {"subscribe": true, "listChanged": true},
  "prompts": {"listChanged": true}
}
```

服务器声明它可以发送 `tools/list_changed` 通知并支持 `resources/subscribe`。客户端通过声明自己的来同意：

```json
{
  "roots": {"listChanged": true},
  "sampling": {},
  "elicitation": {}
}
```

如果客户端没有声明 `sampling`，服务器不得调用 `sampling/createMessage`。对称地：如果服务器没有声明 `resources.subscribe`，客户端不得尝试订阅。

这就是防止生态系统漂移的机制。不支持采样的客户端仍然是有效的 MCP 客户端；不调用 `sampling` 的服务器仍然是有效的 MCP 服务器。它们只是不一起使用那个功能而已。

### 结构化内容和错误形态

`tools/call` 返回一个类型化块的 `content` 数组：`text`、`image`、`resource`。第 13 阶段第 14 课将 MCP 应用（`ui://` 交互式 UI）添加到该列表中。

错误使用 JSON-RPC 错误码。规范定义的新增项：`-32002"资源未找到"`、`-32603"内部错误"`，以及作为 `error.data` 的 MCP 特定错误数据。

### 客户端能力 vs 工具调用细节

一个常见的混淆点：`capabilities.tools` 是指客户端是否支持工具列表更改通知。客户端是否会调用特定工具是一个由其模型驱动的运行时选择，而不是一个能力标志。能力标志是规范级别的契约。模型的选择是正交的。

### 为什么是 JSON-RPC 而不是 REST？

JSON-RPC 2.0（2010）是一个轻量级的双向协议。REST 是客户端发起的。MCP 需要服务器发起的消息（采样、通知），因此具有对称请求/响应形状的 JSON-RPC 是自然的选择。JSON-RPC 还能干净地组合在 stdio 和 WebSocket/Streamable HTTP 之上，而无需重新发明 HTTP 的请求形状。

```figure
mcp-tool-call
```

## 使用

`code/main.py` 提供了一个最小的 JSON-RPC 2.0 解析器和发射器，然后手工走通 `initialize` -> `tools/list` -> `tools/call` -> `shutdown` 序列，打印每条消息。没有真实的传输；只有消息形状。与延伸阅读中链接的规范进行比较，验证每个封装。

关注点：

- `initialize` 双向声明能力；响应包含 `serverInfo` 和 `protocolVersion: "2025-11-25"`。
- `tools/list` 返回一个 `tools` 数组；每个条目有 `name`、`description`、`inputSchema`。
- `tools/call` 使用 `params.name` 和 `params.arguments`。
- 响应的 `content` 是一个 `{type, text}` 块的数组。

## 交付

本课生成 `outputs/skill-mcp-handshake-tracer.md`。给定一个类似 pcap 的 MCP 客户端-服务器交互转录，该技能用原语、生命周期阶段和能力依赖关系注释每条消息。

## 练习

1. 运行 `code/main.py`。确定能力协商发生的行，并描述如果服务器没有声明 `tools.listChanged` 会有什么变化。

2. 扩展解析器以处理 `notifications/progress`。消息形状：`{method: "notifications/progress", params: {progressToken, progress, total}}`。在长时间运行的 `tools/call` 进行中发出它，并确认客户端处理器会显示进度条。

3. 从头到尾阅读 MCP 2025-11-25 规范——整个文档约 80 页。找出大多数服务器不需要的一个能力标志。提示：它与资源订阅有关。

4. 在纸上草拟一个假设的"cron 作业"功能所属的原语。（提示：服务器希望客户端在预定时间调用它。六种原语目前都不适合。）MCP 2026 路线图有一个关于此的 SEP 草案。

5. 解析来自 GitHub 上某个开放 MCP 服务器的一个会话日志。计数请求 vs 响应 vs 通知消息。计算生命周期相关流量与运行相关流量的比例。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|----------------|------------------------|
| MCP | "模型上下文协议" | 模型到工具的发现和调用的开放协议 |
| 服务器原语 | "服务器暴露的内容" | 工具（动作）、资源（数据）、提示（模板） |
| 客户端原语 | "客户端让服务器使用的内容" | 根（作用域）、采样（LLM 回调）、诱导（用户输入） |
| JSON-RPC 2.0 | "网络格式" | 对称的请求/响应/通知封装 |
| `initialize` 握手 | "能力协商" | 第一条消息对；服务器和客户端声明它们支持的功能 |
| `tools/list` | "发现" | 客户端询问服务器当前的工具集 |
| `tools/call` | "调用" | 客户端请求服务器使用参数执行工具 |
| `notifications/*_changed` | "变更事件" | 服务器告知客户端其原语列表已更改 |
| 内容块 | "类型化结果" | 工具结果中的 `{type: "text" | "image" | "resource" | "ui_resource"}` |
| SEP | "规范演进提案" | 命名的草案提案（例如异步任务的 SEP-1686） |

## 延伸阅读

- [模型上下文协议 — 规范 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — 权威规范文档
- [模型上下文协议 — 架构概念](https://modelcontextprotocol.io/docs/concepts/architecture) — 六原语心智模型
- [Anthropic — 介绍模型上下文协议](https://www.anthropic.com/news/model-context-protocol) — 2024 年 11 月发布文章
- [MCP 博客 — MCP 一周年](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/) — 一周年回顾与 2025-11-25 规范变更
- [WorkOS — MCP 2025-11-25 规范更新](https://workos.com/blog/mcp-2025-11-25-spec-update) — SEP-1686、1036、1577、835 和 1724 的总结
