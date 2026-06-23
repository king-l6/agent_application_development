# Skills 与智能体 SDK — Anthropic Skills、AGENTS.md、OpenAI Apps SDK

> MCP 说明"有什么工具"。Skills 说明"如何做任务"。2026 年的技术栈包含两者。Anthropic 的 Agent Skills（开放标准，2025 年 12 月）以 SKILL.md 形式发布，支持渐进式披露。OpenAI 的 Apps SDK 是 MCP 加上小组件元数据。AGENTS.md（现已应用于 60,000+ 仓库）位于仓库根目录，作为项目级别的智能体上下文。本课程说明每个覆盖的内容，并构建一个可在智能体间迁移的最小 SKILL.md + AGENTS.md 包。

**类型：** 学习
**语言：** Python（标准库，SKILL.md 解析器和加载器）
**前置知识：** 阶段 13 · 07（MCP 服务器）
**时间：** 约 45 分钟

## 学习目标

- 区分三个层次：AGENTS.md（项目上下文）、SKILL.md（可复用操作知识）、MCP（工具）。
- 编写带有 YAML 前置元数据和渐进式披露的 SKILL.md。
- 以文件系统方式将技能加载到智能体运行时。
- 将技能与 MCP 服务器和 AGENTS.md 组合，使一个包能在 Claude Code、Cursor 和 Codex 中使用。

## 问题

一位工程师将发布说明编写工作流提炼为多步提示："读取最近合并的 PR。按领域分组。总结每个领域。按照团队风格编写变更日志条目。发布到 Slack 草稿。"他们将其放在团队的 Notion 文档中。

现在他们想在 Claude Code、Cursor 和 Codex CLI 中使用此工作流。每个智能体有不同的加载指令的方式：Claude Code 斜杠命令、Cursor 规则、Codex 的 `.codex.md`。工程师复制了三次工作流并维护三个副本。

AGENTS.md 和 SKILL.md 一起解决了这个问题：

- **AGENTS.md** 位于仓库根目录。每个兼容的智能体在会话启动时读取它。"这个项目如何工作？约定是什么？哪些命令运行测试？"
- **SKILL.md** 是一个可移植包：YAML 前置元数据（名称、描述）+ Markdown 主体 + 可选资源。支持技能的智能体按名称按需加载。
- **MCP**（阶段 13 · 06-14）处理技能需要调用的工具。

三个层次，一个可移植工件。

## 概念

### AGENTS.md（agents.md）

2025 年底推出，截至 2026 年 4 月已被 60,000+ 仓库采用。仓库根目录下一个文件。格式：

```markdown
# Project: my-service

## 约定
- TypeScript，严格模式。
- Python 侧使用 Pydantic 建模。
- 测试使用 `pnpm test` 运行。

## 构建和运行
- `pnpm dev` 用于本地开发服务器。
- `pnpm build` 用于生产包。
```

智能体在会话启动时读取此文件，并用于校准其在项目中的行为。2026 年每个编码智能体都支持 AGENTS.md：Claude Code、Cursor、Codex、Copilot Workspace、opencode、Windsurf、Zed。

### SKILL.md 格式

Anthropic 的 Agent Skills（2025 年 12 月作为开放标准发布）：

