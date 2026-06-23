---
name: prompt-distributed-training-planner
description: 根据模型大小和可用硬件规划分布式训练运行
version: 1.0.0
phase: 10
lesson: 5
tags: [distributed-training, fsdp, deepspeed, tensor-parallelism, pipeline-parallelism, scaling]
---

# 分布式训练规划器

在规划大型语言模型的分布式训练运行时，使用此框架确定并行策略、内存预算、通信开销和预期吞吐量。

## 输入要求

提供：
- **模型大小**（以十亿为单位的参数）
- **目标训练token数**（以万亿为单位）
- **可用GPU**（类型：A100/H100/H200，数量，互连：NVLink/InfiniBand）
- **GPU内存**（A100/H100为80GB，H200为141GB）
- **节点**（每节点GPU数，节点数）
- **预算约束**（最大成本（美元），最大挂钟时间）

## 第1步：内存预算

计算每个组件的每GPU内存：

| 组件 | 公式 | FP16 | FP32 |
|-----------|---------|------|------|
| 权重 | params x bytes_per_param | params x 2 | params x 4 |
| Adam优化器（m + v） | params x 4 x 2 | 始终8字节/参数 | 始终8字节/参数 |
| 梯度 | params x bytes_per_param | params x 2 | params x 4 |
| 激活值（估算） | seq_len x batch x hidden x layers x 2 | 变化 | 变化 |

如果总计超过GPU内存，则需要分片。按顺序尝试：
1. ZeRO-1（仅分片优化器）——通信最便宜
2. ZeRO-2（+梯度）——中等通信
3. FSDP/ZeRO-3（+权重）——通信最高但内存节省最大
4. 如果激活值仍然太大，添加激活检查点
5. 如果单个层装不下一张GPU，添加张量并行

## 第2步：并行策略

### 决策树

1. **一层能否装在一张GPU上？**
   - 不能：你需要张量并行。设置TP = 2、4或8（节点内）。
   - 能：跳过张量并行。

2. **完整模型（带分片）能否装在一个节点内的GPU上？**
   - 不能：你需要流水线并行。设置PP = 节点数/组数。
   - 能：跳过流水线并行。

3. **数据并行还剩下多少GPU？**
   - DP = total_gpus / (TP x PP)

4. **数据并行组内的分片级别？**
   - 从FSDP（ZeRO-3）开始。如果通信成为瓶颈，降低到ZeRO-2或ZeRO-1。

### 典型配置

| 模型大小 | GPU总数 | TP | PP | DP | 分片 |
|-----------|-----------|----|----|-----|----------|
| 7B | 8 | 1 | 1 | 8 | FSDP |
| 13B | 16 | 2 | 1 | 8 | FSDP |
| 70B | 64 | 8 | 1 | 8 | FSDP |
| 70B | 128 | 8 | 2 | 8 | FSDP |
| 405B | 16,384 | 8 | 16 | 128 | FSDP |

## 第3步：通信分析

估算每训练步的通信量：

- **数据并行（all-reduce）**：每步 2 x gradient_size x (N-1)/N
- **FSDP（all-gather + reduce-scatter）**：每步约 3 x weight_size x (N-1)/N（高于DP）
- **张量并行（每层all-reduce）**：每步 2 x activation_size x num_layers（需要NVLink）
- **流水线并行（点对点）**：每阶段边界 activation_size（极小）

如果通信时间超过计算时间的20%，策略受通信限制。解决方案：
- 梯度累积（降低all-reduce频率）
- 将通信与计算重叠（FSDP默认这样做）
- 增加微批次大小（更好的计算与通信比率）
- 切换到通信较少的共享阶段

## 第4步：吞吐量和成本估算

**每训练步的FLOPs：**
- 前向：约 2 x params x tokens_per_batch
- 反向：约 4 x params x tokens_per_batch（2倍前向）
- 总计：约 6 x params x tokens_per_batch

**训练时间：**
- total_flops = 6 x params x total_tokens
- time_seconds = total_flops / (num_gpus x gpu_tflops x 1e12 x utilization)
- 典型利用率：35-45%（考虑到通信、流水线气泡、内存开销）

**成本：**
- total_gpu_hours = num_gpus x time_seconds / 3600
- cost = total_gpu_hours x cost_per_gpu_hour

## 第5步：验证检查清单

在启动之前：

1. 每GPU内存在硬件限制内（10%余量）
2. 有效批次大小匹配目标（per_gpu_batch x DP x gradient_accumulation_steps）
3. 通信与计算比率低于20%
4. 流水线气泡比例低于15%（足够的微批次）
5. 学习率为有效批次大小进行了缩放
6. 检查点保存频率考虑了故障概率（大规模运行每1-2小时保存一次）
7. 设置了梯度裁剪（大模型通常为1.0）
8. 预热步数与总步数成比例（通常为总量的0.1-1%）

## 红旗信号

- **TP > 8**：跨节点（通过InfiniBand）的张量并行几乎总是比流水线并行慢
- **流水线阶段 > 32**：即使有很多微批次，气泡开销也变得显著
- **有效批次大小 > 1000万个token**：收益递减；可能损害收敛
- **利用率低于30%**：通信受限——重新评估并行策略
- **13B以上没有激活检查点**：你会在反向传播期间耗尽内存
- **小每GPU批次没有梯度累积**：梯度噪声增加；累积到有效批次256+样本
