# GAN — 生成器与判别器

> Goodfellow 在 2014 年的技巧是完全跳过密度。两个网络。一个制作假货。一个捕捉它们。它们相互对抗直到假货与真货无法区分。它本不应该奏效。它常常不奏效。但当它奏效时，样本仍然是文献中窄领域最清晰的。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 3 · 02（反向传播），阶段 3 · 08（优化器），阶段 8 · 02（VAE）
**时间：** ~75 分钟

## 问题

VAE 产生模糊的样本，因为它们的 MSE 解码器损失对 *mean* 图像是贝叶斯最优的——而许多合理数字的均值是一个模糊的数字。你需要一个奖励*合理性*的损失，而不是像素上接近任何一个特定目标。合理性没有封闭形式。你必须去学习它。

Goodfellow 的想法：训练一个分类器 `D(x)` 来区分真实图像和假图像。训练一个生成器 `G(z)` 来欺骗 `D`。`G` 的损失信号就是 `D` 当前认为使某物看起来真实的东西。这个信号随着 `G` 的改进而更新，追逐一个移动的目标。如果两个网络收敛，`G` 就学会了数据分布，而从未写下 `log p(x)`。

这就是对抗训练。数学是一个极小极大博弈：

```
min_G max_D  E_real[log D(x)] + E_fake[log(1 - D(G(z)))]
```

在 2026 年，GAN 不再是 SOTA 生成器（扩散和流匹配夺走了那个桂冠）。但 StyleGAN 2/3 仍然是历史上发布过的最清晰的人脸模型，GAN 判别器被用作扩散训练中的*感知损失*，对抗训练驱动了让你能够部署实时扩散的快速单步蒸馏（SDXL-Turbo、SD3-Turbo、LCM）。

## 概念

![GAN 训练：生成器和判别器的极小极大博弈](../assets/gan.svg)

**生成器 `G(z)`。** 将噪声向量 `z ~ N(0, I)` 映射到样本 `x̂`。一个解码器形状的网络（密集或转置卷积）。

**判别器 `D(x)`。** 将样本映射到标量概率（或分数）。真实 → 1，虚假 → 0。

**损失。** 两个交替更新：

- **训练 `D`：** `loss_D = -[ log D(x) + log(1 - D(G(z))) ]`。真实 = 1，虚假 = 0 的二元交叉熵。
- **训练 `G`：** `loss_G = -log D(G(z))`。这是 Goodfellow 使用的*非饱和*形式（原始的 `log(1 - D(G(z)))` 会饱和，当 `D` 确信时梯度消失）。

**训练循环。** 一步 `D`，一步 `G`。重复。

**为什么有效。** 如果 `G` 完美匹配了 `p_data`，那么 `D` 无法比随机猜测更好，并在各处输出 0.5；`G` 不再获得梯度。均衡。

**为什么会崩溃。** 模式崩溃（`G` 找到一个 `D` 无法分类的模式并永远生成它）、梯度消失（`D` 学得太快，`log D` 饱和）、训练不稳定（学习率、批大小、任何事情）。

## 使 GAN 工作的变体

| 年份 | 创新 | 修复 |
|------|------------|------|
| 2015 | DCGAN | Conv/deconv、批归一化、LeakyReLU——第一个稳定的架构。 |
| 2017 | WGAN、WGAN-GP | 用 Wasserstein 距离 + 梯度惩罚替换 BCE。修复梯度消失。 |
| 2017 | 谱归一化 | 对判别器做 Lipschitz 约束。2026 年的判别器仍然使用。 |
| 2018 | Progressive GAN | 先训练低分辨率，再添加层。第一个百万像素级结果。 |
| 2019 | StyleGAN / StyleGAN2 | 映射网络 + 自适应实例归一化。固定域照片级真实感的 SOTA。 |
| 2021 | StyleGAN3 | 无混叠、平移等变——仍然是 2026 年的人脸黄金标准。 |
| 2022 | StyleGAN-XL | 条件式、类别感知、更大规模。 |
| 2024 | R3GAN | 以更强的正则化重新定义；在 1024² 上工作无需技巧。 |

