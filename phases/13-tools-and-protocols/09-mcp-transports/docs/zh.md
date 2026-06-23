# MCP 传输 — stdio 对比 Streamable HTTP 对比 SSE 迁移

> stdio 只在本地工作，其他地方都不行。Streamable HTTP（2025-03-26）是远程标准。旧的 HTTP+SSE 传输已被弃用，将在 2026 年中期移除。选错传输方式需要一次迁移；选对则能获得一个可远程部署的 MCP 服务器，具备会话连续性和 DNS 重绑定防护。

**类型：** 学习
**语言：** Python（标准库，Streamable HTTP 端点骨架）
**前置知识：** 阶段 13 · 07、08（MCP 服务器和客户端）
**时间：** ~45 分钟

## 学习目标

- 根据部署形态（本地 vs 远程、单进程 vs 集群）在 stdio 和 Streamable HTTP 之间做出选择。
- 实现 Streamable HTTP 单端点模式：POST 用于请求，GET 用于会话流。
- 实施 `Origin` 验证和会话 ID 语义，以抵御 DNS 重绑定攻击。
- 在 2026 年中截止日期之前，将遗留的 HTTP+SSE 服务器迁移到 Streamable HTTP。

## 问题

第一个 MCP 远程传输（2024-11）是 HTTP+SSE：两个端点，一个用于客户端的 POST，另一个用于服务器到客户端流的 Server-Sent-Events 通道。它能工作，但也存在缺陷：每个会话两个端点，某些 CDN 前端的缓存机制会失效，以及对长连接 SSE 的硬依赖——一些 WAF 会激进地终止这些连接。

2025-03-26 规范用 Streamable HTTP 取代了它：一个端点，POST 用于客户端请求，GET 用于建立会话流，两者共享一个 `Mcp-Session-Id` 头。此后构建或迁移的所有服务器都使用 Streamable HTTP。旧的 SSE 模式正在被弃用——Atlassian Rovo 于 2026 年 6 月 30 日移除了它；Keboola 于 2026 年 4 月 1 日移除了它；大多数剩余的企业服务器将在 2026 年底前移除。

而 stdio 对于本地服务器仍然很重要。Claude Desktop、VS Code 和所有 IDE 风格的客户端通过 stdio 启动服务器。正确的思维模型是：stdio 用于"本机"，Streamable HTTP 用于"通过网络"。没有交叉。

## 概念

### stdio

- 子进程传输。客户端启动服务器，通过 stdin/stdout 通信。
- 每行一个 JSON 对象。换行符分隔。
- 无会话 ID；进程身份就是会话。
- 无需认证（子进程继承父进程的信任边界）。
- 绝不要用于远程服务器——你需要 SSH 或 socat 来建立隧道，既然那样，不如使用 Streamable HTTP。

### Streamable HTTP

单个端点 `/mcp`（或任何路径）。支持三种 HTTP 方法：

- **POST /mcp。** 客户端发送 JSON-RPC 消息。服务器回复单个 JSON 响应，或一个包含一个或多个响应的 SSE 流（适用于批量响应和与该请求相关的通知）。
- **GET /mcp。** 客户端打开一个长连接 SSE 通道。服务器用它发送服务器到客户端的请求（采样、通知、引导）。
- **DELETE /mcp。** 客户端显式终止会话。

会话由 `Mcp-Session-Id` 头标识，该头由服务器在第一个响应中设置，客户端在每个后续请求中回传。会话 ID 必须是密码学随机的（128 位以上）；为安全起见，拒绝客户端自选的 ID。

### 单端点 vs 双端点

旧规范中的双端点模式在 2026 年仍然可调用——规范将其声明为"遗留兼容"。但所有新服务器应该使用单端点。官方 SDK 生成单端点；只有与未迁移的远程服务器通信时才使用遗留模式。

### `Origin` 验证和 DNS 重绑定

浏览器不是 MCP 客户端（目前），但攻击者可以构建一个网页，诱使浏览器向 `localhost:1234/mcp` 发起 POST——即用户本地 MCP 服务器监听的地址。如果服务器不检查 `Origin`，浏览器的同源策略也无法提供保护，因为 `Origin: http://evil.com` 是有效的跨域请求。

2025-11-25 规范要求服务器拒绝 `Origin` 不在白名单中的请求。白名单通常包含 MCP 客户端宿主（`https://claude.ai`、`vscode-webview://*`）以及用于本地 UI 的 localhost 变体。

### 会话 ID 生命周期

1. 客户端发送第一个请求，不携带 `Mcp-Session-Id`。
2. 服务器分配一个随机 ID，在响应头中设置 `Mcp-Session-Id`。
3. 客户端在所有后续请求和 `GET /mcp` 流中回传该头。
4. 服务器可以吊销会话；客户端在后续请求中看到 404，必须重新初始化。
5. 客户端可以显式 DELETE 会话以实现干净的关闭。

### 保活和重新连接

SSE 连接会断开。客户端通过使用相同的 `Mcp-Session-Id` 重新发起 GET 来重建连接。服务器必须对中断期间错过的事件进行排队（在合理窗口内），并通过客户端回传的 `last-event-id` 头进行重放。

阶段 13 · 13 涵盖任务（Tasks），它允许长时间运行的工作即使在全会话重连后也能存活。

### 向后兼容探测

希望同时支持新旧服务器的客户端：

1. 向 `/mcp` 发送 POST。
2. 如果响应是 `200 OK` 并带有 JSON 或 SSE，这是 Streamable HTTP。
3. 如果响应是 `200 OK` 且 `Content-Type: text/event-stream` 并带有一个指向辅助端点的 `Location` 头，这是遗留的 HTTP+SSE；跟随 `Location`。

