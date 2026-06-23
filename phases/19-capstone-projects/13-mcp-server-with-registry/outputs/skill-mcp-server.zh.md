---
name: mcp-server-platform
description: 部署一个生产 MCP 服务器，带有 StreamableHTTP、OAuth 2.1 作用域、OPA 策略、用于破坏性工具的人工批准门控和用于发现的注册表。
version: 1.0.0
phase: 19
lesson: 13
tags: [capstone, mcp, fastmcp, streamablehttp, oauth, opa, registry, governance]
---

给定一个企业环境，交付一个带有 10 个内部工具、一个用于发现的注册表服务和一个通过 Slack 批准门控破坏性工具的治理层的 MCP 服务器。

构建计划：

1. FastMCP 服务器暴露 10 个只读工具（Postgres、S3、Jira、Linear、Datadog、PagerDuty、GitHub、Notion、Slack、Salesforce），每个带有类型化模式和必需的作用域。
2. StreamableHTTP 传输，在负载均衡器后无状态运行。
3. OAuth 2.1 令牌内省中间件；通过 SPIFFE / SPIRE 的工作负载身份。
4. 每次工具调用的 OPA / Rego 策略决策：作用域强制、PII 脱敏、载荷大小限制。
5. 破坏性工具（Jira 创建、Linear 创建、Postgres 写入）在单独的 MCP 服务器上，要求通过 Slack 卡片在 15 分钟内提升的作用域 `approved:by:human`。
6. 注册表服务轮询每个服务器的 `.well-known/mcp-capabilities`，用 JSON Schema 验证，并暴露列表/搜索/验证/启用 UI。
7. 每租户 JSONL 审计日志，写入前使用 Presidio PII 脱敏。
8. 100 客户端负载测试演示水平扩展；通过 MCP 一致性套件。

评估评分标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 规范一致性 | StreamableHTTP + 能力清单通过 MCP 一致性测试 |
| 20 | 安全性 | 作用域强制、每个工具的 OPA 覆盖、密钥卫生 |
| 20 | 可观测性 | 每次工具调用的审计日志，带写入时 PII 脱敏 |
| 20 | 扩展性 | 100 客户端负载测试，带水平扩展演示 |
| 15 | 注册表 UX | 发现/验证/启用禁用工作流演练 |

硬性拒绝：

- 需要有状态会话的服务器（违反 2026 StreamableHTTP 无状态契约）。
- 破坏性工具与只读工具共享相同认证表面的单服务器拓扑。
- 持久化原始 PII 的审计日志。
- 忽略能力清单；注册表集成是硬性要求。

拒绝规则：

- 拒绝在没有 OAuth 的情况下部署；匿名访问是不合格的。
- 拒绝在没有 Slack 批准流程的情况下交付破坏性工具。
- 拒绝暴露其作用域或描述不在能力清单中的工具。

输出：一个包含两个 MCP 服务器（只读 + 破坏性）、注册表服务、Slack 批准集成、OPA 策略、100 客户端负载测试工具、一致性测试结果的仓库，以及一份描述你考虑过但未暴露的工具（以及原因）加上在干运行期间捕获临近错误的三个主要 OPA 规则的文档。