```figure
gan-minimax
```

## 构建它

`code/main.py` 在一维数据上训练一个微型 GAN：两个高斯分布的混合。生成器和判别器是单隐藏层 MLP。我们手工实现前向传播、反向传播和极小极大循环。目标是看到两个关键失效模式（模式崩溃 + 梯度消失）的发生过程。

### 步骤 1：非饱和损失

原始的 Goodfellow 损失 `log(1 - D(G(z)))` 在 D 以高置信度将 G 的假货分类为假时趋于 0。此时 G 的梯度基本为零——G 无法改进。非饱和形式 `-log D(G(z)))` 有相反的性质：当 D 确信时它会爆炸，给 G 一个强烈的信号。

```python
def g_loss(d_fake):
    # maximize log D(G(z))  <=>  minimize -log D(G(z))
    return -sum(math.log(max(p, 1e-8)) for p in d_fake) / len(d_fake)
```

### 步骤 2：每个生成器步骤对应一个判别器步骤

```python
for step in range(steps):
    # train D
    real_batch = sample_real(batch_size)
    fake_batch = [G(z) for z in sample_noise(batch_size)]
    update_D(real_batch, fake_batch)

    # train G
    fake_batch = [G(z) for z in sample_noise(batch_size)]  # fresh fakes
    update_G(fake_batch)
```

G 需要新鲜的假货，否则梯度会过时。

### 步骤 3：观察模式崩溃

```python
if step % 200 == 0:
    samples = [G(z) for z in sample_noise(500)]
    mode_a = sum(1 for s in samples if s < 0)
    mode_b = 500 - mode_a
    if min(mode_a, mode_b) < 50:
        print("  [!] mode collapse: one mode is starved")
```

典型的症状：两个真实模式中的一个停止了生成。判别器停止纠正它，因为它从未被识别为假。

## 陷阱

- **判别器太强。** 将 D 的学习率降低 2-5 倍，或添加实例/层噪声。如果 D 达到 >95% 的准确率，G 就死了。
- **生成器记忆一个模式。** 向 D 输入添加噪声，使用小批量判别器层，或切换到 WGAN-GP。
- **批归一化泄漏统计量。** 真实批和虚假批流经同一个 BN 层会混合它们的统计量。改用实例归一化或谱归一化。
- **Inception 分数滥用。** FID 和 IS 在低样本数下噪声大。评估时使用 ≥10k 个样本。
- **一次采样对于条件任务是一个谎言。** 你仍然需要 CFG 尺度、截断技巧和重新采样来获得可用的输出。

## 使用它

2026 年的 GAN 堆栈：

| 场景 | 选择 |
|-----------|------|
| 照片级真实感人脸，固定姿态 | StyleGAN3（最清晰、最小） |
| 动漫 / 风格化人脸 | StyleGAN-XL 或 Stable Diffusion LoRA |
| 图像到图像翻译 | Pix2Pix / CycleGAN（阶段 8 · 04）或 ControlNet（阶段 8 · 08） |
| 快速单步文本到图像 | 扩散的对抗性蒸馏（SDXL-Turbo、SD3-Turbo） |
| 扩散训练器内部的感知损失 | 图像裁剪上的小型 GAN 判别器 |
| 任何多模态、开放式的内容 | 不要——使用扩散或流匹配 |

GAN 清晰但狭窄。一旦你的领域打开——照片、任意文本提示、视频——切换到扩散。对抗技巧作为组件（感知损失、蒸馏）存活下来，而不是独立的生成器。

## 交付它

保存 `outputs/skill-gan-debugger.md`。技能接受一个失败的 GAN 运行（损失曲线、样本网格、数据集大小）并输出可能原因的排序列表、一行修复代码以及重新运行协议。

