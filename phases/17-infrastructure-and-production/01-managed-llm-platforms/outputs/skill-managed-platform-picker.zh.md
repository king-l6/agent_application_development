---
name: managed-platform-picker
description: 选择一个托管 LLM 平台（Bedrock、Azure OpenAI、Vertex AI）和一个用于冗余的备用平台，给定工作负载、SLA 和合规要求 — 然后制定 FinOps 检测方案。
version: 1.0.0
phase: 17
lesson: 01
tags: [bedrock, azure-openai, vertex-ai, ptu, finops, managed-platforms]
---

给定工作负载概要（所需模型、每月 token 数、P50/P99 TTFT SLA、合规约束、现有云基础设施），产生平台推荐。

产出：

1. **主要平台。** 指明平台、它覆盖的具体模型，以及根据利用率选择按需还是 Provisioned Throughput Units（PTU）/ Provisioned Throughput。引用盈亏平衡计算（PTU 约在 40-60% 持续利用率）。
2. **辅助平台。** 指明双供应商最低要求的备用方案。证明配对的合理性 — 冗余必须覆盖模型重叠（Bedrock 上的 Claude + Azure OpenAI 上的 GPT 是常见配对）和区域重叠。
3. **FinOps 检测。** 指定第一天就要启用的项：Bedrock Application Inference Profiles、Azure 作用域 + PTU 预留作为成本对象、Vertex 按团队项目 + BigQuery Billing Export。指明归因维度 — 按用户、按任务、按租户。
4. **SLA 检查。** 将目标 TTFT P99 与已发布的基准测试比较（Azure OpenAI PTU ≈ 50 ms P50；Bedrock 按需 ≈ 75 ms P50）。如果 SLA 比按需能提供的更严格，则要求 PTU。
5. **合规检查。** 根据需要验证 BAA、SOC 2 Type II、HIPAA、欧盟数据驻留。注意三者都满足基线，但保留策略和滥用监控 opt-out 有所不同。
6. **迁移路径。** 指出团队本周可执行的一个可逆步骤（例如，通过抽象供应商的 AI 网关部署；检测归因标头）和一个长期步骤（PTU 承诺；跨区域故障转移）。

硬性拒绝：
- 推荐单一平台而没有指定的备用方案。拒绝并坚持双供应商最低要求。
- 没有利用率估算就选择 PTU。拒绝并要求提供持续利用率数据。
- 当归因被列为要求时忽略 Bedrock Application Inference Profiles — 它们是原生最清晰的方案。

拒绝规则：
- 如果工作负载要求 Claude、Gemini 和 GPT 全部为 P0 级别，则指出三平台现实（Bedrock + Vertex + Azure OpenAI 放在一个网关后面），而非假装一个平台可以服务全部三者。
- 如果 SLA 要求 TTFT P99 < 100 ms 且预期预算无法支持 PTU，则拒绝承诺该 SLA — 解释按需方差的限制。
- 如果客户要求"使用最便宜的供应商"，拒绝 — 价格是多维度的（token 费率 + 专用容量 + 归因开销 + 锁定成本）。

输出：一页决策，包含主要平台、辅助平台、PTU vs 按需、检测列表、SLA/合规验证以及两个迁移步骤。最后给出一个能够发现偏离计划的单一指标（持续利用率、PTU 浪费或归因覆盖率）。
