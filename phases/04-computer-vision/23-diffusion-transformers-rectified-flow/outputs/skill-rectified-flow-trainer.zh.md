---
name: skill-rectified-flow-trainer
description: 编写一个完整的修正流训练循环，包含 AdaLN DiT 和欧拉采样
version: 1.0.0
phase: 4
lesson: 23
tags: [diffusion, rectified-flow, DiT, training]
---

# 修正流训练器

生成一个干净、最小的训练循环，能在任何图像张量数据集上成功训练一个小型 DiT 与修正流。

## 何时使用

- 在小规模上复现 SD3 / FLUX 训练目标。
- 在相同数据上基准测试修正流 vs DDPM。
- 为非标准领域（医学、卫星）构建自定义修正流模型。

## 输入

- `model`：一个接受 `(x, t)` 并返回预测速度的 `nn.Module`。
- `dataset`：模型领域内干净图像的可迭代对象。
- `optimizer`：AdamW，使用 `lr=1e-4`，`weight_decay=0.01`，`betas=(0.9, 0.99)`。
- `scheduler`：带预热（warmup）的余弦调度，默认 1000 个预热步。

## 训练步骤

```python
def rectified_flow_train_step(model, x0, optimizer, device):
    model.train()
    x0 = x0.to(device)
    n = x0.size(0)
    t = torch.rand(n, device=device)                     # 在 [0, 1] 上均匀分布
    epsilon = torch.randn_like(x0)
    x_t = (1 - t[:, None, None, None]) * x0 + t[:, None, None, None] * epsilon
    target_v = epsilon - x0                              # 速度目标
    pred_v = model(x_t, t)
    loss = F.mse_loss(pred_v, target_v)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    return loss.item()
```

## 采样（欧拉）

```python
@torch.no_grad()
def sample(model, shape, steps=20, device="cpu"):
    model.eval()
    x = torch.randn(shape, device=device)
    dt = 1.0 / steps
    t = torch.ones(shape[0], device=device)
    for _ in range(steps):
        v = model(x, t)
        x = x - dt * v
        t = t - dt
    return x
```

## 技巧

- 使用 `torch.rand` 均匀分布的 `t`；logit-normal 或 Sd3 风格的加权采样稍有帮助，但不是起步必需。
- 模型权重的 EMA 是标准实践；维护 `ema_model`，衰减率 0.9999。
- 条件模型的无分类器引导：训练时以 10% 概率将条件替换为空/空嵌入；推理时混合 `v_uncond + w * (v_cond - v_uncond)`，`w` 约为 3-5。
- 对于 LDM 风格训练（FLUX、SD3），整个循环在 VAE 潜变量空间中运行；上面的干净 `x0` 实际上是 `VAE.encode(image)`。
- 在 32x32 玩具数据集上的典型收敛：2000-5000 步。在真实潜变量 SD3 训练上：数十万步。

## 报告

```
[修正流训练]
  steps:        <int>
  final loss:   <float>
  ema decay:    <float>
  vae?:         yes | no
  cfg dropout:  <fraction>

[采样]
  default steps: 20
  schnell / turbo target: 4
  full quality reference: 50+（仅用于对比）
```

## 规则

- 绝不要在 RGB `uint8` 数据上用图像空间速度目标训练修正流；先归一化到零均值、单位方差。
- 始终按时间步区间记录训练损失；如果早期时间步（接近 0）的损失高于晚期时间步（接近 1），速度参数化可能配置错误。
- 不要在同一个训练循环中混合修正流速度目标和 DDPM 噪声目标；二选一。
- 在 Ampere+ GPU 上使用 bfloat16 训练；float16 在修正流中有时会因速度幅度产生 NaN 梯度。