## 练习

1. **简单。** 运行带有默认设置的 `code/main.py`。然后设置 `D_LR = 5 * G_LR` 并重新运行。G 的损失需要多少步坍缩到一个常数值？
2. **中等。** 将 Goodfellow BCE 损失替换为 WGAN 损失：`loss_D = E[D(fake)] - E[D(real)]`，`loss_G = -E[D(fake)]`，并将 D 的权重裁剪到 `[-0.01, 0.01]`。训练更稳定吗？比较时间收敛速度。
3. **困难。** 将一维示例扩展到二维数据（环上的 8 个高斯分布混合）。跟踪生成器在第 1k、5k、10k 步时捕获了多少个模式。实现小批量判别并重新测量。

## 关键术语

| 术语 | 大家的说法 | 实际含义 |
|------|-----------------|-----------------------|
| 生成器 | "G" | 噪声到样本的网络，`G: z → x̂`。 |
| 判别器 | "D" | 分类器 `D: x → [0, 1]`，真实 vs 虚假。 |
| 极小极大 | "博弈" | 联合目标的 `min_G max_D`。 |
| 非饱和损失 | "修复方法" | 使用 `-log D(G(z))` 作为 G 的损失，而不是 `log(1 - D(G(z)))`。 |
| 模式崩溃 | "G 只记住了一件事" | 尽管数据多样化，生成器只产生少数不同的输出。 |
| WGAN | "Wasserstein" | 用推土机距离 + 梯度惩罚替换 BCE；更平滑的梯度。 |
| 谱归一化 | "Lipschitz 技巧" | 约束 D 的权重范数以限制其斜率；稳定训练。 |
| StyleGAN | "那个有效的" | 映射网络 + AdaIN；人脸领域最佳，即使在 2026 年。 |

## 生产注意：单次推理是 GAN 的持久优势

GAN 在开放域生成方面不再赢得样本质量，但它们在推理成本上仍然胜出。在生产推理文献的术语中，GAN 具有：

- **没有预填充和解码阶段。** 一个单一的 `G(z)` 前向传播。TTFT ≈ 总延迟。
- **没有 KV 缓存压力。** 唯一的状态是权重。批大小由激活内存限制，而不是缓存。
- **平凡连续批处理。** 由于每个请求消耗相同的固定 FLOPs，服务器目标占用率下的静态批处理通常是最优的。不需要运行中的调度器。

这就是为什么 GAN 蒸馏（SDXL-Turbo、SD3-Turbo、ADD、LCM）是 2026 年快速文本到图像的主要技术：它将 20-50 步扩散流水线折叠为 1-4 步 GAN 风格的前向传播，同时保持扩散基座的分布。对抗损失作为训练时的旋钮存活下来，用于将慢速生成器转变为快速生成器。

## 延伸阅读

- [Goodfellow et al. (2014). Generative Adversarial Nets](https://arxiv.org/abs/1406.2661) — 原始的 GAN 论文。
- [Radford et al. (2015). Unsupervised Representation Learning with DCGAN](https://arxiv.org/abs/1511.06434) — 第一个稳定的架构。
- [Arjovsky, Chintala, Bottou (2017). Wasserstein GAN](https://arxiv.org/abs/1701.07875) — WGAN。
- [Miyato et al. (2018). Spectral Normalization for GANs](https://arxiv.org/abs/1802.05957) — SN。
- [Karras et al. (2020). Analyzing and Improving the Image Quality of StyleGAN](https://arxiv.org/abs/1912.04958) — StyleGAN2。
- [Karras et al. (2021). Alias-Free Generative Adversarial Networks](https://arxiv.org/abs/2106.12423) — StyleGAN3。
- [Sauer et al. (2023). Adversarial Diffusion Distillation](https://arxiv.org/abs/2311.17042) — SDXL-Turbo。
