# 综合项目 — 构建完整的工具生态系统

> 阶段 13 教授了每个部分。本综合项目将它们连接成一个生产级系统：一个带有工具 + 资源 + 提示 + 任务 + UI 的 MCP 服务器，边缘的 OAuth 2.1，一个 RBAC 网关，一个多服务器客户端，一个 A2A 子智能体调用，连接到收集器的 OTel 追踪，CI 中的工具中毒检测，以及一个 AGENTS.md + SKILL.md 包。完成后，你可以为每个架构选择进行辩护。

**类型：** 构建
**语言：** Python（标准库，端到端生态系统框架）
**前置知识：** 阶段 13 · 01 至 21
**时间：** 约 120 分钟

## 学习目标

- 组合一个 MCP 服务器，暴露工具、资源、提示和带 `ui://` 应用的任务。
- 为服务器前端配置一个 OAuth 2.1 网关，执行 RBAC 和固定哈希（pinned hashes）。
- 编写一个多服务器客户端，端到端使用 OTel GenAI 属性追踪。
- 将部分工作负载委派给 A2A 子智能体；验证不透明性得到保留。
- 使用 AGENTS.md + SKILL.md 打包整个栈，使其他智能体可以驱动它。

## 问题

交付"研究并报告"系统：

- 用户询问："总结 2026 年关于智能体协议被引用最多的三篇 arXiv 论文。"
- 系统：通过 MCP 搜索 arXiv；通过 A2A 将论文总结委派给专门的编写智能体；聚合结果；将交互式报告渲染为 MCP Apps `ui://` 资源；将每一步记录到 OTel。

阶段 13 的所有原语都出现了。这不是玩具——2026 年 Anthropic（Claude Research 产品）、OpenAI（带 Apps SDK 的 GPTs）和第三方发布的生产级研究助手系统都采用这种确切形态。

## 概念

### 架构

```
[用户] -> [客户端] -> [网关 (OAuth 2.1 + RBAC)] -> [研究 MCP 服务器]
                                                      |
                                                      +- MCP 工具: arxiv_search (纯函数)
                                                      +- MCP 资源: notes://recent
                                                      +- MCP 提示: /research_topic
                                                      +- MCP 任务: generate_report (长期)
                                                      +- MCP Apps UI: ui://report/current
                                                      +- A2A 调用: writer-agent (tasks/send)
                                                      |
                                                      +- OTel GenAI spans
```

### 追踪层次结构

```
agent.invoke_agent
 ├── llm.chat (启动)
 ├── mcp.call -> tools/call arxiv_search
 ├── mcp.call -> resources/read notes://recent
 ├── mcp.call -> prompts/get research_topic
 ├── a2a.tasks/send -> writer-agent
 │    └── 任务转换 (不透明内部)
 ├── mcp.call -> tools/call generate_report (任务增强)
 │    └── tasks/status 轮询
 │    └── tasks/result (已完成，返回 ui:// 资源)
 └── llm.chat (最终综合)
```

一个 trace id。每个 Span 有正确的 `gen_ai.*` 属性。

### 安全态势

- OAuth 2.1 + PKCE，资源指示器将受众固定到网关。
- 网关持有上游凭据；用户永远看不到它们。
- RBAC：`alice` 有 `research:read`、`research:write`，可以调用所有工具。`bob` 有 `research:read`，不能调用 `generate_report`。
- 固定描述清单：丢弃任何工具哈希发生变化的服务器。
- 双重规则审核：没有工具组合不可信输入、敏感数据和后果性动作。

### 渲染

最终的 `generate_report` 任务返回内容块加上一个 `ui://report/current` 资源。客户端的主机（Claude Desktop 等）在沙箱 iframe 中渲染交互式仪表板。仪表板包含排序后的论文列表、引用计数和一个按钮，用户点击任何论文时调用 `host.callTool('summarize_paper', {arxiv_id})`。

### 打包

整个系统以如下形式发布：

```
research-system/
  AGENTS.md                     # 项目约定
  skills/
    run-research/
      SKILL.md                  # 顶层工作流
  servers/
    research-mcp/               # MCP 服务器
      pyproject.toml
      src/
  agents/
    writer/                     # A2A 智能体
  gateway/
    config.yaml                 # RBAC + 固定清单
```

