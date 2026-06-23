# 流匹配与修正流

> 扩散模型需要 20-50 步采样，因为它们从噪声到数据走的是弯曲路径。流匹配（Lipman 等人，2023）和修正流（Liu 等人，2022）训练的是直线路径。更直的路径意味着更少的步数，意味着更快的推理。Stable Diffusion 3、Flux.1 和 AudioCraft 2 都在 2024 年切换到了流匹配。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 8 · 06（DDPM），阶段 1 · 微积分
**时间：** ~45 分钟

## 问题

DDPM 的反向过程是一个从 `N(0, I)` 回到数据分布的 1000 步随机游走。DDIM 将其压缩为 20-50 步确定性步数。你希望更少的步数——最好是 1 步。阻碍在于求解反向过程的 ODE 是刚性的；路径是弯曲的。

如果你能训练模型使得从噪声到数据的路径是一条*直线*，那么从 `t=1` 到 `t=0` 的单个欧拉步骤就能工作。流匹配直接构建了这一点：定义从 `x_1 ∼ N(0, I)` 到 `x_0 ∼ data` 的直线插值，训练向量场 `v_θ(x, t)` 以匹配其时间导数，在推理时进行积分。

修正流（Liu 2022）更进一步：通过重流（reflow）过程迭代地使路径变直，产生一个逐渐接近线性的 ODE。经过两次重流迭代后，2 步采样器即可匹配 50 步 DDPM 的质量。

## 概念

![流匹配：噪声与数据之间的直线插值](../assets/flow-matching.svg)

### 直线流

定义：

```
x_t = t · x_1 + (1 - t) · x_0,   t ∈ [0, 1]
```

其中 `x_0 ~ data` 且 `x_1 ~ N(0, I)`。沿这条直线的时间导数是常数：

```
dx_t / dt = x_1 - x_0
```

定义一个神经向量场 `v_θ(x_t, t)` 并训练它匹配这个导数：

```
L = E_{x_0, x_1, t} || v_θ(x_t, t) - (x_1 - x_0) ||²
```

这就是**条件流匹配**损失（Lipman 2023）。训练无需模拟：你从不解开 ODE。只需采样 `(x_0, x_1, t)` 并进行回归。

### 采样

在推理时，对学习到的向量场进行*逆向*时间积分：

```
x_{t-Δt} = x_t - Δt · v_θ(x_t, t)
```

从 `x_1 ~ N(0, I)` 开始，用欧拉步逐步下降到 `t=0`。

### 修正流（Liu 2022）

直线流有效，但学习到的路径*实际上并不直*——它们弯曲，因为许多 `x_0` 可以映射到同一个 `x_1`。修正流的重流步骤：

1. 用随机配对训练流模型 v_1。
2. 通过对 v_1 从 `x_1` 到其着陆点 `x_0` 进行积分，采样 N 对 `(x_1, x_0)`。
3. 在这些配对的例子上训练 v_2。由于这些配对现在已经是"ODE 匹配"的，它们之间的直线插值真正更平坦。
4. 重复。

在实践中，2 次重流迭代就能达到接近线性的效果，实现 2-4 步推理。SDXL-Turbo、SD3-Turbo、LCM 都是基于流匹配蒸馏的模型。

### 为什么这在 2024 年赢得了图像生成

三个原因：

1. **无需模拟的训练** — 训练中无需解开 ODE，实现简单。
2. **更好的损失几何** — 直线路径具有一致的信噪比，而 DDPM 的 ε 损失在调度边缘处信噪比很差。
3. **更快的推理** — 以 SDXL-Turbo 质量进行 4-8 步推理；通过一致性蒸馏可达成 1 步推理。

## 流匹配 vs DDPM——确切联系

具有高斯条件路径的流匹配就是扩散*加上特定的噪声调度*。选择 `x_t = α(t) x_0 + σ(t) x_1` 调度，流匹配就恢复了 Stratonovich 重新表述的扩散，其中 `v = α'·x_0 - σ'·x_1`。对于高斯路径，两者在代数上是等价的。

流匹配带来的：目标的*清晰性*（一个简单的速度场）、更干净的损失、以及尝试非高斯插值函数的自由度。

## 动手构建

`code/main.py` 在双峰高斯混合上实现了 1 维流匹配。向量场 `v_θ(x, t)` 是一个微小 MLP，用直线目标进行训练。在推理时，用 1、2、4 和 20 步欧拉积分并比较样本质量。

### 第 1 步：训练损失

```python
def train_step(x0, net, rng, lr):
    x1 = rng.gauss(0, 1)
    t = rng.random()
    x_t = t * x1 + (1 - t) * x0
    target = x1 - x0
    pred = net_forward(x_t, t)
    loss = (pred - target) ** 2
    # 反向传播 + 更新
```

### 第 2 步：多步推理

```python
def sample(net, num_steps):
    x = rng.gauss(0, 1)
    for i in range(num_steps):
        t = 1.0 - i / num_steps
        dt = 1.0 / num_steps
        x -= dt * net_forward(x, t)
    return x
```

### 第 3 步：比较步数

预期 4 步采样器已经能够匹配 20 步的质量——这对延迟来说意义重大。

## 陷阱

