# 构建 MCP 客户端 — 发现、调用、会话管理

> 大多数 MCP 内容提供的是服务器教程，对客户端只是一笔带过。客户端代码才是真正编排工作的所在：进程启动、能力协商、跨多个服务器的工具列表合并、采样回调、重连以及命名空间冲突解决。本课程构建一个多服务器客户端，将三个不同的 MCP 服务器提升为一个扁平的工具命名空间供模型使用。

**类型：** 构建
**语言：** Python（标准库，多服务器 MCP 客户端）
**前置知识：** 阶段 13 · 07（构建 MCP 服务器）
**时间：** ~75 分钟

## 学习目标

- 以子进程方式启动 MCP 服务器，完成 `initialize` 握手，并发送 `notifications/initialized`。
- 维护每个服务器的会话状态（能力、工具列表、最后看到的通知 ID）。
- 将多个服务器的工具列表合并为一个命名空间，并处理冲突。
- 将工具调用路由到拥有该工具的服务器，并重组响应。

## 问题

真实的 Agent 宿主（Claude Desktop、Cursor、Goose、Gemini CLI）会同时加载多个 MCP 服务器。用户可能同时运行着一个文件系统服务器、一个 Postgres 服务器和一个 GitHub 服务器。客户端的工作是：

1. 启动每个服务器。
2. 各自独立完成握手。
3. 对每个服务器调用 `tools/list` 并将结果展平。
4. 当模型发出 `notes_search` 时，在合并后的命名空间中查找并路由到正确的服务器。
5. 处理来自任何服务器的通知（`tools/list_changed`），不阻塞主流程。
6. 在传输失败时重新连接。

手工实现所有这些，正是区分"玩具"和"可用系统"的关键。官方 SDK 封装了这些，但你必须在思维模型中理解它们。

## 概念

### 子进程启动

`subprocess.Popen` 配合 `stdin=PIPE, stdout=PIPE, stderr=PIPE`。设置 `bufsize=1` 并使用文本模式进行逐行读取。每个服务器是一个独立的进程；客户端为每个服务器持有一个 `Popen` 句柄。

### 每个服务器的会话状态

每个服务器对应一个 `Session` 对象，持有：

- `process` — Popen 句柄。
- `capabilities` — 服务器在 `initialize` 中声明的能力。
- `tools` — 最近一次 `tools/list` 的结果。
- `pending` — 请求 ID 到等待响应的 promise/future 的映射。

请求本质上是异步的；向服务器 A 发送 `tools/call` 时，服务器 B 正在处理调用，不能阻塞。要么使用线程加队列，要么使用 asyncio。

### 合并命名空间

当客户端看到聚合的工具列表时，名称可能冲突。两个服务器可能都暴露了 `search`。客户端有三种选择：

1. **按服务器名称添加前缀。** `notes/search`、`files/search`。清晰但不够美观。
2. **静默先到先得。** 后到的服务器的 `search` 覆盖先到的。有风险；隐藏了冲突。
3. **冲突拒绝。** 拒绝加载第二个服务器；通知用户。对安全敏感的宿主来说最安全。

Claude Desktop 使用按服务器添加前缀。Cursor 使用冲突拒绝并给出明确的错误信息。VS Code MCP 也采用按服务器添加前缀。

### 路由

合并后，一个分发表将 `tool_name` 映射到 `session`。模型按名称发起调用；客户端找到对应的 session，向该服务器的 stdin 写入 `tools/call` 消息，然后等待响应。

### 采样回调

如果服务器在 `initialize` 时声明了 `sampling` 能力，它可能发送 `sampling/createMessage` 请求，要求客户端运行其 LLM。客户端必须：

1. 在该采样解析之前，阻塞对该服务器的进一步请求；如果实现支持并发，也可以进行流水线处理。
2. 调用其 LLM 提供商。
3. 将响应发送回服务器。

课程 11 涵盖完整的采样流程。本课程将其作为桩代码实现，以保持完整性。

### 通知处理

`notifications/tools/list_changed` 意味着重新调用 `tools/list`。`notifications/resources/updated` 意味着如果资源正在使用，则重新读取。通知不得产生响应——不要尝试确认它们。

一个常见的客户端错误：在等待 `tools/call` 响应时阻塞了读取循环，而通知已经在流中。使用后台读取线程，将每条消息推送到队列；主线程从队列中取出并分发。

### 重新连接

