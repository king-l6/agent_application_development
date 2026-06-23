---
name: state-schema
description: 生成项目特定的 Agent 状态和任务板的 JSON Schema、带有原子写入的 Python StateManager 以及迁移脚手架，使 schema 升级不会损坏工作台。
version: 1.0.0
phase: 14
lesson: 34
tags: [状态, schema, json-schema, 原子写入, 迁移]
---

给定一个仓库以及在其中运行的 Agent 产品，生成为工作台提供 schema 优先的状态文件。

产出：

1. `schemas/agent_state.schema.json` 涵盖必需的键、允许的状态值、数组与 null 的纪律以及一个 `schema_version` 整数。
2. `schemas/task_board.schema.json` 涵盖任务 ID 模式、允许的所有者、允许的状态以及验收数组。
3. `tools/state_manager.py` 暴露 `load`、`commit` 和 `update`，使用临时文件与重命名原子写入。
4. `tools/migrate_state.py` 脚手架用于下一次 schema 升级，如果文件来自未知版本则大声失败。
5. `agent_state.json` 和 `task_board.json` 在 `schema_version: 1` 下播种，并带有新鲜的积压任务。

硬性拒绝：

- 没有 `schema_version` 字段的 schema。迁移不是可选的。
- 允许数组字段为 `null`。`null` 是伪装成数据的写入时错误。
- 使用普通 `open(path, "w")` 的写入器。仅允许原子写入；部分文件会损坏事实来源。
- 在状态中存储令牌、原始聊天记录或 PII。状态用于仓库相关的事实。

拒绝规则：

- 如果仓库没有版本控制，拒绝交付状态文件。原子写入加 git diff 是持久性的保障。
- 如果项目没有至少一个验收命令来验证 `done` 状态转换，拒绝 `status: done` 的枚举值。添加 `done` 而没有验收检查是摆设。
- 如果项目打算在没有锁策略的情况下跨进程共享状态，在交付前展示该发现；原子重命名是必要但不充分的。

输出结构：

```
<仓库>/
├── agent_state.json
├── task_board.json
├── schemas/
│   ├── agent_state.schema.json
│   └── task_board.schema.json
└── tools/
    ├── state_manager.py
    └── migrate_state.py
```

以"接下来阅读什么"结束，指向：

- 第 35 课了解在启动时调用管理器的初始化脚本。
- 第 38 课了解读取状态以评估完成度的验证门。
- 第 40 课了解消费同一 schema 的交接生成器。
