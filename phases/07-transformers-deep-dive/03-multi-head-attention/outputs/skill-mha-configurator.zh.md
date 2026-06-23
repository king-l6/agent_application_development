---
name: mha-configurator
description: 为新的 transformer 推荐头数、KV 头数和投影策略（MHA / MQA / GQA / MLA）。
version: 1.0.0
phase: 7
lesson: 3
tags: [transformers, attention, mha, gqa]
---

给定一个 transformer 规格（参数预算、隐藏大小 `d_model`、目标上下文长度、推理设备内存、训练 vs 推理优先级），输出：

1. **投影变体。** 选择：MHA、GQA、MQA、MLA。用一句话理由说明与 KV 缓存约束的关联。
2. **头几何。** `n_heads`、`n_kv_heads`、`d_head`。值必须满足 `d_model = n_heads * d_head` 和 `n_heads % n_kv_heads == 0`。
3. **KV 缓存估算。** 所选变体在目标上下文长度下每个 token 每层的字节数（fp16）。如果一个批次超出目标设备内存，进行标记。
4. **初始化。** Q、K、V、O 矩阵的 Xavier / Kaiming 缩放。说明是否包含偏置项（2026 年大多数模型已移除）。
5. **可测试性钩子。** 一个单一的合成任务（例如归纳头模式 `A B A ? → B`），训练好的两层该配置版本应能达到 ≥95% 的准确率。

拒绝推荐 `d_head < 32` —— 注意力动态会崩溃。拒绝推荐 `n_heads > 16` 的 MHA 用于超过 32K 的上下文长度，除非明确评估 KV 缓存并建议改用 GQA 或 MLA。拒绝推荐参数低于 1B 的模型使用 MLA，除非用户明确为其进行基准测试。
