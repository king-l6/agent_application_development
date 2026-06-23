# 生产环境中的 MCP 认证 — 注册、JWKS 刷新、受众钉选令牌

> 第 16 课在内存中搭建了 OAuth 2.1 状态机。到 2026 年，你交付给真实组织的每个 MCP 服务器都将位于生产认证之后：可扩展到无限客户端群体的客户端注册（首先是客户端 ID 元数据文档，动态客户端注册作为向后兼容的备用方案）、授权服务器元数据发现（RFC 8414 **或** OpenID Connect Discovery）、不会在凌晨 3 点破坏令牌验证的 JWKS 缓存刷新，以及拒绝跨资源重放的受众钉选令牌。本课用三个角色——授权服务器、资源服务器（MCP 服务器）和客户端——对完整接口进行建模，让你可以追踪从发现到已验证工具调用的每一跳。
>
> **规范说明（2025-11-25）：** 2025 年 11 月的 MCP 授权规范将动态客户端注册从 `SHOULD` 降级为 `MAY`，并将**客户端 ID 元数据文档（CIMD）**设为推荐的默认注册机制。本课按规范的优先级顺序教授两者，代码保留 DCR 用于讲解，因为它在单个进程中完全自包含。

**类型：** 构建
**语言：** Python（标准库）
**前置知识：** 阶段 13 · 16（OAuth 2.1 状态机），阶段 13 · 17（网关）
**时间：** ~90 分钟

## 学习目标

- 通过 RFC 8414 元数据发现授权服务器并验证契约。
- 实现 RFC 7591 动态客户端注册，使 MCP 客户端无需管理员干预即可注册。
- 按计划缓存和刷新 JWKS 密钥，使签名验证能经受密钥轮换。
- 使用 RFC 8707 资源指示器将令牌钉到单个 MCP 资源，并拒绝混淆代理重用。
- 清晰分离三个角色——授权服务器、资源服务器、客户端——使每个角色只执行属于自己的检查。
- 阅读 IdP 能力矩阵，并在 IdP 无法满足 MCP 认证配置时拒绝部署。

## 问题

第 16 课的模拟器在内存中运行 OAuth 2.1。生产环境有三个内存模拟器看不到的运营缺口。

第一个缺口是注册。真实组织运行数百个 MCP 服务器和数千个 MCP 客户端。运维人员不会为每个 Cursor 用户手动注册 OAuth 客户端。2025-11-25 规范为客户端提供了解决此问题的优先级顺序：如果有预注册的 `client_id` 就使用它，否则使用**客户端 ID 元数据文档**（客户端用它控制的 HTTPS URL 标识自身，授权服务器**拉取**元数据），否则回退到 **RFC 7591 动态客户端注册**（客户端**推送** `POST /register` 并立即收到 `client_id`），否则提示用户。CIMD 是推荐默认方案，因为它在保持 DNS 根植信任模型的同时完全消除了按服务器注册的需求；DCR 保留用于向后兼容。两者都从授权服务器的元数据发现入口点：CIMD 使用 `client_id_metadata_document_supported`，DCR 使用 `registration_endpoint`。

第二个缺口是密钥轮换。JWT 验证依赖于授权服务器的签名密钥，以 JSON Web Key Set (JWKS) 形式发布。授权服务器按计划轮换这些密钥（通常每小时一次，事件响应时更快）。在启动时获取一次 JWKS 的 MCP 服务器在轮换窗口之前验证正常——然后每个请求都失败，直到重启。生产环境将 JWKS 作为缓存值，带有一个刷新任务，在先前密钥过期前覆盖缓存，外加缓存未命中时的回退获取，用于处理由比缓存更新的密钥签署的令牌到达的情况。

第三个缺口是受众绑定。第 16 课介绍了 RFC 8707 资源指示器。在生产环境中，该指示器成为每个请求上的硬性声明检查。MCP 服务器将 `token.aud` 与其自身规范资源 URL 进行比较，不匹配时返回 HTTP 401。这是防止上游 MCP 服务器（或持有本应用于一个服务器的令牌的恶意客户端）在同一个信任网格中针对另一个服务器重放该令牌的唯一防御。

本课将每个缺口映射到接口的一个具体部分。元数据文档是一个 HTTP 端点。JWKS 缓存刷新是一个定时任务加键值缓存。JWT 验证是资源服务器在分发任何工具前运行的例程。保持三个角色分离，每个角色只执行它拥有的检查：授权服务器颁发和轮换密钥，资源服务器缓存和验证，客户端发现和注册。

