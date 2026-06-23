# 潜在扩散与Stable Diffusion

> 在512×512图像上进行像素空间扩散是一种计算暴行。Rombach等人（2022）注意到，你不需要所有的786k维度来生成一幅图像——你只需要足够的维度来捕捉语义结构，剩下的交给一个独立的解码器。在VAE的潜在空间内运行扩散。这一个想法就是Stable Diffusion。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段8·02（VAE）、阶段8·06（DDPM）、阶段7·09（ViT）
**时间：** ~75分钟

## 问题

在512²分辨率下的像素空间扩散意味着U-Net处理形状为`[B, 3, 512, 512]`的张量。对于一个500M参数的U-Net，每个采样步骤大约需要100 GFLOPS。五十步就是每张图像5 TFLOPS。在十亿张图像上训练，计算账单将是天文数字。

这些FLOPs中的大部分都在将感知上不重要的细节推过网络——那些有损VAE可以压缩掉的高频纹理。Rombach的想法是：训练一次VAE（*第一阶段*），冻结它，然后在4通道64×64的潜在空间中完全运行扩散（*第二阶段*）。相同的U-Net。1/16的像素。在相当的质量下，FLOPs减少约64倍。

这就是Stable Diffusion的配方。SD 1.x / 2.x在`64×64×4`的潜在空间上使用了860M的U-Net，SDXL在`128×128×4`上使用了2.6B的U-Net，SD3用扩散Transformer（DiT）与流匹配替换了U-Net。Flux.1-dev（Black Forest Labs，2024）发布了12B参数的DiT-MMDiT。所有这些都运行在相同的两阶段框架上。

## 概念

![潜在扩散：VAE压缩 + 潜在空间中的扩散](../assets/latent-diffusion.svg)

**两个阶段，分别训练。**

1. **阶段1 — VAE。** 编码器`E(x) → z`，解码器`D(z) → x`。目标压缩：每个空间轴下采样8倍 + 调整通道数，使总潜在大小约为像素数的1/16。损失 = 重建（L1 + LPIPS感知）+ KL（小权重，所以`z`不会被强制过于高斯，因为我们不需要从`z`精确采样）。通常使用对抗性损失训练，使得解码后的图像是锐利的。

2. **阶段2 — 在`z`上进行扩散。** 将`z = E(x_real)`视为数据。训练U-Net（或DiT）对`z_t`进行去噪。推理时：通过扩散采样`z_0`，然后`x = D(z_0)`。

**文本条件化。** 两个额外的组件。一个冻结的文本编码器（SD 1.x用CLIP-L，SD 2/XL用CLIP-L+OpenCLIP-G，SD3和Flux用T5-XXL）。一个交叉注意力注入：每个U-Net块接受`[Q = 图像特征, K = V = 文本令牌]`并混合它们。令牌是文本影响图像的唯一方式。

**损失函数与第06课相同。** 相同的DDPM / 流匹配MSE作用于噪声。你只需交换数据域。

## 架构变体

| 模型 | 年份 | 骨干网络 | 潜在形状 | 文本编码器 | 参数量 |
|------|------|---------|---------|-----------|--------|
| SD 1.5 | 2022 | U-Net | 64×64×4 | CLIP-L（77个令牌） | 860M |
| SD 2.1 | 2022 | U-Net | 64×64×4 | OpenCLIP-H | 865M |
| SDXL | 2023 | U-Net + 精炼器 | 128×128×4 | CLIP-L + OpenCLIP-G | 2.6B + 6.6B |
| SDXL-Turbo | 2023 | 蒸馏 | 128×128×4 | 同上 | 1-4步采样 |
| SD3 | 2024 | MMDiT（多模态DiT） | 128×128×16 | T5-XXL + CLIP-L + CLIP-G | 2B / 8B |
| Flux.1-dev | 2024 | MMDiT | 128×128×16 | T5-XXL + CLIP-L | 12B |
| Flux.1-schnell | 2024 | MMDiT蒸馏 | 128×128×16 | T5-XXL + CLIP-L | 12B, 1-4步 |

