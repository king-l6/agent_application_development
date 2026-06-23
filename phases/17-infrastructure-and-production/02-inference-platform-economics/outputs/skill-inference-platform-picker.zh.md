---
name: inference-platform-picker
description: 选择推理平台（Fireworks、Together、Baseten、Modal、Replicate、Anyscale 或定制芯片），给定工作负载、SLA、预算和运维约束。标准化按 token、按分钟和按预测定价。
version: 1.0.0
phase: 17
lesson: 02
tags: [inference, fireworks, together, baseten, modal, replicate, anyscale, economics]
---

给定工作负载概要（模型、每日 token 数、持续利用率、TTFT SLA、突发因子、合规性、Python vs 混合栈），产生平台推荐。

产出：

1. **主要平台。** 指明平台和具体的定价层级（无服务器 vs 专用 vs 批处理）。用匹配的工作负载特征证明其合理性 — 例如，"Fireworks 无服务器，因为 TTFT < 500 ms 是 SLA 要求且流量是突发性的。"
2. **有效成本。** 将所选定价模型标准化为 $/M 输出 token。与至少两个替代方案进行比较。指出按分钟何时优于按 token（约 30% 持续利用率以上）或反之。
3. **冷启动方案。** 对于无服务器选择（Fireworks、Modal、Replicate），说明预期的冷启动延迟和缓解措施（预热、min_workers=1、实时迁移）。对于专用选择（Baseten、Anyscale），跳过此部分但说明权衡。
4. **亚军。** 指出第二个平台以及你会切换的明确条件（例如，"如果我们签下需要 HIPAA + 专用 GPU 的企业交易，则迁移到 Baseten"）。
5. **网关层。** 建议是否在前面放置一个 AI 网关（LiteLLM、Portkey、Kong AI Gateway）来隔离产品与供应商变更。默认：是，除非规模低于 500 RPS。

硬性拒绝：
- 不进行标准化就直接比较按 token 和按分钟。拒绝并要求提供有效 $/M token。
- 因为 Fireworks"最快"就选择它，而没有用已发布的基准测试验证 TTFT SLA。
- 对于非延迟受限的工作负载推荐定制芯片（Groq、Cerebras、SambaNova）。它们定价溢价，仅在交互式 SLA 上才合理。

拒绝规则：
- 如果工作负载需要受监管框架（SOC 2 Type II、HIPAA）且客户选择了 Modal 或 Replicate，拒绝 — 两者都没有 Baseten 或 Anyscale 那样的企业足迹。建议 Baseten。
- 如果预期流量低于每天 100k token，拒绝推荐按分钟（Baseten、Modal、Anyscale）。经济性不成立 — 默认使用市场（OpenRouter、DeepInfra）或托管云厂商。
- 如果客户想要"最便宜的"，拒绝 — 指出多维成本函数（token 费率 + 冷启动 + 归因 + 网关 + 开发者体验）。

输出：一页推荐，包含主要平台、有效成本、冷启动方案、亚军、网关姿态。最后给出一个能够揭示错误选择的单一指标（冷启动 P99、按 token 费率或利用率漂移）。
