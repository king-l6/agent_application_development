# 安全 — 密钥、API Key 轮换、审计日志、防护栏

> 通过集中式密钥库（HashiCorp Vault、AWS Secrets Manager、Azure Key Vault）消除密钥分散。切勿将凭证存储在配置文件、VCS 中的环境文件、电子表格中。使用 IAM 角色替代静态密钥；CI/CD 使用 OIDC。AI 网关模式是 2026 年的解决方案：应用 → 网关 → 模型提供商，网关在运行时从密钥库拉取凭证。在密钥库中轮换后，所有应用在数分钟内生效 — 无需重新部署，无需在 Slack 中询问"谁有新密钥"。轮换策略 ≤ 90 天；每次提交使用 TruffleHog / GitGuardian / Gitleaks 扫描。零信任：MFA、SSO、RBAC/ABAC、短期令牌、设备状态。PII 清洗使用实体识别在转发前屏蔽 PHI/PII；一致的令牌化（Mesh 方法）将敏感值映射到稳定的占位符，使 LLM 保留代码/关系语义。网络出口：LLM 服务在专用 VPC/VNet 子网中，仅白名单 `api.openai.com`、`api.anthropic.com` 等；阻止所有其他出站流量。2026 年事故驱动因素：Vercel 供应链攻击，通过受损的 CI/CD 凭证泄露了数千个客户部署的环境变量。

**类型：** 学习
**语言：** Python（标准库，玩具 PII 清洗器 + 审计日志写入器）
**前置要求：** 第 17 阶段 · 19（AI 网关），第 17 阶段 · 13（可观测性）
**时间：** 约 60 分钟

## 学习目标

- 列举四种密钥管理反模式（VCS 中的配置文件、硬编码的环境变量、电子表格、静态密钥）并说出它们的替代方案。
- 解释 AI 网关从密钥库拉取的模式是 2026 年生产标准。
- 实现具有一致令牌化（相同值 → 相同占位符）的 PII 清洗器，使语义得以保留。
- 说出 2026 年 Vercel 供应链事件及其关于 CI/CD 凭证安全的教训。

## 问题

实习生提交了包含 API 密钥的 `.env` 文件。他们迅速删除了它。但密钥已经在 git 历史中 — GitGuardian 扫描发现了它，你的轮换流程是"在 Slack 通知团队，更新 40 个配置文件，重新部署所有服务。"8 小时后，一半服务已上线，另一半在等待部署窗口。

另外，用户提示中包含"我的社会安全号码是 123-45-6789。"提示被发送到 OpenAI。你有 BAA 但你的内部策略是在转发前屏蔽 PII。你没有这样做。

另外，你的 EKS 集群的 LLM Pod 可以访问任何互联网主机。有人通过 DNS 查询将数据泄露到攻击者控制的域名。没有任何东西阻止它。

LLM 服务的安全性必须解决所有三个向量。密钥库支持的凭证。PII 清洗。网络出口过滤。审计日志。

## 概念

### 集中式密钥库 + IAM 角色拉取

**密钥库**：HashiCorp Vault、AWS Secrets Manager、Azure Key Vault、GCP Secret Manager。单一信任源。

**IAM 角色**：应用/网关通过其 IAM 身份进行认证，而不是静态密钥。密钥库在令牌的生命周期内返回密钥。

**AI 网关模式**：网关在请求时从密钥库拉取 `OPENAI_API_KEY`。在密钥库中轮换；下一个请求获取新密钥。无需重新部署。

### 轮换策略 ≤ 90 天

所有 API 密钥、密钥库根令牌、CI/CD 凭证。尽可能自动化轮换。手动轮换需记录和跟踪。

### 密钥扫描

- **TruffleHog** — 提交时进行正则表达式 + 熵检测。
- **GitGuardian** — 商业软件，高准确率。
- **Gitleaks** — 开源，在 CI 中运行。

每次提交都运行。如果检测到新密钥则阻止 PR。

### 零信任安全姿态

- 所有账户要求 MFA。
- 通过 SAML/OIDC 实现 SSO。
- RBAC（基于角色）或 ABAC（基于属性）实现细粒度访问。
- 短期令牌（小时级，而非天级）。
- 设备状态 — 仅限具有磁盘加密的公司设备。

### PII / PHI 清洗

在提示离开你的基础设施之前：

