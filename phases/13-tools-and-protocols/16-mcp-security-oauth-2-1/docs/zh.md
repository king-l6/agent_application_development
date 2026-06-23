# MCP 安全 II — OAuth 2.1、资源指示器、增量范围

> 远程 MCP 服务器需要授权，而不仅仅是身份验证。2025-11-25 规范与 OAuth 2.1 + PKCE + 资源指示器（RFC 8707）+ 受保护资源元数据（RFC 9728）保持一致。SEP-835 通过 403 WWW-Authenticate 上的逐步升级授权添加了增量范围同意。本课将逐步升级流程实现为状态机，以便您可以看到每一步。

**类型：** 构建
**语言：** Python（标准库，OAuth 状态机模拟器）
**前置知识：** 阶段 13 · 09（传输层），阶段 13 · 15（安全 I）
**时间：** ~75 分钟

## 学习目标

- 区分资源服务器和授权服务器的职责。
- 理解受 PKCE 保护的 OAuth 2.1 授权码流程。
- 使用 `resource`（RFC 8707）和受保护资源元数据（RFC 9728）防止混淆代理攻击。
- 实现逐步升级授权：服务器响应 403 并附带 WWW-Authenticate 请求更高范围；客户端重新提示用户同意并重试。

## 问题

早期 MCP（2025 年前）为远程服务器配备了临时 API 密钥甚至没有认证。2025-11-25 规范通过完整的 OAuth 2.1 配置填补了这一空白。

三个真实世界的需求：

- **普通远程服务器。** 用户安装一个访问其 Notion / GitHub / Gmail 的远程 MCP 服务器。OAuth 2.1 和 PKCE 是正确的做法。
- **范围升级。** 被授予 `notes:read` 的笔记服务器稍后可能需要 `notes:write` 来执行特定操作。与其重新完成整个流程，逐步升级（SEP-835）请求额外的范围。
- **防止混淆代理。** 客户端持有一个受众范围为服务器 A 的令牌。服务器 A 是恶意的，试图向服务器 B 出示该令牌。资源指示器（RFC 8707）将令牌钉到其预期的受众。

OAuth 2.1 并不新鲜。新鲜的是 MCP 的配置：特定的必需流程（仅授权码 + PKCE；无隐式流，默认无客户端凭证）、每个令牌请求必需的资源指示器，以及发布的受保护资源元数据以便客户端知道去哪里。

## 概念

### 角色

- **客户端。** MCP 客户端（Claude Desktop、Cursor 等）。
- **资源服务器。** MCP 服务器（笔记、GitHub、Postgres 等）。
- **授权服务器。** 颁发令牌。可能与资源服务器是同一服务，也可能是独立的 IdP（Auth0、Keycloak、Cognito）。

在 MCP 的配置中，资源服务器和授权服务器**可以**是同一主机，但**应该**通过 URL 区分。

### 授权码 + PKCE

流程：

1. 客户端生成 `code_verifier`（随机）和 `code_challenge`（SHA256）。
2. 客户端将用户重定向到 `/authorize?response_type=code&client_id=...&redirect_uri=...&scope=notes:read&code_challenge=...&resource=https://notes.example.com`。
3. 用户同意。授权服务器重定向到 `redirect_uri?code=...`。
4. 客户端 POST 到 `/token?grant_type=authorization_code&code=...&code_verifier=...&resource=...`。
5. 授权服务器验证验证器的哈希是否与存储的挑战匹配，并颁发访问令牌。
6. 客户端使用令牌：对资源服务器的每个请求都带有 `Authorization: Bearer ...`。

PKCE 防止授权码拦截攻击。资源指示器防止令牌在其他地方有效。

### 受保护资源元数据（RFC 9728）

资源服务器发布 `.well-known/oauth-protected-resource` 文档：

```json
{
  "resource": "https://notes.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["notes:read", "notes:write", "notes:delete"]
}
```

客户端从资源服务器发现授权服务器。减少了配置——客户端只需要资源 URL。

### 资源指示器（RFC 8707）

令牌请求中的 `resource` 参数将令牌的预期受众钉到特定值。颁发的令牌包含 `aud: "https://notes.example.com"`。另一个收到此令牌的 MCP 服务器检查 `aud` 并拒绝它。

### 范围模型

范围是空格分隔的字符串。常见的 MCP 约定：

- `notes:read`、`notes:write`、`notes:delete`
- 管理能力使用 `admin:*`（谨慎使用）
- 身份信息使用 `profile:read`

范围选择应遵循最小权限原则：现在需要什么就请求什么，需要更多时再逐步升级。

### 逐步升级授权（SEP-835）

用户授予 `notes:read`。他们后来要求智能体删除一条笔记。服务器响应：

```
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_scope",
    scope="notes:delete", resource="https://notes.example.com"
```

