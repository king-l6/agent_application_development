# LLM 可观测性栈选型

> 2026年的可观测性市场分为两类。开发平台（LangSmith、Langfuse、Comet Opik）将监控与评估、提示管理、会话回放捆绑在一起。网关/ instrumentation 工具（Helicone、SigNoz、OpenLLMetry、Phoenix）专注于遥测。Langfuse 采用 MIT 许可核心，拥有强大的开源平衡（云免费版每月5万事件）。Phoenix 是基于 OpenTelemetry 原生、采用 Elastic License 2.0 的工具——非常适合漂移/RAG可视化，但不是持久化生产后端。Arize AX 使用零拷贝 Iceberg/Parquet 集成，声称比整体式可观测性便宜100倍。LangSmith 在 LangChain/LangGraph 方面领先，每位用户每月39美元，仅企业版支持自托管。Helicone 是基于代理的，15-30分钟即可完成设置，每月免费10万次请求，但在代理追踪方面的深度较差。常见的生产模式：网关（Helicone/Portkey）+ 评估平台（Phoenix/TruLens），通过 OpenTelemetry 粘合。

**类型：** 学习
**语言：** Python（标准库，玩具级追踪采样模拟器）
**前置知识：** 第17阶段 · 08（推理指标），第14阶段（Agent 工程）
**时间：** 约60分钟

## 学习目标

- 区分开发平台（捆绑：评估 + 提示 + 会话）与网关/遥测工具（仅追踪 + 指标）。
- 将六大主要工具（Langfuse、LangSmith、Phoenix、Arize AX、Helicone、Opik）与其许可、定价和最佳用例场景对应起来。
- 解释 OpenTelemetry 粘合模式，该模式允许你组合使用网关工具和独立的评估平台。
- 指出2026年的成本差异化因素（Arize AX 的零拷贝方法与整体式摄取对比）并说明大约100倍的倍增关系。

## 问题

你上线了一个 LLM 功能。它能工作。但你对提示失败、工具循环、延迟回归、成本激增或提示缓存命中率毫无可见性。你在 Google 上搜索"LLM 可观测性"，得到八个工具，它们都声称以三种不同的价格点解决同一个问题。

它们解决的不是同一个问题。LangSmith 回答"这个 LangGraph 运行为什么失败？" Phoenix 回答"我的 RAG 管道在漂移吗？" Helicone 回答"哪个应用在消耗 tokens？" Langfuse 回答"我能自托管整个系统吗？" 不同的工具，不同的受众。

选择涉及四个维度：技术栈（LangChain？裸 SDK？多厂商？）、许可容忍度（仅 MIT？Elastic 可以？商业版也行？）、预算（免费层？每月100美元？每月1000美元？）和自托管（必须？锦上添花？从不？）。

## 概念

### 两大类别

**开发平台**将可观测性与评估、提示管理、数据集版本控制、会话回放捆绑在一起。你可以运行实验，查看哪个提示有效，对旧优胜者进行数据集回归测试。LangSmith、Langfuse、Comet Opik。

**网关/遥测工具**对推理调用进行 instrumentation——提示、响应、tokens、延迟、模型、成本。Helicone、SigNoz、OpenLLMetry、Phoenix。极简主义。可以通过 OpenTelemetry 与独立的评估工具组合使用。

### Langfuse —— 开源平衡

- 核心采用 Apache / MIT 许可；通过 Docker 自托管。
- 云免费层：每月5万事件。付费：团队版每月29美元。
- 评估、提示管理、追踪、数据集。覆盖所有四个开发平台功能的合理范围。
- 最佳场景：你需要 LangSmith 级别的功能但必须自托管或使用开源许可。

### Phoenix（Arize）—— 遥测优先，OpenTelemetry 原生

- Elastic License 2.0；自托管简单。
- 在 RAG 和漂移可视化方面表现出色。嵌入空间散点图作为一等公民提供。
- 并非设计为持久化生产后端——主要是开发时期的可观测性。
- 最佳场景：RAG 管道开发、漂移调试，与单独的网关配对用于生产。

### Arize AX —— 规模化方案

- 商业版。通过 Iceberg/Parquet 实现零拷贝数据湖集成。
- 声称在大规模下比整体式可观测性（Datadog 级别）便宜约100倍。原理：你将追踪存储在自己的 S3 Parquet 中；Arize 直接读取。
- 最佳场景：每天超过1000万追踪，已有数据湖，需要 LLM 特定的仪表板而不承担 Datadog 定价。

### LangSmith —— LangChain/LangGraph 优先

- 商业版，每位用户每月39美元。仅企业版支持自托管。
- 在 LangChain 和 LangGraph 技术栈中表现最佳。如果你不在其中任何一个上，它的吸引力就不大了。
- 最佳场景：团队致力于 LangChain，愿意付费。

### Helicone —— 基于代理的最小可行方案

