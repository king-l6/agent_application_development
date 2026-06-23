# MCP Apps — 通过 `ui://` 实现交互式 UI 资源

> 纯文本的工具输出限制了智能体所能展示的内容。MCP Apps（SEP-1724，2026 年 1 月 26 日正式发布）让工具可以返回在 Claude Desktop、ChatGPT、Cursor、Goose 和 VS Code 中内联渲染的沙箱化交互式 HTML。仪表盘、表单、地图、3D 场景，全部通过一个扩展实现。本课讲解 `ui://` 资源方案、`text/html;profile=mcp-app` MIME 类型、iframe-sandbox postMessage 协议，以及服务器渲染 HTML 带来的安全面。

**类型：** 构建
**语言：** Python（标准库，UI 资源发射器），HTML（示例应用）
**前置知识：** 阶段 13 · 07（MCP 服务器），阶段 13 · 10（资源）
**时间：** ~75 分钟

## 学习目标

- 从工具调用返回 `ui://` 资源，并设置正确的 MIME 和元数据。
- 使用 `_meta.ui.resourceUri`、`_meta.ui.csp` 和 `_meta.ui.permissions` 声明工具的关联 UI。
- 实现用于 UI 与主机通信的 iframe sandbox postMessage JSON-RPC。
- 应用防御 UI 发起攻击的 CSP 和权限策略默认值。

## 问题

2025 年时代的 `visualize_timeline` 工具只能返回"这里有按时间顺序组织的 14 条笔记：……"。这只是一个段落。用户实际想要的是交互式时间线。在 MCP Apps 之前，选项只有：特定于客户端的 Widget API（Claude artifacts、OpenAI Custom GPT HTML），或者根本没有 UI。

MCP Apps（SEP-1724，2026 年 1 月 26 日发布）标准化了契约。工具结果包含一个 `resource`，其 URI 为 `ui://...`，MIME 类型为 `text/html;profile=mcp-app`。主机将其渲染在沙箱化的 iframe 中，带有受限的 CSP，除非明确授权否则不允许网络访问。iframe 内部的 UI 通过一个微型的 postMessage JSON-RPC 方言向主机发送消息。

每个兼容的客户端（Claude Desktop、ChatGPT、Goose、VS Code）都以相同的方式渲染相同的 `ui://` 资源。一个服务器，一个 HTML 包，通用 UI。

## 概念

### `ui://` 资源方案

工具返回：

```json
{
  "content": [
    {"type": "text", "text": "这是您的笔记时间线："},
    {"type": "ui_resource", "uri": "ui://notes/timeline"}
  ],
  "_meta": {
    "ui": {
      "resourceUri": "ui://notes/timeline",
      "csp": {
        "defaultSrc": "'self'",
        "scriptSrc": "'self' 'unsafe-inline'",
        "connectSrc": "'self'"
      },
      "permissions": []
    }
  }
}
```

然后主机在 `ui://notes/timeline` URI 上调用 `resources/read` 并获取：

```json
{
  "contents": [{
    "uri": "ui://notes/timeline",
    "mimeType": "text/html;profile=mcp-app",
    "text": "<!doctype html>..."
  }]
}
```

### Iframe 沙箱

主机在沙箱化的 `<iframe>` 中渲染 HTML，带有：

- `sandbox="allow-scripts allow-same-origin"`（或根据服务器声明更严格）
- 通过响应头应用服务器声明的 CSP。
- 没有来自主机源（origin）的 cookie 或 localStorage。
- 网络访问限于 CSP 中的 `connectSrc`。

### postMessage 协议

iframe 通过 `window.postMessage` 与主机通信。一个微型的 JSON-RPC 2.0 方言：

始终将 `targetOrigin` 钉到对端的精确源（origin），在接收端根据允许列表验证 `event.origin`，然后再处理任何有效负载。永远不要在通道的任何一侧使用 `"*"`——body 中携带的是工具调用和资源读取。

```js
// iframe 到主机（钉到主机源）
window.parent.postMessage({
  jsonrpc: "2.0",
  id: 1,
  method: "host.callTool",
  params: { name: "notes_update", arguments: { id: "note-14", title: "..." } }
}, "https://host.example.com");

// 主机到 iframe（钉到 iframe 源）
iframe.contentWindow.postMessage({
  jsonrpc: "2.0",
  id: 1,
  result: { content: [...] }
}, "https://iframe.example.com");

// 双方的接收器
window.addEventListener("message", (event) => {
  if (event.origin !== "https://expected-peer.example.com") return;
  // 安全处理 event.data
});
```

UI 可以调用的可用主机端方法：

- `host.callTool(name, arguments)` — 调用服务器工具。
- `host.readResource(uri)` — 读取 MCP 资源。
- `host.getPrompt(name, arguments)` — 获取提示模板。
- `host.close()` — 关闭 UI。

每次调用仍然通过 MCP 协议进行，并继承服务器的权限。

### 权限

`_meta.ui.permissions` 列表请求额外的能力：

- `camera` — 访问用户摄像头（用于扫描文档类 UI）。
- `microphone` — 语音输入。
- `geolocation` — 位置信息。
- `network:*` — 比 `connectSrc` 单独允许的更广泛的网络访问。

每个权限都是用户在 UI 渲染前会看到的一个提示。

### 安全风险

iframe 中的 HTML 仍然是 HTML。新增的攻击面：

