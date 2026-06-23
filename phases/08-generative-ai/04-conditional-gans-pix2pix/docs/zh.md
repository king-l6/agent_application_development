# 条件GAN与Pix2Pix

> 2014-2017年的第一个重大突破是控制了GAN的生成内容。附加上一个标签、一张图片或一句话。Pix2Pix实现了图像版本，在狭窄的图像到图像任务上，至今仍胜过所有通用文生图模型。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段8·03（GANs）、阶段4·06（U-Net）、阶段3·07（CNN）
**时间：** ~75分钟

## 问题

无条件的GAN只能随机采样人脸。对于演示来说很有用，但在生产环境中毫无价值。你想要的是：*将草图映射为照片*、*将地图映射为航拍图*、*将白天场景映射为夜晚*、*为灰度图像上色*。在所有这些任务中，你都有输入图像`x`，必须输出具有某种语义对应关系的`y`。每个`x`对应多个合理的`y`。均方误差会让它们模糊成一团。但对抗性损失不会，因为"看起来真实"是锐利的。

条件GAN（Mirza & Osindero, 2014）将条件`c`作为`G`和`D`的输入。Pix2Pix（Isola et al., 2017）将其特化：条件是一张完整的输入图像，生成器是U-Net，判别器是基于*补丁*的分类器（PatchGAN），损失函数是对抗性损失 + L1损失。即便到了2026年，这种方案在狭窄的图像到图像领域仍然优于从头训练的文本到图像模型，因为它在*成对数据*上训练——你拥有所需的精确信号。

## 概念

![Pix2Pix：U-Net生成器，PatchGAN判别器](../assets/pix2pix.svg)

**条件G。** `G(x, z) → y`。在Pix2Pix中，`z`是G内部的dropout（没有输入噪声——Isola发现显式的噪声会被忽略）。

**条件D。** `D(x, y) → [0, 1]`。输入是*(条件, 输出)*这一对。这是关键区别：D必须判断`y`是否与`x`一致，而不仅仅是`y`看起来真实。

**U-Net生成器。** 带有跳跃连接的编码器-解码器结构，跨越瓶颈层。对于输入和输出共享底层结构（边缘、轮廓）的任务至关重要。没有跳跃连接，高频细节会消失。

**PatchGAN判别器。** D不是输出单一的"真实/虚假"分数，而是输出一个`N×N`的网格，每个网格单元判断大约`70×70`像素的感受野。然后取平均值。这是一个马尔可夫随机场假设：真实性是局部的。训练更快，参数更少，输出更锐利。

**损失函数。**

```
loss_G = -log D(x, G(x)) + λ · ||y - G(x)||_1
loss_D = -log D(x, y) - log (1 - D(x, G(x)))
```

L1项稳定训练，并推动G靠近已知目标。L1比L2产生更锐利的边缘（中位数优于平均值）。`λ = 100`是Pix2Pix的默认值。

## CycleGAN——当你没有成对数据时

Pix2Pix需要成对的`(x, y)`数据。CycleGAN（Zhu et al., 2017）放弃了这个要求，但代价是多了一个损失：*循环一致性*损失。两个生成器`G: X → Y`和`F: Y → X`。训练它们使得`F(G(x)) ≈ x`和`G(F(y)) ≈ y`。这让你可以在没有成对样本的情况下，将马变成斑马，将夏天变成冬天。

在2026年，非成对的图像到图像转换主要通过扩散模型（ControlNet、IP-Adapter）完成，而不是CycleGAN，但循环一致性的思想在几乎所有非成对领域适应论文中仍然存在。

## 构建

`code/main.py`实现了一个在1维数据上的小型条件GAN。条件`c`是一个类别标签（0或1）。任务是：为给定的类别生成来自条件分布的样本。

### 步骤1：将条件附加到G和D的输入

```python
def G(z, c, params):
    return mlp(concat([z, one_hot(c)]), params)

def D(x, c, params):
    return mlp(concat([x, one_hot(c)]), params)
```

独热编码是最简单的方法。更大的模型使用学习的嵌入、FiLM调制或交叉注意力。

### 步骤2：训练条件模型

```python
for step in range(steps):
    x, c = sample_real_conditional()
    noise = sample_noise()
    update_D(x_real=x, x_fake=G(noise, c), c=c)
    update_G(noise, c)
```

生成器必须匹配*给定条件*下的真实分布，而不是边缘分布。

### 步骤3：验证每个类别的输出

```python
for c in [0, 1]:
    samples = [G(noise, c) for noise in batch]
    mean_c = mean(samples)
    assert_near(mean_c, real_mean_for_class_c)
```

## 陷阱

- **条件被忽略。** G学会了边缘化，D因为条件信号弱而从未惩罚。修复方法：更激进地对D施加条件（在早期层，而非最后层），使用投影判别器（Miyato & Koyama 2018）。
- **L1权重太低。** G漂移到任意的真实感输出，而不是忠实的输出。对于Pix2Pix风格的任务，从λ≈100开始。
- **L1权重太高。** G产生模糊的输出，因为L1仍然是L_p范数。训练稳定后逐步降低。
- **真实值泄漏到D中。** 将`(x, y)`拼接作为D的输入，而不仅仅是`y`。没有这个，D无法检查一致性。
- **每个类别的模式崩溃。** 每个类别可能独立崩溃。进行类别条件多样性检查。

