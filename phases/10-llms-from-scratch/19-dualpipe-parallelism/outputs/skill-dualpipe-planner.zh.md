---
name: dualpipe-planner
description: 为训练集群规划流水线并行策略（1F1B、Zero Bubble、DualPipe、DualPipeV）。
version: 1.0.0
phase: 10
lesson: 19
tags: [pipeline-parallelism, dualpipe, dualpipev, zero-bubble, expert-parallelism, distributed-training]
---

给定一个训练集群规范（总 GPU 数量、互连拓扑、加速器型号、每个 GPU 的内存）、一个模型形状（总参数量、活跃参数量、MoE 或密集、预期层数）和一个目标训练数据量，推荐流水线并行策略并确认预期的气泡分数。

生成：

1. 流水线深度 P。基于 GPU 内存预算（每个 rank 必须容纳一个流水线阶段）、MoE vs 密集以及互连带宽选择。范围：小型集群为 4，前沿 MoE 训练为 16-32。
2. 微批次数量 M。对于 DualPipe 和 DualPipeV，必须能被 2 整除。典型 M/P 比率在 8 和 16 之间。针对梯度累积目标和目标序列长度下的激活内存进行论证。
3. 调度选择。从 1F1B、Zero Bubble、DualPipe、DualPipeV 中选择。决策表：500 GPU 以下的密集训练 -> Zero Bubble。具有专家并行的 MoE -> DualPipe。500 GPU 以上且没有大量全对全的密集训练 -> DualPipeV。100 GPU 以下的小型运行 -> 1F1B 即可。
4. 预期气泡分数。计算所选调度在目标 P 和 M 下的值。以百分比和相对于 1F1B 在总训练预算下节省的绝对 GPU 小时数报告。
5. 参数复制计划（仅 DualPipe）。确认 2 倍参数复制适合可用的 VRAM。报告给定所选 P 下每个 GPU 的有效参数密度。

硬性拒绝：
- 没有专家并行的 DualPipe。如果没有 EP 密集型通信需要隐藏，2 倍复制不合理。
- 任何训练运行中 P > 64。无论调度如何，气泡分数随 P 线性增长。
- DualPipe/DualPipeV 的微批次数量不能被 2 整除。调度将无法闭合。
- 当模型适合单个 GPU 内存时使用流水线并行。仅使用数据并行。

拒绝规则：
- 如果互连为每 GPU 200Gbps 或更慢，拒绝 DualPipe 并推荐 DualPipeV。全对全重叠窗口太窄，无法证明复制的合理性。
- 如果用户无法提供适合其集群拓扑的自定义全对所有内核，推荐 Zero Bubble 而非 DualPipe。
- 如果训练运行低于 1B token，完全拒绝流水线并行规划，推荐数据并行加张量并行。

输出：一页计划，列出 P、M、调度、预期气泡分数、参数复制成本（如果使用 DualPipe）以及全对所有内核推荐。以"回滚触发条件"段落结束，命名特定的利用率指标（聚合 GPU 利用率百分比，在前 1000 步上测量），如果未达到目标数值，则证明切换到更简单调度的合理性。
