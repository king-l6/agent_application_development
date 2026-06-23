---
name: minimal-workbench
description: 为任何仓库搭建三个文件的最小可行 Agent 工作台——简短的 AGENTS.md 路由器、持久的 agent_state.json 以及键接到项目当前积压任务的 JSON task_board.json。
version: 1.0.0
phase: 14
lesson: 32
tags: [工作台, agents-md, 状态, 任务板, 脚手架]
---

给定一个仓库路径和一个简短的积压任务列表，搭建最小可行 Agent 工作台。

产出：

1. `AGENTS.md` 不超过 80 行。它必须指向：状态文件、任务板、更深层的规则文档（即使为空）以及验证命令。此文件中不得有散文教程。
2. `agent_state.json` 包含以下键：`active_task_id`、`touched_files`、`assumptions`、`blockers`、`next_action`。所有可选字段默认为空数组或空字符串，数组绝不使用 `null`。
3. `task_board.json` 作为任务的 JSON 数组。每个任务有 `id`、`goal`、`owner`（`builder` | `reviewer` | `human`）、`acceptance`（字符串列表）和 `status`（`todo` | `in_progress` | `done` | `blocked`）。
4. `docs/agent-rules.md` 占位符，每个面一个 H2，供后续课程填充。

硬性拒绝：

- `AGENTS.md` 超过 80 行或少于 10 行。太长则 Agent 跳过；太短则没有路由能力。
- 引用聊天历史而非仓库的状态文件。仓库是记录系统。
- 没有 `acceptance` 的任务板。没有验收标准的任务变成了"看起来不错"的橡皮图章。
- `owner` 为 `agent` 或 `model` 的任务。所有者是角色，不是实体。

拒绝规则：

- 如果仓库没有验证命令，在提供或桩接一个之前拒绝写入 `AGENTS.md`。指向缺失门的路由器比没有路由器更糟。
- 如果积压任务超过 12 个开放任务，拒绝并要求用户拆分。超过一个屏幕的板会沦为规划表演。
- 如果项目在追踪的文件中包含密钥，拒绝写入状态文件并首先将密钥泄漏显示为阻塞性发现。

输出结构：

```
<仓库>/
├── AGENTS.md
├── agent_state.json
├── task_board.json
└── docs/
    └── agent-rules.md
```

以"接下来阅读什么"结束，指向：

- 第 33 课了解将规则占位符转化为可执行约束。
- 第 34 课了解持久状态 schema。
- 第 36 课了解每个任务的范围合同。
