# 图像修补、外延与编辑

> 文生图创造新事物。修补修复旧事物。在生产中，70%的可计费图像工作是编辑——替换背景、移除Logo、扩展画布、重新生成手部。修补是扩散模型真正发挥价值的地方。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段8·07（潜在扩散）、阶段8·08（ControlNet与LoRA）
**时间：** ~75分钟

## 问题

客户发来一张完美的产品照片，但背景中有一个分散注意力的标志。你想要擦除这个标志，并保持其他所有像素完全一致。你不能从头开始文生图——结果会有不同的颜色、不同的光照、不同的产品角度。你想要*只*重新生成遮罩区域，并且希望重新生成的内容尊重周围的上下文。

这就是图像修补。变种：

- **图像修补。** 在遮罩内部重新生成，保留外部像素。
- **图像外延。** 在遮罩外部（或超出画布）重新生成，保留内部像素。
- **图像编辑。** 重新生成整个图像，但保持与原始图像的语义或结构保真度（SDEdit、InstructPix2Pix）。

2026年的每个扩散流水线都配备了一个修补模式。Flux.1-Fill、Stable Diffusion Inpaint、SDXL-Inpaint、DALL-E 3 Edit。它们都基于相同的原理工作。

## 概念

![修补：带有上下文保持重注入的遮罩感知去噪](../assets/inpainting.svg)

### 朴素方法（以及为什么它有问题）

使用遮罩运行标准的文生图。在每个采样步骤，将未遮罩区域的带噪潜在表示替换为经过前向扩散的干净图像。它能工作……但效果很差。边界伪影会渗入，因为模型不知道遮罩区域中有什么。

### 正确的修补模型

训练一个修改过的U-Net，接受9个输入通道而不是4个：

```
input = concat([ noisy_latent (4ch), encoded_image (4ch), mask (1ch) ], dim=channel)
```

额外的通道是VAE编码的源图像的副本加上一个单通道遮罩。训练时，你随机遮罩图像的区域，并训练模型仅对遮罩区域去噪，同时将未遮罩区域作为干净的条件信号提供。推理时，模型可以"看到"遮罩区域周围的内容，并生成连贯的补全。

SD-Inpaint、SDXL-Inpaint、Flux-Fill都使用这种9通道（或类似）输入。Diffusers中的`StableDiffusionInpaintPipeline`、`FluxFillPipeline`。

### SDEdit（Meng et al., 2022）——免费编辑

对源图像添加噪声直到某个中间`t`，然后从`t`向下运行到0的反向链，使用新的提示。无需重新训练。起始`t`的选择用保真度换取创作自由：

- `t/T = 0.3` → 几乎与源图像相同，小的风格变化
- `t/T = 0.6` → 中等编辑，保留粗略结构
- `t/T = 0.9` → 从接近噪声生成，最小程度保留源图像

### InstructPix2Pix（Brooks et al., 2023）

在`(input_image, instruction, output_image)`三元组上微调扩散模型。推理时，同时对输入图像和文本指令（"让它变成日落"、"添加一条龙"）进行条件化。两个CFG尺度：图像尺度和文本尺度。

### RePaint（Lugmayr et al., 2022）

保持一个标准的无条件扩散模型。在每个反向步骤，重新采样——偶尔跳回一个更噪声的状态并重新生成。避免边界伪影。当你没有经过训练的修补模型时使用。

## 构建

`code/main.py`在5维数据上实现了一个玩具级的1维修补方案。我们在5维混合数据上训练一个DDPM，其中每个样本是来自两个簇之一的5个浮点数。推理时，我们"遮罩"5个维度中的2个，在每一步注入未遮罩的三个维度的噪声前向版本，并仅重新生成遮罩的维度。

### 步骤1：5维DDPM数据

```python
def sample_data(rng):
    cluster = rng.choice([0, 1])
    center = [-1.0] * 5 if cluster == 0 else [1.0] * 5
    return [c + rng.gauss(0, 0.2) for c in center], cluster
```

### 步骤2：在所有5维上训练去噪器

标准的DDPM。网络为5维带噪输入输出5维噪声预测。

### 步骤3：推理时，遮罩感知的反向

```python
def inpaint_step(x_t, mask, clean_image, alpha_bars, t, rng):
    # 用干净源的新鲜噪声版本替换未遮罩的维度
    a_bar = alpha_bars[t]
    for i in range(len(x_t)):
        if not mask[i]:
            x_t[i] = math.sqrt(a_bar) * clean_image[i] + math.sqrt(1 - a_bar) * rng.gauss(0, 1)
    # ...然后在x_t上运行正常的反向步骤
```

这是朴素方法，在玩具1维数据上有效。真实的图像修补使用9通道输入，因为纹理一致性更重要。

### 步骤4：图像外延

外延就是将遮罩反转的修补：遮罩新的（之前不存在的）画布，用原始图像填充其余部分。相同的训练目标。

## 陷阱

- **接缝。** 朴素方法会留下可见的边界，因为梯度信息不跨遮罩流动。修复方法：将遮罩膨胀8-16像素，或使用正确的修补模型。
- **遮罩泄漏。** 如果条件化图像的未遮罩区域质量低或有噪声，它会污染遮罩内的生成。稍微去噪或模糊。
- **CFG与遮罩大小相互作用。** 在小的遮罩上使用高CFG = 饱和的补丁。对小的编辑降低CFG。
- **SDEdit保真度悬崖。** 从`t/T = 0.5`到`t/T = 0.6`可能会丢失主体的身份。进行扫描和检查点。
- **提示不匹配。** 提示应该描述*整个*图像，而不仅仅是新内容。"一只坐在椅子上的猫"而不是"一只猫"。

