# MCP 网关和注册表 — 企业控制平面

> 企业不能让每个开发者随意安装随机的 MCP 服务器。网关集中管理认证、RBAC、审计、速率限制、缓存和工具投毒检测，然后将合并后的工具表面作为一个统一的 MCP 端点暴露出来。官方 MCP 注册表（Anthropic + GitHub + PulseMCP + Microsoft，命名空间验证）是权威的上游。本课说明网关的位置、讲解一个最小实现，并概述 2026 年的厂商格局。

**类型：** 学习
**语言：** Python（标准库，最小网关）
**前置知识：** 阶段 13 · 15（工具投毒），阶段 13 · 16（OAuth 2.1）
**时间：** ~45 分钟

## 学习目标

- 解释 MCP 网关的位置（在 MCP 客户端和多个后端 MCP 服务器之间）。
- 实现网关的五个职责：认证、RBAC、审计、速率限制、策略。
- 在网关层强制执行钉选工具哈希清单。
- 区分官方 MCP 注册表和元注册表（Glama、MCPMarket、MCP.so、Smithery、LobeHub）。

## 问题

一家财富 500 强公司拥有 30 个批准的 MCP 服务器、5000 名开发者、合规和审计要求，以及一个想要集中策略的安全团队。让每个开发者在他们的 IDE 中随意安装任意服务器是行不通的。

网关模式：

1. 网关作为单个 Streamable HTTP 端点运行，开发者连接到该端点。
2. 网关持有每个后端 MCP 服务器的凭证。
3. 每个开发者请求都通过网关自身的 OAuth 进行身份验证和范围限定。
4. 网关将调用路由到后端服务器，并应用策略。
5. 所有调用都被记录以供审计。

Cloudflare MCP Portals、Kong AI Gateway、IBM ContextForge、MintMCP、TrueFoundry、Envoy AI Gateway——所有这些都在 2025-2026 年发布了网关或网关功能。

同时，官方 MCP 注册表作为权威上游推出：经过精选、命名空间验证、反向 DNS 命名的服务器，网关可以从中拉取。元注册表（Glama、MCPMarket、MCP.so、Smithery、LobeHub）聚合来自多个来源的服务器。

## 概念

### 网关的五个职责

1. **认证。** OAuth 2.1 用于识别开发者；映射到用户角色。
2. **RBAC。** 每用户策略：哪些服务器、哪些工具、哪些范围。
3. **审计。** 每次调用都记录谁、做了什么、何时、结果如何。
4. **速率限制。** 每用户/每工具/每服务器上限以防止滥用。
5. **策略。** 拒绝投毒描述、执行"二规则"、编辑 PII。

### 网关作为单一端点

对开发者而言，网关看起来像一个 MCP 服务器。内部它路由到 N 个后端。会话 ID（阶段 13 · 09）在边界处被重写。

### 凭证保管

开发者从未看到后端令牌。网关持有它们（或代理到执行此操作的标识提供者）。在网关上具有 `notes:read` 的开发者可以传递性地使用网关自己的后端凭证访问笔记 MCP 服务器——但只在绑定传递性访问的策略下。

### 网关层的工具哈希钉选

网关持有一份已批准工具描述的清单（SHA256 哈希）。在发现时，它获取每个后端的 `tools/list`，将哈希与清单进行比较，并移除任何描述已变更的工具。这是阶段 13 · 15 中的撤梯子防御在集中层面的应用。

### 策略即代码

高级网关使用 OPA/Rego、Kyverno 或 Styra 表达策略。像"用户 `alice` 只能在 `acme` 组织的仓库上调用 `github.open_pr`"这样的规则是声明式编码的。简单的网关使用手动编码的 Python。两种形式都有效。

### 会话感知路由

当用户的会话包含多个服务器时，网关进行多路复用：开发者的单个 MCP 会话持有 N 个后端会话，每个服务器一个。来自任何后端的通知都通过网关路由到开发者的会话。

### 命名空间合并

网关合并来自所有后端的工具命名空间，通常使用前缀来解决冲突。例如 `github.open_pr`、`notes.search`。这使得路由无歧义。

### 注册表

- **官方 MCP 注册表 (`registry.modelcontextprotocol.io`)。** 由 Anthropic、GitHub、PulseMCP、Microsoft 共同管理。命名空间验证（反向 DNS：`io.github.user/server`）。经过基本质量预筛选。
- **Glama。** 以搜索为中心的元注册表，聚合多个来源。
- **MCPMarket。** 偏向商业的目录，有厂商列表。
- **MCP.so。** 社区目录；开放提交。
- **Smithery。** 包管理器风格的安装流程。
- **LobeHub。** 在其 LobeChat 应用中集成 UI 的注册表。

