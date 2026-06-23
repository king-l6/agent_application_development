# 构建 MCP 服务器 — Python + TypeScript SDK

> 大多数 MCP 教程只展示 stdio hello-world。真正的服务器需要同时暴露工具、资源和提示，处理能力协商，发出结构化错误，并且在各个 SDK 中保持一致的运行方式。本课程从头到尾构建一个笔记服务器：标准库 stdio 传输、JSON-RPC 分发、三种服务器原语，以及一种纯函数风格，当你进阶时可以直接迁移到 Python SDK 的 FastMCP 或 TypeScript SDK。

**类型：** 构建
**语言：** Python（标准库，stdio MCP 服务器）
**前置知识：** 阶段 13 · 06（MCP 基础）
**时间：** ~75 分钟

## 学习目标

- 实现 `initialize`、`tools/list`、`tools/call`、`resources/list`、`resources/read`、`prompts/list` 和 `prompts/get` 方法。
- 编写一个分发循环，从 stdin 读取 JSON-RPC 消息并向 stdout 写入响应。
- 根据 JSON-RPC 2.0 规范和 MCP 的附加错误码发出结构化错误响应。
- 在不重写工具逻辑的前提下，将标准库实现迁移到 FastMCP（Python SDK）或 TypeScript SDK。

## 问题

在可以使用远程传输（阶段 13 · 09）或认证层（阶段 13 · 16）之前，你需要一个干净的本地服务器。本地意味着 stdio：服务器由客户端作为子进程启动，消息通过 stdin/stdout 以换行符分隔的形式流动。

2025-11-25 规范规定，stdio 消息编码为 JSON 对象，并使用显式的 `\n` 分隔符。这里不使用 SSE；SSE 是旧的远程模式，将在 2026 年中期被移除（Atlassian 的 Rovo MCP 服务器于 2026 年 6 月 30 日弃用了它；Keboola 于 2026 年 4 月 1 日弃用了它）。对于 stdio，每行一个 JSON 对象就是完整的线路格式。

笔记服务器是一个很好的范例，因为它涉及了所有三种服务器原语。工具执行修改操作（`notes_create`）。资源暴露数据（`notes://{id}`）。提示提供模板（`review_note`）。本课程的结构可以推广到任何领域。

## 概念

### 分发循环

```
循环：
  line = stdin.readline()
  msg = json.loads(line)
  如果有 id：
    处理请求 -> 写入响应
  否则：
    处理通知 -> 不响应
```

三条规则：

- 不要向 stdout 打印任何非 JSON-RPC 信封的内容。调试日志输出到 stderr。
- 每个请求必须与一个携带相同 `id` 的响应匹配。
- 通知不得被响应。

### 实现 `initialize`

```python
def initialize(params):
    return {
        "protocolVersion": "2025-11-25",
        "capabilities": {
            "tools": {"listChanged": True},
            "resources": {"listChanged": True, "subscribe": False},
            "prompts": {"listChanged": False},
        },
        "serverInfo": {"name": "notes", "version": "1.0.0"},
    }
```

只声明你支持的能力。客户端依赖于能力集来控制功能的开启。

### 实现 `tools/list` 和 `tools/call`

`tools/list` 返回 `{tools: [...]}`，每个条目包含 `name`、`description`、`inputSchema`。`tools/call` 接收 `{name, arguments}` 并返回 `{content: [blocks], isError: bool}`。

内容块是带类型的。最常见的有：

```json
{"type": "text", "text": "Found 2 notes"}
{"type": "resource", "resource": {"uri": "notes://14", "text": "..."}}
{"type": "image", "data": "<base64>", "mimeType": "image/png"}
```

工具错误有两种形式。协议级错误（未知方法、错误参数）是 JSON-RPC 错误。工具级错误（调用有效但工具本身失败）以 `{content: [...], isError: true}` 的形式返回。这样可以让模型在上下文中看到失败信息。

### 实现资源

资源设计为只读。`resources/list` 返回清单；`resources/read` 返回内容。URI 可以是 `file://...`、`http://...` 或自定义方案如 `notes://`。

当你将数据以资源而非工具的形式暴露时：

- 模型不会"调用"它；客户端可以在用户请求时将其注入上下文。
- 订阅允许服务器在资源变化时推送更新（阶段 13 · 10）。
- 阶段 13 · 14 通过 `ui://` 将其扩展为交互式资源。

### 实现提示

提示是带有命名参数的模板。宿主将它们作为斜杠命令呈现。一个 `review_note` 提示可能接收 `note_id` 参数，并生成一个多消息提示模板，客户端将其输入给模型。

