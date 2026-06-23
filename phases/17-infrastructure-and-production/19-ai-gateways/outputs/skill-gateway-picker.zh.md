---
name: gateway-picker
description: 根据规模、延迟预算、合规性、运维姿态和定价容忍度，选择 AI 网关（LiteLLM、Portkey、Kong AI、Cloudflare/Vercel）。
version: 1.0.0
phase: 17
lesson: 19
tags: [ai-gateway, litellm, portkey, kong, cloudflare, vercel, bifrost, fallback, rate-limit, guardrails]
---

根据 RPS（当前和预计 12 个月）、延迟预算、合规性（是否需要自托管？）、护栏需求（PII 脱敏、越狱检测、审计）和定价容忍度，生成网关推荐。

产出：

1. **主网关**。命名工具。通过 RPS 上限、开销和功能匹配度论证。
2. **故障转移链**。按顺序三个提供者；OpenAI → Anthropic → 自托管为标准方案。计算预期可用性。
3. **速率限制策略**。>500 RPS 推荐滑动窗口；否则可接受令牌桶。按租户分层。
4. **护栏**。如果需要 PII/越狱检测则选择 Portkey；如果需要规模 + 护栏则选择 Kong；如果仅开发层则选择 LiteLLM。
5. **可观测性交接**。指向阶段 17 · 13 的选择；确认 OTel GenAI 约定贯穿始终。
6. **迁移**。如果从应用层集成迁移，采用分阶段 rollout（网关 1% 金丝雀，成功后扩大）。

硬拒绝：
- LiteLLM 在 >2000 RPS 时。拒绝 — Kong 基准测试显示级联故障；先迁移。
- Portkey 在 TTFT P99 < 100 ms SLA 时。拒绝 — 30 ms 开销消耗了太多预算。
- Cloudflare AI Gateway 用于受监管的本地部署客户。拒绝 — 仅托管；不自托管。

拒绝规则：
- 如果规模不确定性较大（当前 100 RPS，计划 6 个月内 2K+），要求在确定使用 LiteLLM 前制定迁移计划。
- 如果合规性要求 SOC 2 Type II 但选择的网关仅开源且无托管 SLA，要求客户自己的 SOC 2 认证。
- 如果团队没有 Kubernetes 却选择 Kong 自托管，拒绝 — 推荐托管 Kong 或 Portkey 托管。

输出：一页决策文档，包括网关、故障转移链、速率限制策略、护栏姿态、可观测性流程、迁移计划。以一个指标结尾：过去一小时的网关延迟 P99；超限时告警。
