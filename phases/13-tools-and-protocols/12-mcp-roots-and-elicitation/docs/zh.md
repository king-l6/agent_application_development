# 根与引导 — 作用域限定与运行中的用户输入

> 硬编码路径在用户打开不同项目的那一刻就失效了。预填的工具参数在用户指定不足时也会失效。根（Roots）将服务器限定在用户控制的一组 URI 范围内；引导（Elicitation）在工具调用中途暂停，通过表单或 URL 向用户请求结构化输入。两种客户端原语，修复了两种常见的 MCP 故障模式。SEP-1036（URL 模式引导，2025-11-25）在 2026 年上半年处于实验阶段——在依赖它之前请检查 SDK 版本。

**类型：** 构建
**语言：** Python（标准库，根 + 引导演示）
**前置知识：** 阶段 13 · 07（MCP 服务器）
**时间：** ~45 分钟

## 学习目标

- 声明 `roots` 并响应 `notifications/roots/list_changed`。
- 将服务器的文件操作限制在声明的根集合内的 URI。
- 使用 `elicitation/create` 在工具调用中途向用户请求确认或结构化输入。
- 在表单模式和 URL 模式引导之间做出选择（后者为实验性；注意漂移风险）。

## 问题

笔记 MCP 服务器在生产中会遇到两个具体故障。

**路径假设错误。** 服务器是针对 `~/notes` 编写的。一个在不同机器上且笔记位于 `~/Documents/Notes` 的用户会收到静默失败的工具调用（找不到文件），或者更糟——写到了错误的位置。

**用户本应知道的缺失参数。** 用户要求"删除旧的 TPS 报告笔记"。模型调用了 `notes_delete(title: "TPS report")`，但有三个匹配的笔记，分别来自 2023、2024 和 2025 年。工具无法猜测。返回"歧义"很烦人；对三个都执行则是灾难性的。

根解决了第一个问题：客户端在 `initialize` 时声明服务器可以接触的 URI 集合。引导解决了第二个问题：服务器暂停工具调用，发送 `elicitation/create` 让用户选择哪一个。

## 概念

### 根

客户端在 `initialize` 时声明根列表：

```json
{
  "capabilities": {"roots": {"listChanged": true}}
}
```

然后服务器可以调用 `roots/list`：

```json
{"roots": [{"uri": "file:///Users/alice/Documents/Notes", "name": "Notes"}]}
```

服务器必须将根视为边界：任何超出根集合的文件读写都将被拒绝。这不是由客户端强制执行的（服务器仍是用户信任的代码），但符合规范的服务器会遵守这一点。

当用户添加或移除根时，客户端发送 `notifications/roots/list_changed`。服务器重新调用 `roots/list` 并更新其边界。

### 为什么根是客户端原语

根由客户端声明，因为它们代表了用户的同意模型。用户告诉 Claude Desktop"授予此笔记服务器访问这两个目录的权限"。服务器不能扩大该范围。

### 引导：表单模式（默认）

`elicitation/create` 接收一个表单模式加一个自然语言提示：

```json
{
  "method": "elicitation/create",
  "params": {
    "message": "删除 'TPS report'？多个笔记匹配，请选择一个。",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "note_id": {
          "type": "string",
          "enum": ["note-3", "note-7", "note-14"]
        },
        "confirm": {"type": "boolean"}
      },
      "required": ["note_id", "confirm"]
    }
  }
}
```

客户端渲染表单，收集用户的答案，返回：

```json
{
  "action": "accept",
  "content": {"note_id": "note-14", "confirm": true}
}
```

三种可能的动作：`accept`（用户填写了）、`decline`（用户关闭了）、`cancel`（用户中止了整个工具调用）。

表单模式是扁平的——v1 不支持嵌套对象。SDK 通常会拒绝比单层更复杂的结构。

### 引导：URL 模式（SEP-1036，实验性）

2025-11-25 的新功能。服务器发送一个 URL 而非模式：

```json
{
  "method": "elicitation/create",
  "params": {
    "message": "登录 GitHub",
    "url": "https://github.com/login/oauth/authorize?client_id=..."
  }
}
```

客户端在浏览器中打开 URL，等待完成，用户返回后给出结果。适用于 OAuth 流程、支付授权和文档签名等表单不足的场景。

