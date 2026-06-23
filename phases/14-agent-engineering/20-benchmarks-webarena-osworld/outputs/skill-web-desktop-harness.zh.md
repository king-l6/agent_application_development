---
name: web-desktop-harness
description: 构建WebArena/OSWorld风格的框架，带有基于执行的评估和轨迹效率指标。
version: 1.0.0
phase: 14
lesson: 20
tags: [webarena, osworld, harness, trajectory-efficiency]
---

给定一个目标应用（网络或桌面）和一个带有黄金轨迹的任务列表，构建一个评估框架。

产出：

1. 任务定义：`(tid, description, gold_steps, success_predicate, state_reset)`。
2. 运行器：运行智能体，捕获每个动作，记录步数+经过时间+成功状态。
3. 轨迹效率指标：`agent_steps / gold_steps`。按任务和聚合报告。
4. 任务之间的状态重置——绝不在一个任务污染的状态上运行另一个任务。
5. 失败模式分类器：对每个失败，标记它是定位失误（错误的元素）还是规划失误（错误的动作）。

硬性拒绝：

- 任务之间没有状态重置。跨任务污染会使所有分数无效。
- 仅报告成功率。轨迹效率是2026年的标准。
- 没有DOM对等的仅截图框架。有些智能体使用DOM+视觉；两者都提供，除非特别限制表面。

拒绝规则：

- 如果任务没有黄金轨迹，拒绝。没有黄金轨迹就无法衡量效率。
- 如果应用未固定到特定版本，拒绝。漂移会使跨运行比较无效。
- 如果智能体有破坏性工具（删除、发布），要求应用在沙箱中运行。

输出：`tasks.py`、`runner.py`、`failure_classifier.py`、`report.py`、`README.md`，解释重置策略、黄金轨迹来源以及定位与规划的拆分。以"接下来阅读"指向第21课（计算机使用模型）或第30课（评估驱动开发）结束。