## 概念

### RFC 8414 — OAuth 授权服务器元数据

位于 `/.well-known/oauth-authorization-server` 的文档描述了客户端需要的一切：

```json
{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/token",
  "jwks_uri": "https://auth.example.com/.well-known/jwks.json",
  "registration_endpoint": "https://auth.example.com/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["mcp:tools.read", "mcp:tools.invoke"],
  "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"]
}
```

给定 MCP 资源 URL 的客户端链式发现：来自 RFC 9728 的 `oauth-protected-resource`（资源服务器的文档）命名了 issuer，然后 `oauth-authorization-server`（此 RFC）命名了每个端点。客户端从不硬编码授权 URL。

在信任用于 MCP 的 IdP 之前需要验证的契约：

- `code_challenge_methods_supported` 包含 `S256`（每 RFC 7636 的 PKCE）。规范明确：如果此字段**缺失**，则授权服务器不支持 PKCE，客户端**必须**拒绝继续。
- `grant_types_supported` 包含 `authorization_code` 并拒绝 `password` 和 `implicit`。
- 至少公布了一条注册路径：`client_id_metadata_document_supported: true`（CIMD，推荐）**或** `registration_endpoint`（RFC 7591 DCR，备用）。任一满足契约；你不再硬性要求 DCR。
- `response_types_supported` 对于 OAuth 2.1 恰好是 `["code"]`。

如果 `S256` 缺失，MCP 服务器拒绝针对此 IdP 部署——PKCE 没有降级模式。如果两条注册路径都没有公布且你没有预注册的 `client_id`，你也无法注册；部署清单有问题，不是代码。

### RFC 9728（回顾）— 受保护资源元数据

第 16 课涵盖了 RFC 9728。生产环境中的差异：这个文档是客户端查找**此** MCP 服务器信任的授权服务器的唯一位置。单个 MCP 服务器可能接受来自多个 IdP 的令牌（一个用于员工，一个用于合作伙伴）。RFC 9728 声明该集合；RFC 8414 记录每个 IdP 支持的内容。

```json
{
  "resource": "https://notes.example.com",
  "authorization_servers": ["https://auth.example.com", "https://partners.example.com"],
  "scopes_supported": ["mcp:tools.invoke"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://notes.example.com/docs"
}
```

### 客户端 ID 元数据文档（推荐默认方案）

CIMD 将注册从**推送**反转为**拉取**。客户端不是要求授权服务器生成 `client_id`，而是使用一个它控制的 HTTPS URL **作为**它的 `client_id`。该 URL 解析为 JSON 元数据文档；授权服务器在 OAuth 流程期间按需获取它。信任根植于 DNS：如果服务器运营商信任 `app.example.com`，它就信任从 `https://app.example.com/client.json` 提供的客户端。无注册往返，无 `client_id` 命名空间耗尽，无需要同步的按服务器状态。

客户端托管的元数据文档：

```json
{
  "client_id": "https://app.example.com/oauth/client.json",
  "client_name": "Example MCP Client",
  "client_uri": "https://app.example.com",
  "redirect_uris": ["http://127.0.0.1:7333/callback", "http://localhost:7333/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

文档中的 `client_id` 值**必须**等于它提供服务的 URL（授权服务器验证这一点；不匹配则拒绝）。授权服务器在其 RFC 8414 元数据中使用 `client_id_metadata_document_supported: true` 公布支持。

规范直言不讳的两个安全事实：

- **SSRF。** 授权服务器获取攻击者提供的 URL。它必须防御服务端请求伪造（不获取内部/管理端点）。
- **localhost 冒充。** CIMD 单独无法阻止本地攻击者声称合法客户端的元数据 URL 并绑定任何 `localhost` 重定向。授权服务器**必须**在同意时清晰显示重定向 URI 主机名，并且**应该**对仅 `localhost` 的重定向给出警告。

因为 CIMD 不需要服务端状态，所以不需要像 DCR 要求的那样搭建注册服务。客户端端是只读的：从静态 HTTPS 端点提供你的元数据文档，让授权服务器拉取它。

### RFC 7591 — 动态客户端注册（备用/向后兼容）

DCR 现在是 `MAY`，保留用于与 2025-11-25 之前的部署以及尚不支持 CIMD 的 IdP 向后兼容。没有它（也没有 CIMD 或预注册），每个 MCP 客户端（Cursor、Claude Desktop、自定义智能体）都需要与 IdP 管理员进行带外交换。使用 DCR，客户端发送：

```json
POST /register
Content-Type: application/json

