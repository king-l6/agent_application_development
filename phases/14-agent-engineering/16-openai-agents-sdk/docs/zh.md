# OpenAI Agents SDK：交接、护栏、追踪

> OpenAI Agents SDK 是构建在 Responses API 之上的轻量级多智能体框架。五个基本要素：Agent、Handoff、Guardrail、Session、Tracing。交接是以 `transfer_to_<agent>` 命名的工具。护栏在输入或输出时触发。追踪默认开启。

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置条件：** 第14阶段·01（智能体循环），第14阶段·06（工具使用）
**时长：** ~75分钟

## 学习目标

- 列举 OpenAI Agents SDK 的五个基本要素。
- 解释交接：为什么将其建模为工具，模型看到什么名称形状，以及上下文如何转移。
- 区分输入护栏、输出护栏和工具护栏；解释 `run_in_parallel` 与阻塞模式。
- 使用标准库实现一个带有交接 + 护栏 + 跨度风格追踪的运行时。

## 问题

无法干净委托的智能体会把一切塞进一个提示词中。没有护栏的智能体会泄露 PII、输出违反策略的内容，或永远循环。OpenAI 的 SDK 将这三者编纂为使多智能体工作可管理的原语。

## 概念

### 五个基本要素

1. **Agent。** LLM + 指令 + 工具 + 交接。
2. **Handoff。** 委托给另一个智能体。向模型表示为名为 `transfer_to_<agent_name>` 的工具。
3. **Guardrail。** 对输入（仅第一个智能体）、输出（仅最后一个智能体）或工具调用（每个函数工具）的验证。
4. **Session。** 跨轮次的自动对话历史。
5. **Tracing。** 内建的 LLM 生成、工具调用、交接、护栏跨度。

### 交接即工具

模型在其工具列表中看到 `transfer_to_billing_agent`。调用它指示运行时：

1. 复制对话上下文（或通过 `nest_handoff_history` beta 功能折叠）。
2. 使用其指令初始化目标智能体。
3. 继续使用目标智能体运行。

这是产品化的监督者模式（第13课 / 第28课）。

### 护栏

三种风格：

- **输入护栏。** 在第一个智能体的输入上运行。在任何 LLM 调用之前拒绝不安全或超出范围的请求。
- **输出护栏。** 在最后一个智能体的输出上运行。捕获 PII 泄露、策略违规、格式错误的响应。
- **工具护栏。** 按函数工具运行。验证参数、检查权限、审计执行。

模式：

- **并行**（默认）。护栏 LLM 与主 LLM 同时运行。较低的尾部延迟。如果触发，主 LLM 的工作被丢弃（令牌浪费）。
- **阻塞**（`run_in_parallel=False`）。护栏 LLM 先运行。如果触发，主调用上不浪费令牌。

触发时抛出 `InputGuardrailTripwireTriggered` / `OutputGuardrailTripwireTriggered`。

### 追踪

默认开启。每次 LLM 生成、工具调用、交接和护栏都会发出一个跨度。`OPENAI_AGENTS_DISABLE_TRACING=1` 退出。`add_trace_processor(processor)` 将跨度分发到你自己的后端以及 OpenAI 的后端。

### 会话

`Session` 在后端（SQLite、Redis、自定义）中存储对话历史。`Runner.run(agent, input, session=session)` 自动加载和追加。

### 这种模式的失败点

- **交接漂移。** Agent A 交接给 Agent B，Agent B 又交回给 Agent A。添加跳数计数器。
- **护栏绕过。** 工具护栏仅在函数工具上触发；内置工具（文件读取器、网页获取）需要单独的策略。
- **过度追踪。** 跨度中的敏感内容。配合 OTel GenAI 内容捕获规则（第23课）——外部存储，按 ID 引用。

## 构建

`code/main.py` 使用标准库实现了 SDK 形态：

- `Agent`、`FunctionTool`、`Handoff`（作为具有转移语义的函数工具）。
- 带有输入/输出/工具护栏、交接调度和跳数计数器的 `Runner`。
- 一个简单的跨度发射器以显示跟踪形状。
- 一个根据用户查询交接给 billing 或 support 的分诊智能体；护栏在某输入上触发。

运行：

```
python3 code/main.py
```

跟踪显示两次成功的交接、一次输入护栏触发以及一个镜像真实 SDK 发出的跨度的树状结构。

## 使用

- **OpenAI Agents SDK** 用于以 OpenAI 为先的产品。
- **Claude Agent SDK**（第17课）用于以 Claude 为先的产品。
- **LangGraph**（第13课）当你想要显式状态和持久化恢复时。
- **自定义** 当你需要精确控制（语音、多提供商、联邦部署）时。

## 交付

`outputs/skill-agents-sdk-scaffold.md` 搭建一个 Agents SDK 应用，包含分诊智能体、交接、输入/输出/工具护栏、会话存储和一个追踪处理器。

## 练习

1. 添加交接跳数计数器：N 次转移后拒绝。跟踪行为。
2. 将 `nest_handoff_history` 作为选项实现——在转移前将先前的消息折叠为一个摘要。
3. 编写一个阻塞输出护栏。比较会触发它的提示词与通过的提示词的延迟。
4. 将 `add_trace_processor` 接入 JSON 记录器。每个跨度发出什么形状？
5. 阅读 SDK 文档。将你的标准库玩具移植到 `openai-agents-python`。你建模错了什么？

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| Agent | "LLM + 指令" | SDK 中的智能体类型；拥有工具和交接 |
| Handoff | "转移" | 模型调用的用于委托给另一个智能体的工具 |
| Guardrail | "策略检查" | 对输入/输出/工具调用的验证 |
| Tripwire | "护栏触发" | 护栏拒绝时引发的异常 |
| Session | "历史存储" | 跨运行持久化的对话记忆 |
| Tracing | "跨度" | 内建的 LLM + 工具 + 交接 + 护栏可观测性 |
| 阻塞护栏（Blocking guardrail） | "顺序检查" | 护栏先运行；触发时不浪费令牌 |
| 并行护栏（Parallel guardrail） | "并发检查" | 护栏并行运行；延迟更低，触发时浪费令牌 |

## 延伸阅读

- [OpenAI Agents SDK 文档](https://openai.github.io/openai-agents-python/) — 基本要素、交接、护栏、追踪
- [Claude Agent SDK 概述](https://platform.claude.com/docs/en/agent-sdk/overview) — Claude 风格的对等产品
- [Anthropic，构建有效的智能体](https://www.anthropic.com/research/building-effective-agents) — 何时需要交接
- [OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — Agents SDK 跨度映射到的标准