## 使用

2026年图像到图像任务的状态：

| 任务 | 最佳方法 |
|------|---------|
| 草图→照片，同领域，成对数据 | Pix2Pix / Pix2PixHD（仍然快速，仍然清晰） |
| 草图→照片，非成对 | 使用Scribble条件模型的ControlNet |
| 语义分割→照片 | SPADE / GauGAN2 或 SD + ControlNet-Seg |
| 风格迁移 | 使用IP-Adapter或LoRA的扩散模型；GAN方法已过时 |
| 深度图→照片 | 基于Stable Diffusion的ControlNet-Depth |
| 超分辨率 | Real-ESRGAN（GAN）、ESRGAN-Plus或SD-Upscale（扩散） |
| 上色 | ColTran、基于扩散的上色器或Pix2Pix-color |
| 白天→夜晚、季节、天气 | CycleGAN或基于ControlNet的方法 |

Pix2Pix仍然是正确的工具，当（a）你有数千个成对样本，（b）任务狭窄且可重复，（c）你需要快速推理。在通用开放领域任务上，扩散模型胜出。

## 交付

保存`outputs/skill-img2img-chooser.md`。该技能接收任务描述、数据可用性（成对 vs 非成对、N个样本）和延迟/质量预算，然后输出：方法（Pix2Pix、CycleGAN、ControlNet变体、SDXL + IP-Adapter）、训练数据需求、推理成本和评估协议（LPIPS、FID、任务特定指标）。

## 练习

1. **简单。** 修改`code/main.py`添加第三个类别。确认G仍然将每个类别的噪声映射到正确的模式。
2. **中等。** 在1维设置中将L1替换为感知风格损失（例如，一个小的冻结D作为特征提取器）。这会改变条件分布的锐利度吗？
3. **困难。** 在1维设置中勾勒CycleGAN：两个分布、两个生成器、循环损失。展示它可以在没有成对数据的情况下学习映射。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 条件GAN | "带标签的GAN" | G(z, c)、D(x, c)。两个网络都看到条件。 |
| Pix2Pix | "图像到图像GAN" | 带U-Net G和PatchGAN D + L1损失的成对cGAN。 |
| U-Net | "带跳跃连接的编码器-解码器" | 对称卷积网络；跳跃连接保留高频信息。 |
| PatchGAN | "局部真实性分类器" | D输出每个补丁的分数而不是全局分数。 |
| CycleGAN | "非成对图像翻译" | 两个G + 循环一致性损失；不需要成对数据。 |
| SPADE | "GauGAN" | 用语义图归一化中间激活；分割到图像。 |
| FiLM | "特征级线性调制" | 对条件进行逐特征仿射变换；廉价的条件化方法。 |

## 生产说明：Pix2Pix作为延迟受限的基线

当你有成对数据和狭窄的任务（草图→渲染、语义图→照片、白天→夜晚）时，Pix2Pix的单次推理在延迟上比扩散模型高出一个数量级。生产中的比较通常是：

| 方案 | 步数 | 在单张L4上512²的典型延迟 |
|------|------|--------------------------|
| Pix2Pix（U-Net前向） | 1 | ~30 ms |
| SD-Inpaint 或 SD-Img2Img | 20 | ~1.2 s |
| SDXL-Turbo Img2Img | 1-4 | ~0.15-0.35 s |
| ControlNet + SDXL底座 | 20-30 | ~3-5 s |

Pix2Pix在静态批处理中胜出（每个请求的FLOPs相同）。扩散模型在质量和泛化上胜出。现代的做法通常是：为狭窄任务部署Pix2Pix风格的蒸馏模型，并为边缘输入准备扩散模型作为后备。

## 延伸阅读

- [Mirza & Osindero (2014). Conditional Generative Adversarial Nets](https://arxiv.org/abs/1411.1784) — cGAN论文。
- [Isola et al. (2017). Image-to-Image Translation with Conditional Adversarial Networks](https://arxiv.org/abs/1611.07004) — Pix2Pix。
- [Zhu et al. (2017). Unpaired Image-to-Image Translation using Cycle-Consistent Adversarial Networks](https://arxiv.org/abs/1703.10593) — CycleGAN。
- [Wang et al. (2018). High-Resolution Image Synthesis with Conditional GANs](https://arxiv.org/abs/1711.11585) — Pix2PixHD。
- [Park et al. (2019). Semantic Image Synthesis with Spatially-Adaptive Normalization](https://arxiv.org/abs/1903.07291) — SPADE / GauGAN。
- [Miyato & Koyama (2018). cGANs with Projection Discriminator](https://arxiv.org/abs/1802.05637) — 投影判别器。
