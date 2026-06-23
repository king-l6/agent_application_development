---
name: sequence-architecture-picker
description: 根据长度、吞吐量和训练预算选择序列架构（RNN、transformer、SSM、混合架构）。
version: 1.0.0
phase: 7
lesson: 1
tags: [transformers, architecture, rnn, ssm]
---

给定一个序列问题（最大长度、批次形状、预算的训练 token 数、推理延迟目标、设备类型），输出：

1. **主要架构。** 选择：transformer、状态空间模型（Mamba/RWKV）、混合 SSM+注意力、RNN。用一句话理由说明与主要约束的关联。
2. **上下文长度策略。** 如果选择 transformer：全注意力截断点、滑动窗口大小、RoPE 缩放因子。如果选择 SSM：扫描块大小。如果选择 RNN：隐藏层宽度。
3. **训练 FLOP 概况。** 根据架构和上下文估算每个 token 的 FLOPs；说明规格是否适合计算预算。
4. **推理内存概况。** transformer 的 KV 缓存、SSM 的状态大小、RNN 的每个 token 内存。标记目标设备是否能容纳单个批次。
5. **风险说明。** 该选择在规格规模下一个已知的具体失败模式（例如，在没有 Flash Attention 的 24GB GPU 上，64K 上下文的 transformer 会 OOM）。

拒绝推荐纯 RNN 用于任何超过 1B token 的训练任务，除非明确说明梯度流和并行性损失。拒绝推荐全注意力 transformer 用于 >64K 上下文，除非明确说明 `O(N^2)` 内存成本。拒绝推荐发布不到 12 个月的全新架构用于生产环境，除非有指定的备用方案。