趋势：用DiT替换U-Net（对潜在补丁的Transformer），扩大文本编码器（T5在提示遵循方面优于CLIP），增加潜在通道数（4→16提供了更多的细节空间）。

```figure
noise-schedule
```

## 构建

`code/main.py`在第06课的DDPM之上叠加了一个玩具1维"VAE"（恒等编码器+解码器，用于演示；真正的VAE应该是卷积网络），并添加了带有无分类器指导的类别条件化。它展示了相同的扩散损失无论是在原始1维值上还是在编码值上都能工作——这是关键洞见。

### 步骤1：编码器/解码器

```python
def encode(x):    return x * 0.5          # 玩具"压缩"到更小的尺度
def decode(z):    return z * 2.0
```

真正的VAE有训练好的权重。出于教学目的，这个线性映射足以展示扩散是在`z`上操作，而不关心原始数据空间。

### 步骤2：在`z`空间中的扩散

与第06课相同的DDPM。网络看到的数据是`z = E(x)`。采样`z_0`后，用`D(z_0)`解码。

### 步骤3：无分类器指导

训练期间，10%的时间丢弃类别标签（替换为空令牌）。推理时，同时计算`ε_cond`和`ε_uncond`，然后：

```python
eps_cfg = (1 + w) * eps_cond - w * eps_uncond
```

`w = 0` = 无指导（完全多样性），`w = 3` = 默认值，`w = 7+` = 饱和 / 过锐利。

### 步骤4：文本条件化（概念，非代码）

用冻结的文本编码器输出替换类别标签。通过交叉注意力将文本嵌入馈送到U-Net：

```python
h = h + CrossAttention(Q=h, K=text_embed, V=text_embed)
```

这是类别条件扩散模型和Stable Diffusion之间唯一实质性的区别。

## 陷阱

- **VAE尺度不匹配。** SD 1.x的VAE有一个编码后应用的缩放常量（`scaling_factor ≈ 0.18215`）。忘记这个会让U-Net在方差严重错误的潜在空间上训练。每个检查点都附带这个常量。
- **文本编码器静默出错。** SD3需要T5-XXL搭配>=128个令牌，仅回退到CLIP是有损的。总是检查`use_t5=True`，否则提示保真度会崩溃。
- **混合潜在空间。** SDXL、SD3、Flux使用不同的VAE。在SDXL潜在空间上训练的LoRA无法在SD3上工作。Hugging Face diffusers 0.30+拒绝加载不匹配的检查点。
- **CFG太高。** `w > 10`会产生饱和、油腻的图像，并以多样性为代价过度拟合提示。最佳范围是`w = 3-7`。
- **负提示泄露。** 空的负提示变为空令牌；填充的负提示变为`ε_uncond`。这两者不同；某些流水线静默默认使用空令牌。

## 使用

2026年的生产技术栈：

| 目标 | 推荐的骨干网络 |
|------|--------------|
| 狭窄领域、成对数据、从头训练模型 | SDXL微调（LoRA / 全量）——最快交付 |
| 开放领域文生图、开放权重 | Flux.1-dev（12B，Apache / 非商业）或 SD3.5-Large |
| 最快推理、开放权重 | Flux.1-schnell（1-4步，Apache）或 SDXL-Lightning |
| 最佳提示遵循、托管 | GPT-Image / DALL-E 3（仍然）、Midjourney v7、Imagen 4 |
| 编辑工作流 | Flux.1-Kontext（2024年12月）——原生接受图像+文本 |
| 研究、基线 | SD 1.5——古老但研究充分 |

## 交付

保存`outputs/skill-sd-prompter.md`。该技能接收文本提示 + 目标风格并输出：模型 + 检查点、CFG尺度、采样器、负提示、分辨率、可选的ControlNet/IP-Adapter组合，以及每步QA检查清单。

