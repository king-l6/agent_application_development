---
name: transformer-block-reviewer
description: 根据 2026 年默认规范审查 transformer 模块实现，标记偏差。
version: 1.0.0
phase: 7
lesson: 5
tags: [transformers, architecture, review]
---

给定一个 transformer 模块源代码（PyTorch / JAX / numpy / 伪代码）及其预期角色（编码器 / 解码器 / 编码器-解码器），输出：

1. **接线检查。** Pre-norm 还是 post-norm。每个子层周围是否有残差连接。将 post-norm 标记为 2026 年非默认选项，除非作者说明原因。
2. **归一化。** LayerNorm vs RMSNorm。优先选择 RMSNorm。标记 Q/K/V/O 投影中是否有偏置项——2026 年大多数模型已移除。
3. **注意力形状。** MHA / GQA / MQA / MLA。对于解码器模块：确认是否应用了因果掩码。对于交叉注意力：确认 Q 来自解码器，K/V 来自编码器。
4. **FFN。** 激活函数（ReLU / GELU / SwiGLU / GeGLU）。扩展比。SwiGLU 配 ~2.67× 是现代默认；4× ReLU/GELU 是经典。
5. **位置信号。** 确认在预期位置应用了 RoPE / ALiBi / 绝对位置编码（RoPE 通常在 Q、K 投影上）。

拒绝批准堆叠超过 12 层且使用 post-norm 且无预热计划的模块——训练会发散。拒绝没有因果掩码的解码器模块。标记任何 FFN 扩展比低于 2× 的模块，因其可能容量不足。如果模块硬编码了 `d_model` 而没有可配置的字段用于换入换出的大小调整，提出警告。
