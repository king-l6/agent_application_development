# 扩散模型——从零实现DDPM

> Ho、Jain、Abbeel（2020）为这个领域提供了一个无法拒绝的配方。通过一千个微小的步骤用噪声破坏数据。训练一个神经网络来预测噪声。在推理时逆转这个过程。如今，所有主流的图像、视频、3D和音乐模型都在这个循环上运行，可能还叠加了流匹配或一致性技巧。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段3·02（反向传播）、阶段8·02（VAE）
**时间：** ~75分钟

## 问题

你想要一个能从`p_data(x)`采样的模型。GANs玩的是一个极小极大博弈，通常会发散。VAEs从高斯解码器中产生模糊的样本。你真正想要的是一个训练目标，它（a）是单一的稳定损失（没有鞍点，没有极小极大），（b）是`log p(x)`的下界（因此你可以得到似然值），并且（c）产生的样本达到最先进的质量。

Sohl-Dickstein等人（2015）给出了一个理论答案：定义一个马尔可夫链`q(x_t | x_{t-1})`逐步添加高斯噪声，并训练一个反向链`p_θ(x_{t-1} | x_t)`去噪。Ho、Jain、Abbeel（2020）证明了这个损失可以简化为一行——预测噪声——并清理了数学。2020年这只是一个有趣的想法。2021年它产生了最先进的样本。2022年它变成了Stable Diffusion。2026年它是整个领域的基础。

## 概念

![DDPM：前向加噪声，反向去噪](../assets/ddpm.svg)

**前向过程`q`。** 通过`T`个小步添加高斯噪声。闭式解——数学可处理的原因——是累积步骤也是高斯的：

```
q(x_t | x_0) = N( sqrt(α̅_t) · x_0,  (1 - α̅_t) · I )
```

其中`α̅_t = ∏_{s=1..t} (1 - β_s)`对应一个`β_t`的调度。选择`β_t`从1e-4到0.02在T=1000步上线性变化，`x_T`近似为`N(0, I)`。

**反向过程`p_θ`。** 学习一个神经网络`ε_θ(x_t, t)`来预测被添加的噪声。给定`x_t`，通过以下方式去噪：

```
x_{t-1} = (1 / sqrt(α_t)) · ( x_t - (β_t / sqrt(1 - α̅_t)) · ε_θ(x_t, t) )  +  σ_t · z
```

其中`σ_t`是`sqrt(β_t)`或学习到的方差。这个表达式看起来很复杂，但它只是代数运算——根据后验`q(x_{t-1} | x_t, x_0)`求解`x_{t-1}`，并用噪声预测的估计值替换`x_0`。

**训练损失。**

```
L_simple = E_{x_0, t, ε} [ || ε - ε_θ( sqrt(α̅_t) · x_0 + sqrt(1 - α̅_t) · ε,  t ) ||² ]
```

从数据中采样`x_0`，随机选择一个`t`，采样`ε ~ N(0, I)`，通过闭式解一步计算带噪声的`x_t`，然后回归噪声。一个损失，没有极小极大，没有KL散度，没有重参数化技巧。

**采样。** 从`x_T ~ N(0, I)`开始。从`t = T`到`1`迭代反向步骤。完成。

## 为什么有效

三个直觉：

1. **去噪很容易；生成很难。** 在`t=T`时，数据是纯噪声——网络需要解决一个微不足道的问题。在`t=0`时，网络只需清理几个像素。在中间的`t`，问题很难，但网络从每个噪声级别通过相同的权重获得大量梯度流。

2. **分数匹配的伪装。** Vincent（2011）证明预测噪声等价于估计`∇_x log q(x_t | x_0)`，即*分数*。反向SDE使用这个分数沿着密度梯度向上走——一个朝向高概率区域的引导随机游走。

3. **ELBO简化为简单的MSE。** 完整的变分下界每个时间步有一个KL项。使用DDPM的参数化，这些KL项简化为具有特定系数的噪声预测MSE；Ho去掉了系数（称之为"简单"损失），而质量*反而提高了*。

```figure
diffusion-denoise
```

## 构建