## 练习

1. **简单。** 运行`code/main.py`，设置指导`w ∈ {0, 1, 3, 7, 15}`。按类别记录平均样本。在哪个`w`值下，类别均值偏离超过真实数据均值？
2. **中等。** 将玩具线性编码器替换为带重建损失的tanh-MLP编码器/解码器对。在新的潜在空间上重新训练扩散。样本质量是否改变？
3. **困难。** 使用diffusers设置真实的Stable Diffusion推理：加载`sdxl-base`，运行30步Euler，CFG=7，计时。现在切换到`sdxl-turbo`，4步，CFG=0。相同主题，不同质量——描述发生了什么变化以及原因。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 第一阶段 | "VAE" | 训练好的编码器/解码器对；将512²压缩到64²。 |
| 第二阶段 | "U-Net" | 潜在空间上的扩散模型。 |
| CFG | "指导尺度" | `(1+w)·ε_cond - w·ε_uncond`；调节条件化强度。 |
| 空令牌 | "空提示嵌入" | 用于`ε_uncond`的无条件嵌入。 |
| 交叉注意力 | "文本如何进入" | 每个U-Net块关注文本令牌作为K和V。 |
| DiT | "扩散Transformer" | 用Transformer替换U-Net处理潜在补丁；扩展性更好。 |
| MMDiT | "多模态DiT" | SD3的架构：文本和图像流带有联合注意力。 |
| VAE缩放因子 | "神奇数字" | 将潜在值除以约5.4，使扩散在单位方差空间中操作。 |

## 生产说明：在8GB消费级GPU上运行Flux-12B

参考的Flux集成是"我有一张消费级GPU，能交付这个吗？"的经典方案。技巧与生产推理文献中列出的相同三旋钮方案，应用于扩散DiT：

1. **分阶段加载。** Flux有三个永远不需要同时存在于VRAM中的网络：T5-XXL文本编码器（fp32下约10 GB）、CLIP-L（小型）、12B MMDiT和VAE。先编码提示，*删除*编码器，加载DiT，去噪，*删除* DiT，加载VAE，解码。消费级8GB GPU一次只能容纳一个阶段。
2. **通过bitsandbytes进行4位量化。** 在T5编码器和DiT上都使用`BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)`。内存减少8倍，质量下降对文生图来说是可以忽略的（根据笔记中链接的Aritra的基准测试）。
3. **CPU卸载。** `pipe.enable_model_cpu_offload()`随着每个前向传递的推进，自动在CPU和GPU之间交换模块。增加10-20%的延迟，但使整个流水线能够运行。

内存核算：`10 GB T5 / 8 = 1.25 GB`量化后，`12 B参数 × 0.5字节 = ~6 GB`量化的DiT，加上激活值。用stas00的话说，这是TP=1推理的极端情况——没有模型并行，最大程度量化。对于生产环境，你会使用TP=2或TP=4在H100上运行；对于单台开发者笔记本电脑，这就是方案。

## 延伸阅读

- [Rombach et al. (2022). High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752) — Stable Diffusion。
- [Podell et al. (2023). SDXL: Improving Latent Diffusion Models for High-Resolution Image Synthesis](https://arxiv.org/abs/2307.01952) — SDXL。
- [Peebles & Xie (2023). Scalable Diffusion Models with Transformers (DiT)](https://arxiv.org/abs/2212.09748) — DiT。
- [Esser et al. (2024). Scaling Rectified Flow Transformers for High-Resolution Image Synthesis](https://arxiv.org/abs/2403.03206) — SD3, MMDiT。
- [Ho & Salimans (2022). Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598) — CFG。
- [Labs (2024). Flux.1 — Black Forest Labs announcement](https://blackforestlabs.ai/announcing-black-forest-labs/) — Flux.1系列。
- [Hugging Face Diffusers docs](https://huggingface.co/docs/diffusers/index) — 以上所有检查点的参考实现。
