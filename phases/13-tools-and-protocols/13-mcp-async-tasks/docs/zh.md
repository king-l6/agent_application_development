# 异步任务 (SEP-1686) — 即时调用、延迟获取，用于长时间运行的工作

> 真实的智能体工作需要数分钟到数小时：CI 运行、深度研究综合、批量导出。同步工具调用会断开连接、超时或阻塞 UI。SEP-1686 于 2025 年 11 月 25 日合并，新增了任务（Tasks）原语：任何请求都可以扩展为任务，其结果可以在之后获取或通过状态通知流式传输。风险提示：任务在 2026 年上半年仍处于实验阶段；SDK 接口仍在围绕规范进行设计。

**类型：** 构建
**语言：** Python（标准库，异步任务状态机）
**前置知识：** 阶段 13 · 07（MCP 服务器），阶段 13 · 09（传输层）
**时间：** ~75 分钟

## 学习目标

- 识别何时将工具从同步提升为任务增强（服务器端工作超过 30 秒）。
- 理解任务生命周期：`working` → `input_required` → `completed` / `failed` / `cancelled`。
- 持久化任务状态，使崩溃不会丢失进行中的工作。
- 正确轮询 `tasks/status` 和获取 `tasks/result`。

## 问题

`generate_report` 工具运行一个需要数分钟的提取管道。在同步模型下的选项：

1. 保持连接打开三分钟。远程传输层会断开它；客户端超时；UI 冻结。
2. 立即返回一个占位符；要求客户端轮询自定义端点。打破了 MCP 的统一性。
3. 发后即忘；没有结果。

这些都不好。SEP-1686 增加了第四个选项：任务增强。任何请求（通常是 `tools/call`）都可以标记为任务。服务器立即返回任务 ID。客户端轮询 `tasks/status` 并在完成后获取 `tasks/result`。服务器端状态在重启后仍然存在。

## 概念

### 任务增强

