# Claude Agent SDK：子智能体与会话存储

> Claude Agent SDK 是 Claude Code 运行时的库形式。内置工具、用于上下文隔离的子智能体、钩子、W3C 追踪传播、会话存储对等。Claude Managed Agents 是用于长时间运行异步工作的托管替代方案。

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置条件：** 第14阶段·01（智能体循环），第14阶段·10（技能库）
**时长：** ~75分钟

## 学习目标

- 解释 Anthropic Client SDK（原始 API）和 Claude Agent SDK（运行时形态）之间的区别。
- 描述子智能体——并行化和上下文隔离——以及何时使用它们。
- 列举 Python SDK 的会话存储接口（`append`、`load`、`list_sessions`、`delete`、`list_subkeys`）和 `--session-mirror` 的作用。
- 使用标准库实现一个带有内置工具、子智能体生成（带隔离上下文）、生命周期钩子和会话存储的运行时。

## 问题

原始 LLM API 只能实现一次往返。生产级智能体需要工具执行、MCP 服务器、生命周期钩子、子智能体生成、会话持久化、追踪传播。Claude Agent SDK 以库的形式提供这种运行时形态——Claude Code 使用的同一运行时，为自定义智能体暴露。

## 概念

### Client SDK vs Agent SDK

- **Client SDK（`anthropic`）。** 原始 Messages API。你自己拥有循环、工具和状态。
- **Agent SDK（`claude-agent-sdk`）。** 内置工具执行、MCP 连接、钩子、子智能体生成、会话存储。以库形式提供的 Claude Code 循环。

### 内置工具

SDK 内置了10多种工具：文件读写、shell、grep、glob、网页获取等。自定义工具通过标准工具模式接口注册。

### 子智能体

Anthropic 文档记录的两个用途：

1. **并行化。** 并发运行独立工作。"为这20个模块分别查找测试文件"是20个并行子智能体任务。
2. **上下文隔离。** 子智能体使用自己的上下文窗口；只有结果返回给编排者。编排者的预算得到保护。

Python SDK 近期新增：`list_subagents()`、`get_subagent_messages()` 用于读取子智能体转录。

### 会话存储

与 TypeScript 协议对等：

- `append(session_id, message)` — 添加一轮对话。
- `load(session_id)` — 恢复对话。
- `list_sessions()` — 枚举。
- `delete(session_id)` — 级联删除到子智能体会话。
- `list_subkeys(session_id)` — 列出子智能体键。

`--session-mirror`（CLI 标志）将转录流式写入外部文件，用于调试。

### 钩子

可以注册的生命周期钩子：

- `PreToolUse`、`PostToolUse` — 门控或审计工具调用。
- `SessionStart`、`SessionEnd` — 设置和清理。
- `UserPromptSubmit` — 在模型看到用户输入之前处理。
- `PreCompact` — 在上下文压缩前运行。
- `Stop` — 智能体退出时清理。
- `Notification` — 侧信道告警。

钩子是 pro-workflow（第14阶段课程参考）和类似系统添加横切行为的方式。

### W3C 追踪上下文

调用方上的 OTel 跨度通过 W3C 追踪上下文头部传播到 CLI 子进程中。整个多进程追踪在你的后端中显示为一条追踪。

### Claude Managed Agents

托管替代方案（beta 头部 `managed-agents-2026-04-01`）。长时间运行异步工作、内置提示缓存、内置压缩。用控制权换取托管基础设施。

### 这种模式的失败点

- **子智能体过度生成。** 为100个小任务生成100个子智能体。开销占主导地位。改用批处理。
- **钩子蔓延。** 每个团队都添加钩子；启动时间膨胀。每季度审查钩子。
- **会话膨胀。** 会话积累；体积增长。使用 `list_sessions` + 过期策略。

## 构建

`code/main.py` 使用标准库实现了 SDK 形态：

- `Tool`、`ToolRegistry`，带有内置的 `read_file`、`write_file`、`list_dir`。
- `Subagent` — 私有上下文、隔离运行、返回结果。
- `SessionStore` — append、load、list、delete、list_subkeys。
- `Hooks` — `pre_tool_use`、`post_tool_use`、`session_start`、`session_end`。
- 演示：主智能体并行生成3个子智能体（各自隔离），聚合结果，持久化会话。

运行：

```
python3 code/main.py
```

跟踪显示子智能体上下文隔离（编排者上下文大小保持有界）、钩子执行和会话持久化。

## 使用

- **Claude Agent SDK** 用于以 Claude 为先的产品，需要 Claude Code 运行时形态。
- **Claude Managed Agents** 用于托管的长时间运行异步工作。
- **OpenAI Agents SDK**（第16课）用于以 OpenAI 为先的对等产品。
- **LangGraph + 自定义工具** 如果你想要图形状态机替代方案。

## 交付

`outputs/skill-claude-agent-scaffold.md` 搭建一个 Claude Agent SDK 应用，包含子智能体、钩子、会话存储、MCP 服务器连接和 W3C 追踪传播。

## 练习

1. 添加一个子智能体生成器，将20个任务分批为每组5个并行子智能体。测量编排者上下文大小与每个任务一个子智能体的对比。
2. 实现一个 `PreToolUse` 钩子，限流 `write_file` 调用（每会话每分钟5次）。跟踪行为。
3. 接入 `list_subkeys` 以渲染子智能体树。深度嵌套看起来像什么？
4. 将玩具示例移植到真实的 `claude-agent-sdk` Python 包。工具注册有什么变化？
5. 阅读 Claude Managed Agents 文档。何时会从自托管切换到托管？

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| Agent SDK | "以库形式提供的 Claude Code" | 运行时形态：工具、MCP、钩子、子智能体、会话存储 |
| 子智能体（Subagent） | "子智能体" | 独立上下文，自有预算；结果向上冒泡 |
| 会话存储（Session store） | "对话数据库" | 持久化、加载、列出、删除带子智能体级联的轮次 |
| 钩子（Hook） | "生命周期回调" | 工具前后、会话、提示提交、压缩、停止 |
| W3C 追踪上下文 | "跨进程追踪" | 父跨度传播到 CLI 子进程 |
| Managed Agents | "托管运行时" | Anthropic 托管的长时间运行异步工作 |
| `--session-mirror` | "转录镜像" | 将会话轮次流式写入外部文件 |
| MCP 服务器 | "工具表面" | 附加到智能体的外部工具/资源来源 |

## 延伸阅读

- [Claude Agent SDK 概述](https://platform.claude.com/docs/en/agent-sdk/overview) — Claude Code 的库形式
- [Anthropic，使用 Claude Agent SDK 构建智能体](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) — 生产模式
- [Claude Managed Agents 概述](https://platform.claude.com/docs/en/managed-agents/overview) — 托管替代方案
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — 对等产品
