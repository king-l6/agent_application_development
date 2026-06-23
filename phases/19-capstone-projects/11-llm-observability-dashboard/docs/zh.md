# 综合项目 11 — LLM 可观测性与评估仪表盘

> Langfuse 转向了开放核心。Arize Phoenix 发布了 2026 年的 GenAI semconv 映射。Helicone 和 Braintrust 都加倍投入了按用户成本归属。Traceloop 的 OpenLLMetry 成为了事实上的 SDK 仪表化方案。生产形态是 ClickHouse 存储追踪数据，Postgres 存储元数据，Next.js 构建 UI，以及一小组评估任务（DeepEval、RAGAS、LLM-judge）对采样追踪运行。构建一个自托管的方案，从至少四个 SDK 家族摄取数据，并演示在五分钟内捕获注入的回溯。

**类型：** 综合项目
**语言：** TypeScript（UI）、Python / TypeScript（摄取 + 评估）、SQL（ClickHouse）
**前置知识：** 阶段 11（LLM 工程）、阶段 13（工具）、阶段 17（基础设施）、阶段 18（安全）
**涉及阶段：** P11 · P13 · P17 · P18
**时间：** 25 小时

## 问题

2026 年每个运行生产流量的 AI 团队都在模型旁边维护一个可观测平面。成本归属、幻觉检测、漂移监控、越狱信号、SLO 仪表盘、PII 泄露告警。开源参考——Langfuse、Phoenix、OpenLLMetry——都收敛到 OpenTelemetry GenAI 语义约定作为摄取模式。你现在可以用一个 SDK 仪表化 OpenAI、Anthropic、Google、LangChain、LlamaIndex 和 vLLM，并发送兼容的 span。

你将构建一个自托管仪表盘，从至少四个 SDK 家族摄取数据，对采样追踪运行一小套评估任务，检测漂移并发出告警。衡量标准：给定一个故意注入的回溯（一个开始产生 PII 的提示词），仪表盘在五分钟内捕获它并发出告警。

## 概念

摄取通过 OTLP HTTP。SDK 产生 GenAI-semconv span：`gen_ai.system`、`gen_ai.request.model`、`gen_ai.usage.input_tokens`、`gen_ai.response.id`、`llm.prompts`、`llm.completions`。Span 落入 ClickHouse 进行列式分析；元数据（用户、会话、应用）落入 Postgres。

评估作为批处理任务对采样追踪运行。DeepEval 评分忠实度、毒性和答案相关性。当追踪携带检索上下文时，RAGAS 评分检索指标。自定义 LLM-judge 运行领域特定检查（PII 泄露、策略外响应）。评估运行写回同一个 ClickHouse，作为链接到父追踪的评估 span。

漂移检测随时间观察嵌入空间分布（PSI 或提示词嵌入上的 KL 散度）以及评估分数趋势。告警反馈到 Prometheus Alertmanager，然后到 Slack / PagerDuty。UI 是带 Recharts 的 Next.js 15。

## 架构

```
生产应用:
  OpenAI SDK  +  Anthropic SDK  +  Google GenAI SDK
  LangChain + LlamaIndex + vLLM
       |
       v
  OpenTelemetry SDK with GenAI semconv
       |
       v  OTLP HTTP
  收集器 (ingest, sample, fan-out)
       |
       +-------------+-----------+
       v             v           v
   ClickHouse    Postgres    S3 归档
   (span)        (元数据)   (原始事件)
       |
       +---> 评估任务 (DeepEval, RAGAS, LLM-judge)
       |     采样或全量追踪
       |     写回评估 span
       |
       +---> 漂移检测器 (PSI / KL on prompt embeddings)
       |
       +---> Prometheus 指标 -> Alertmanager -> Slack / PagerDuty
       |
       v
   Next.js 15 仪表盘 (Recharts)
```

## 技术栈

- 摄取：OpenTelemetry SDK + GenAI 语义约定；OTLP HTTP 传输
- 收集器：OpenTelemetry Collector，带尾采样处理器（用于成本控制）
- 存储：ClickHouse 存储 span，Postgres 存储元数据，S3 存储原始事件归档
- 评估：DeepEval、RAGAS 0.2、Arize Phoenix evaluator pack、自定义 LLM-judge
- 漂移：每周对池化提示词嵌入进行 PSI / KL（sentence-transformers）
- 告警：Prometheus Alertmanager -> Slack / PagerDuty
- UI：Next.js 15 App Router + Recharts + server actions
- 开箱即用的 SDK 支持：OpenAI、Anthropic、Google GenAI、LangChain、LlamaIndex、vLLM

## 构建步骤

1. **收集器配置。** OpenTelemetry Collector，带 OTLP HTTP 接收器、保留 100% 错误追踪和 10% 成功追踪的尾采样器，以及导出到 ClickHouse 和 S3 的导出器。

2. **ClickHouse 模式。** `spans` 表，列映射 GenAI semconv：`gen_ai_system`、`gen_ai_request_model`、`input_tokens`、`output_tokens`、`latency_ms`、`prompt_hash`、`trace_id`、`parent_span_id`，加上用于长负载的 JSON bag。添加按 user_id 和 app_id 的二级索引。