`code/main.py`实现了一个1维DDPM。数据是一个双模态混合。"网络"是一个小型MLP，接受`(x_t, t)`并输出预测的噪声。训练就是一行损失。采样迭代反向链。

### 步骤1：前向调度（闭式解）

```python
betas = [1e-4 + (0.02 - 1e-4) * t / (T - 1) for t in range(T)]
alphas = [1 - b for b in betas]
alpha_bars = []
cum = 1.0
for a in alphas:
    cum *= a
    alpha_bars.append(cum)
```

### 步骤2：一步采样`x_t`

```python
def forward_sample(x0, t, alpha_bars, rng):
    a_bar = alpha_bars[t]
    eps = rng.gauss(0, 1)
    x_t = math.sqrt(a_bar) * x0 + math.sqrt(1 - a_bar) * eps
    return x_t, eps
```

### 步骤3：一个训练步骤

```python
def train_step(x0, model, alpha_bars, rng):
    t = rng.randrange(T)
    x_t, eps = forward_sample(x0, t, alpha_bars, rng)
    eps_hat = model_forward(model, x_t, t)
    loss = (eps - eps_hat) ** 2
    return loss, gradient_step(model, ...)
```

### 步骤4：反向采样

```python
def sample(model, alpha_bars, T, rng):
    x = rng.gauss(0, 1)
    for t in range(T - 1, -1, -1):
        eps_hat = model_forward(model, x, t)
        beta_t = 1 - alphas[t]
        x = (x - beta_t / math.sqrt(1 - alpha_bars[t]) * eps_hat) / math.sqrt(alphas[t])
        if t > 0:
            x += math.sqrt(beta_t) * rng.gauss(0, 1)
    return x
```

对于一个40个时间步和24个隐藏单元的MLP的1维问题，这在大约200个epochs内就能学会双模态混合。

## 时间条件化

网络需要知道它正在去噪的是哪个时间步。两种标准选择：

- **正弦嵌入。** 类似Transformer的位置编码。`embed(t) = [sin(t/ω_0), cos(t/ω_0), sin(t/ω_1), ...]`。通过MLP处理，广播到网络中。
- **FiLM / 组归一化条件化。** 将嵌入投影为每个块的逐通道缩放/偏置（FiLM）。

我们的玩具代码使用正弦嵌入 → 拼接的方式。生产级U-Net使用FiLM。

## 陷阱

- **调度至关重要。** 线性`β`是DDPM的默认值，但余弦调度（Nichol & Dhariwal, 2021）在相同计算量下提供更好的FID。如果质量停滞，请切换调度。
- **时间步嵌入很脆弱。** 将原始`t`作为浮点数传递可以在玩具1维任务中工作，但在图像上会失败；始终使用适当的嵌入。
- **V预测 vs ε预测。** 在狭窄范围内（非常小或非常大的t），`ε`的信噪比很低。V预测（`v = α·ε - σ·x`）更稳定；SDXL、SD3和Flux都使用它。
- **无分类器指导。** 推理时，同时计算条件性和无条件性`ε`，然后`ε_cfg = (1 + w) · ε_cond - w · ε_uncond`，其中`w ≈ 3-7`。在第8课中详细介绍。
- **1000步太多了。** 生产中使用DDIM（20-50步）、DPM-Solver（10-20步）或蒸馏（1-4步）。参见第12课。

## 使用

| 角色 | 2026年的典型技术栈 |
|------|-------------------|
| 图像像素空间扩散（小型，玩具） | DDPM + U-Net |
| 图像潜在扩散 | VAE编码器 + U-Net或DiT（第07课） |
| 视频潜在扩散 | 时空DiT（Sora、Veo、WAN） |
| 音频潜在扩散 | Encodec + 扩散Transformer |
| 科学（分子、蛋白质、物理） | 等变扩散（EDM、RFdiffusion、AlphaFold3） |

扩散是通用的生成骨干网络。流匹配（第13课）是2024-2026年的竞品，通常在相同质量下在推理速度上胜出。

## 交付

保存`outputs/skill-diffusion-trainer.md`。该技能接收数据集 + 计算预算并输出：调度（线性/余弦/sigmoid）、预测目标（ε/v/x）、步数、指导尺度、采样器家族和评估协议。

