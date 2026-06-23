---
name: llm-observability
description: 构建一个自托管的 LLM 可观测性仪表盘，摄取 OpenTelemetry GenAI span，运行评估，并在五分钟内捕获注入的回归。
version: 1.0.0
phase: 19
lesson: 11
tags: [capstone, observability, otel, langfuse, phoenix, evals, drift, clickhouse]
---

给定至少六个 SDK 家族（OpenAI、Anthropic、Google GenAI、LangChain、LlamaIndex、vLLM）的生产 LLM 流量，部署一个自托管可观测平面，摄取 OTLP GenAI-semconv span，运行评估，检测漂移并发出告警。

构建计划：

1. 带 OTLP HTTP 接收器的 OpenTelemetry Collector、尾采样处理器（保留 100% 错误、10% 成功、100% 高毒性/PII）、导出到 ClickHouse + S3 的导出器。
2. 镜像 GenAI semconv 的 ClickHouse span 模式：gen_ai.system、gen_ai.request.model、usage.input/output_tokens、latency_ms、user_id、app_id，加上用于提示/补全的 JSON bag。
3. 用于应用、用户、会话、注释队列的 Postgres 元数据存储。
4. 每个 SDK 家族的客户端应用的 OpenLLMetry 自动仪表化；验证规范的 span 落地。
5. DeepEval + RAGAS + Phoenix 评估器包调度在采样追踪上；用于 PII 和策略外行为的自定义 LLM-judge。
6. 每周 PSI / KL 漂移检测器在池化提示词嵌入上；告警阈值 0.2。
7. 用于评估分数聚合和延迟百分位数的 Prometheus 导出器；Alertmanager 到 Slack（警告）+ PagerDuty（严重）。
8. Next.js 15 App Router 仪表盘：概览、追踪搜索 + 瀑布图、评估趋势、漂移图表、告警。
9. 回归探针：注入一个 1% 时间泄露虚假 SSN 的响应模式；测量 MTTR（告警触发时间）。

评估评分标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 追踪模式覆盖 | 产生规范 GenAI span 的 SDK 家族数量（目标 6+） |
| 20 | 评估正确性 | DeepEval / RAGAS 分数 vs 人工标记集 |
| 20 | 仪表盘 UX | 注入回归的 MTTR（目标 5 分钟以内） |
| 20 | 成本/规模 | 持续 1k spans/秒摄取无积压 |
| 15 | 告警 + 漂移检测 | Prometheus/Alertmanager 链端到端演练 |

硬性拒绝：

- 发明不在 OpenTelemetry GenAI semconv 中的属性名称的 span 模式。
- 丢弃错误的尾采样策略（著名的反模式）。
- 以摄取率运行评估而不采样（不可接受的成本）。
- 显示"延迟"而没有 p50/p95/p99 分离的仪表盘。

拒绝规则：

- 拒绝在无 PII 脱敏策略的情况下持久化提示或补全。
- 拒绝在没有每个 SDK 规范 span 回归测试的情况下声称"多 SDK 支持"。
- 拒绝在无基线窗口的情况下发布漂移检测；零样本漂移是无用的。

输出：一个包含收集器配置、ClickHouse 模式、Next.js 15 仪表盘、评估任务、漂移检测器、告警链、带注释回归的 10k 追踪演示数据集的仓库，以及一份记录注入的 PII 回归的 MTTR 和三个在迭代中降低 MTTR 的顶级仪表盘 UX 改进的文档。
