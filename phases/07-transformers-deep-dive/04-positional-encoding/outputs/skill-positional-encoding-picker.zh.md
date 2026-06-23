---
name: positional-encoding-picker
description: 给定上下文长度和训练预算，选择位置编码（RoPE、ALiBi、正弦）及缩放策略。
version: 1.0.0
phase: 7
lesson: 4
tags: [transformers, positional-encoding, rope, alibi]
---

给定一个 transformer 规格（推理时的目标上下文长度、训练时的上下文长度、外推需求、微调预算 token 数），输出：

1. **基础编码。** 选择：RoPE、ALiBi、正弦、学习绝对。用一句话说明理由。
2. **超参数。** 如果选择 RoPE：`base` 值，`d_head` 需偶数分割。如果选择 ALiBi：斜率公式。如果选择正弦：`max_len`。
3. **扩展策略。** 如果目标 > 训练：NTK-aware 缩放因子、YaRN 配置、LongRoPE 规格或位置插值比率。说明微调 token 预算。
4. **测试计划。** 在最大上下文下的 NIAH（大海捞针）通过率目标，相对于训练长度基线的困惑度差距。
5. **备用方案。** 如果长上下文评估失败的处理方式：使用更大的 `base` 重新训练、切换到 ALiBi，或限制部署上下文长度。

拒绝推荐 2026 年的新模型使用正弦或学习绝对位置编码——它们不能外推，且所有现代技术栈都假设使用 RoPE 或 ALiBi。拒绝在没有微调阶段的情况下将 RoPE 扩展到训练长度的 8 倍以上。拒绝在未对完整部署长度运行 NIAH 测试的情况下交付长上下文配置。
