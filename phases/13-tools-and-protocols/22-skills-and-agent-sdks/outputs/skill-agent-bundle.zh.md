---
name: agent-bundle
description: 为工作流生成可移植的 SKILL.md + AGENTS.md + MCP 服务器蓝图，可在 Claude Code、Cursor、Codex 和兼容智能体间加载。
version: 1.0.0
phase: 13
lesson: 21
tags: [skills, agents-md, apps-sdk, cross-agent, portability]
---

给定一个工作流描述，生成智能体包。

产出：

1. SKILL.md。YAML 前置元数据，包含 `name` 和 `description`，Markdown 主体包含编号步骤。如果主体较长，包含渐进式披露子资源引用。
2. AGENTS.md 条目。为仓库的 AGENTS.md 添加几行，反映技能依赖的约定（linter 命令、测试命令）。
3. MCP 服务器蓝图。技能通过 MCP 调用的工具；名称、描述（使用-何时模式）和输入模式。
4. 跨智能体翻译。SkillKit 风格的注释，说明此 SKILL.md 如何映射到 Cursor 规则、Codex 的 `.codex.md`、Windsurf 规则。
5. 加载路径。智能体将在何处发现此包：`~/.anthropic/skills/`、`./skills/`、`~/.claude/skills/`。

硬性拒绝：
- 任何 `name` 不是 `kebab-case` 的 SKILL.md。会破坏发现机制。
- 任何前置元数据中没有 `description` 的 SKILL.md。智能体运行时跳过它。
- 任何 MCP 工具未按阶段 13 · 05 规则命名的包。

拒绝规则：
- 如果工作流是一次性提示，拒绝生成技能；推荐内联提示工程。
- 如果工作流需要 OAuth（例如 Slack 发布），标记 MCP 服务器的首次运行引导必须处理此情况。
- 如果目标智能体不支持 SKILL.md（某些 IDE），推荐通过 SkillKit 或类似工具进行翻译。

输出：一页包，包含三个文件的草稿、跨智能体翻译说明和加载路径。以应该首先测试包的单个智能体结尾。