### Stdio 传输的微妙之处

- 换行符分隔的 JSON。没有长度前缀的帧界定。
- 不要缓冲。每次写入后执行 `sys.stdout.flush()`。
- 客户端控制生命周期。当 stdin 关闭（EOF）时，干净退出。
- 不要静默处理 SIGPIPE；记录日志并退出。

### 注解

每个工具可以携带描述安全属性的 `annotations`：

- `readOnlyHint: true` — 纯读取，可安全重试。
- `destructiveHint: true` — 不可逆的副作用；客户端应确认。
- `idempotentHint: true` — 相同输入产生相同输出。
- `openWorldHint: true` — 与外部系统交互。

客户端使用这些来决定用户体验（确认对话框、状态指示器）和路由（阶段 13 · 17）。

### 进阶路径

`code/main.py` 中的标准库服务器大约 180 行。FastMCP（Python）将相同逻辑简化为装饰器风格：

```python
from fastmcp import FastMCP
app = FastMCP("notes")

@app.tool()
def notes_search(query: str, limit: int = 10) -> list[dict]:
    ...
```

TypeScript SDK 具有等同的结构。进阶路径在你准备就绪时即可直接替换；概念（能力、分发、内容块）都是相同的。

## 使用

`code/main.py` 是一个完整的笔记 MCP 服务器，基于 stdio，仅使用标准库。它处理 `initialize`、`tools/list`、`tools/call`（三个工具：`notes_list`、`notes_search`、`notes_create`）、每个笔记的 `resources/list` 和 `resources/read`，以及 `review_note` 提示。你可以通过管道传入 JSON-RPC 消息来驱动它：

```
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python main.py
```

注意要点：

- 分发器是一个以方法名为键的 `dict[str, Callable]`。
- 每个工具执行器返回内容块列表，而非裸字符串。
- 执行器抛出异常时设置 `isError: true`。

## 交付

本课程产出 `outputs/skill-mcp-server-scaffolder.md`。给定一个领域（笔记、工单、文件、数据库），该技能会搭建一个 MCP 服务器，包含正确的工具/资源/提示划分和 SDK 进阶路径。

## 练习

1. 运行 `code/main.py` 并使用手工构建的 JSON-RPC 消息驱动它。先执行 `notes_create`，然后通过 `resources/read` 检索新建的笔记。

2. 添加一个带有 `annotations: {destructiveHint: true}` 的 `notes_delete` 工具。验证客户端会显示一个确认对话框（这需要一个真实的宿主；Claude Desktop 可以）。

3. 实现 `resources/subscribe`，使得服务器在笔记被修改时推送 `notifications/resources/updated` 通知。添加一个保活任务。

4. 将服务器移植到 FastMCP。Python 文件应缩减到 80 行以内。线路行为必须相同；使用相同的 JSON-RPC 测试工具验证。

5. 阅读规范中的 `server/tools` 部分，找出本课程服务器未实现的一个工具定义字段。（提示：有好几个；挑选一个并添加它。）

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| MCP 服务器 | "暴露工具的东西" | 通过 stdio 或 HTTP 使用 MCP JSON-RPC 通信的进程 |
| stdio 传输 | "子进程模型" | 服务器由客户端启动；通过 stdin/stdout 通信 |
| 分发器 | "方法路由器" | JSON-RPC 方法名到处理函数的映射 |
| 内容块 | "工具结果片段" | 工具响应中 `content` 数组里的类型化元素 |
| `isError` | "工具级失败" | 指示工具失败；区别于 JSON-RPC 错误 |
| 注解 | "安全提示" | readOnly / destructive / idempotent / openWorld 标志 |
| FastMCP | "Python SDK" | 基于 MCP 协议的装饰器风格高级框架 |
| 资源 URI | "可寻址数据" | `file://`、`db://` 或自定义方案，标识一个资源 |
| 提示模板 | "斜杠命令简介" | 服务器提供的带参数槽的模板，用于宿主 UI |
| 能力声明 | "功能开关" | 在 `initialize` 中声明的每个原语的标志 |

## 延伸阅读

- [Model Context Protocol — Python SDK](https://github.com/modelcontextprotocol/python-sdk) — 参考 Python 实现
- [Model Context Protocol — TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — 并行的 TS 实现
- [FastMCP — server framework](https://gofastmcp.com/) — MCP 服务器的装饰器风格 Python API
- [MCP — Quickstart server guide](https://modelcontextprotocol.io/quickstart/server) — 使用任一 SDK 的端到端教程
- [MCP — Server tools spec](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — tools/* 消息的完整参考