```markdown
---
name: release-notes-writer
description: 按照项目风格为最近合并的 PR 编写变更日志条目。
---

# 发布说明编写器

调用时，执行以下步骤：

1. 列出自上一个标签以来合并的 PR。使用 `gh pr list --base main --state merged`。
2. 按标签分组：feature、fix、chore、docs。
3. 对每组中的每个 PR，写一行：`- <标题> (#<编号>)`。
4. 起草发布说明并将其暂存到 CHANGELOG.md 中。

如果用户说"发布"，运行 `git tag vX.Y.Z` 和 `gh release create`。

## 注意

- 绝不包含没有 PR 的提交。
- 从公开变更日志中跳过"chore"条目。
```

前置元数据声明技能的标识。主体是技能加载时向模型展示的提示。

### 渐进式披露

技能可以引用子资源，智能体仅在需要时获取。示例：

```
skills/
  release-notes-writer/
    SKILL.md
    style-guide.md
    template.md
    scripts/
      generate.sh
```

SKILL.md 说明"参见 style-guide.md 了解风格规则。"智能体仅在技能实际运行时拉取 style-guide.md。这避免了用模型可能不需要的细节膨胀提示。

### 文件系统发现

智能体运行时扫描已知目录以寻找 SKILL.md 文件：

- `~/.anthropic/skills/*/SKILL.md`
- 项目 `./skills/*/SKILL.md`
- `~/.claude/skills/*/SKILL.md`

加载通过文件夹名称和前置元数据 `name` 进行。Claude Code、Anthropic Claude Agent SDK 和 SkillKit（跨智能体）都遵循此模式。

### Anthropic Claude Agent SDK

`@anthropic-ai/claude-agent-sdk`（TypeScript）和 `claude-agent-sdk`（Python）在会话启动时加载技能，将其作为运行时中可调用的"智能体"暴露。当用户调用技能时，智能体循环派发到该技能。

### OpenAI Apps SDK

2025 年 10 月推出；直接构建在 MCP 之上。将 OpenAI 之前的 Connectors 和 Custom GPT Actions 统一在一个开发者界面下。Apps SDK 应用包含：

- 一个 MCP 服务器（工具、资源、提示）。
- 加上 ChatGPT UI 的小组件元数据。
- 加上一个可选的 MCP Apps `ui://` 资源，用于交互式界面。

相同的协议，更丰富的 UX。

### 通过 SkillKit 实现跨智能体可移植性

像 SkillKit 和类似的跨智能体分发层工具将单个 SKILL.md 翻译成 32+ AI 智能体的原生格式（Claude Code、Cursor、Codex、Gemini CLI、OpenCode 等）。一个真实来源；多个消费者。

### 三层栈

| 层次 | 文件 | 加载时机 | 用途 |
|-------|------|----------|------|
| AGENTS.md | 仓库根目录 | 会话启动 | 项目级约定 |
| SKILL.md | skills 目录 | 技能被调用 | 可复用的工作流 |
| MCP 服务器 | 外部进程 | 需要工具时 | 可调用的动作 |

三者组合：智能体在会话启动时读取 AGENTS.md，用户调用技能，技能的指令包含 MCP 工具调用，智能体通过 MCP 客户端派发。

## 使用

`code/main.py` 提供了一个标准库 SKILL.md 解析器和加载器。它发现 `./skills/` 下的技能，解析 YAML 前置元数据和 Markdown 主体，生成按技能名称索引的字典。然后模拟一个按名称调用 `release-notes-writer` 的智能体循环。

需要关注的内容：

- YAML 前置元数据使用最小标准库解析器解析（无 `pyyaml` 依赖）。
- 技能主体按原样存储；智能体在调用时将其前置到系统提示中。
- 通过 `read_subresource` 函数演示渐进式披露，该函数按需拉取引用的文件。

## 交付

本课程产出 `outputs/skill-agent-bundle.md`。给定一个工作流，该技能生成组合的 SKILL.md + AGENTS.md + MCP-server-blueprint 包，可在智能体间移植。

## 练习

1. 运行 `code/main.py`。在 `skills/` 下添加第二个技能，确认加载器能发现它。

2. 为本课程仓库编写 AGENTS.md。包括测试命令、风格约定和阶段 13 的心理模型。

3. 将团队内部文档中的多步工作流移植到 SKILL.md。验证它能在 Claude Code 中加载。

4. 手动将技能翻译成 Cursor 和 Codex 的原生规则格式。计算格式之间的差异——这是 SkillKit 自动化的翻译面。

5. 阅读 Anthropic Agent Skills 博客。找出 Claude Agent SDK 中本课程加载器未覆盖的一个功能。（提示：智能体子调用。）

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| SKILL.md | "技能文件" | YAML 前置元数据加 Markdown 主体，由智能体运行时加载 |
| AGENTS.md | "仓库根智能体上下文" | 项目级约定文件，会话启动时读取 |
| 渐进式披露（Progressive disclosure） | "懒加载子资源" | 技能主体引用文件，仅在需要时获取 |
| 前置元数据（Frontmatter） | "顶部的 YAML 块" | 元数据（名称、描述），在 `---` 分隔符内 |
| Claude Agent SDK | "Anthropic 的技能运行时" | `@anthropic-ai/claude-agent-sdk`，加载技能并路由 |
| OpenAI Apps SDK | "MCP + 小组件元数据" | 构建在 MCP 之上的 OpenAI 开发者界面，加上 ChatGPT UI 钩子 |
| 技能发现（Skill discovery） | "文件系统扫描" | 遍历已知目录查找 SKILL.md，按键值为名称 |
| 跨智能体可移植性（Cross-agent portability） | "一个技能，多个智能体" | 通过 SkillKit 风格的工具将一个 SKILL.md 翻译给 32+ 智能体 |
| Agent Skill | "可移植操作知识" | 独立于 MCP 工具概念的可复用任务模板 |
| Apps SDK | "MCP 加 ChatGPT UI" | Connectors 和 Custom GPTs 在 MCP 上统一 |

## 扩展阅读

- [Anthropic — Agent Skills 公告](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — 2025 年 12 月发布
- [Anthropic — Agent Skills 文档](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — SKILL.md 格式参考
- [OpenAI — Apps SDK](https://developers.openai.com/apps-sdk) — 基于 MCP 的 ChatGPT 开发者平台
- [agents.md](https://agents.md/) — AGENTS.md 格式和采用列表
- [Anthropic — anthropics/skills GitHub](https://github.com/anthropics/skills) — 官方技能示例