1. 实体识别（spaCy NER、Presidio、商业软件）。
2. 屏蔽匹配的实体：`"My SSN is 123-45-6789"` → `"My SSN is [SSN_TOKEN_A3F]"`。
3. 一致的令牌化（Mesh 方法）：相同的值映射到相同的占位符，使 LLM 保留关系。
4. 可选的反向映射用于 LLM 响应。

静态正则表达式过滤器捕获基本模式；NER 捕获更多。两者都使用。

### 输入 + 输出防护栏

输入：阻止已知的越狱提示、禁止的话题；按用户限流。

输出：正则表达式清洗泄露的密钥（API 密钥模式、拒绝上下文中的电子邮件模式）、策略违规分类器。

### 网络出口白名单

LLM 服务在专用子网中：
- 白名单：`api.openai.com`、`api.anthropic.com`、向量数据库端点、密钥库端点。
- 其他所有流量：丢弃。
- 仅通过白名单解析器的 DNS（避免 DNS 隧道泄露）。

### 审计日志

每个 LLM 调用的不可变日志，包含：
- 时间戳。
- 用户/租户。
- 提示哈希（出于隐私考虑，非原始提示）。
- 模型 + 版本。
- Token 数量。
- 成本。
- 响应哈希。
- 任何防护栏触发。

根据监管要求保留（SOC 2 1 年，HIPAA 6 年）。

### 2026 年 Vercel 事件

供应链攻击：受损的 CI/CD 凭证泄露了数千个客户部署的环境变量。教训：CI/CD 凭证等同于生产环境凭证。存储在密钥库中。窄化范围。积极轮换。

### 你应该记住的数字

- 轮换策略：≤ 90 天。
- 每次提交扫描：TruffleHog / GitGuardian / Gitleaks。
- Vercel 2026：CI/CD 凭证受损 → 数千个客户环境变量泄露。
- 审计日志保留：SOC 2 = 1 年，HIPAA = 6 年。

## 使用它

`code/main.py` 实现了一个具有一致性令牌化和追加式审计日志的玩具 PII 清洗器。

## 交付它

本课程生成 `outputs/skill-llm-security-plan.md`。根据监管范围和当前状态，规划密钥库迁移、清洗器、出口、审计日志。

## 练习

1. 运行 `code/main.py`。发送两个引用相同 SSN 的提示。确认两者得到相同的占位符。
2. 为部署在 EKS 上并调用 OpenAI + Anthropic + Weaviate 的 vLLM 服务设计网络出口策略。
3. 你发现在 git 历史中有一个密钥（2 年前的）。正确的响应是什么 — 轮换密钥、清除历史，还是两者都做？论证理由。
4. 你的审计日志每天增长 10 GB。设计保留层级（热数据 30 天，温数据 12 个月，冷数据 6 年）。
5. 论证反向令牌化（将真实值替换回 LLM 响应中）是否值得增加复杂性，还是保持占位符可见。

## 关键术语

| 术语 | 人们说的意思 | 实际含义 |
|------|----------------|------------------------|
| 密钥库 | "密钥存储" | 集中式凭证管理服务 |
| IAM 角色 | "基于身份的身份验证" | 应用承担的角色；返回短期凭证 |
| OIDC for CI/CD | "云颁发的令牌" | CI 中无需静态密钥 — 通过 OIDC 进行身份验证 |
| TruffleHog / GitGuardian / Gitleaks | "密钥扫描器" | 提交时密钥检测 |
| RBAC / ABAC | "访问控制" | 基于角色 vs 基于属性 |
| PII 清洗 | "数据屏蔽" | 移除或令牌化敏感实体 |
| 一致的令牌化 | "稳定占位符" | 相同值 → 每次相同的令牌 |
| Mesh 方法 | "Mesh 令牌化" | 保持语义的令牌化模式 |
| 出口白名单 | "出站允许列表" | 仅允许的域名可访问 |
| 审计日志 | "不可变历史" | 仅追加的记录，用于合规 |

## 进一步阅读

- [Doppler — Advanced LLM Security](https://www.doppler.com/blog/advanced-llm-security)
- [Portkey — Manage LLM API keys with secret references](https://portkey.ai/blog/secret-references-ai-api-key-management/)
- [Datadog — LLM Guardrails Best Practices](https://www.datadoghq.com/blog/llm-guardrails-best-practices/)
- [JumpServer — Secrets Management Best Practices 2026](https://www.jumpserver.com/blog/secret-management-best-practices-2026)
- [Microsoft Presidio](https://github.com/microsoft/presidio) — PII 检测和匿名化。
- [HashiCorp Vault docs](https://developer.hashicorp.com/vault/docs)
