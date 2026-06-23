# Vision Transformer 与 Patch-Token 原语

> 在任何多模态处理之前，图像必须变成 transformer 可以处理的 token 序列。2020 年的 ViT 论文用 16x16 像素的图块（patch）、一个线性投影和一个位置编码回答了这个问题。五年后，每个 2026 年的前沿模型（Claude Opus 4.7 原生 2576px、Gemini 3.1 Pro、Qwen3.5-Omni）仍然以这种方式开始——编码器从 ViT 演进到 DINOv2 再到 SigLIP 2，增加了寄存器 token，位置方案变成了 2D-RoPE，但原语保持不变。这节课从头到尾阅读 patch-token 流水线，并用标准库 Python 构建它，以便阶段 12 的其余部分对"视觉 token"有一个具体的思维模型。

**类型：** 学习
**语言：** Python（标准库，patch 分词器 + 几何计算器）
**前置知识：** 阶段 7（Transformer），阶段 4（计算机视觉）
**时间：** ~120 分钟

## 学习目标

- 将 HxWx3 图像转换为具有正确位置编码的 patch token 序列。
- 计算给定（patch 大小、分辨率、隐藏维度、深度）的 ViT 的序列长度、参数量和 FLOPs。
- 说出将 ViT 从 2020 年研究提升到 2026 年生产的三个升级：自监督预训练（DINO / MAE）、寄存器 token 和原生分辨率打包。
- 为下游任务在 CLS 池化、均值池化和寄存器 token 之间做出选择。

## 问题

Transformer 操作的是向量序列。文本本身就是一个序列（字节或 token）。图像是一个 2D 像素网格，有三个颜色通道——不是一个序列。如果你展开每个像素，一张 224x224 的 RGB 图像就变成了 150,528 个 token，而在这个长度上的自注意力是不可行的（序列长度的二次方）。

2020 年之前的方法是在前端附加一个 CNN 特征提取器：ResNet 产生一个 7x7 的 2048 维向量特征图，将这 49 个 token 输入 transformer。这种方法可行，但继承了 CNN 的偏差（平移等变性、局部感受野）并失去了 transformer 对规模的适应性。

Dosovitskiy 等人（2020 年）提出了一个直白的问题：如果我们跳过 CNN 呢？将图像分割成固定大小的图块（比如 16x16 像素），将每个图块线性投影成一个向量，添加位置嵌入，然后将序列输入给一个普通的 transformer。当时这被认为是异端——没有卷积的视觉。凭借足够的数据（JFT-300M，然后是 LAION），它在 ImageNet 上击败了 ResNet 并持续改进。

到 2026 年，ViT 原语已成为无可争议的基础。每个开源权重 VLM 的视觉塔都是某个后代（DINOv2、SigLIP 2、CLIP、EVA、InternViT）。问题不再是"我们应该使用 patch 吗？"而是"使用什么 patch 大小、什么分辨率规划、什么预训练目标、什么位置编码。"

## 概念

### 作为 token 的图块

给定一个形状为 `(H, W, 3)` 的图像 `x` 和一个 patch 大小 `P`，你将图像划分为 `(H/P) x (W/P)` 个不重叠的图块网格。每个图块是一个 `P x P x 3` 的像素立方体。将每个立方体展平为一个 `3 P^2` 的向量。应用形状为 `(3 P^2, D)` 的共享线性投影 `W_E`，将每个图块映射到模型的隐藏维度 `D`。

对于 ViT-B/16 标准配置：
- 分辨率 224，patch 大小 16 → 网格 14x14 → 196 个 patch token。
- 每个图块有 `16 x 16 x 3 = 768` 个像素值，投影到 `D = 768`。
- 添加一个可学习的 `[CLS]` token → 序列长度 197。

图块投影在数学上与核大小为 `P`、步长为 `P`、输出通道为 `D` 的 2D 卷积相同。这就是生产代码实际实现它的方式——`nn.Conv2d(3, D, kernel_size=P, stride=P)`。"线性投影"的表述是概念性的；核的表述是高效的。

### 位置编码

图块没有固有的顺序——transformer 将它们视为一个包。早期的 ViT 添加了可学习的 1D 位置编码（每个位置一个 768 维向量，共 197 个）。有效，但将模型绑定到了训练分辨率：如果在推理时改变网格，你不得不插值位置表。

现代的视觉骨干使用 2D-RoPE（Qwen2-VL 的 M-RoPE、SigLIP 2 的默认选择）或分解的 2D 位置。2D-RoPE 基于图块的 (行, 列) 索引旋转查询和键向量，因此模型从旋转角度推断出相对的 2D 位置。没有位置表。模型在推理时处理任意网格大小。

