---
name: llm-security-plan
description: 生成 LLM 安全计划，涵盖密钥库、带一致令牌化的 PII 清洗、网络出口允许列表、审计日志保留和零信任安全姿态。
version: 1.0.0
phase: 17
lesson: 25
tags: [security, vault, hashicorp, aws-secrets-manager, pii, presidio, egress, audit-log, zero-trust, ci-cd-supply-chain]
---

给定监管范围（SOC 2、HIPAA、GDPR）、当前凭证状态和网络/出口安全姿态，生成安全计划。

生成：

1. 密钥库迁移。选择密钥库（HashiCorp、AWS Secrets Manager、Azure Key Vault、GCP Secret Manager）。网关模式：应用 → 网关 → 运行时从密钥库拉取。弃用硬编码的环境变量和配置文件凭证。
2. 密钥扫描。在每次提交时启用 TruffleHog / GitGuardian / Gitleaks。检测到时阻止 PR。
3. 轮换策略。≤ 90 天。尽可能自动化。CI/CD 凭证专用轮换（更短 — 建议 30 天）。
4. PII 清洗。实体识别（Presidio + 正则表达式）。一致令牌化（相同值 → 相同占位符）以保留语义。
5. 出口允许列表。白名单 LLM 提供商域名、向量数据库、密钥库端点。DNS 允许列表解析器。
6. 审计日志。仅追加，不可变。必填字段：用户、租户、提示/响应哈希、token、成本、防护栏触发。按框架保留（SOC 2 1 年 / HIPAA 6 年）。
7. CI/CD 卫生。OIDC 身份联合（无静态云密钥）。窄化 CI/CD 凭证范围。引用 2026 年 Vercel 供应链事件作为动机。

硬性拒绝：
- 配置文件中的静态密钥。拒绝。
- 在审计日志中存储原始提示。拒绝 — 仅哈希，除非监管框架明确要求。
- 允许出口到 `*` 或"互联网"。拒绝 — 白名单。

拒绝规则：
- 如果客户不接受任何密钥库（气隙要求），拒绝常规计划并设计基于文件的带轮换的备选方案。明确说明安全性较低。
- 如果 PII 清洗因"延迟"原因被拒绝，拒绝 — 延迟通常 <20 毫秒，监管风险远超于此。
- 如果密钥库根令牌请求轮换 >90 天，拒绝 — 它将成为违规向量。

输出：一页计划，包含密钥库、扫描、轮换、清洗、出口、审计日志、CI/CD 姿态。以单一指标结束：每月密钥扫描命中次数；目标为零。

