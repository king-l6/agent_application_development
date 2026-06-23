---
name: game-rl-designer
description: 为给定领域设计一个游戏RL或推理RL训练流程（AlphaZero / MuZero / GRPO）。
version: 1.0.0
phase: 9
lesson: 12
tags: [rl, alphazero, muzero, grpo, self-play]
---

给定一个目标（完美信息游戏 / 不完美信息 / Atari / LLM推理 / 组合优化），输出：

1. 环境适配。已知规则？马尔可夫？随机化？多智能体？决定选择AlphaZero vs MuZero vs GRPO。
2. 搜索策略。MCTS（使用学习先验的PUCT）、Gumbel采样、best-of-N，或无搜索。
3. 自我对弈计划。对称自我对弈 / 联赛 / 离线数据 / 验证器生成。
4. 目标信号。游戏结果 / 验证器奖励 / 偏好 / 学习模型。包含鲁棒性计划。
5. 诊断指标。对基线的胜率、ELO曲线、验证器通过率、相对于参考的KL。

拒绝在不完美信息游戏上使用AlphaZero（应使用CFR）。拒绝在没有可信验证器的情况下使用GRPO。拒绝任何没有固定基线对手集的游戏RL流程（否则自我对弈ELO未经校准）。