### Cloudflare、ngrok 和托管

2026 年的生产级远程 MCP 服务器运行在 Cloudflare Workers（配合其 MCP Agents SDK）、Vercel Functions 或容器化的 Node/Python 上。关键点：你的托管方案必须支持 SSE GET 长连接 HTTP。Vercel 的免费层上限为 10 秒，不适合。Cloudflare Workers 支持无限流。

### 网关组合

当你通过网关（阶段 13 · 17）前置多个 MCP 服务器时，网关是一个单一的 Streamable HTTP 端点，重写会话 ID 并在上游进行多路复用。工具在网关层合并；客户端看到一个单一的逻辑服务器。

### 传输故障模式

- **stdio SIGPIPE。** 子进程在写入过程中死亡会引发 SIGPIPE；服务器应干净退出。客户端应检测到 EOF 并将会话标记为死亡。
- **HTTP 502 / 504。** Cloudflare、nginx 和其他代理在上游故障时发出这些错误。Streamable HTTP 客户端应在短时回退后重试一次。
- **SSE 连接断开。** TCP RST、代理超时或客户端网络变更关闭了流。客户端使用 `Mcp-Session-Id` 和可选的 `last-event-id` 重新连接以恢复。
- **会话吊销。** 服务器使会话 ID 失效；客户端在下一个请求上看到 404。客户端必须重新握手。
- **时钟偏差。** 客户端上的资源 TTL 计算与服务器偏离。客户端应将服务器时间戳视为权威。

### 何时绕过 Streamable HTTP

一些企业在自己的网络内部通过 gRPC 或消息队列传输部署 MCP 服务器。这不是标准做法——MCP 规范并未正式定义这些传输方式。网关可以向 MCP 客户端暴露 Streamable HTTP 接口，同时内部使用 gRPC。保持外部接口符合规范；网关负责转换。

## 使用

`code/main.py` 使用 `http.server`（标准库）实现了一个最小的 Streamable HTTP 端点。它在 `/mcp` 上处理 POST、GET 和 DELETE，在第一个响应中设置 `Mcp-Session-Id`，验证 `Origin`，并拒绝来自非白名单来源的请求。该处理器复用了课程 07 笔记服务器的分发逻辑。

注意要点：

- POST 处理器读取 JSON-RPC 请求体，分发，然后写入 JSON 响应（这是单响应变体；SSE 变体结构类似）。
- `Origin` 检查拒绝了默认的 `http://evil.example` 探测，但接受了 `http://localhost`。
- 会话 ID 是随机的 128 位十六进制字符串；服务器在内存中维护每个会话的状态。

## 交付

本课程产出 `outputs/skill-mcp-transport-migrator.md`。给定一个 HTTP+SSE（遗留）MCP 服务器，该技能会生成一个迁移计划，迁移到具备会话 ID 连续性、Origin 检查和向后兼容探测支持的 Streamable HTTP。

## 练习

1. 运行 `code/main.py`。从 `curl` 发送一个 `initialize` 的 POST 请求，观察 `Mcp-Session-Id` 响应头。发送第二个 POST 请求并回传该头，验证会话连续性。

2. 添加一个打开 SSE 流的 GET 处理器。每五秒发送一个 `notifications/progress` 事件。通过使用相同的会话 ID 重新发起 GET 来重新连接，并确认服务器接受该请求。

3. 实现 `last-event-id` 重放逻辑。在重连时，重放自该 ID 以来产生的所有事件。

4. 扩展 `Origin` 验证以支持通配符模式（`https://*.example.com`），确认它接受 `https://app.example.com` 但拒绝 `https://evil.example.com.attacker.net`。

5. 从官方注册表中找一个遗留的 HTTP+SSE 服务器（有几个），并设计迁移方案：端点处理、会话 ID 生成和头语义需要哪些更改。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| stdio 传输 | "本地子进程" | JSON-RPC 通过 stdin/stdout，换行符分隔 |
| Streamable HTTP | "远程传输" | 单端点 POST + GET + 可选 SSE，2025-03-26 规范 |
| HTTP+SSE | "遗留模式" | 双端点模式，2026 年中期被移除 |
| `Mcp-Session-Id` | "会话头" | 服务器分配的随机 ID，每个后续请求回传 |
| `Origin` 白名单 | "DNS 重绑定防御" | 拒绝 Origin 未获批准的请求 |
| 单端点 | "一个 URL" | `/mcp` 处理所有会话操作的 POST / GET / DELETE |
| `last-event-id` | "SSE 重放" | 用于恢复断开的流且不丢失事件的头部 |
| 向后兼容探测 | "新旧检测" | 客户端根据响应形态自动选择传输方式 |
| 长连接 HTTP | "SSE 流式传输" | 服务器在单个 TCP 连接上推送数分钟或数小时的事件 |
| 会话吊销 | "强制重新初始化" | 服务器使会话 ID 失效；客户端必须再次握手 |

## 延伸阅读

- [MCP — Basic transports spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) — stdio 和 Streamable HTTP 的标准参考
- [MCP — Basic transports spec 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — 引入 Streamable HTTP 的修订版
- [Cloudflare — MCP transport](https://developers.cloudflare.com/agents/model-context-protocol/transport/) — Workers 托管的 Streamable HTTP 模式
- [AWS — MCP transport mechanisms](https://builder.aws.com/content/35A0IphCeLvYzly9Sw40G1dVNzc/mcp-transport-mechanisms-stdio-vs-streamable-http) — 不同部署形态下的对比
- [Atlassian — HTTP+SSE deprecation notice](https://community.atlassian.com/forums/Atlassian-Remote-MCP-Server/HTTP-SSE-Deprecation-Notice/ba-p/3205484) — 具体的迁移截止日期示例
