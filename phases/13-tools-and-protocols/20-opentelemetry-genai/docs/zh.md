# OpenTelemetry GenAI — 端到端追踪工具调用

> 一个智能体调用五个工具、三个 MCP 服务器和两个子智能体。你需要一个跨越所有组件的追踪。OpenTelemetry GenAI 语义约定（v1.37 及更高版本中的稳定属性）是 2026 年的标准，原生受 Datadog、Langfuse、Arize Phoenix、OpenLLMetry 和 AgentOps 支持。本课程列出所需属性，介绍 Span 层次结构（智能体 → LLM → 工具），并提供可用于任何 OTel 导出器的标准库 Span 发射器。

**类型：** 构建
**语言：** Python（标准库，OTel Span 发射器）
**前置知识：** 阶段 13 · 07（MCP 服务器），阶段 13 · 08（MCP 客户端）
**时间：** 约 75 分钟

## 学习目标

- 说出 LLM Span 和工具执行 Span 所需的 OTel GenAI 属性。
- 构建覆盖智能体循环、LLM 调用、工具调用和 MCP 客户端派发的追踪层次结构。
- 决定捕获（选择加入）与隐藏（默认）的内容。
- 在不重写工具代码的情况下，将 Span 发射到本地收集器（Jaeger、Langfuse）。

## 问题

一个来自 2026 年 2 月的调试场景：用户报告"我的智能体有时需要 30 秒响应；有时只需 3 秒。"没有追踪。日志显示 LLM 调用，但没有工具派发、没有 MCP 服务器往返、没有子智能体。你在猜测。最终你发现：一个 MCP 服务器偶尔在冷启动时挂起。

没有端到端追踪，你无法找到这个问题。OTel GenAI 修复了它。

约定于 2025-2026 年在 OpenTelemetry 语义约定组下确定。它们定义了稳定的属性名称，以便 Datadog、Langfuse、Phoenix、OpenLLMetry 和 AgentOps 都能解析相同的 Span。一次插桩；发送到任何后端。

## 概念

### Span 层次结构

```
agent.invoke_agent  (顶层，INTERNAL span)
 ├── llm.chat       (CLIENT span)
 ├── tool.execute   (INTERNAL)
 │    └── mcp.call  (CLIENT span)
 ├── llm.chat       (CLIENT span)
 └── subagent.invoke (INTERNAL)
```

整个结构嵌套在一个 trace id 下。Span id 编码父子关系。

### 必需属性

根据 2025-2026 年语义约定：