企业网关默认从官方注册表拉取，允许管理员从元注册表精选添加，拒绝任何未钉选的内容。

### 反向 DNS 命名

官方注册表要求公共服务器使用反向 DNS 名称：`io.github.alice/notes`。命名空间防止抢注并使信任委托更清晰。

### 厂商调查，2026 年 4 月

| 厂商 | 优势 |
|------|------|
| Cloudflare MCP Portals | 边缘托管；OAuth 集成；免费层 |
| Kong AI Gateway | 原生 K8s；细粒度策略；日志输出到 OpenTelemetry |
| IBM ContextForge | 企业 IAM；合规；审计导出 |
| TrueFoundry | 偏向 DevOps；以指标为先 |
| MintMCP | 面向开发者平台 |
| Envoy AI Gateway | 开源；可定制过滤器 |

阶段 17（生产基础设施）深入探讨网关运维。

## 使用它

`code/main.py` 附带一个约 150 行的最小网关：通过假的 Bearer 令牌认证用户、持有每用户 RBAC 策略、将请求路由到两个后端 MCP 服务器、将每次调用写入审计日志、强制执行速率限制，以及拒绝任何描述哈希与钉选清单不匹配的后端工具。

需要关注的内容：

- `RBAC` 字典以 `user_id` 为键，包含允许的 `server_tool` 条目。
- `AUDIT_LOG` 是一个仅追加的事件列表。
- 速率限制使用每用户令牌桶。
- 钉选清单是一个 `server::tool -> hash` 的字典。

## 交付

本课产出 `outputs/skill-gateway-bootstrap.md`。给定一个企业 MCP 计划（用户、后端、合规要求），该技能生成一个网关配置规范。

## 练习

1. 运行 `code/main.py`。作为允许的用户进行调用；然后作为不允许的用户；再然后超过速率限制的突发调用。验证所有三种流程。

2. 添加一个策略，在结果返回给客户端之前编辑其中的 PII。使用简单的正则表达式匹配 SSN 格式的字符串；注意差距（电子邮件、电话号码）。

3. 扩展审计日志以发出 OpenTelemetry GenAI spans。阶段 13 · 20 涵盖确切的属性。

4. 为一个 50 名开发者、五个后端（notes、github、postgres、jira、slack）的团队设计 RBAC 策略。谁获得每个后端的只读权限？谁获得写入权限？

5. 从头到尾阅读 Cloudflare 企业 MCP 文章。找出 Cloudflare 提供但此标准库网关没有的一个特性。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 网关 (Gateway) | "MCP 代理" | 客户端和后端之间的集中式服务器 |
| 凭证保管 (Credential vaulting) | "后端令牌留在服务端" | 开发者从未看到上游令牌 |
| 会话感知路由 (Session-aware routing) | "多后端会话" | 网关为每个开发者会话多路复用 N 个后端会话 |
| 工具哈希钉选 (Tool-hash pinning) | "批准清单" | 每个已批准工具描述的 SHA256；集中阻止撤梯子攻击 |
| RBAC | "每用户策略" | 基于角色的工具和服务器访问控制 |
| 策略即代码 (Policy-as-code) | "声明式规则" | 在网关执行的 OPA/Rego、Kyverno、Styra 策略 |
| 审计日志 (Audit log) | "谁、做了什么、何时" | 仅追加的事件日志，用于合规 |
| 速率限制 (Rate limit) | "每用户令牌桶" | 每分钟上限以防止滥用 |
| 官方 MCP 注册表 (Official MCP Registry) | "权威上游" | `registry.modelcontextprotocol.io`，命名空间验证 |
| 反向 DNS 命名 (Reverse-DNS naming) | "注册表命名空间" | `io.github.user/server` 约定 |

## 扩展阅读

- [官方 MCP 注册表](https://registry.modelcontextprotocol.io/) — 权威上游，命名空间验证
- [Cloudflare — Enterprise MCP](https://blog.cloudflare.com/enterprise-mcp/) — 带 OAuth 和策略的网关模式
- [agentic-community — MCP gateway registry](https://github.com/agentic-community/mcp-gateway-registry) — 开源参考网关
- [TrueFoundry — What is an MCP gateway?](https://www.truefoundry.com/blog/what-is-mcp-gateway) — 功能对比文章
- [IBM — MCP context forge](https://github.com/IBM/mcp-context-forge) — IBM 的企业网关