通过设置 `params._meta.task.required: true`（或 `optional: true`，由服务器决定）使请求成为任务。服务器立即响应：

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "_meta": {
      "task": {
        "id": "tsk_9f7b...",
        "state": "working",
        "ttl": 900000
      }
    }
  }
}
```

`ttl` 是服务器保留状态的承诺；ttl 过后任务结果将被丢弃。

### 按工具选择加入

工具注解可以声明任务支持：

- `taskSupport: "forbidden"` — 该工具始终同步运行。适用于快速工具。
- `taskSupport: "optional"` — 客户端可以请求任务增强。
- `taskSupport: "required"` — 客户端必须使用任务增强。

`generate_report` 工具应为 `required`。`notes_search` 工具应为 `forbidden`。

### 状态

```
working  -> input_required -> working  （通过诱导循环）
working  -> completed
working  -> failed
working  -> cancelled
```

状态机是仅追加的：一旦进入 `completed`、`failed` 或 `cancelled`，任务即为终止状态。

### 方法

- `tasks/status {taskId}` — 返回当前状态和进度提示。
- `tasks/result {taskId}` — 阻塞或返回 404（如果尚未完成）。
- `tasks/cancel {taskId}` — 幂等；终止状态忽略。
- `tasks/list` — 可选；列举活跃和最近完成的任务。

### 流式状态变更

当服务器支持时，客户端可以订阅状态通知：

```
server -> notifications/tasks/updated {taskId, state, progress?}
```

使用流式而非轮询的客户端获得更好的用户体验。轮询始终作为最小接口被支持。

### 持久状态

规范要求声明支持任务的服务器持久化状态。崩溃不应在 ttl 内丢失已完成的结果。存储可以从 SQLite 到 Redis 再到文件系统。第 13 课的测试工具使用文件系统。

### 取消语义

`tasks/cancel` 是幂等的。如果任务正在执行中，服务器尝试停止（检查执行器协作式取消）。如果已经是终止状态，则该请求为空操作。

### 崩溃恢复

当服务器进程重启时：

1. 加载所有持久化的任务状态。
2. 将任何其进程已死亡的 `working` 任务标记为 `failed`，错误为 `CRASH_RECOVERY`。
3. 在 ttl 内保留 `completed` / `failed` / `cancelled` 状态。

### 异步任务加采样

任务本身可以调用 `sampling/createMessage`。这就是长时间运行的研究任务的工作方式：服务器的任务线程按需采样客户端的模型，同时客户端的 UI 将任务显示为 `working` 并附带定期进度更新。

### 为什么这是实验性的

SEP-1686 于 2025 年 11 月 25 日发布，但更广泛的路线图指出了三个未解决的问题：持久订阅原语、子任务（父子任务关系）和结果 TTL 标准化。预计规范将在 2026 年持续演进。生产代码应将任务仅视为常见情况下的稳定功能，并为子任务的未来 SDK 变化做好防护。

## 使用它

`code/main.py` 实现了一个持久化任务存储（基于文件系统）和一个在后台线程中运行的 `generate_report` 工具。客户端调用该工具，立即获得任务 ID，在工作线程更新进度时轮询 `tasks/status`，完成后获取 `tasks/result`。取消功能有效；通过杀死工作线程并重新加载状态来模拟崩溃恢复。

需要关注的内容：

- 任务状态 JSON 持久化到 `/tmp/lesson-13-tasks/<id>.json`。
- 工作线程更新 `progress` 字段；轮询显示其推进过程。
- 来自客户端的取消设置事件；工作线程检查并提前退出。
- "崩溃"时的状态重新加载将进行中的任务标记为 `failed`，带有 `CRASH_RECOVERY`。

## 交付

本课产出 `outputs/skill-task-store-designer.md`。给定一个长时间运行的工具（研究、构建、导出），该技能设计任务存储（状态形状、ttl、持久性），选择合适的 taskSupport 标志，并勾勒进度通知方案。

## 练习

1. 运行 `code/main.py`。启动一个 `generate_report` 任务，轮询状态，然后获取结果。

2. 在运行过程中添加 `tasks/cancel` 调用。验证工作线程是否响应取消请求，状态变为 `cancelled`。

3. 模拟崩溃恢复：杀死工作线程，重新启动加载器，观察 `CRASH_RECOVERY` 失败模式。

4. 将存储扩展到 SQLite。持久性的优势相同；查询选项增加（列出来自会话 X 的所有任务）。

5. 阅读 2026 年 MCP 路线图文章。找出在未来一年中最可能影响 SDK API 设计的一个与任务相关的未解决问题。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 任务 (Task) | "长时间运行的工具调用" | 通过 `_meta.task` 增强的请求，用于异步执行 |
| SEP-1686 | "任务规范" | 于 2025-11-25 添加任务的规范演进提案 |
| `_meta.task` | "任务信封" | 每个请求的元数据，包含 id、state、ttl |
| taskSupport | "工具标志" | 每个工具的 `forbidden` / `optional` / `required` |
| `tasks/status` | "轮询方法" | 获取当前状态和可选的进度提示 |
| `tasks/result` | "获取结果" | 返回已完成的有效负载，如果尚未完成则返回 404 |
| `tasks/cancel` | "停止它" | 幂等的取消请求 |
| ttl | "保留预算" | 服务器承诺保留任务状态的毫秒数 |
| `notifications/tasks/updated` | "状态推送" | 服务器发起的状态变更事件 |
| 持久化存储 (Durable store) | "崩溃安全状态" | 文件系统 / SQLite / Redis 持久化层 |

## 扩展阅读

- [MCP — GitHub SEP-1686 issue](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1686) — 原始提案和完整讨论
- [WorkOS — MCP async tasks for AI agent workflows](https://workos.com/blog/mcp-async-tasks-ai-agent-workflows) — 设计讲解及原理
- [DeepWiki — MCP task system and async operations](https://deepwiki.com/modelcontextprotocol/modelcontextprotocol/2.7-task-system-and-async-operations) — 机制和状态机
- [FastMCP — Tasks](https://gofastmcp.com/servers/tasks) — SDK 级任务实现模式
- [MCP blog — 2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) — 未解决问题和 2026 年优先事项，包括子任务
