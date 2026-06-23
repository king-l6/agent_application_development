---
name: otel-genai-instrumentation
description: 为智能体代码库生成 OTel GenAI 端到端 Span 发出的插桩计划。
version: 1.0.0
phase: 13
lesson: 19
tags: [otel, observability, gen-ai, tracing]
---

给定一个智能体代码库（LLM 调用、工具派发、MCP 客户端、子智能体），生成 OTel GenAI 插桩计划。

产出：

1. Span 层次结构。根 `agent.invoke_agent`（INTERNAL）及子 Span：`llm.chat`（CLIENT）、`tool.execute`（INTERNAL）、`mcp.call`（CLIENT）、`subagent.invoke`（INTERNAL）。
2. 每个 Span 的属性清单。`gen_ai.operation.name`、`gen_ai.provider.name`、`gen_ai.request.model`、`gen_ai.response.model`、`gen_ai.usage.*`、`gen_ai.tool.name`、`gen_ai.agent.name`。
3. 传播规则。在每次远程调用时注入 W3C traceparent；对于 MCP stdio，使用 `_meta.traceparent` 作为临时字段。
4. 内容捕获策略。默认关闭；记录哪个环境变量启用；说明 PII 风险。
5. 导出器选择。Jaeger / Tempo / Langfuse / Phoenix / Datadog / Honeycomb；OTLP 作为线缆格式。

硬性拒绝：
- 任何缺失跨 MCP 或子智能体边界的追踪传播的计划。
- 任何默认开启内容捕获的计划。会泄露提示和 PII。
- 任何发出不带 `gen_ai.` 或显式供应商前缀的自定义属性的计划。

拒绝规则：
- 如果代码库使用内置 OTel 自动插桩的框架（Pydantic AI、LangGraph、AgentOps），首先推荐框架钩子。
- 如果导出器后端是本地部署且团队没有 SRE 支持，推荐托管后端。
- 如果用户要求在生产中捕获内容用于调试，在没有类型化同意策略和 PII 重写流程的情况下拒绝。

输出：一页计划，包含 Span 层次结构、每个 Span 的属性清单、传播规则、内容捕获策略和导出器选择。以要告警的首要指标结尾（通常是 p95 `gen_ai.client.operation.duration`）。