漂移风险提示：SEP-1036 的响应形态仍在确定中；一些 SDK 返回回调 URL，其他返回完成令牌。在生产中使用 URL 模式之前，请阅读你的 SDK 发布说明。

### 何时使用引导

- 在破坏性操作前获得用户确认（破坏性提示 + 引导）。
- 消歧（从 N 个匹配中选一个）。
- 首次运行设置（API 密钥、目录、偏好）。
- OAuth 风格流程（URL 模式）。

### 何时不应使用引导

- 填充模型本可以以文本形式询问的工具必需参数。使用正常的重新提示，而非引导对话框。
- 高频调用。引导会中断对话；不要在循环中触发它。
- 服务器可以在事后验证的任何内容。先验证，返回错误，让模型以文本形式向用户提问。

### 人类参与循环桥梁

引导加采样共同构成了 MCP 的"人类参与循环"模型。服务器的 Agent 循环可以暂停以获取用户输入（引导）或模型推理（采样）。阶段 13 · 11 涵盖了采样；本课程涵盖引导。将两者结合起来，实现完整的循环中控制。

## 使用

`code/main.py` 扩展了笔记服务器，增加了：

- 支持在根列表变更通知后重新查询的 `roots/list` 响应。
- 一个 `notes_delete` 工具，在多个笔记匹配时使用 `elicitation/create` 进行消歧。
- 一个 `notes_setup` 工具，使用 URL 模式引导打开首次运行配置页面（模拟）。
- 一个边界检查，拒绝在声明的根集合之外的 URI 上执行操作。

该演示运行三个场景：正常路径（一个匹配）、消歧（三个匹配，引导触发）、根外写入（被拒绝）。

## 交付

本课程产出 `outputs/skill-elicitation-form-designer.md`。给定一个可能需要用户确认或消歧的工具，该技能会设计引导表单模式和消息模板。

## 练习

1. 运行 `code/main.py`。触发消歧路径；确认模拟的用户回答被路由回工具。

2. 添加一个新工具 `notes_archive`，每次都需要引导确认（破坏性提示）。检查用户体验：与模型以文本形式重新询问相比如何？

3. 为首次运行 OAuth 流程实现 URL 模式引导。注意漂移风险并添加 SDK 版本防护。

4. 扩展 `roots/list` 处理：当收到通知时，服务器应原子性地重新读取并重新扫描可能已超出作用域的已打开文件句柄。

5. 阅读 GitHub 上的 SEP-1036 议题讨论线程。找出一个影响服务器应如何处理 URL 模式回调的未决问题。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 根 | "同意边界" | 客户端允许服务器接触的 URI |
| `roots/list` | "服务器询问作用域" | 客户端返回当前的根集合 |
| `notifications/roots/list_changed` | "用户更改了作用域" | 客户端信号表示根集合已变更 |
| 引导 | "在调用中询问用户" | 服务器发起的结构化用户输入请求 |
| `elicitation/create` | "方法" | 引导请求的 JSON-RPC 方法 |
| 表单模式 | "模式驱动的表单" | 在客户端 UI 中渲染为表单的扁平 JSON Schema |
| URL 模式 | "浏览器重定向" | SEP-1036 实验性功能；打开 URL 并等待 |
| `accept` / `decline` / `cancel` | "用户响应结果" | 服务器处理的三种分支 |
| 消歧 | "选择一个" | 当工具有 N 个候选时常见的引导用例 |
| 扁平表单 | "仅顶层属性" | 引导模式不能嵌套 |

## 延伸阅读

- [MCP — Client roots spec](https://modelcontextprotocol.io/specification/draft/client/roots) — 根的标准参考
- [MCP — Client elicitation spec](https://modelcontextprotocol.io/specification/draft/client/elicitation) — 引导的标准参考
- [Cisco — What's new in MCP elicitation, structured content, OAuth enhancements](https://blogs.cisco.com/developer/whats-new-in-mcp-elicitation-structured-content-and-oauth-enhancements) — 2025-11-25 新增功能的逐步解析
- [MCP — GitHub SEP-1036](https://github.com/modelcontextprotocol/modelcontextprotocol) — URL 模式引导提案（实验性，漂移风险）
- [The New Stack — How elicitation brings human-in-the-loop to AI tools](https://thenewstack.io/how-elicitation-in-mcp-brings-human-in-the-loop-to-ai-tools/) — 用户体验解析
