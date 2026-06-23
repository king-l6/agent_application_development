---
name: transformer-review
description: 根据阶段 7 的 13 课内容审查从零构建 Transformer 的实现。
version: 1.0.0
phase: 7
lesson: 14
tags: [transformers, review, capstone]
---

给定一个从零构建的 Transformer 代码库（PyTorch / JAX），根据 2026 年的默认实践进行审查，并标记缺失或不正确的部分：

1. 注意力。因果掩码存在。按 `sqrt(d_head)` 缩放。多头拆分正常工作。如果可用则使用 Flash Attention。如果 d_model ≥ 1024 则提及 GQA。
2. 位置编码。RoPE（2026 年首选）或学习绝对位置编码（小型模型可接受）。标记正弦编码为历史做法。
3. 模块布线。预归一化（非后归一化）。RMSNorm（非 LayerNorm）。SwiGLU FFN（非 ReLU/GELU）。每个子层周围有残差连接。线性层中去除偏置（现代默认）。
4. 训练。AdamW（或 2026+ 的 Muon）、带线性预热的余弦学习率调度、梯度裁剪为 1.0、bf16 自动混合精度。token 嵌入和 lm_head 之间的权重绑定。
5. 损失。每个位置的偏移一位交叉熵。如果有填充则掩码掉。以固定间隔记录训练和验证损失。

以下情况拒绝签署通过：后归一化没有明确原因、2026 年生产代码中使用 LayerNorm 没有合理解释、解码器自注意力中缺少因果掩码、小型 LM 中未绑定嵌入。标记：没有验证集分割、没有梯度裁剪、学习率 > 1e-3 且没有预热、或者 block_size 超过位置嵌入范围且没有回退方案。建议端到端运行 `python code/main.py`，并检查在 nano 配置下最终验证损失在 tinyshakespeare 上是否低于 2.5。
