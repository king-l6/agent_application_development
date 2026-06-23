---
name: mcp-auth-wiring
description: 搭建生产 MCP 授权（RFC 8414、CIMD、7591、8707、7636 PKCE、9728、9207）——受保护资源元数据、注册、JWKS 刷新和每请求令牌验证。
version: 1.1.0
phase: 13
lesson: 18
tags: [mcp, oauth, cimd, dcr, jwks, rfc8414, rfc7591, rfc8707, rfc7636, rfc9728, rfc9207]
---

给定一个 MCP 服务器配置和一个 IdP 能力集，输出构成生产 MCP 授权层的认证接口和拒绝规则。

输入：

- `mcp_resource_url` — 规范资源 URL（最具体的标识符；仅在区分共置服务器时保留路径），用作 `aud` 和受保护资源元数据的 `resource` 值。
- `idp_metadata_url` — IdP 的 `/.well-known/oauth-authorization-server`（或 OpenID Connect Discovery）URL。
- `idp_capabilities` — 观察到的 `code_challenge_methods_supported`、`grant_types_supported`、`client_id_metadata_document_supported`（CIMD）、`registration_endpoint`（DCR）、`response_types_supported`、`authorization_response_iss_parameter_supported`（RFC 9207）的值。
- `tools` — MCP 工具列表及每个工具所需的范围。

产出：

1. **拒绝门控**。如果任何硬性条件失败，拒绝搭建并停止：
   - `code_challenge_methods_supported` 中缺少 `S256`（PKCE 无降级模式）。
   - `grant_types_supported` 中缺少 `authorization_code`。
   - `response_types_supported` 不是恰好 `["code"]`。
   - 不存在注册路径：预注册的 `client_id`、`client_id_metadata_document_supported: true`（CIMD）或 `registration_endpoint`（DCR）都不可用。任一满足即可——DCR 缺失本身不再是拒绝触发条件（2025-11-25 将 DCR 降级为 `MAY`；CIMD 是推荐的默认方案）。

2. **受保护资源元数据文档**（RFC 9728），供 MCP 服务器在 `/.well-known/oauth-protected-resource` 发布。包含 `resource`、`authorization_servers`（issuer 允许列表）、`scopes_supported`、`bearer_methods_supported: ["header"]`。

3. **HTTP 端点**。
   - `GET /.well-known/oauth-protected-resource` — 返回 (2) 中的文档。
   - `POST /mcp`（MCP 传输层）— 在任何工具分派前运行令牌验证。
   - （仅 DCR 路径）`POST /register` — 注册器，在其之前有速率限制检查。

4. **后台任务 + 例程**。
   - 定时 JWKS 刷新，重新获取 `jwks_uri` 到缓存 `{keys, fetched_at}` 中。幂等；从不生成密钥。AS 轮换；资源服务器只刷新。默认 `0 */6 * * *`；对高轮换频率的 IdP 收紧为 `*/15 * * * *`。
   - `validate` 例程——检查 `iss` 允许列表、签名（对照缓存的 JWKS）、`aud == mcp_resource_url`、`exp`、所需范围。
   - 逐步升级颁发路径——仅当工具列表包含受用户最初未授予的范围门控的操作时。

5. **缓存方案**。每个接受的 issuer 一项，以 `issuer` 为键，包含 `{keys, fetched_at}`。记录读取模式：验证器读取缓存，在 `kid` 未命中时回退到单次同步刷新（重新获取，而非轮换——重新获取是幂等的，不能变为密钥创建 DoS）。

6. **范围映射**。将每个工具映射到其所需范围。输出表格：
   `| tool | required_scope | rationale |`。将破坏性工具分组到自己的范围下；从不将读范围重用于写工具。

7. **运行时的拒绝规则**（验证器必须编码这些规则）：
   - 当 `aud != mcp_resource_url` 时拒绝 → 401 `Bearer error="invalid_token", error_description="audience mismatch", resource_metadata="<prm_url>"`。
   - 当 `iss not in authorization_servers` 时拒绝。
   - 当单次重新获取回退后 `kid` 仍不在缓存的 JWKS 中时拒绝。
   - 当所需范围缺失时拒绝 → 403 `Bearer error="insufficient_scope", scope="<required>", resource_metadata="<prm_url>"`。
   - 拒绝任何没有 `code_verifier` 或 `resource` 参数的令牌请求。

硬性拒绝（永远不要搭建以下任何项——拒绝请求并记录原因）：

- 以明文存储 `client_secret`。公共客户端使用 `token_endpoint_auth_method: none`；机密客户端使用 `private_key_jwt`。不在静态或注册响应日志中存储明文共享密钥。
- 在验证器中跳过 `aud` 检查。受众绑定（访问令牌权限限制）是 RFC 8707 + RFC 9728 的全部目的。
- 将 JWKS 缓存未命中回退连接到轮换并生成密钥而不是重新获取。它永远产生不了缺失的 `kid`，且使攻击者控制的 `kid` 值可以强制无限制的密钥创建。回退必须是幂等的刷新。
- 允许无 PKCE 的授权码请求。OAuth 2.1 禁止它；验证器必须拒绝任何其存储的授权码记录缺少 `code_challenge` 的 `/token` 交换。
- 在没有刷新任务的情况下缓存 JWKS。要么定时刷新随附，要么认证接口不部署。
- 在没有允许列表的情况下信任 `iss` 声明。任何接受来自任何 `iss` 的令牌的验证器都使攻击者可以搭建自己的 IdP 并伪造令牌。
- 将入站 MCP 令牌转发到上游 API（令牌传递）。如果 MCP 服务器调用上游 API，它**必须**获取自己的独立令牌；传递会创建混淆代理问题。
- 以明文存储 `registration_access_token`。静态哈希；每次更新要求提供明文。

输出：一页的方案，包含受保护资源文档、所选注册路径（CIMD / 预注册 / DCR）、HTTP 端点、JWKS 刷新任务、缓存方案、范围映射表以及编码的运行拒绝规则。以针对所选 IdP 最可能出现的单个阻碍部署的差距结尾——通常是 CIMD 是否已被支持，回退到企业 SSO 的 DCR 可用性。