客户端看到 insufficient_scope 错误，向用户显示额外范围的同意对话框，为其执行迷你 OAuth 流程，然后使用新令牌重试请求。

### 令牌受众验证

每个请求：服务器检查 `token.aud == self.resource_url`。不匹配 = 401。这阻止了跨服务器令牌重用。

### 短期令牌和轮换

访问令牌**应该**短期有效（默认 1 小时）。刷新令牌在每次刷新时轮换。客户端在后台处理静默刷新。

### 无令牌传递

采样服务器（阶段 13 · 11）**不得**将客户端的令牌传递给其他服务。采样请求是边界。

### 防止混淆代理

令牌绑定到 `aud`。客户端绑定到 `client_id`。每个请求都针对两者进行验证。规范明确禁止了在预 MCP 远程工具生态系统中常见的旧的"传递令牌"模式。

### 客户端 ID 发现

每个 MCP 客户端在其固定 URL 发布元数据。授权服务器可以获取客户端的元数据文档以发现重定向 URI 和联系信息。这消除了手动客户端注册。

### 网关和 OAuth

阶段 13 · 17 展示了企业网关如何处理 OAuth：网关持有上游服务器的凭证，给客户端的令牌由网关颁发，上游令牌从不离开网关。这翻转了信任模型——用户只需向网关认证一次；网关处理 N 个服务器授权。

## 使用它

`code/main.py` 将完整的 OAuth 2.1 逐步升级流程模拟为状态机。它实现了：

- PKCE code-verifier / challenge 生成。
- 带资源指示器的授权码流程。
- 受保护资源元数据端点。
- 带受众检查的令牌验证。
- 对 `insufficient_scope` 的逐步升级。

本课没有 HTTP 服务器；状态机在内存中运行，因此您可以追踪每一步。阶段 13 · 17 的网关课程将其连接到实际的传输层。

## 交付

本课产出 `outputs/skill-oauth-scope-planner.md`。给定一个带有工具的远程 MCP 服务器，该技能设计范围集、钉选规则和逐步升级策略。

## 练习

1. 运行 `code/main.py`。追踪两个范围的逐步升级流程。注意逐步升级时哪些步骤会重复。

2. 添加刷新令牌轮换：每次刷新颁发一个新的刷新令牌并使旧令牌失效。模拟一个被盗的刷新令牌在轮换后使用，并确认它失败。

3. 使用 stdlib http.server 将受保护资源元数据端点实现为真实的 HTTP 响应。镜像第 09 课的 /mcp 端点。

4. 为 GitHub MCP 服务器设计范围层次结构：读取仓库、写入 PR、审批 PR、合并 PR、管理员。在每个级别之间使用逐步升级。

5. 阅读 RFC 8707 和 RFC 9728。找出 9728 中 MCP 使用方式与 RFC 示例不同的一个字段。（提示：涉及 `scopes_supported`。）

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| OAuth 2.1 | "现代 OAuth" | 强制要求 PKCE 并禁止隐式流的合并 RFC |
| PKCE | "持有证明" | 通过 code verifier + challenge 防御授权码拦截 |
| 资源指示器 (Resource indicator) | "令牌受众" | RFC 8707 `resource` 参数，将令牌钉到一个服务器 |
| 受保护资源元数据 (Protected-resource metadata) | "发现文档" | RFC 9728 `.well-known/oauth-protected-resource` |
| 逐步升级授权 (Step-up authorization) | "增量同意" | 按需添加范围的 SEP-835 流程 |
| `insufficient_scope` | "带 WWW-Authenticate 的 403" | 服务器信号，要求为更大范围重新同意 |
| 混淆代理 (Confused deputy) | "跨服务令牌重用" | 可信持有者不当转发令牌的攻击 |
| 短期令牌 (Short-lived token) | "访问令牌 TTL" | 快速过期的 Bearer 令牌；刷新令牌续期 |
| 范围层次结构 (Scope hierarchy) | "最小权限栈" | 级别间有逐步升级的渐进范围集 |
| 客户端 ID 元数据 (Client ID metadata) | "客户端发现文档" | 客户端发布自身 OAuth 元数据的 URL |

## 扩展阅读

- [MCP — Authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization) — 权威 MCP OAuth 配置
- [den.dev — MCP November authorization spec](https://den.dev/blog/mcp-november-authorization-spec/) — 2025-11-25 变更的讲解
- [RFC 8707 — Resource indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707) — 受众钉选的 RFC
- [RFC 9728 — OAuth 2.0 protected resource metadata](https://datatracker.ietf.org/doc/html/rfc9728) — 发现文档的 RFC
- [Aembit — MCP OAuth 2.1, PKCE and the future of AI authorization](https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/) — 实用的逐步升级流程讲解
