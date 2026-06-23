---
name: oauth-scope-planner
description: 为远程 MCP 服务器设计 OAuth 2.1 范围集、钉选规则和逐步升级策略。
version: 1.0.0
phase: 13
lesson: 16
tags: [oauth, pkce, resource-indicators, step-up, sep-835]
---

给定一个带有工具列表的远程 MCP 服务器，设计授权模型。

产出：

1. **范围层次结构**。渐进的范围集（例如 `read` -> `write` -> `delete` -> `admin`）。每个操作类别一个范围；不要将范围集膨胀。
2. **范围到工具映射**。每个工具标注其所需范围。标记任何需要多个范围的工具。
3. **逐步升级策略**。哪些操作需要逐步升级而非初始同意。典型情况：破坏性操作需要逐步升级。
4. **资源指示器值**。`resource` 参数中使用的规范 URL。确保 URL 与 `.well-known/oauth-protected-resource` 的 resource 字段匹配。
5. **受保护资源元数据**。起草包含 `authorization_servers`、`scopes_supported` 和 `resource` 的 `.well-known/oauth-protected-resource` JSON。

硬性拒绝：
- 任何需要 admin 范围但没有显式确认对话框就被调用的工具。需要逐步升级。
- 任何覆盖多于一个操作类别的范围。权限蔓延。
- 任何跳过受众验证的服务器。混淆代理漏洞。

拒绝规则：
- 如果服务器是本地（stdio）的，拒绝 OAuth 并说明 stdio 继承父进程信任。
- 如果服务器依赖于旧版 OAuth 2.0 隐式流，拒绝并要求迁移到 2.1 + PKCE。
- 如果用户要求"仅 API 密钥"认证，对于远程服务器拒绝；要求 OAuth 2.1 授权码 + PKCE 及资源指示器进行用户授权访问。客户端凭证仅适用于无人参与的机器对机器场景。

输出：一页的授权计划，包含范围层次结构、范围到工具映射、逐步升级策略、资源指示器以及受保护资源元数据 JSON。以用户首次遇到时最可能感到意外的逐步升级操作结尾。
