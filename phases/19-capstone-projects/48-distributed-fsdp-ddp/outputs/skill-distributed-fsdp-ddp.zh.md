---
name: distributed-fsdp-ddp
description: 使用从零实现的 DDP 包装器和 FSDP 参数分片草稿，在 gloo 或 nccl 后端上启动多卡训练。
version: 1.0.0
phase: 19
lesson: 48
tags: [分布式, ddp, fsdp, 集合通信]
---

## 何时使用

模型适合一个设备但你需要更多吞吐量（DDP）。模型不适合一个设备（FSDP）。无论哪种情况：使用相同代码路径的多卡训练设置。

## 启动进程组

```python
os.environ["MASTER_ADDR"] = "127.0.0.1"
os.environ["MASTER_PORT"] = str(port)
dist.init_process_group(backend="gloo", rank=rank, world_size=world_size)
```

`gloo` 是 CPU 后端；`nccl` 是 GPU 后端。两者实现相同的集合通信接口。

## 包装模型

1. 在 rank 0 上，从你的种子构建模型。
2. 用 DDP 外壳包装它。
3. 外壳的 `__init__` 为每个参数和缓冲区调用 `dist.broadcast(p.data, src=0)`。
4. 每次 `loss.backward()` 之后，训练器调用 `sync_grads()`。
5. `sync_grads()` 调用 `dist.all_reduce(p.grad, op=SUM)` 和 `p.grad.div_(world_size)`。
6. 每个 rank 使用相同的平均梯度执行优化器步骤。

## 分片参数（FSDP 草稿）

1. 展平每个参数，填充到 `world_size` 的倍数。
2. 在本地保留你的分片；释放其余部分。
3. 前向传播前，`dist.all_gather(...)` 在每个 rank 上重建完整张量。
4. 前向传播后，丢弃完整张量。

## 失败模式

- 跳过 broadcast：各 rank 从不同的初始化开始，静默发散。
- 忘记求和后除法：梯度按 world_size 缩放，优化器步骤过大。
- 对检查点使用跨设备重命名：不是原子的；与第47课相同的陷阱。
- 在同一集合通信中混用 CPU 和 CUDA 张量：后端不匹配，运行挂起。
