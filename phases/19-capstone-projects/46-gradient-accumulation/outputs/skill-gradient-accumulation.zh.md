---
name: gradient-accumulation
description: 通过缩放微批次损失并每个窗口只执行一次优化器步骤，以大于设备内存的有效批次进行训练。
version: 1.0.0
phase: 19
lesson: 46
tags: [training, batch-size, distributed, scaling]
---

## 何时使用

有效批次是平滑梯度并使学习率调度策略匹配的杠杆。当无法在单次前向传播中负担时，这就是配方。

## 配方

1. 选择 `micro_batch` 为能放入内存并饱和加速器的最大大小。
2. 从学习率调度策略中选择 `effective_batch`。
3. 设置 `accum_steps = effective_batch // (micro_batch * world_size)` 并断言它能整除。
4. 每微批次：`loss = criterion(model(x), y) / accum_steps; loss.backward()`。
5. 在非最终微批次上，进入 `model.no_sync()` 以跳过 DDP 中的梯度全规约。
6. 在最后一个微批次后，运行一次 `optimizer.step()`。在下一个窗口前清零梯度。
7. 优化器状态每个有效批次前进一次；学习率调度策略每个有效批次跳动一次。

## 日志记录

每个有效步骤发出一个小型 JSON 记录，包含 `samples_per_sec`、`median_step_ms`、`sync_calls`、`accum_steps`、`effective_batch`。没有它，成本权衡是不可见的。

## 故障模式

- 忘记 `/ accum_steps` 缩放：梯度爆炸 N 倍。
- 在窗口中间执行步骤：参数漂移。
- 每个微批次都进行同步：网络受限，无统计收益。
- 与混合精度取消缩放混合：仅缩放未缩放的损失。