- **通过 UI 进行提示注入。** 恶意服务器 UI 可以显示看起来像系统消息的文本，从而欺骗用户。主机渲染应明确区分服务器 UI 和主机 UI。
- **通过 `connectSrc` 进行数据窃取。** 如果 CSP 允许 `connect-src: *`，UI 可以将数据发送到任何地方。默认应该严格。
- **点击劫持。** UI 覆盖主机界面。主机必须防止 z-index 操作并强制执行不透明度规则。
- **窃取焦点。** UI 获取键盘焦点并捕获下一条消息。主机必须进行拦截。

阶段 13 · 15 作为 MCP 安全的一部分深入讨论这些问题；本课进行初步介绍。

### `ui/initialize` 握手

iframe 加载后，它通过 postMessage 发送 `ui/initialize`：

```json
{"jsonrpc": "2.0", "id": 0, "method": "ui/initialize",
 "params": {"theme": "dark", "locale": "en-US", "sessionId": "..."}}
```

主机响应能力信息和会话令牌。UI 在每次后续主机调用中使用会话令牌。

### AppRenderer / AppFrame SDK 原语

ext-apps SDK 公开了两个便利原语：

- `AppRenderer`（服务器端）— 包装 React / Vue / Solid 组件，并发出带有正确 MIME 和元数据的 `ui://` 资源。
- `AppFrame`（客户端）— 接收资源，挂载 iframe，并协调 postMessage。

您可以使用这些，也可以手动构建 HTML 和 JSON-RPC。

### 生态系统状态

MCP Apps 于 2026 年 1 月 26 日发布。截至 2026 年 4 月的客户端支持：

- **Claude Desktop。** 自 2026 年 1 月起完全支持。
- **ChatGPT。** 通过 Apps SDK 完全支持（相同的底层 MCP Apps 协议）。
- **Cursor。** Beta 版；通过设置启用。
- **VS Code。** 仅 Insider 构建版本。
- **Goose。** 完全支持。
- **Zed、Windsurf。** 已列入路线图。

生产中的服务器：仪表盘、地图可视化、数据表格、图表构建器、沙箱 IDE 预览。

## 使用它

`code/main.py` 为笔记服务器扩展了一个 `visualize_timeline` 工具，该工具返回 `ui://notes/timeline` 资源，以及一个处理 `resources/read` 请求的处理程序，返回一个小巧但完整的 HTML 包，带有 SVG 时间线。HTML 使用标准库模板——无需构建系统。postMessage 在 JS 注释中有所描述，因为标准库无法驱动浏览器。

需要关注的内容：

- 工具响应中的 `_meta.ui` 携带 resourceUri、CSP、permissions。
- HTML 在没有网络访问的情况下渲染；所有数据都是内联的。
- JS 通过 `window.parent.postMessage` 调用 `host.callTool`（在此标准库演示中已记录但无效）。

## 交付

本课产出 `outputs/skill-mcp-apps-spec.md`。给定一个受益于交互式 UI 的工具，该技能产出完整的 MCP Apps 契约：`ui://` URI、CSP、权限、postMessage 入口点以及安全检查清单。

## 练习

1. 运行 `code/main.py` 并检查发出的 HTML。直接在浏览器中打开 HTML；验证 SVG 渲染。然后勾勒 UI 用于调用 `host.callTool("notes_update", ...)` 的 postMessage 契约。

2. 收紧 CSP：移除 `'unsafe-inline'` 并使用基于 nonce 的脚本策略。HTML 生成代码中有什么变化？

3. 添加第二个 UI 资源 `ui://notes/editor`，带有一个用于原地编辑笔记的表单。当用户提交时，iframe 调用 `host.callTool("notes_update", ...)`。

4. 审计 UI 的攻击面。恶意服务器可以在哪里注入内容？iframe 沙箱防御了什么，没有防御什么？

5. 阅读 SEP-1724 规范，找出 MCP Apps SDK 中此玩具实现未使用的一个能力。（提示：组件级状态同步。）

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| MCP Apps | "交互式 UI 资源" | 2026-01-26 发布的 SEP-1724 扩展 |
| `ui://` | "应用 URI 方案" | UI 包的资源方案 |
| `text/html;profile=mcp-app` | "MIME 类型" | MCP App HTML 的内容类型 |
| Iframe 沙箱 (Iframe sandbox) | "渲染容器" | 浏览器对 UI 的沙箱化，使用 CSP 和权限 |
| postMessage JSON-RPC | "UI 到主机的通信线" | 用于主机调用的微型 JSON-RPC-over-postMessage 方言 |
| `_meta.ui` | "工具-UI 绑定" | 将工具结果链接到 UI 资源的元数据 |
| CSP | "内容安全策略" | 声明脚本、网络、样式的允许来源 |
| AppRenderer | "服务器 SDK 原语" | 将框架组件转换为 `ui://` 资源 |
| AppFrame | "客户端 SDK 原语" | 挂载 iframe 并协调 postMessage 的帮助程序 |
| `ui/initialize` | "握手" | UI 到主机的第一条 postMessage |

## 扩展阅读

- [MCP ext-apps — GitHub](https://github.com/modelcontextprotocol/ext-apps) — 参考实现和 SDK
- [MCP Apps specification 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) — 正式规范文档
- [MCP — Apps extension overview](https://modelcontextprotocol.io/extensions/apps/overview) — 高层文档
- [MCP blog — MCP Apps launch](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) — 2026 年 1 月发布文章
- [MCP Apps API reference](https://apps.extensions.modelcontextprotocol.io/api/) — JSDoc 风格的 SDK 参考
