---
name: migration-agent
description: 构建一个仓库级代码迁移 Agent，结合确定性配方和 Agent 后备循环，通过 MigrationBench，并发布失败分类。
version: 1.0.0
phase: 19
lesson: 09
tags: [capstone, code-migration, openrewrite, libcst, migrationbench, agent, sandbox]
---

给定一个 Java 8 或 Python 2 仓库，生成一个已迁移的分支（到 Java 17 或 Python 3.12），具有绿色的测试套件和最小的覆盖率回归。跨 MigrationBench 的 50 仓库子集进行评估。

构建计划：

1. 确定性运行：OpenRewrite（Java）或 libcst（Python）首先运行机械重写。提交为"recipe"提交，带有干净的差异。
2. Daytona 沙盒：预装目标运行时；每分支构建；只读源码挂载。
3. Agent 循环：基于 Claude Opus 4.7 + GPT-5.4-Codex 的 LangGraph 或 OpenAI Agents SDK。工具：`run_build`、`read_file`、`edit_file`、`run_test`、`git_diff`。分类失败（依赖、语法、测试、构建工具），应用有针对性的修复，重新运行。
4. 预算上限：30 分钟、8 美元、20 轮。任何违反立即暂停并归档为"budget_exhausted"，附带当前差异。
5. 测试 + 覆盖率门：构建变绿然后测试变绿；覆盖率不得下降超过 2%。
6. 打开 PR，包含 recipe 提交 + Agent 提交 + 摘要注释。
7. 失败分类：每个仓库标签来自 `{dep_upgrade_required, build_tool_drift, custom_annotation, test_flake, syntax_edge_case, budget_exhausted, coverage_regression}`。
8. 跨 MigrationBench 的 50 仓库运行；发布每类通过率、每仓库成本和覆盖保持率；与仅确定性基线对比。

评估标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | MigrationBench 通过率 | 50 仓库子集 pass@1 |
| 20 | 测试覆盖保持率 | 与基础分支的平均覆盖率差异 |
| 20 | 每个迁移仓库的成本 | 通过运行的平均 $/repo |
| 20 | Agent / 确定性工具集成 | OpenRewrite 处理的修复比例 vs Agent 处理的修复比例 |
| 15 | 失败分析报告 | 分类完整性，带示例 |

硬性拒绝：

- 跳过确定性运行的管道。OpenRewrite 比任何 Agent 更廉价、更可靠地处理 70-80% 的机械工作。
- 覆盖率回归超过 2% 被视为通过。
- 将机械和 Agent 编写的更改合并到一个提交中的 PR。必须分开。
- 报告通过率时没有在相同 50 个仓库上的匹配仅确定性基线。

拒绝规则：

- 拒绝强制推送已迁移分支覆盖基础分支。始终是新分支 + PR。
- 拒绝打开 CI 未在沙盒中变绿的 PR。
- 拒绝在没有明确修改许可的情况下对公司仓库运行。

输出：一个包含两层迁移管道、50 仓库 MigrationBench 运行日志、失败分类仪表盘、匹配的仅确定性基线运行、以及一份关于三个最常见失败类别以及消除每个类别所需配方变更的报告的仓库。