## 练习

1. **简单。** 将`code/main.py`中的T从40改为10。样本质量（输出的可视化直方图）如何下降？在哪个T值时，双模态结构崩溃？
2. **中等。** 从ε预测切换到v预测。重新推导反向步骤。比较最终的样本质量。
3. **困难。** 添加无分类器指导。以类别标签`c ∈ {0, 1}`为条件，在训练期间10%的情况下丢弃它，在采样时使用`ε = (1+w)·ε_cond - w·ε_uncond`。在`w = 0, 1, 3, 7`下测量条件模式命中率。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 前向过程 | "添加噪声" | 固定的马尔可夫链`q(x_t \| x_{t-1})`，破坏数据。 |
| 反向过程 | "去噪" | 学习到的链`p_θ(x_{t-1} \| x_t)`，重建数据。 |
| β调度 | "噪声阶梯" | 每步方差；线性、余弦或sigmoid。 |
| α̅ | "Alpha bar" | 累积乘积`∏(1 - β)`；给出从`x_0`到`x_t`的闭式转换。 |
| 简单损失 | "噪声上的MSE" | `\|\|ε - ε_θ(x_t, t)\|\|²`；所有变分推导都归结为此。 |
| ε预测 | "预测噪声" | 输出是被添加的噪声；标准DDPM。 |
| V预测 | "预测速度" | 输出是`α·ε - σ·x`；跨t的更好条件化。 |
| DDPM | "那篇论文" | Ho et al. 2020；线性β，1000步，U-Net。 |
| DDIM | "确定性采样器" | 非马尔可夫采样器，20-50步，相同训练目标。 |
| 无分类器指导 | "CFG" | 混合条件性和无条件性噪声预测以增强条件化。 |

## 生产说明：扩散推理是一个步数问题

DDPM论文运行T=1000步反向过程。没有人在生产中这样做。每个真实的推理栈选择三种策略之一——每种都清晰地映射到生产中"延迟从何而来"的框架：

1. **更快的采样器，相同的模型。** DDIM（20-50步）、DPM-Solver++（10-20）、UniPC（8-16）。反向循环的即插即用替代方案；已训练的`ε_θ`权重不受影响。延迟降低20-50倍。
2. **蒸馏。** 训练一个学生模型以更少的步骤匹配教师模型：Progressive Distillation（2→1）、Consistency Models（任意→1-4）、LCM、SDXL-Turbo、SD3-Turbo。延迟再降低5-10倍，需要重新训练。
3. **缓存和编译。** `torch.compile(unet, mode="reduce-overhead")`、TensorRT-LLM的扩散后端、`xformers`/SDPA注意力、bf16权重。每步延迟降低约2倍。可与（1）和（2）叠加。

对于生产级扩散服务器，预算对话与生产文献中描述的LLMs相同：延迟是`num_steps × step_cost + VAE_decode`，吞吐量是`batch_size × (num_steps × step_cost)^-1`。TTFT很小（一步）；TPOT等价于完整响应时间，因为从用户角度来看，图像生成是"一次性"的。

## 延伸阅读

- [Sohl-Dickstein et al. (2015). Deep Unsupervised Learning using Nonequilibrium Thermodynamics](https://arxiv.org/abs/1503.03585) — 扩散论文，超前于时代。
- [Ho, Jain, Abbeel (2020). Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239) — DDPM。
- [Song, Meng, Ermon (2021). Denoising Diffusion Implicit Models](https://arxiv.org/abs/2010.02502) — DDIM，更少步骤。
- [Nichol & Dhariwal (2021). Improved DDPM](https://arxiv.org/abs/2102.09672) — 余弦调度，学习方差。
- [Dhariwal & Nichol (2021). Diffusion Models Beat GANs on Image Synthesis](https://arxiv.org/abs/2105.05233) — 分类器指导。
- [Ho & Salimans (2022). Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598) — CFG。
- [Karras et al. (2022). Elucidating the Design Space of Diffusion-Based Generative Models (EDM)](https://arxiv.org/abs/2206.00364) — 统一记法，最清晰的配方。