用户使用 `docker compose up` 部署。Claude Code、Cursor、Codex 和 opencode 用户可以通过调用 `run-research` 技能来驱动系统。

### 每个阶段 13 课程的贡献

| 课程 | 综合项目使用的内容 |
|--------|-------------------|
| 01-05 | 工具接口、供应商可移植性、并行调用、模式、lint |
| 06-10 | MCP 原语、服务器、客户端、传输、资源 + 提示 |
| 11-14 | 采样、根 + 引导、异步任务、`ui://` 应用 |
| 15-17 | 工具中毒、OAuth 2.1、网关 + 注册中心 |
| 18 | A2A 子智能体委派 |
| 19 | OTel GenAI 追踪 |
| 20 | LLM 层的路由网关 |
| 21 | SKILL.md + AGENTS.md 打包 |

## 使用

`code/main.py` 将之前课程的模式拼接成一个可运行的演示。全部使用标准库，全部在进程中，以便端到端阅读。它运行研究并报告场景的完整流程：与网关握手、模拟 OAuth 2.1、合并 tools/list、以任务形式运行 generate_report、向编写器发出 A2A 调用、返回 ui:// 资源、发出 OTel Span。

需要关注的内容：

- 一个 trace id 贯穿每个跳转。
- 网关策略阻止第二个用户写入。
- 任务生命周期经历 working → completed 并返回文本和 ui:// 内容。
- A2A 调用的内部状态对编排器不透明。
- AGENTS.md 和 SKILL.md 是其他智能体复现工作流所需的唯一文件。

## 交付

本课程产出 `outputs/skill-ecosystem-blueprint.md`。给定一个产品需求（研究、摘要、自动化），该技能生成完整架构：哪些 MCP 原语、哪些网关控制、哪些 A2A 调用、哪些遥测、哪些打包。

## 练习

1. 运行 `code/main.py`。注意单个 trace id 以及 Span 如何嵌套。计算演示触及的阶段 13 原语数量。

2. 扩展演示：添加第二个后端 MCP 服务器（例如 `bibliography`），确认网关将其工具合并到同一个命名空间中。

3. 将模拟 A2A 编写智能体替换为在子进程中运行的真实智能体。使用课程 19 的框架。

4. 在编排器和 LLM 之间的路由网关中添加 PII 重写步骤。确认用户查询中的电子邮件被清除。

5. 为将要维护此系统的队友编写 AGENTS.md。阅读时间应少于五分钟，并给予他们在 Cursor 或 Codex 中驱动综合项目所需的一切信息。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| 综合项目（Capstone） | "阶段 13 集成演示" | 使用每个原语的端到端系统 |
| 研究与报告（Research and report） | "场景" | 搜索、摘要、渲染模式 |
| 生态系统（Ecosystem） | "所有部分在一起" | 服务器 + 客户端 + 网关 + 子智能体 + 遥测 + 包 |
| 追踪层次结构（Trace hierarchy） | "单个 trace id" | 每个跳转的 Span 共享追踪；父子关系通过 span id |
| 网关签发令牌（Gateway-issued token） | "传递认证" | 客户端只看到网关的令牌；网关持有上游凭据 |
| 合并命名空间（Merged namespace） | "所有工具在一个扁平列表中" | 在网关处合并多服务器，冲突时加前缀 |
| 不透明性边界（Opacity boundary） | "A2A 调用隐藏内部" | 子智能体的推理对编排器不可见 |
| 三层栈（Three-layer stack） | "AGENTS.md + SKILL.md + MCP" | 项目上下文 + 工作流 + 工具 |
| 纵深防御（Defense-in-depth） | "多层安全" | 固定哈希、OAuth、RBAC、双重规则、审计日志 |
| 规范合规矩阵（Spec compliance matrix） | "我们交付的符合规范要求" | 将交付物映射到 2025-11-25 要求的清单 |

## 扩展阅读

- [MCP — 规范 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — 综合参考
- [MCP 博客 — 2026 路线图](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) — 协议的发展方向
- [a2a-protocol.org](https://a2a-protocol.org/latest/) — A2A v1.0 参考
- [OpenTelemetry — GenAI semconv](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — 规范追踪约定
- [Anthropic — Claude Agent SDK 概述](https://code.claude.com/docs/en/agent-sdk/overview) — 生产级智能体运行时模式