- **时间参数化。** 流匹配使用 `t ∈ [0, 1]`，其中 `t=0` 对应数据，`t=1` 对应噪声。DDPM 使用 `t ∈ [0, T]`，其中 `t=0` 对应数据，`t=T` 对应噪声。方向相同，尺度不同。论文中经常搞错这一点。
- **调度选择。** 修正流的直线是"标准"的流匹配调度，但你可以使用余弦或 logit-normal t 采样（SD3 使用后者）以获得更好的尺度覆盖。
- **重流成本。** 为重流生成配对数据集需要每个样本进行一次完整的推理。只在确实需要 1-2 步推理时才进行重流。
- **无分类器引导仍然适用。** 只需在线性组合中将 ε 替换为 v：`v_cfg = (1+w) v_cond - w v_uncond`。

## 使用建议

| 用例 | 2026 年推荐方案 |
|----------|-----------|
| 文本到图像，最佳质量 | 流匹配：SD3、Flux.1-dev |
| 文本到图像，1-4 步 | 蒸馏流匹配：Flux.1-schnell、SD3-Turbo、SDXL-Turbo |
| 实时推理 | 基于流匹配基础模型的一致性蒸馏（LCM、PCM） |
| 音频生成 | 流匹配：Stable Audio 2.5、AudioCraft 2 |
| 视频生成 | 流匹配与扩散混合（Sora、Veo、Stable Video） |
| 科学/物理（粒子轨迹、分子） | 流匹配 + 等变向量场 |

每当 2025-2026 年的论文说"比扩散更快"时，几乎都是流匹配 + 蒸馏。

## 交付技能

保存 `outputs/skill-fm-tuner.md`。技能接收一个扩散风格模型规格并将其转换为流匹配训练配置：调度选择、时间采样分布（均匀 / logit-normal）、优化器、重流计划、目标步数、评估协议。

## 练习

1. **简单。** 运行 `code/main.py`，比较 1 步 vs 20 步 MSE 与真实数据分布的差异。
2. **中等。** 从均匀 `t` 采样切换到 logit-normal（将采样集中在中间 t）。模型质量是否提高？
3. **困难。** 实现一次重流迭代：通过对第一个模型进行积分生成配对 (x_0, x_1)，在这些配对上训练第二个模型，比较 1 步采样质量。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| Flow matching | "直线扩散" | 训练 `v_θ(x, t)` 沿插值路径匹配 `x_1 - x_0`。 |
| Rectified flow | "重流" | 使学习到的流变直的迭代过程。 |
| Velocity field | "v_θ" | 模型的输出——移动 `x_t` 的方向。 |
| Straight-line interpolant | "路径" | `x_t = (1-t)·x_0 + t·x_1`；简单的目标导数。 |
| Euler sampler | "一阶 ODE 求解器" | 最简单的积分器；路径较直时效果很好。 |
| Logit-normal t | "SD3 采样" | 将 `t` 采样集中到梯度最强的中间值。 |
| Consistency distillation | "1 步采样器" | 训练学生模型将任意 `x_t` 直接映射到 `x_0`。 |
| CFG with velocity | "v-CFG" | `v_cfg = (1+w) v_cond - w v_uncond`；相同的技巧，新的变量。 |

## 生产注意事项：Flux.1-schnell 是最快的流匹配

流匹配在生产中的胜利是 Flux.1-schnell——一个流匹配的 DiT，蒸馏到 1-4 推理步骤，同时保持 Flux-dev 级别的质量。Niels 的"在 8GB 机器上运行 Flux"笔记本是参考部署方案：T5 + CLIP 编码，量化 MMDiT 去噪（schnell 只需 4 步，dev 需要 50 步），VAE 解码。成本核算：

| 变体 | 步数 | L4 上 1024² 的延迟 | 总 FLOPs（相对值） |
|---------|-------|------------------------|------------------------|
| Flux.1-dev（原始） | 50 | ~15 秒 | 1.0× |
| Flux.1-schnell | 4 | ~1.2 秒 | 0.08×（快 12 倍） |
| SDXL-base | 30 | ~4 秒 | 0.25× |
| SDXL-Lightning 2-step | 2 | ~0.3 秒 | 0.03× |

生产规则：**流匹配基础 + 蒸馏 = 2026 年快速文本到图像的默认方案。** 每个主要厂商都提供这种组合：SD3-Turbo（SD3 + 流 + 蒸馏）、Flux-schnell（Flux-dev + 修正流拉直）、CogView-4-Flash。纯扩散基础模型只存在于遗留检查点中。

## 延伸阅读

- [Liu, Gong, Liu (2022). Flow Straight and Fast: Learning to Generate and Transfer Data with Rectified Flow](https://arxiv.org/abs/2209.03003) — 修正流。
- [Lipman et al. (2023). Flow Matching for Generative Modeling](https://arxiv.org/abs/2210.02747) — 流匹配。
- [Esser et al. (2024). Scaling Rectified Flow Transformers for High-Resolution Image Synthesis](https://arxiv.org/abs/2403.03206) — SD3，大规模修正流。
- [Albergo, Vanden-Eijnden (2023). Stochastic Interpolants](https://arxiv.org/abs/2303.08797) — 覆盖 FM + 扩散的通用框架。
- [Song et al. (2023). Consistency Models](https://arxiv.org/abs/2303.01469) — 扩散/流的一步蒸馏。
- [Sauer et al. (2023). Adversarial Diffusion Distillation (SDXL-Turbo)](https://arxiv.org/abs/2311.17042) — turbo 变体。
- [Black Forest Labs (2024). Flux.1 models](https://blackforestlabs.ai/announcing-black-forest-labs/) — 生产中的流匹配。
