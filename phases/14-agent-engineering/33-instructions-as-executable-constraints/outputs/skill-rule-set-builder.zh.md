---
name: rule-set-builder
description: 采访项目所有者，将现有散文指令分类为五个操作性类别，并发布版本化的 agent-rules.md 以及 Python 检查器桩代码。
version: 1.0.0
phase: 14
lesson: 33
tags: [规则, 指令, 约束, 检查器, 工作台]
---

给定一个仓库以及任何现有的散文指令（`AGENTS.md`、`CONTRIBUTING.md`、入职文档），生成工作台可以执行的五类别规则集。

五种类别：

1. `startup` —— 工作开始前必须满足什么。
2. `forbidden` —— 什么绝对不能发生。
3. `definition_of_done` —— 什么证明任务已完成。
4. `uncertainty` —— Agent 不确定时做什么。
5. `approval` —— 什么需要人类签字批准。

产出：

1. `docs/agent-rules.md`，每条规则一个 `##` 标题。每条规则携带 `category`、`check` 和一行描述。
2. `tools/rule_checker.py`，包含一个 `RuleChecker` 类，为每个 `check` 暴露一个方法。每个方法接收一个 `TurnTrace` 数据类并返回 `bool`。
3. `tools/rule_report.py` 运行器，加载规则，对追踪运行检查器，输出 `rule_report.json`。
4. 迁移说明文件：哪些散文行变成了哪条规则、哪些作为愿望性的被丢弃、以及原因。

硬性拒绝：

- 没有 `check` 字段的规则。纯愿望性的规则属于入职文档，不属于工作台规则集。
- 单一的"要小心"规则。指定一个类别和一个检查，否则移除它。
- 需要 LLM 调用的检查。规则检查必须是确定性的且廉价的，以便每轮都能运行。
- 超过 200 行的规则文件。按类别拆分为 `agent-rules.{startup,forbidden,done,uncertainty,approval}.md`，并通过父索引路由。

拒绝规则：

- 如果 Agent 产品无法提供 `TurnTrace`（没有仪表化），在至少记录 `read_state_file`、`edited_files` 和 `tests_exit_code` 之前拒绝接入检查器。
- 如果现有指令大部分是愿望性的（>50%），在输出规则之前先展示该发现。规则集会看起来很薄；这是正确的。
- 如果规则是因为单一过去事件添加的，附加上事件 ID，以便未来审查可以判断是否仍然需要。

输出结构：

```
<仓库>/
├── docs/
│   └── agent-rules.md
├── tools/
│   ├── rule_checker.py
│   └── rule_report.py
└── docs/migration-notes.md
```

以"接下来阅读什么"结束，指向：

- 第 36 课了解扩展禁止类别的每任务范围合同。
- 第 38 课了解消费规则报告的验证门。
- 第 39 课了解对规则合规性评分的审查 Agent。