### CLS token、池化输出和寄存器 token

什么是图像级别的表示？三种选择并存：

1. `[CLS]` token。在 patch 序列前添加一个可学习向量。经过所有 transformer 块后，CLS token 的隐藏状态就是图像表示。继承自 BERT。由原始 ViT、CLIP 使用。
2. 均值池化。平均所有 patch token 的输出隐藏状态。由 SigLIP、DINOv2 和大多数现代 VLM 使用。
3. 寄存器 token。Darcet 等人（2023 年）观察到，没有显式汇合（sink）token 训练的 ViT 会产生高范数的"伪影"patch，劫持自注意力。添加 4-16 个可学习的寄存器 token 吸收这一负载，提高了密集预测（分割、深度）的质量。DINOv2 和 SigLIP 2 都带有寄存器。

下游任务的选择很重要。CLS 适用于分类。对于将 patch token 输入 LLM 的 VLM，你完全跳过池化——每个 patch 成为 LLM 的一个输入 token。寄存器在移交前被丢弃（它们是脚手架，而非内容）。

### 预训练：监督、对比、掩码、自蒸馏

2020 年的 ViT 使用 JFT-300M 上的监督分类进行预训练。很快被以下方法取代：

- CLIP（2021 年）：在 400M 对（图像，文本）上进行对比学习。课程 12.02。
- MAE（2021 年，He 等人）：掩码 75% 的 patch，重建像素。自监督，适用于纯图像。
- DINO（2021 年）/ DINOv2（2023 年）：学生-教师自蒸馏，无标签，无标题。2023 年的 DINOv2 ViT-g/14 是最强的纯视觉骨干，是"密集特征"用例的默认选择。
- SigLIP / SigLIP 2（2023 年、2025 年）：具有 sigmoid 损失和 NaFlex 原生纵横比的 CLIP。2026 年开源 VLM（Qwen、Idefics2、LLaVA-OneVision）中占主导地位的视觉塔。

你选择的预训练方式决定了骨干网络的擅长领域：CLIP/SigLIP 用于与文本的语义匹配，DINOv2 用于密集视觉特征，MAE 作为下游微调的起点。

### 缩放定律

ViT 缩放（Zhai 等人 2022）确定了 ViT 的质量在模型大小、数据量和计算量方面遵循可预测的规律。在固定计算量下：
- 更大的模型 + 更多的数据 → 更好的质量。
- Patch 大小是序列长度与保真度之间的杠杆。Patch 14（DINOv2/SigLIP SO400m 的典型值）比 patch 16 每幅图像产生更多 token；对 OCR 和密集任务更好，但速度更慢。
- 分辨率是另一个大杠杆。从 224 提高到 384 再到 512 几乎总是有帮助，但 FLOPs 成本是二次方增长。

ViT-g/14（1B 参数，patch 14，分辨率 224 → 256 token）和 SigLIP SO400m/14（400M 参数，patch 14）是 2026 年开源 VLM 的两大主力编码器。

### ViT 的参数量

完整的计算在 `code/main.py` 中。对于 224 分辨率的 ViT-B/16：

```
patch_embed = 3 * 16 * 16 * 768 + 768  =  591k
cls + pos    = 768 + 197 * 768          =  152k
block        = 4 * 768^2 (QKVO) + 2 * 4 * 768^2 (MLP) + 2 * 2*768 (LN)
             = 12 * 768^2 + 3k          =  7.1M
12 blocks    = 85M
final LN    = 1.5k
total       ≈ 86M
```

在加载检查点之前，以这种方式估算每个 ViT。骨干网络大小决定了你在任何下游 VLM 中的 VRAM 底线。

### 2026 年生产配置

2026 年大多数开源 VLM 标配的编码器是原生分辨率（NaFlex）的 SigLIP 2 SO400m/14。它具有：
- 400M 参数。
- Patch 大小 14，默认分辨率 384 → 每幅图像 729 个 patch token。
- 图像级任务使用均值池化；VQA 时所有 729 个 patch 流入 LLM。
- 4 个寄存器 token，在 LLM 移交前丢弃。
- 带有图像级缩放的 2D-RoPE，用于原生纵横比。

该配置中的每个决策都可以追溯到你读过的一篇论文。

```figure
image-patch-tokens
```

## 使用它

`code/main.py` 是一个 patch 分词器和几何计算器。它接收（图像 H, W, patch P, 隐藏维度 D, 深度 L）并报告：