传输可能失败：服务器崩溃、操作系统杀死了进程、stdio 管道断裂。客户端检测到 stdout 上的 EOF，将会话标记为死亡。选项：

- 静默重启服务器并重新握手。适用于纯只读服务器。
- 向用户呈现失败信息。适用于有状态的服务器和用户可见的会话。

阶段 13 · 09 涵盖了 Streamable HTTP 的重新连接语义；stdio 更简单。

### 保活和会话 ID

Streamable HTTP 使用 `Mcp-Session-Id` 头。Stdio 没有会话 ID——进程身份就是会话。保活心跳是可选的；stdio 管道在空闲时不会断开。

## 使用

`code/main.py` 以子进程方式启动三个模拟的 MCP 服务器，与每个握手，合并它们的工具列表，并将工具调用路由到正确的服务器。这些"服务器"实际上是运行玩具应答器（非真实 LLM）的其他 Python 进程。运行它可以看到：

- 三次初始化，各自具有不同的能力集。
- 三个 `tools/list` 结果合并为一个 7 工具命名空间。
- 基于工具名称的路由决策。
- 通过命名空间前缀防止冲突。

注意要点：

- `Session` 数据类清晰地保存了每个服务器的状态。
- 后台读取线程在不阻塞主线程的情况下，从 stdout 取出每一行。
- 分发表只是一个简单的 `dict[str, Session]`。
- 冲突处理是显式的：当两个服务器声明相同名称时，后到的被重命名并添加前缀。

## 交付

本课程产出 `outputs/skill-mcp-client-harness.md`。给定一个声明式的 MCP 服务器列表（名称、命令、参数），该技能会生成一个启动工具，用于启动服务器、合并工具列表，并提供带冲突解决的路由函数。

## 练习

1. 运行 `code/main.py` 并观察服务器启动日志。用 SIGTERM 杀掉其中一个模拟服务器进程，观察客户端如何检测到 EOF 并将该会话标记为死亡。

2. 实现命名空间前缀化。当两个服务器暴露 `search` 时，将第二个重命名为 `<server>/search`。更新分发表并验证工具调用是否正确路由。

3. 为服务器重启添加连接池风格的回退机制：连续失败时指数退避，上限 30 秒，三次失败后向用户发出通知。

4. 设计一个支持 100 个并发 MCP 服务器的客户端。什么数据结构替代简单的分发表？（提示：前缀命名空间使用前缀树，加上每个服务器的工具计数指标。）

5. 将客户端移植到官方的 MCP Python SDK。该 SDK 封装了 `stdio_client` 和 `ClientSession`。代码应从约 200 行缩减到约 40 行，同时保持多服务器路由功能。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| MCP 客户端 | "Agent 宿主" | 启动服务器并编排工具调用的进程 |
| 会话 | "每个服务器的状态" | 能力、工具列表和待处理请求的记账信息 |
| 合并命名空间 | "一个工具列表" | 所有活动服务器工具名称的扁平集合 |
| 命名空间冲突 | "两个服务器同一个工具" | 客户端必须对重复项添加前缀、拒绝或先到先得 |
| 路由 | "谁来处理这个调用" | 从工具名称分发到所属服务器 |
| 后台读取器 | "非阻塞 stdout" | 将服务器 stdout 内容排入队列的线程或任务 |
| 采样回调 | "LLM 即服务" | 客户端处理来自服务器的 `sampling/createMessage` |
| `notifications/*_changed` | "原语已变更" | 通知客户端必须重新发现或重新读取的信号 |
| 重新连接策略 | "服务器宕机时" | 传输失败时的重启语义 |
| Stdio 会话 | "进程 = 会话" | 无会话 ID；子进程的生命周期即会话 |

## 延伸阅读

- [Model Context Protocol — Client spec](https://modelcontextprotocol.io/specification/2025-11-25/client) — 客户端标准行为
- [MCP — Quickstart client guide](https://modelcontextprotocol.io/quickstart/client) — 使用 Python SDK 的 hello-world 客户端教程
- [MCP Python SDK — client module](https://github.com/modelcontextprotocol/python-sdk) — 参考 `ClientSession` 和 `stdio_client`
- [MCP TypeScript SDK — Client](https://github.com/modelcontextprotocol/typescript-sdk) — TS 并行的实现
- [VS Code — MCP in extensions](https://code.visualstudio.com/api/extension-guides/ai/mcp) — VS Code 如何在单个编辑器宿主中多路复用多个 MCP 服务器
