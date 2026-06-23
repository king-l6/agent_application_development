---
name: mcp-transport-migrator
description: 生成从遗留 HTTP+SSE 到 Streamable HTTP 的迁移计划，包含会话 ID 连续性和 Origin 验证。
version: 1.0.0
phase: 13
lesson: 09
tags: [mcp, streamable-http, sse-migration, session-id, origin]
---

给定一个现有的 HTTP+SSE（遗留）MCP 服务器，生成到单端点 Streamable HTTP 的迁移计划。

生成内容：

1. 端点重写。将 `/messages` 和 `/sse` 合并为一个 `/mcp`。将 POST 映射到请求处理，GET 映射到 SSE 流，DELETE 映射到会话终止。
2. 会话连续性。在第一次 POST 时生成新的 `Mcp-Session-Id`。拒绝客户端提供的 ID。如果客户端首先发送了遗留的会话 cookie，保留桥接逻辑。
3. Origin 验证。将明确的生产来源（`https://app.company.com`、`https://claude.ai`、localhost 变体）加入白名单。拒绝所有其他来源并返回 403。
4. last-event-id 重放。为每个会话维护一个最近事件的环形缓冲区，以便重新连接时能够恢复。
5. 弃用窗口。记录切换日期和一个 60 天的宽限期，期间遗留端点以 301 重定向到新端点并附带警告头。

硬性拒绝：
- 任何使两个端点无限期存活的计划。遗留 SSE 将在 2026 年被移除。
- 任何由客户端生成会话 ID 的计划。违反了密码学随机性要求。
- 任何没有 Origin 验证的计划。存在 DNS 重绑定漏洞。

拒绝规则：
- 如果服务器仅限本地使用（stdio），拒绝迁移到 HTTP；stdio 对于本地是正确的选择。
- 如果服务器尚未提供 OAuth，先完成阶段 13 · 16 再公开暴露。
- 如果托管目标不支持长连接 HTTP（例如 Vercel 免费层），拒绝并推荐 Cloudflare Workers。

输出：一份迁移运行手册，包含端点变更、Origin 白名单、会话 ID 计划、弃用时间表，以及涵盖 initialize、tools/list、流式通知、带 last-event-id 的重新连接和显式 DELETE 的测试清单。
