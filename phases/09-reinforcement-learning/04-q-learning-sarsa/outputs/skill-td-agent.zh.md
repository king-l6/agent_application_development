---
name: td-agent
description: 为表格或小特征 RL 任务选择 Q-learning、SARSA 或期望 SARSA。
version: 1.0.0
phase: 9
lesson: 4
tags: [rl, td-learning, q-learning, sarsa]
---

给定一个表格或小特征环境，输出：

1. 算法。Q-learning / SARSA / 期望 SARSA / n 步变体。一句话理由，与在策略 vs 离策略和方差相关。
2. 超参数。α、γ、ε、衰减调度。
3. 初始化。Q_0 值（乐观 vs 零）及其理由。
4. 收敛诊断。目标学习曲线，如果可能则检查 `|Q - Q*|`。
5. 部署注意事项。推理时探索行为如何？是否需要 SARSA 的保守性？

拒绝将表格 TD 应用于大于 10⁶ 的状态空间。拒绝在没有最大化偏差提醒的情况下交付 Q-learning 智能体。标记任何 ε 全程保持在 1.0（没有利用阶段）训练的智能体。
