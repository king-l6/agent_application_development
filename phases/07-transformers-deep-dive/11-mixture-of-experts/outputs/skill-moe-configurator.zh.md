---
name: moe-configurator
description: 为新的 MoE Transformer 选择专家数量、top-k、均衡策略和共享专家布局。
version: 1.0.0
phase: 7
lesson: 11
tags: [transformers, moe, mixture-of-experts, scaling]
---

给定一个 Transformer 规格（总参数预算、每 token 期望活跃参数、可用训练 token 数、推理硬件），输出：

1. **MoE 布局。** `n_experts`、`top_k`、`n_shared`。前沿规模选择细粒度（256+ 专家，top-8）；较小模型选择经典（8 专家，top-2）。附一句理由。
2. **均衡策略。** 无辅助损失（DeepSeek-V3，默认）、Switch 风格辅助损失、或专家容量 + token 丢弃。如果是无辅助损失，给出 `γ` 值。
3. **专家并行计划。** 根据 VRAM 将专家分片到 GPU 上。给出每个专家的 VRAM 成本和总集群规模。
4. **路由精度。** fp32 路由器分数 vs fp16。路由精度在大规模下很重要。
5. **故障模式检查。** 命名的风险：路由器崩溃、专家饥饿、all-to-all 网络瓶颈、路由开销导致的推理延迟、checkpoint 内存占用。

拒绝为活跃参数低于 4B 的模型推荐 MoE——密集模型在同等算力下胜出。拒绝在 2026 年新项目中仅使用辅助损失均衡（无辅助损失是默认选择）。如果总参数超过 80 GB，拒绝交付没有专家并行计划的 MoE。标记 MoE 在延迟关键的单用户路径上可能比密集等价物更慢。
