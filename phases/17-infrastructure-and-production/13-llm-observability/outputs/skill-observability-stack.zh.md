---
name: observability-stack
description: 根据技术栈、规模、预算和许可姿态，选择 LLM 可观测性栈（开发平台 + 网关 + 可选的规模层），并定义 OpenTelemetry GenAI 属性集。
version: 1.0.0
phase: 17
lesson: 13
tags: [observability, langfuse, langsmith, phoenix, arize, helicone, opik, opentelemetry, genai-conventions]
---

给定技术栈（LangChain / DSPy / 裸 SDK）、规模（每日追踪数）、预算、许可姿态（仅 MIT vs 可接受商业版）和自托管需求，生成一个可观测性方案。

生成内容：

1. 开发平台选择。Langfuse（开源）、LangSmith（LangChain 优先的商业版）、Opik（Comet 开源）或无。根据技术栈和许可说明理由。
2. 网关/遥测选择。Helicone（代理 + 网关）、SigNoz（完整 APM）、OpenLLMetry（纯 OTel）。如果已在使用 AI 网关（第17阶段·19），说明集成方式。
3. 规模/数据湖层。可选；Arize AX 或裸 Iceberg 用于长期分析，Phoenix 用于 RAG 漂移检测。
4. OTel GenAI 约定。指定最小属性集：`gen_ai.system`、`gen_ai.request.model`、`gen_ai.usage.input_tokens`、`gen_ai.usage.output_tokens`、`gen_ai.request.temperature`、`gen_ai.response.finish_reasons`，加上组织特定属性（tenant_id、user_id、task）。
5. 采样策略。100%错误、100%高成本（>0.10美元/调用）、N%成功采样率。原始保留窗口（14天/30天/90天）。聚合数据保留更长时间。
6. 告警。必须设置告警的五个指标：错误率、P99 TTFT、每次请求成本、提示缓存命中率、拒绝率。

硬拒绝：
- 在框架特定的 SDK 内部进行 instrumentation 而没有 OTel 后备方案。拒绝——框架锁定。
- 在非监管工作负载上以 Datadog 级别定价（每月>500美元）保留100%的追踪。拒绝——建议采样。
- 忽略 OpenTelemetry GenAI 约定。拒绝——2026年的互操作需要它们。

拒绝规则：
- 如果每日追踪 > 500万且团队坚持完全保留 Datadog，则在没有成本预测的情况下拒绝。
- 如果团队只接受 MIT 许可但选择 LangSmith，则拒绝——Langfuse 是 MIT 等效方案。
- 如果团队没有 AI 网关且选择 Helicone 作为网关和可观测性工具，则接受——该代理可兼作网关，最高约500 RPS（第17阶段·19涵盖网关规模）。

输出：一页方案，说明开发平台、网关、规模层（如有）、OTel 属性集、采样规则、五个告警。以衡量技术栈漂移的单一指标结束：过去7天内具有完整 OTel GenAI 属性的 LLM 调用百分比。
