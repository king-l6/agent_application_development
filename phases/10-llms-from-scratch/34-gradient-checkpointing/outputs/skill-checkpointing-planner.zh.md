---
name: checkpointing-planner
description: 根据训练配置和 HBM 预算，为每层选择激活重计算策略（无 / 选择性 / 全 / 卸载）。
version: 1.0.0
phase: 10
lesson: 34
tags: [gradient-checkpointing, activation-recomputation, selective-checkpoint, fsdp-offload, training-memory]
---

给定训练配置（层数 L、隐藏大小 d、序列长度 S、微批次 B、每个值的 dtype 字节数、注意力内核、张量并行度 TP、流水线并行度 PP、专家并行度 EP（如果是 MoE））以及权重和优化器状态之后每 rank 的 HBM 预算，输出：

1. 每层策略。对于栈中的每层家族（嵌入、注意力、FFN、MoE 专家、归一化、输出头），选择无、选择性、全或卸载。当 S 超过 4_096 时，默认为注意力选择性；残差流和归一化默认为无；仅当该层激活的测量 PCIe 传输时间小于其测量重计算时间时，FFN 默认为卸载。
2. 段大小 k。如果启用全检查点，对于均匀层成本选择 k 为 round(sqrt(L))，当激活内存占主导预算时选择更小的 k。报告额外 FLOP 百分比为前向 FLOPs 的 (1/k)。
3. FlashAttention 交互。确认注意力内核是否已经重计算 softmax。如果是，选择性注意力检查点收效甚微；降级为无。按名称说明内核（FlashAttention-2/3、xFormers memory-efficient、vanilla）。
4. TP / PP 计划。对于 TP，命名需要在重计算时收集或重新分散的激活以及每步增加的通信字节数。对于 PP，确认哪些流水线阶段被端到端检查点，以便反向微批次在回流之前释放激活内存。
5. 预算计算。预测策略前后的激活内存（每 rank 的 MB）。预测 FLOP 开销为前向+反向的百分比。拒绝任何不适合 HBM 预算且没有 10% 余量的计划。

拒绝在选择性仅注意力就能闭合预算时每层都进行全检查点；性能分析显示 FLOP 开销比相同内存节省的选择性高许多倍，且精确比率取决于工作负载。当该层在目标 PCIe 链路上的测量激活传输时间超过其测量重计算时间时拒绝卸载；重计算胜出。对于 FP8 训练，当所选框架未快照 amax 历史时，拒绝"到处检查点"；重计算会使比例漂移并静默地破坏梯度。

示例输入："L=64, d=8192, S=8192, B=1, bf16, FlashAttention-3, TP=8, PP=4, 权重后每 rank HBM 预算 32 GB, MoE 有 8 个专家且 EP=8。"

示例输出：
- 每层策略：注意力选择性，FFN 无，MoE 专家全，嵌入无，输出头卸载。
- 段大小：全仅在 MoE 上应用，k=8；专家路径上 FLOP 开销 12%，其他地方 0。
- FlashAttention 交互：FA-3 已经重计算 softmax；在层包装器中选择性，不在内核内部。
- TP / PP 计划：重计算时 TP 收集注意力输入，每步额外通信 0.3 GB；PP 阶段各检查点其完整前向；PP 阶段 3 保留其激活用于最终反向。
- 预算计算：无策略时激活 38 GB，有策略时 11 GB。总 FLOP 开销为前向+反向的 7.5%。
