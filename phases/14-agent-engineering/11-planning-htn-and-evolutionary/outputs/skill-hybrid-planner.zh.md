---
name: hybrid-planner
description: 构建一个混合规划器——ChatHTN 用于可证明正确的计划，AlphaEvolve 用于带机器可检查评估器的代码搜索——并为问题选择正确的方案。
version: 1.0.0
phase: 14
lesson: 11
tags: [planning, htn, chathtn, alphaevolve, evolutionary-search]
---

给定一个问题类别（策略约束的工作流 vs 代码优化 vs 开放式任务），选择一个规划器并生成正确的脚手架。

决策：

1. 问题是否有硬性前置条件/策略/调度约束？ -> HTN（ChatHTN）。
2. 问题是否有一个确定性的、可机器检查的适应度函数？ -> 进化式（AlphaEvolve）。
3. 两者都不符合？ -> 改为选择 ReAct（第 01 课）或 ReWOO（第 02 课）。

对于 HTN，生成：

1. `Operator` 类型，包含 `preconditions`、`effects_add`、`effects_remove`。
2. `Method` 类型，包含 `task`、`preconditions`、`subtasks`。
3. 一个规划器，先尝试方法，回退到 LLM 分解，并缓存成功的 LLM 分解。
4. 一个验证步骤，拒绝引用未知操作符或方法的 LLM 分解。

对于进化式，生成：

1. 候选程序的种子种群。
2. 返回标量适应度的确定性评估器。
3. 一个变异操作符（LLM 驱动或基于规则）。
4. 一个选择循环（保留 top-k、变异、重复）并带有提前停止。

硬性拒绝：

- LLM 输出未经操作符模式验证而直接应用的 ChatHTN。正确性的主张无法成立。
- 评估器调用 LLM 评判者的 AlphaEvolve。适应度必须是确定性的；LLM 评判者引入随机噪声，循环无法从中恢复。
- 任一种模式用于开放式任务（"写一篇博客文章"）。没有评估器，没有前置条件 -> 使用 ReAct。

拒绝规则：

- 如果领域没有明确的操作符模式，拒绝 ChatHTN。建议 ReWOO 或普通的 ReAct。
- 如果领域没有可机器检查的适应度，拒绝 AlphaEvolve。建议 Self-Refine（第 05 课）。
- 如果用户想要"规划器 + LLM 做最终决策"，拒绝。符号正确性与 LLM 探索之间的分离是承重结构。

输出：`operators.py`、`methods.py`、`planner.py`（HTN）或 `evaluator.py`、`mutator.py`、`loop.py`（进化式），外加 `README.md` 说明决策理由。以"下一步阅读"结束，如果问题适合辩论式验证则指向第 25 课，如果问题实际上仍然是 ReWOO 形状的则指向第 02 课。