- 通过将 `OPENAI_API_BASE` 切换到 Helicone 代理，15-30分钟即可完成设置。
- MIT 许可；每月免费10万次请求，付费版每月20美元以上。
- 包括故障转移、缓存、速率限制——同时充当网关。
- 在 Agent / 多步骤追踪方面深度较浅。
- 最佳场景：快速启动、单一技术栈应用、需要网关 + 可观测性一体。

### Opik（Comet）—— 开源开发平台

- Apache 2.0，完全开源。
- 功能集与 Langfuse 相似，具有 Comet 传统。
- 最佳场景：ML 团队已在使用 Comet，希望在同一个面板中获得 LLM 可观测性。

### SigNoz —— OpenTelemetry 优先的全面 APM

- Apache 2.0。通过 OpenTelemetry 处理通用 APM 以及 LLM。
- 最佳场景：跨服务和 LLM 调用的统一可观测性。

### 粘合层：OpenTelemetry + GenAI 语义约定

OpenTelemetry 在2025年底发布了 GenAI 语义约定（`gen_ai.system`、`gen_ai.request.model`、`gen_ai.usage.input_tokens`）。消费 OTel 的工具可以互操作。出现中的生产模式：

1. 从每次 LLM 调用中发出带有 GenAI 约定的 OTel。
2. 路由到网关（Helicone / Portkey）用于日常使用。
3. 双发到评估平台（Phoenix / Langfuse）用于回归测试。
4. 归档到数据湖（Iceberg）用于通过 Arize AX 或 DuckDB 进行长期分析。

### 陷阱：在错误的层进行 instrumentation

在 Agent 框架内部进行 instrumentation（例如添加 LangSmith 追踪）会使你与该框架耦合。在 HTTP/OpenAI-SDK 层进行 instrumentation（通过 OpenLLMetry 或你的网关）是可移植的。

### 采样——你无法保留所有数据

在每天超过100万次请求时，完整追踪保留的成本甚至超过 LLM 调用本身。按规则采样：100%错误、100%高成本、5%成功。始终保留聚合数据；保留原始数据用于长尾分析。

### 你应该记住的数字

- Langfuse 免费云：每月5万事件。
- LangSmith：每位用户每月39美元。
- Helicone 免费：每月10万次请求。
- Arize AX 声称：大规模下比整体式方案便宜约100倍。
- OpenTelemetry GenAI 约定：2025年发布，2026年广泛采用。

## 使用

`code/main.py` 模拟了100万追踪日，涵盖不同保留策略（100%摄取、采样、采样+错误）。报告每种策略下的存储成本和丢失的内容。

## 交付

本课程产出 `outputs/skill-observability-stack.md`。根据技术栈、规模、预算、许可姿态选择合适的工具。

## 练习

1. 你的团队使用 LangChain，需要开源自托管可观测性。选择 Langfuse 或 Opik 并说明理由。
2. 在每天500万追踪、Datadog 报价每月15万美元的情况下，计算 Arize AX 的盈亏平衡点。
3. 设计一组 OpenTelemetry GenAI 属性集，你的组织的指南应要求在每次 LLM 调用中强制设置。
4. 讨论仅靠 Phoenix 是否足以用于生产。它在什么情况下不够用？
5. Helicone 产生20毫秒代理开销。在 P99 TTFT 为300毫秒时，这是否可接受？如果 SLA 是100毫秒呢？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| OpenLLMetry | "LLM 的 OTel" | 用于 LLM 的开源 OpenTelemetry instrumentation |
| GenAI 约定 | "OTel 属性" | 用于 LLM 调用的标准 OTel 属性名 |
| LangSmith | "LangChain 可观测性" | 与 LangChain 生态系统捆绑的商业平台 |
| Langfuse | "开源版 LangSmith" | 功能集相似的 MIT 开源方案 |
| Phoenix | "Arize 开发工具" | OpenTelemetry 原生开发/评估平台 |
| Arize AX | "规模化可观测性" | 商业零拷贝 Iceberg/Parquet 可观测性 |
| Helicone | "代理可观测性" | 收集 LLM 遥测的 HTTP 代理 + 网关功能 |
| Opik | "Comet LLM 工具" | Comet 出品的 Apache 2.0 开源开发平台 |
| 会话回放 | "追踪重放" | 重放包含工具调用的完整 Agent 会话 |
| 评估 | "离线测试" | 在标记数据集上运行候选模型/提示 |

## 延伸阅读

- [SigNoz — 2026年顶级 LLM 可观测性工具](https://signoz.io/comparisons/llm-observability-tools/)
- [Langfuse — Arize AX 替代方案分析](https://langfuse.com/faq/all/best-phoenix-arize-alternatives)
- [PremAI — 设置 Langfuse、LangSmith、Helicone、Phoenix](https://blog.premai.io/llm-observability-setting-up-langfuse-langsmith-helicone-phoenix/)
- [OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [Arize Phoenix 文档](https://docs.arize.com/phoenix)
- [Helicone 文档](https://docs.helicone.ai/)