- `gen_ai.operation.name` — `"chat"`、`"text_completion"`、`"embeddings"`、`"execute_tool"`、`"invoke_agent"`。
- `gen_ai.provider.name` — `"openai"`、`"anthropic"`、`"google"`、`"azure_openai"`。
- `gen_ai.request.model` — 请求的模型字符串（例如 `"gpt-4o-2024-08-06"`）。
- `gen_ai.response.model` — 实际服务的模型。
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`。
- `gen_ai.response.id` — 用于关联的提供者响应 ID。

对于工具 Span：

- `gen_ai.tool.name` — 工具标识符。
- `gen_ai.tool.call.id` — 特定调用 ID。
- `gen_ai.tool.description` — 工具描述（可选）。

对于智能体 Span：

- `gen_ai.agent.name` / `gen_ai.agent.id` / `gen_ai.agent.description`。

### Span 类型

- `SpanKind.CLIENT` 用于跨进程边界的调用（LLM 提供者、MCP 服务器）。
- `SpanKind.INTERNAL` 用于智能体自己的循环步骤和工具执行。

### 选择加入内容捕获

默认情况下，Span 携带指标和计时——而不是提示和完成内容。大的负载和 PII 默认关闭。设置 `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` 和特定的内容捕获环境变量以包含内容。在启用生产环境前仔细审查。

### Span 上的事件

令牌级事件可以作为 Span 事件添加：

- `gen_ai.content.prompt` — 输入消息。
- `gen_ai.content.completion` — 输出消息。
- `gen_ai.content.tool_call` — 记录的工具调用。

事件在 Span 内按时间排序，用于详细重放。

### 导出器

OTel Span 可导出到：

- **Jaeger / Tempo。** 开源，本地部署。
- **Langfuse。** LLM 可观测性专用；可视化令牌使用。
- **Arize Phoenix。** 评估 + 追踪结合。
- **Datadog。** 商业；原生解析 `gen_ai.*` 属性。
- **Honeycomb。** 列式存储；查询友好。

都使用 OTLP 作为线缆格式。你的代码无需关心。

### 跨 MCP 传播

当 MCP 客户端调用服务器时，将 W3C traceparent 头注入请求。Streamable HTTP 支持标准头部。Stdio 不原生携带 HTTP 头；规范的 2026 路线图讨论了在 JSON-RPC 调用上添加 `_meta.traceparent` 字段。

在该功能发布之前：手动将 traceparent 包含在每个请求的 `_meta` 中。服务器记录 trace id。

### 指标

与 Span 一起，GenAI 语义约定定义了指标准：

- `gen_ai.client.token.usage` — 直方图。
- `gen_ai.client.operation.duration` — 直方图。
- `gen_ai.tool.execution.duration` — 直方图。

用于不需要每次调用详情的仪表板。

### AgentOps 层

AgentOps（成立于 2024 年）专门从事 GenAI 可观测性。它包装流行的框架（LangGraph、Pydantic AI、CrewAI）以自动发出 OTel Span。如果你的栈使用支持的框架，则很有用；否则使用手动插桩。

## 使用

`code/main.py` 为调用 LLM、派发两个工具并进行一次 MCP 往返的智能体发出 OTel 形状的 Span，输出到 stdout（OTLP-JSON 格式）。没有真实的导出器——本课程专注于 Span 形状和属性集。将输出粘贴到 OTLP 兼容的查看器中，或直接阅读。

需要关注的内容：

- Trace id 在所有 Span 间共享。
- 父子链接通过 `parentSpanId` 编码。
- 必需的 `gen_ai.*` 属性已填充。
- 内容捕获默认关闭；一个场景通过环境变量开启。

## 交付

本课程产出 `outputs/skill-otel-genai-instrumentation.md`。给定一个智能体代码库，该技能生成插桩计划：在哪里添加 Span，填充哪些属性，以及针对哪些导出器。

## 练习

1. 运行 `code/main.py`。统计 Span 数量并识别哪些是 CLIENT 与 INTERNAL。

2. 开启内容捕获（环境变量），确认 `gen_ai.content.prompt` 和 `gen_ai.content.completion` 事件出现。注意对 PII 的影响。

3. 添加工具执行指标 `gen_ai.tool.execution.duration`，每次调用作为直方图样本发出。

4. 将 traceparent 从父智能体 Span 传播到 MCP 请求的 `_meta.traceparent` 字段。验证 MCP 服务器将看到相同的 trace id。

5. 阅读 OTel GenAI 语义约定规范。找出规范中列出但本课程代码未发出的一个属性。添加它。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| OTel | "OpenTelemetry" | 追踪、指标、日志的开放标准 |
| GenAI semconv | "GenAI 语义约定" | LLM / 工具 / 智能体 Span 的稳定属性名称 |
| `gen_ai.*` | "属性命名空间" | 所有 GenAI 属性共享此前缀 |
| Span | "计时操作" | 具有开始、结束和属性的工作单元 |
| Trace | "跨 Span 谱系" | 共享同一 trace id 的 Span 树 |
| SpanKind | "CLIENT / SERVER / INTERNAL" | Span 方向的提示 |
| OTLP | "OpenTelemetry 线路协议" | 导出器的线缆格式 |
| 选择加入内容（Opt-in content） | "提示/完成捕获" | 默认关闭；通过环境变量启用 |
| traceparent | "W3C 头部" | 跨服务传播追踪上下文 |
| 导出器（Exporter） | "后端特定发送器" | 将 Span 发送到 Jaeger / Datadog 等的组件 |

## 扩展阅读

- [OpenTelemetry — GenAI semconv](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — GenAI Span、指标和事件的规范约定
- [OpenTelemetry — GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/) — LLM 和工具执行 Span 属性列表
- [OpenTelemetry — GenAI agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) — 智能体级别的 `invoke_agent` Span
- [open-telemetry/semantic-conventions — GenAI spans](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md) — GitHub 托管的真实来源
- [Datadog — LLM OTel semantic convention](https://www.datadoghq.com/blog/llm-otel-semantic-convention/) — 生产集成指南
