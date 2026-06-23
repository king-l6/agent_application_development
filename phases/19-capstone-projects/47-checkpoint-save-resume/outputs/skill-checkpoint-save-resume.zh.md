---
name: checkpoint-save-resume
description: 原子化、分片检查点，带完整 RNG 捕获，使被中断的运行可以在轮次中间恢复，并保持相同的损失轨迹。
version: 1.0.0
phase: 19
lesson: 47
tags: [训练, 持久性, 恢复, 分片状态]
---

## 何时使用

任何比集群墙钟上限更长的训练运行，任何必须在节点重启后幸存下来的运行，任何对于单个负载来说过大的模型。

## 负载形状

```python
{
  "schema": "ckpt.v1",
  "model": model.state_dict(),
  "optimizer": opt.state_dict(),
  "scheduler": sched.state_dict(),
  "state": {"step": int, "epoch": int, "batch_in_epoch": int, "losses": [float, ...]},
  "rng": {"python": ..., "numpy": ..., "torch_cpu": ..., "torch_cuda": ...},
  "wall_saved_at": time.time(),
}
```

## 原子化保存

1. 将负载写入目标目录中唯一的临时文件。
2. `os.replace(tmp, target)` 原子化交换。
3. 永远不要直接写入目标名称。

## 分片布局

- 每个分片一个 `model.shard-NNN.pt`，按键轮询或按参数组拆分。
- `meta.pt` 携带优化器、调度器、训练状态、RNG 和分片清单。
- `index.json` 为每个分片和 `meta.pt` 携带 `sha256`。
- 加载器在合并前验证每个哈希。

## 轮次中间恢复

- 在 `step` 旁边保存 `(epoch, batch_in_epoch)`。
- 在恢复轮次的第一个批次之前恢复 RNG 状态。
- 将生成器快进到已消费的批次之后。

## 失败模式

- 跨设备重命名：不是原子的，丢失之前的文件。将临时文件放在同一目录。
- 忘记 RNG：恢复的损失偏离基线。运行演示的断言。
- 忘记优化器状态：下一步猛冲。同样的差异爆炸式增长。
- 修剪了错误的检查点：保留最后 K 个加最佳。
