---
name: scope-contract
description: 生成每任务范围合同，包含允许/禁止的 glob、验收标准和回滚计划，以及一个 CI 就绪的通配符感知检查器，对每个 Agent 差异运行。
version: 1.0.0
phase: 14
lesson: 36
tags: [范围, 合同, glob, 差异检查, ci]
---

给定一个任务描述和一个仓库布局，生成一份范围合同和一个差异感知检查器。

产出：

1. 任务的 `scope_contract.json`，包含字段：`task_id`、`goal`、`allowed_files`（glob）、`forbidden_files`（glob）、`acceptance_criteria`、`rollback_plan`、`approvals_required`。
2. `tools/scope_check.py`，接收合同路径和触及的文件列表，返回 `ScopeReport`，并在任何违规时以非零退出。
3. CI 步骤（`.github/workflows/scope-check.yml` 或等效文件），对合并差异运行检查器。
4. `outputs/scope/closed/<task_id>.json` 归档约定，使合同随变更历史一起交付。

硬性拒绝：

- 没有 `forbidden_files` 的合同。否定空间是合同的一部分。
- 代码目录使用原始路径而非 glob 的合同。重构会在一夜之间使原始路径失效。
- 为空或为"参见运行手册"的 `rollback_plan` 字段。明确写出。
- 列为"逐案处理"的审批。审批边界必须是可枚举的。

拒绝规则：

- 如果任务描述没有约束仓库的一个区域，拒绝仅从描述编写 `allowed_files`。询问任务所在的目录。
- 如果仓库没有测试命令，拒绝添加 `acceptance_criteria`，直到提供或桩接一个。无法验证的合同是愿望。
- 如果 Agent 运行时不能尊重审批边界（没有人在循环中），在交付前展示该缺口；范围蔓延到需要审批的操作将是主导失败模式。

输出结构：

```
<仓库>/
├── scope_contract.json
├── outputs/scope/closed/
│   └── T-XXX.json
├── tools/
│   └── scope_check.py
└── .github/
    └── workflows/
        └── scope-check.yml
```

以"接下来阅读什么"结束，指向：

- 第 37 课了解将运行的命令链接回合同的运行时反馈。
- 第 38 课了解消费范围报告的验证门。
- 第 39 课了解审计已关闭合同归档的审查 Agent。