{
  "redirect_uris": ["http://127.0.0.1:7333/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "mcp:tools.invoke",
  "client_name": "Cursor",
  "software_id": "com.cursor.cursor",
  "software_version": "0.42.0"
}
```

服务器响应 `client_id` 和用于后续更新的 `registration_access_token`：

```json
{
  "client_id": "c_3e7f1a",
  "client_id_issued_at": 1769472000,
  "redirect_uris": ["http://127.0.0.1:7333/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "registration_access_token": "regt_b2...",
  "registration_client_uri": "https://auth.example.com/register/c_3e7f1a"
}
```

`token_endpoint_auth_method: none` 是在用户设备上运行的 MCP 客户端的正确默认值。它们只获得 `client_id`——没有 `client_secret` 可被窃取。PKCE 提供了公共客户端所需的持有证明。

三个生产陷阱：

- 注册端点必须按源 IP 进行速率限制。没有这个，恶意行为者可以用脚本创建数百万个虚假注册，耗尽 `client_id` 命名空间。在注册器处理请求之前运行速率限制检查。
- 某些企业 IdP 要求 `software_statement`（为客户端担保的已签名 JWT）。本课的模拟跳过它；生产环境中连接一个验证步骤，拒绝来自 localhost 重定向 URI 之外的未签名注册。
- `registration_access_token` 必须存储为哈希值，而不是明文。如果此令牌被盗，攻击者可以重写客户端的重定向 URI。

### RFC 8707（回顾）— 资源指示器

第 16 课确立了基本形状。生产规则：每个令牌请求包含 `resource=<canonical-mcp-url>`，MCP 服务器在每个调用上验证 `token.aud` 是否匹配其自身的资源 URL。规范 URI 是服务器**最具体**的标识符：它使用小写 scheme 和 host，无 fragment，按惯例无尾部斜杠。路径组件**不**被规则剥离——当需要识别单个 MCP 服务器时，规范保留它。`https://mcp.example.com`、`https://mcp.example.com/mcp`、`https://mcp.example.com:8443` 和 `https://mcp.example.com/server/mcp` 都是有效的规范 URI。每个服务器选一个，将 `aud` 精确钉到那个。（本课的模拟为简洁使用裸主机受众如 `https://notes.example.com`；在同一源下共置多个 MCP 服务器的部署通过路径区分它们。）

### RFC 7636（回顾）— PKCE

PKCE 在 OAuth 2.1 中是强制性的。本课的授权码流程始终携带 `code_challenge` 和 `code_verifier`。服务器拒绝任何没有验证器或验证器哈希与存储的挑战不匹配的令牌请求。

### MCP 规范 2025-11-25 认证配置

MCP 规范（2025-11-25）精确规定了 MCP 服务器的授权层必须做什么：

- 实现 RFC 9728 受保护资源元数据，并通过 `WWW-Authenticate: Bearer resource_metadata="..."` 头部（在 401 上）**或** well-known URI `/.well-known/oauth-protected-resource`（SEP-985 使头部成为可选项，以 well-known 为备用）提供其位置。元数据的 `authorization_servers` 字段**必须**至少命名一个服务器。
- 仅通过 `Authorization: Bearer ...` 在每个**请求**上接受令牌——永远不在查询字符串中，也绝不仅仅在会话开始时验证。
- 对每个请求验证 `aud`、`iss`、`exp` 和所需范围。服务器**必须**验证令牌是专门为它颁发的（受众）；缺失或不匹配的 `aud` 被拒绝，从不视为通配符。
- 在 401/403 上，返回 `WWW-Authenticate: Bearer` 携带 `error=...`、`resource_metadata="<PRM-URL>"` 参数（元数据文档的 URL，**不是**裸资源），以及在 `insufficient_scope`（403）时携带 `scope="..."`。注意：该参数是 `resource_metadata`，一个发现指针——质询中没有 `resource` 参数。
- 授权服务器发现接受 **RFC 8414 OAuth 元数据**或 **OpenID Connect Discovery 1.0**；客户端必须按优先级顺序尝试两个 well-known 后缀。
- 客户端（而非服务器）防御**混叠攻击**：它在重定向前记录预期的 `issuer`，并在兑换码之前验证 `iss` 授权响应参数（RFC 9207）。PKCE 单独不足以阻止混叠，因为客户端将其 `code_verifier` 交给它被引导到的任何令牌端点。

OAuth 2.1 草案是基底；RFC 8414/7591/8707/9728/9207 + RFC 7636 + CIMD 是接口；MCP 规范是配置。

### IdP 能力矩阵

并非每个 IdP 都支持完整的 MCP 配置。下面的矩阵记录了截至 2025-11-25 规范的事实能力声明。它是一个**部署门控**，而非推荐。

CIMD 在 2025-11-25 规范中发布，底层 OAuth 草案仅在 2025 年 10 月被采纳，因此厂商支持仍在逐步到位——将下面的"CIMD"视为"截至当前的状态，在你的租户中验证"，而非永久声明。

| IdP 类别 | AS 元数据 (8414/OIDC) | CIMD | RFC 7591 DCR | RFC 8707 resource | RFC 7636 S256 PKCE | 备注 |
|----------|----------------------|------|-------------|-------------------|-------------------|------|
| 自托管 (Keycloak) | 是 | 新兴 | 是 | 是（自 24.x） | 是 | 本课 MCP 配置的参考 IdP；端到端完整 DCR 路径，CIMD 跟进新规范 |
| 企业 SSO (Microsoft Entra ID) | 是 | 新兴 | 是（高级版） | 是 | 是 | DCR 可用性因租户层级而异；部署前在目标租户中验证 |
| 企业 SSO (Okta) | 是 | 新兴 | 是（Okta CIC / Auth0） | 是 | 是 | DCR 在 Auth0（现为 Okta CIC）上可用；经典 Okta 组织需要管理员预注册 |
| 社交登录 IdP（通用） | 各异 | 否 | 极少 | 极少 | 是 | 大多数社交 IdP 将客户端视为静态合作伙伴；无自助注册。仅用作身份源，在其上构建你自己的 MCP 感知授权服务器 |
| 自定义/自建 | 取决于 | 取决于 | 取决于 | 取决于 | 取决于 | 如果你自己交付，交付完整配置并优先使用 CIMD。跳过 PKCE 或受众绑定会破坏 MCP 认证契约 |

部署清单的拒绝规则：如果所选 IdP 未在 `code_challenge_methods_supported` 中列出 `S256`，MCP 服务器拒绝启动——PKCE 没有降级模式。注册是较软的门控：你需要**一条**工作路径（预注册的 `client_id`、`client_id_metadata_document_supported: true` 或 `registration_endpoint`）。DCR 缺失本身不再是拒绝触发条件，因为 CIMD 或预注册可以覆盖。

### JWKS 刷新模式（授权服务器轮换，资源服务器刷新）

区分两个动词，因为混淆它们是真实的生产错误：

- **轮换**是**授权服务器**做的事情：生成新的签名密钥，在 JWKS 中发布，稍后淘汰旧密钥。资源服务器不参与也不能做这个——它不持有 IdP 的私钥。
- **刷新**是**资源服务器**做的事情：重新 `GET` 已发布的 JWKS 到其缓存中。这是资源服务器执行的唯一 JWKS 操作。

生产的故障模式是过期缓存。通过定时刷新任务加键值缓存来解决。资源服务器运行一个任务（cron、timer，无论你的运行时提供什么），在固定间隔上获取 `<issuer>/.well-known/jwks.json` 并覆盖 `cache[issuer] = {keys, fetched_at}`。验证器从该缓存读取。其 `kid` 在缓存中缺失的令牌触发**一次**同步刷新作为回退，然后重新检查。这同时处理两种情况：定时刷新，以及由全新密钥签署的令牌在下次定时刷新之前到达的密钥重叠窗口。

回退**必须是重新获取，绝不是轮换**。如果你将缓存未命中路径连接到轮换并生成密钥，两件事会损坏：(1) 生成的新密钥产生的 `kid` **仍然**不匹配令牌，所以查找仍然失败；(2) 攻击者用随机 `kid` 值喷射令牌，迫使无限制的密钥创建——一种自残的 DoS。重新获取是幂等的，所以伪造的 `kid` 最多浪费一次获取。

缓存形状：

```json
{
  "https://auth.example.com": {
    "keys": [
      {"kid": "k_2026_03", "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256", "use": "sig"},
      {"kid": "k_2026_04", "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256", "use": "sig"}
    ],
    "fetched_at": 1772668800
  }
}
```

同时存在两个密钥是稳态。授权服务器通过引入下一个密钥（`k_2026_04`）然后淘汰前一个（`k_2026_03`）来进行轮换，因此在旧密钥下颁发的令牌在它们过期前保持有效。缓存持有并集；验证器按 `kid` 选择。

### 验证例程

MCP 服务器在分派任何工具前运行验证。`code/main.py` 使用的形状：

```python
result = server.validate(bearer_token, required_scope="mcp:tools.invoke")
if not result["valid"]:
    return {"status": result["status"], "WWW-Authenticate": result["www_authenticate"]}
```

`validate` 解码 JWT，从 JWKS 缓存解析签名密钥（在未命中时刷新一次），验证签名，然后对照允许列表检查 `iss`，对照此服务器的规范资源检查 `aud`，检查 `exp` 和所需范围——在第一次失败时返回 `WWW-Authenticate` 质询。在资源服务器上将其保持为单个例程意味着每个入口点（每次工具调用、每个传输层）都经过相同的检查；没有任何路径可以在不先验证的情况下到达工具。

### 受众重放讲解（访问令牌权限限制）

服务器 A（`notes.example.com`）和服务器 B（`tasks.example.com`）都向同一授权服务器注册。服务器 A 被攻破。攻击者获取用户的笔记令牌并针对服务器 B 重放它。

服务器 B 的验证器：

1. 解码 JWT，按 `kid` 获取 JWKS，验证签名。
2. 检查 `iss` 是否在其受保护资源元数据的 `authorization_servers` 中。（通过——同一 IdP。）
3. 检查 `aud == "https://tasks.example.com"`。（失败——令牌的 `aud` 是 `https://notes.example.com`。）
4. 返回 401 并附带 `WWW-Authenticate: Bearer error="invalid_token", error_description="audience mismatch", resource_metadata="https://tasks.example.com/.well-known/oauth-protected-resource"`。

受众声明是在协议层防御此攻击的唯一手段。为性能跳过它是最常见的生产错误；验证器必须在每个请求上运行，不仅仅在会话开始时。规范称此为**访问令牌权限限制**：MCP 服务器**必须**拒绝任何未在受众中命名它的令牌。

> **命名说明。** 规范保留术语*混淆代理*用于一个相关但不同的问题：MCP 服务器作为 OAuth **代理**到第三方 API，使用静态客户端 ID，转发令牌而未获得按客户端用户同意。受众绑定修复了上述重放；混淆代理的修复是按客户端同意**加上**永不将传入令牌传递给上游 API（MCP 服务器**必须**获取自己的独立上游令牌）。

### 混叠攻击（客户端侧防御，服务器无法提供）

客户端在其生命周期中与许多授权服务器通信。恶意 AS 可以尝试使客户端在攻击者的令牌端点兑换诚实 AS 的授权码。受众绑定在这里无济于事——攻击发生在任何令牌存在之前。防御在客户端侧（RFC 9207）：

1. 在重定向之前，客户端记录来自已验证 AS 元数据的预期 `issuer`。
2. 在授权响应上，客户端在将代码发送到任何地方之前，将返回的 `iss` 参数与该记录的 issuer 进行比较（简单字符串比较，无标准化）。
3. 不匹配（或当 AS 公布了 `authorization_response_iss_parameter_supported` 但 `iss` 缺失）→ 拒绝，甚至不显示 `error` 字段。

PKCE 单独不足以阻止混叠，因为客户端将其 `code_verifier` 交给它被引导到的任何令牌端点。这就是为什么规范在每个请求上记录 issuer 以及 PKCE 验证器和 `state`。

### 故障模式

- **过期的 JWKS。** AS 轮换密钥后，验证器拒绝有效令牌。修复方法是上面的 cron 刷新 + 缓存未命中重新获取模式。切勿在没有刷新任务的情况下缓存 JWKS。
- **将轮换用作回退。** 将缓存未命中路径连接到轮换并生成密钥而不是重新获取是一个真实的错误：它从未产生缺失的 `kid`，且将攻击者控制的 `kid` 值变成密钥创建 DoS。回退必须是幂等的 `refresh-jwks`。
- **缺少 `aud` 声明。** 某些 IdP 默认省略 `aud`，除非令牌请求中存在 `resource`。验证器必须拒绝缺少 `aud` 的令牌，而不是将缺失视为通配符。
- **通过缺少 `iss` 检查的混叠。** 未验证 RFC 9207 `iss` 授权响应参数与重定向前记录的 issuer 对等的客户端可以被引导在攻击者的令牌端点兑换诚实 AS 的代码。这是一个客户端侧故障；资源服务器无法补偿。
- **范围升级竞争。** 同一用户的两个并发逐步升级流程都可以成功并产生具有不同范围的两个访问令牌。验证器必须使用请求上呈现的令牌，而不是查找"用户当前范围"——那会创建一个 TOCTOU 窗口。
- **注册令牌盗窃。** 泄露的 `registration_access_token` 使攻击者可以重写重定向 URI。对这些令牌进行静态哈希；要求客户端在每次更新时呈现明文；在怀疑时轮换。
- **`iss` 未钉选。** 接受任何 `iss` 的验证器使攻击者可以搭建自己的授权服务器，为目标受众注册客户端，并颁发令牌。受保护资源元数据的 `authorization_servers` 列表是允许列表；强制执行它。

## 使用它

`code/main.py` 使用标准库 Python 和三个角色——`AuthorizationServer`、`ResourceServer` 和 `Client`——走通完整的生产流程。流程：

1. 授权服务器在 `/.well-known/oauth-authorization-server` 发布 RFC 8414 元数据。
2. MCP 客户端调用元数据端点并检查其注册选项（用于 CIMD 的 `client_id_metadata_document_supported`，用于 DCR 的 `registration_endpoint`）和 `S256` PKCE 支持。
3. 讲解走 DCR 回退路径：客户端 POST 到 `/register`（RFC 7591）并收到 `client_id`。（CIMD 客户端会改为呈现自己的 HTTPS `client_id` URL 并跳过此步骤。）
4. MCP 客户端运行受 PKCE 保护的授权码流程（RFC 7636），带有 `resource` 指示器（RFC 8707）。
5. MCP 客户端使用 `Authorization: Bearer ...` 调用 MCP 服务器上的工具。
6. MCP 服务器运行 `validate`，从 JWKS 缓存解析签名密钥。
7. IdP 轮换密钥；定时刷新重新将 JWKS 拉取到缓存中。
8. 下一次调用针对刷新后的密钥进行验证，无需重启，且先前的令牌在重叠窗口期间仍然有效。
9. 针对不同 MCP 资源的受众重放尝试获得 401，附带 `audience mismatch` 和 `resource_metadata` 指针。

此处的 JWT 使用带有共享密钥的 HS256（因此本课仅在标准库上运行）。生产环境使用 RS256 或 EdDSA 以及上述 JWKS 模式；验证逻辑在其他方面相同。因为 IdP 和资源服务器生活在同一个进程中，`refresh_jwks` 直接读取授权服务器的密钥列表；通过网络，它是一个对 `jwks_uri` 的 HTTP `GET`。

## 交付

本课产出 `outputs/skill-mcp-auth.md`。给定一个 MCP 服务器配置和一个 IdP 能力集，该技能输出要搭建的认证接口——受保护资源元数据、要使用的注册路径（CIMD、预注册或 DCR 备用）、JWKS 刷新计划、范围映射，以及在 IdP 不支持完整 RFC 配置时应用的拒绝规则。

## 练习

1. 运行 `code/main.py`。追踪流程。注意 IdP 如何在步骤 6 轮换密钥、定时 `refresh_jwks` 如何重新拉取已发布的集合，以及旧令牌（重叠窗口）和新令牌如何无需重启即可验证。

2. 在受保护资源元数据的 `authorization_servers` 列表中添加一个新的 IdP。颁发一个由新 IdP 签署的令牌，确认验证器接受它。颁发一个由未列出的 IdP 签署的令牌，确认验证器拒绝并返回 `WWW-Authenticate: Bearer error="invalid_token", error_description="iss not allowed"`。

3. 在 `register_client` 中添加一个速率限制检查，在注册器接受请求之前运行。使用每个源 IP 的令牌桶，保存在以 IP 为键的小型字典中。

4. 阅读 RFC 7591 并找出本课 `/register` 处理程序未验证的两个字段。添加验证。（提示：`software_statement` 和 `redirect_uris` URI scheme。）

5. 添加一个客户端 ID 元数据文档路径。提供一个 `client.json`，其 `client_id` 等于它自己的 URL，并让授权服务器获取并验证它（如果 `client_id` ≠ URL 则拒绝）。确认 CIMD 客户端无需 `register_client` 调用即可注册。

6. 证明 DoS 修复。向验证器发送一个带有随机 `kid` 的令牌，确认 `refresh_jwks` 最多运行一次且授权服务器的密钥计数不增长。然后故意将回退重新连接到轮换并生成密钥，观察每个伪造令牌的密钥计数攀升——之后恢复为重新获取。

7. 实现混叠部分中的客户端侧 RFC 9207 `iss` 检查：在授权请求前记录预期的 issuer，然后拒绝 `iss` 不匹配的授权响应。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| ASM | "OAuth 元数据文档" | RFC 8414 `/.well-known/oauth-authorization-server` JSON |
| CIMD | "客户端元数据 URL" | 客户端 ID 元数据文档——用作 `client_id` 的 HTTPS URL；AS 拉取 JSON。2025-11-25 起推荐默认方案 |
| DCR | "自助客户端注册" | RFC 7591 `POST /register` 流程；2025-11-25 降级为 `MAY` 备用方案 |
| JWKS | "用于 JWT 验证的公钥" | JSON Web Key Set，从 `jwks_uri` 获取，按 `kid` 索引 |
| 轮换 vs 刷新 | "更新密钥" | *轮换* = AS 生成/淘汰签名密钥；*刷新* = 资源服务器重新获取已发布的集合。资源服务器只刷新 |
| 资源指示器 (Resource indicator) | "受众参数" | RFC 8707 `resource` 参数，将令牌钉到一个服务器 |
| `aud` 声明 | "受众" | JWT 声明，验证器将其与规范资源 URL 进行比较 |
| 受众重放 (Audience replay) | "令牌重放" | 为服务器 A 颁发的令牌被呈现给服务器 B；通过受众验证防御（规范：访问令牌权限限制） |
| 混淆代理 (Confused deputy) | "代理令牌误用" | 具有静态客户端 ID 的 MCP 代理，在没有按客户端同意的情况下转发令牌；与受众重放不同 |
| 混叠攻击 (Mix-up attack) | "错误的令牌端点" | 客户端被引导在攻击者的端点兑换诚实 AS 的代码；通过客户端侧 RFC 9207 `iss` 防御 |
| `iss` 允许列表 | "受信任的授权服务器" | 受保护资源元数据的 `authorization_servers` 中命名的集合 |
| `resource_metadata` | "在哪里找到 PRM 文档" | `WWW-Authenticate` 参数，在 401/403 上命名 RFC 9728 元数据 URL |
| 公共客户端 (Public client) | "原生或浏览器客户端" | 没有 `client_secret` 的 OAuth 客户端；PKCE 补偿 |
| `WWW-Authenticate` | "401/403 响应头部" | 携带 `Bearer error=...` 指令，驱动客户端恢复 |

## 扩展阅读

- [MCP — Authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — 本课实现的 MCP 认证配置
- [MCP blog — One Year of MCP: November 2025 Spec Release](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/) — 2025-11-25 的变化（CIMD、XAA、DCR 降级）
- [Aaron Parecki — Client Registration in the November 2025 MCP Authorization Spec](https://aaronparecki.com/2025/11/25/1/mcp-authorization-spec-update) — CIMD 优于 DCR 的理由
- [OAuth Client ID Metadata Document (draft-ietf-oauth-client-id-metadata-document-00)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00) — CIMD
- [RFC 8414 — OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414) — 发现契约
- [RFC 7591 — OAuth 2.0 Dynamic Client Registration Protocol](https://datatracker.ietf.org/doc/html/rfc7591) — DCR（回退路径）
- [RFC 7636 — Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636) — 公共客户端持有证明
- [RFC 8707 — Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707) — 受众钉选
- [RFC 9728 — OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728) — 资源服务器发现
- [RFC 9207 — OAuth 2.0 Authorization Server Issuer Identification](https://datatracker.ietf.org/doc/html/rfc9207) — 防御混叠攻击的 `iss` 参数
- [OAuth 2.1 draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1) — 合并的 OAuth 基底