3. **SDK 覆盖测试。** 使用每个 SDK（OpenAI、Anthropic、Google、LangChain、LlamaIndex、vLLM）编写一个小型客户端应用，使用 OpenLLMetry 自动仪表化。验证每个产生规范的 GenAI span 并落入 ClickHouse。

4. **评估任务。** 一个定时任务读取过去 15 分钟的采样追踪，运行 DeepEval 忠实度、毒性和答案相关性。输出是链接到父追踪的评估 span。

5. **自定义 LLM-judge。** 一个 PII 泄露判断器：给定一个响应，调用一个守卫 LLM 来评分 PII 泄露的可能性。高评分响应进入分类队列。

6. **漂移检测。** 每周任务计算本周池化提示词嵌入与过去 4 周基线之间的 PSI。如果 PSI 超过阈值，发出告警。

7. **仪表盘。** Next.js 15 页面：概览（span/秒、成本/用户、p95 延迟）、追踪（搜索 + 瀑布图）、评估（忠实度趋势、毒性）、漂移（PSI 随时间变化）、告警。

8. **告警链。** Prometheus 导出器读取评估分数聚合和延迟百分位数；Alertmanager 将警告路由到 Slack，将严重违规路由到 PagerDuty。

9. **回溯探针。** 注入一个 bug：被评估的聊天机器人开始 1% 的时间泄露虚假 SSN。测量 MTTR：从 bug 部署到 Slack 告警的时间。

## 使用方式

```
$ curl -X POST https://my-otel-collector/v1/traces -d @trace.json
[collector]  accepted 1 trace, 3 spans
[clickhouse] inserted 3 spans (app=chat, user=u_42)
[eval]       DeepEval faithfulness 0.82, toxicity 0.03
[drift]      weekly PSI 0.08 (below 0.2 threshold)
[ui]         live at https://obs.example.com
```

## 交付产出

`outputs/skill-llm-observability.md` 是交付产出。给定一个 LLM 应用，仪表盘摄取其追踪，运行评估，对漂移发出告警，并在 Next.js 中展示成本/用户分解。

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 追踪模式覆盖 | 产生规范 GenAI span 的 SDK 家族数量（目标：6+） |
| 20 | 评估正确性 | DeepEval / RAGAS 分数与人工标记集对比 |
| 20 | 仪表盘 UX | 注入回溯的 MTTR（目标 5 分钟内） |
| 20 | 成本/规模 | 持续以 1k spans/秒摄取，无积压 |
| 15 | 告警 + 漂移检测 | Prometheus/Alertmanager 链端到端演练 |
| **100** | | |

## 练习

1. 为 Haystack 框架添加自定义仪表化。验证规范的 span 以准确的 `gen_ai.*` 属性落入 ClickHouse。

2. 在同一追踪上将 DeepEval 替换为 Phoenix 评估器。测量两个评估引擎之间的分数漂移。

3. 改进漂移检测器：按 app-id 而非全局计算 PSI。展示每个应用的漂移轨迹。

4. 添加"用户影响"页面：每个用户的成本、每个用户的失败率，带迷你趋势图。

5. 构建一个尾采样策略，保留 100% 毒性 > 0.5 的追踪，外加 10% 分层采样的其余部分。测量引入的采样偏差。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| GenAI semconv | "OTel LLM 属性" | 2025 年 OpenTelemetry 规范中 LLM span 属性（系统、模型、令牌） |
| 尾采样 | "追踪后采样" | 收集器在追踪完成后决定保留还是丢弃（可查看错误） |
| PSI | "群体稳定性指数" | 比较两个分布的漂移指标；> 0.2 通常表示有意义的漂移 |
| LLM-judge | "评估即模型" | 一个 LLM 根据规则对另一个 LLM 的输出进行评分（忠实度、毒性、PII） |
| 尾采样策略 | "保留规则" | 决定哪些追踪保留 vs 丢弃的规则；错误 + 采样率 |
| 评估 span | "链接的评估追踪" | 携带评估分数的子 span，链接到原始 LLM 调用 span |
| 每用户成本 | "单位经济" | 在一个时间窗口内归属于 user_id 的美元成本；关键产品指标 |

## 延伸阅读

- [Langfuse](https://github.com/langfuse/langfuse) — 参考开放核心可观测性平台
- [Arize Phoenix](https://github.com/Arize-ai/phoenix) — 替代参考，支持强大的漂移检测
- [OpenLLMetry (Traceloop)](https://github.com/traceloop/openllmetry) — 自动仪表化 SDK 家族
- [OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — 摄取模式
- [Helicone](https://www.helicone.ai) — 替代托管可观测性方案
- [Braintrust](https://www.braintrust.dev) — 替代评估优先平台
- [ClickHouse 文档](https://clickhouse.com/docs) — 列式 span 存储
- [DeepEval](https://github.com/confident-ai/deepeval) — 评估器库
