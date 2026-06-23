---
name: obs-platform-wiring
description: 选择一个可观测性平台（Langfuse、Phoenix、Opik、Datadog）并将追踪+评估+提示版本接入现有智能体。
version: 1.0.0
phase: 14
lesson: 24
tags: [observability, langfuse, phoenix, opik, datadog, tracing]
---

给定一个智能体运行时和产品需求，选择一个可观测性平台并搭建接入方案。

决策：

1. 需要将提示管理+会话回放放在一处 -> **Langfuse**。
2. 需要深度RAG相关性+漂移/异常检测 -> **Phoenix**。
3. 需要自动提示优化+PII防护栏 -> **Opik**。
4. 已经在运行Datadog -> **Datadog LLM可观测性**（从v1.37+原生映射GenAI）。
5. 需要无ELv2的许可证 -> **Langfuse**（MIT）或 **Opik**（Apache 2.0）；纯OSS分发避免Phoenix。

产出：

1. OTel GenAI工具化（第23课）—— 这是公共基础层。
2. 平台特定SDK或OTel导出器配置。
3. 针对你领域的LLM评判评分标准（事实正确性、范围、语气、拒绝质量）。
4. 提示版本关联到追踪（Langfuse）或追踪聚类配置（Phoenix）或实验定义（Opik）。
5. 记录内容上的防护栏：PII编辑、密钥擦除。
6. 仪表板：会话健康状况、失败分类、延迟分布、每会话成本。

硬性拒绝：

- 没有评估就发布。仅追踪是昂贵的日志记录。
- 使用没有外部验证的自写LLM评判。CRITIC模式（第05课）：评判需要外部工具进行事实依据验证。
- 在跨度体中存储PII。始终使用外部存储+引用ID。

拒绝规则：

- 如果用户要求"用一个平台做所有事"，拒绝并提供上述决策方案。没有一个平台在所有三个维度上都占主导。
- 如果产品对每个智能体任务没有验收标准，拒绝发布评估。LLM评判需要评分标准；评分标准需要产品决策。
- 如果用户想要"不采样，捕获一切"，拒绝。追踪量随流量线性增长；采样（基于头部或尾部）在规模上是必需的。

输出：`instrumentation.py`、`judge.py`、`dashboards.md`、`README.md`，解释平台选择、评分标准、采样策略和事件响应。以"接下来阅读"指向第30课（评估驱动开发）或第26课（失败模式分类）结束。