- 图块网格形状和序列长度。
- 一个合成的 8x8 像素玩具图像的 token 序列（遍历展平 + 投影路径）。
- 按 patch 嵌入、位置嵌入、transformer 块和头分解的参数数量。
- 目标分辨率下每次前向传播的 FLOPs。
- 跨 ViT-B/16 @ 224、ViT-L/14 @ 336、DINOv2 ViT-g/14 @ 224、SigLIP SO400m/14 @ 384 的对比表。

运行它。将参数量与已发布的数据进行匹配。尝试不同的 patch 大小和分辨率，感受 token 数量的成本。

## 交付物

本课程产出 `outputs/skill-patch-geometry-reader.zh.md`。给定一个 ViT 配置（patch 大小、分辨率、隐藏维度、深度），它产生一个 token 数量、参数量和 VRAM 估算并附有理由。每当你为 VLM 选择视觉骨干时使用此技能——它可以防止"token 爆炸了，我的 LLM 上下文被填满了"的意外。

## 练习

1. 计算 Qwen2.5-VL 在原生 1280x720 输入、patch 大小 14 下的 patch-token 序列长度。与仅 CLS 表示相比如何？

2. 一帧 1080p（1920x1080）在 patch 14 下产生多少个 token？在 30 FPS、5 分钟的视频中，总共多少个视觉 token？哪种节省成本的方法最有效：池化、帧采样还是 token 合并？

3. 在纯 Python 中实现 patch token 的均值池化。验证 DINOv2 输出的 196 个 token 的均值池化与你要求池化嵌入时模型的 `forward` 返回的结果是否匹配。

4. 阅读"Vision Transformers Need Registers"（arXiv:2309.16588）的第 3 节。用两句话描述寄存器吸收了什么伪影以及为什么它对下游密集预测很重要。

5. 修改 `code/main.py` 以支持 patch-n'-pack：给定一个不同分辨率的图像列表，生成一个单一的打包序列和块对角注意力掩码。在到达课程 12.06 时进行验证。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 图块（Patch） | "16x16 像素方块" | 输入图像的固定大小不重叠区域；成为一个 token |
| Patch 嵌入 | "线性投影" | 共享的学习矩阵（或 stride=P 的 Conv2d），将展平的 patch 像素映射到 D 维向量 |
| CLS token | "分类 token" | 前置的可学习向量，其最终隐藏状态代表整幅图像；2026 年可选 |
| 寄存器 token（Register token） | "汇合 token" | 额外的可学习 token，吸收 ViT 在预训练期间产生的高范数注意力伪影 |
| 位置编码（Position embedding） | "位置信息" | 每个位置的向量或旋转，使序列对顺序敏感；2D-RoPE 是现代默认 |
| 网格（Grid） | "图块网格" | 给定分辨率和 patch 大小下的 (H/P) x (W/P) 2D 图块数组 |
| NaFlex | "原生灵活分辨率" | SigLIP 2 特性：单一模型服务多种纵横比和分辨率，无需重新训练 |
| 骨干网络（Backbone） | "视觉塔" | 预训练的图像编码器，其 patch-token 输出在 VLM 中馈送到 LLM |
| 池化（Pooling） | "图像级总结" | 将 patch token 转换为一个向量的策略：CLS、均值、注意力池化或基于寄存器 |
| Patch 14 vs 16 | "更细 vs 更粗的网格" | Patch 14 每幅图像产生更多 token，对 OCR 保真度更好，但速度更慢；patch 16 是经典默认 |

## 延伸阅读

- [Dosovitskiy 等人 — An Image is Worth 16x16 Words (arXiv:2010.11929)](https://arxiv.org/abs/2010.11929) — 原始 ViT。
- [He 等人 — Masked Autoencoders Are Scalable Vision Learners (arXiv:2111.06377)](https://arxiv.org/abs/2111.06377) — MAE，自监督预训练。
- [Oquab 等人 — DINOv2 (arXiv:2304.07193)](https://arxiv.org/abs/2304.07193) — 大规模自蒸馏，无标签。
- [Darcet 等人 — Vision Transformers Need Registers (arXiv:2309.16588)](https://arxiv.org/abs/2309.16588) — 寄存器 token 和伪影分析。
- [Tschannen 等人 — SigLIP 2 (arXiv:2502.14786)](https://arxiv.org/abs/2502.14786) — 2026 年默认视觉塔。
- [Zhai 等人 — Scaling Vision Transformers (arXiv:2106.04560)](https://arxiv.org/abs/2106.04560) — 经验缩放定律。
