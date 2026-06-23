---
name: rlhf-architect
description: 为语言模型设计 RLHF / DPO / GRPO 对齐流水线，包括 RM、KL 和数据策略。
version: 1.0.0
phase: 9
lesson: 9
tags: [rl, rlhf, alignment, llm]
---

给定一个基础 LM、一个目标行为（对齐 / 推理 / 拒绝 / 智能体）和偏好或验证器预算，输出：

1. 阶段。SFT？RM？DPO？GRPO？附理由。
2. 偏好或验证器来源。人类、AI 反馈、基于规则、单元测试通过、或奖励蒸馏。
3. KL 策略。固定 β、自适应 β、或 DPO（隐式 KL）。
4. 诊断。平均 KL、奖励稳定性、过度优化防护（保留的人类评估）。
5. 安全门。红队测试集、拒绝率、独立于助人性 RM 的安全性 RM。

拒绝在没有 KL 监控的情况下交付 RLHF-PPO。拒绝使用比目标策略小的 RM。拒绝仅长度奖励。标记任何没有保留盲审人类评估集的流水线为缺乏过度优化保护。
