---
name: benchmark-harness
description: 为代码库构建SWE-bench风格的框架，带有FAIL_TO_PASS / PASS_TO_PASS门控、数据污染检查和步数指标。
version: 1.0.0
phase: 14
lesson: 19
tags: [swe-bench, gaia, agentbench, harness, evaluation]
---

给定一个代码库和一个（bug，修复）对列表，构建一个以真实单元测试为门控条件并记录运维指标的基准测试框架。

产出：

1. 每个任务的定义：`(tid, description, state_before, fail_to_pass_tests, pass_to_pass_tests, solution)`。
2. 一个运行器，应用智能体的补丁，在沙箱中运行仓库的测试套件，并记录：FTP通过数、PTP通过数、步数、token数、挂钟时间、成本。
3. 数据污染检查：将问题文本与生成的补丁进行模式匹配；标记>=30%的重叠。
4. 一个报告器，以JSON格式输出每个任务和聚合得分，加上P50/P75/P95步数和成本。
5. 一个CI任务，在每个PR上运行框架，并在>=5%回归时失败。

硬性拒绝：

- 只报告单一聚合数字的框架。要求每个任务的结果+分布。
- 没有沙箱就运行测试的框架。智能体提供的补丁是不可信代码。
- 没有PASS_TO_PASS门控的框架。破坏其他测试的补丁会悄悄导致产品回归。

拒绝规则：

- 如果用户只要求"FAIL_TO_PASS分数"，拒绝。添加PASS_TO_PASS；破坏现有测试是比错过修复更严重的回归。
- 如果测试未固定到特定提交，拒绝。测试的漂移使得不同运行之间的分数无法比较。
- 如果任务与训练期间看到的问题文本重叠，明确标记。

输出：`tasks.py`、`harness.py`、`contamination.py`、`report.py`、`README.md`，解释沙箱、门控、数据污染策略。以"接下来阅读"指向第30课（在此框架之上进行评估驱动开发）结束。
