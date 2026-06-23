---
name: attention-shapes
description: 调试注意力实现中的形状错误。
phase: 5
lesson: 10
---

给定一个出错的注意力实现，你识别形状不匹配。输出：

1. 哪个矩阵形状错误。命名张量。
2. 根据 `(d_s, d_h, d_attn, T_enc, T_dec, batch_size)` 推导出其应有的形状。
3. 一行修复。转置、重塑或投影。
4. 一个用于捕获回归的测试。通常断言 `output.shape == (batch, T_dec, d_h)` 且 `weights.shape == (batch, T_dec, T_enc)` 且 `weights.sum(dim=-1)` 接近 1。

拒绝推荐静默广播的修复。隐藏广播的错误会在后来表现为悄无声息的准确率下降。

对于 Bahdanau 混淆，坚持解码器输入是 `s_{t-1}`（步前状态）。对于 Luong，是 `s_t`（步后状态）。点积注意力中最常见的初学错误是查询/键维度不匹配——显式地标记它。