## 使用

| 任务 | 流水线 |
|------|--------|
| 移除物体，小遮罩 | SD-Inpaint 或 Flux-Fill，标准提示 |
| 替换天空 | SD-Inpaint + "日落时的蓝天" |
| 扩展画布 | SDXL外延模式（8px羽化）或带外延遮罩的Flux-Fill |
| 重新生成手/脸 | SD-Inpaint + 重新描述主体的提示 + ControlNet-Openpose |
| 改变一个区域的风格 | 在遮罩区域上使用`t/T=0.5`的SDEdit |
| "让它变成日落" | InstructPix2Pix 或 Flux-Kontext |
| 背景替换 | SAM遮罩 → SD-Inpaint |
| 超高保真度 | 最困难情况使用Flux-Fill或GPT-Image（托管） |

SAM（Meta的Segment Anything，2023）+ 扩散修补是2026年的背景去除流水线。SAM 2（2024）适用于视频。

## 交付

保存`outputs/skill-editing-pipeline.md`。该技能接收原始图像 + 编辑描述 + 可选遮罩（或SAM提示）并输出：遮罩生成方法、基础模型、CFG尺度（图像+文本）、SDEdit-t或修补模式，以及QA检查清单。

## 练习

1. **简单。** 在`code/main.py`中，将遮罩维度比例从0.2变化到0.8。在哪个比例下，修补质量（遮罩维度中的残差）等于无条件生成？
2. **中等。** 实现RePaint：每10个反向步骤，跳回5步（添加噪声）并重新去噪。测量它是否减少了遮罩边缘的边界残差。
3. **困难。** 使用Hugging Face diffusers比较：SD 1.5 Inpaint + ControlNet-Openpose vs Flux.1-Fill在20个面部重新生成任务上的表现。分别对姿态遵循度和身份保持度评分。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 图像修补 | "填充空洞" | 在遮罩内部重新生成；保留外部像素。 |
| 图像外延 | "扩展画布" | 在画布外部重新生成；保留内部。 |
| 9通道U-Net | "正确的修补模型" | 输入为`noisy \| encoded-source \| mask`的U-Net。 |
| SDEdit | "带噪声级别的图生图" | 加噪声到时间`t`，用新提示去噪。 |
| InstructPix2Pix | "仅文本编辑" | 在（图像、指令、输出）三元组上微调的扩散模型。 |
| RePaint | "无需重新训练" | 在反向过程中定期重新加噪声以减少接缝。 |
| SAM | "Segment Anything" | 通过点击或框选生成遮罩；与修补配对。 |
| Flux-Kontext | "带上下文的编辑" | 接受参考图像+编辑指令的Flux变体。 |

## 生产说明：编辑流水线对延迟敏感

编辑图像的用户期望亚5秒的往返时间。一个在1024²下的30步SDXL-Inpaint在L4上需要3-4秒，加上SAM遮罩生成（~200 ms）和VAE编码/解码（合计约500 ms）。用生产框架来看，这更受TTFT限制而非吞吐量限制——批量1，低并发，最小化每个阶段：

- **SAM-H是最慢的。** 1024²下的SAM-H约200 ms；SAM-ViT-B约40 ms，质量损失很小。SAM 2（视频）增加了时间开销；不要将其用于单图像编辑。
- **尽可能跳过编码。** `pipe.image_processor.preprocess(img)`将图像编码为潜在表示。如果你有之前生成中的潜在表示（在迭代式编辑UI中很典型），通过`latents=...`直接传递它们以跳过一次VAE编码。
- **遮罩膨胀也会影响吞吐量。** 一个小的遮罩意味着U-Net前向传递的大部分是浪费的（未遮罩的像素无论如何都会被钳制）。`diffusers`的`StableDiffusionInpaintPipeline`运行完整的U-Net；只有9通道的正确修补变体利用了遮蔽计算。
- **Flux-Kontext是2025年的答案。** 在`(source_image, instruction)`上单次前向传递——无需单独的遮罩，无需SDEdit噪声扫描。在H100上，它在大约1.5秒内交付一次编辑。架构上的教训：合并阶段。

## 延伸阅读

- [Lugmayr et al. (2022). RePaint: Inpainting using Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2201.09865) — 无需训练的修补。
- [Meng et al. (2022). SDEdit: Guided Image Synthesis and Editing with Stochastic Differential Equations](https://arxiv.org/abs/2108.01073) — SDEdit。
- [Brooks, Holynski, Efros (2023). InstructPix2Pix](https://arxiv.org/abs/2211.09800) — 文本指令编辑。
- [Kirillov et al. (2023). Segment Anything](https://arxiv.org/abs/2304.02643) — SAM，遮罩来源。
- [Ravi et al. (2024). SAM 2: Segment Anything in Images and Videos](https://arxiv.org/abs/2408.00714) — 视频SAM。
- [Hertz et al. (2022). Prompt-to-Prompt Image Editing with Cross-Attention Control](https://arxiv.org/abs/2208.01626) — 注意力级编辑。
- [Black Forest Labs (2024). Flux.1-Fill and Flux.1-Kontext](https://blackforestlabs.ai/flux-1-tools/) — 2024工具。
