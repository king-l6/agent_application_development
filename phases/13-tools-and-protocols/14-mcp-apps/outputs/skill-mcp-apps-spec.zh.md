---
name: mcp-apps-spec
description: 为需要交互式 UI 资源的工具生成完整的 MCP Apps 契约。
version: 1.0.0
phase: 13
lesson: 14
tags: [mcp, apps, ui-resources, csp, iframe-sandbox]
---

给定一个受益于交互式 UI 的工具（时间线、表单、仪表盘、地图、图表），生成 MCP Apps 契约。

产出：

1. **`ui://` URI**。UI 资源的一个规范名称（例如 `ui://notes/timeline`）。
2. **工具结果形状**。`content[]` 包含 `text` 前言和 `ui_resource` 块；填充 `_meta.ui`。
3. **CSP**。`default-src`、`script-src`、`connect-src`、`img-src`、`style-src` 的最小允许列表。除非必要，避免使用 `'unsafe-inline'`。
4. **权限列表**。如需摄像头/麦克风/地理位置/网络权限则列出；不需要则为空。
5. **postMessage 入口点**。UI 将进行哪些 `host.*` 调用以及它们返回什么。
6. **安全检查清单**。与主机区分、无点击劫持、严格的 connect-src、如果渲染任何用户内容则进行 HTML 清理。

硬性拒绝：
- CSP 使用 `default-src *`。安全性完全开放的风险。
- 任何超出 UI 实际使用范围的 `permissions` 请求。最小权限原则。
- 任何加载外部脚本的 ui:// 资源。打包或拒绝。
- 任何渲染用户控制 HTML 而不进行清理的 UI。XSS 向量。

拒绝规则：
- 如果 UI 只是静态结果，拒绝搭建 App；返回文本内容。
- 如果工具受益于原生主机小部件（进度条、确认对话框），推荐使用这些。
- 如果主机尚不支持 MCP Apps（截至 2026 年 4 月的 VS Code 稳定版、Zed、Windsurf），标记回退到纯文本的路径。

输出：一页的契约文档，包含 `ui://` URI、工具结果 JSON、CSP、权限、postMessage 入口点以及安全检查清单。以一句话说明将渲染此 UI 的最低主机要求结尾。
