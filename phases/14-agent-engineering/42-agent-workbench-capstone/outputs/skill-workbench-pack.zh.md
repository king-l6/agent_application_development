---
name: workbench-pack
description: 生成一个项目调优的即插即用智能体工作台包 —— 根据团队历史磨锐的规则、与仓库匹配的范围通配符、用一个领域特定条目扩展的评分标准维度。
version: 1.0.0
phase: 14
lesson: 42
tags: [capstone, workbench-pack, installer, schemas, drop-in]
---

给定一个仓库、团队的事故历史和在其内部运行的智能体产品，发出一个调优的 agent-workbench-pack 和一个安装器。

产出：

1. `agent-workbench-pack/` 目录，匹配规范布局：AGENTS.md、docs/、schemas/、scripts/、bin/、README.md、VERSION。
2. 一个 `bin/install.sh`，拒绝在没有 `--force` 的情况下覆盖现有包，并将 `.workbench-version` 写入目标仓库。
3. 项目调优版本的 `agent-rules.md`（每个类别至少一条规则，源自团队最近六次事故）、`reviewer-rubric.md`（带有第六个领域维度）和 `scope_contract.schema.json`（带有项目特定通配符）。
4. 一个 `lint_pack.py` 脚本，在脚本和模式之间或 VERSION 与模式的 `schema_version` 之间发生漂移时失败。
5. 可选的 CI 集成，在演示分支上安装包并针对已知良好的任务运行验证门。

硬性拒绝：

- 包含项目特定任务的包。任务存在于目标仓库的板子上。
- 绑定到单一供应商 SDK 的包。仅框架无关；SDK 接线是目标仓库的工作。
- 修改状态文件的安装器。安装器是幂等的仅表面操作；状态属于智能体和人类。
- 没有对应检查函数的规则。愿望性规则属于入职资料，而不是包。

拒绝规则：

- 如果事故历史为空，拒绝交付调优的 `agent-rules.md`。使用规范默认值并表面这一差距。
- 如果目标仓库的 CI 与安装不兼容（无 `.github/workflows/`，无等价物），拒绝可选的 CI 步骤并记录手动路径。
- 如果团队使用包的私有分叉，拒绝编写公开安装器。私有安装器携带私有不变量。

输出结构：

```
agent-workbench-pack/
├── AGENTS.md
├── docs/
├── schemas/
├── scripts/
├── bin/install.sh
├── lint_pack.py
├── VERSION
└── README.md
```

最后附上"接下来阅读"指向：

- 课程 41 —— 此包改进的前后基准。
- 课程 30（评估驱动的智能体开发）—— 消费包裁决的评估循环。
- [SkillKit](https://github.com/rohitg00/skillkit) —— 将包分发到 32 个 AI 智能体。
