# Flamingo 与用于少样本 VLM 的门控交叉注意力

> DeepMind 的 Flamingo（2022 年）在其他人之前做了两件事。它展示了单一模型可以处理任意交错的图像、视频和文本序列。并且它展示了 VLM 可以在上下文（in-context）中学习——给一个带有三个示例（图像、标题）对的少样本提示，模型无需任何梯度步骤就能为一张新图像生成标题。机制：门控交叉注意力层，插入在冻结的 LLM 现有层之间，带有一个从零开始学习的 tanh 门，使得 LLM 在初始化时的文本能力得以保留。本节课讲解 Flamingo 的 Perceiver 重采样器和门控交叉注意力架构——Gemini 交错输入和 Idefics2 视觉 token 的祖先。

**类型：** 学习
**语言：** Python（标准库，门控交叉注意力 + Perceiver 重采样器演示）
**前置知识：** 阶段 12 · 03（BLIP-2 Q-Former）
**时间：** ~120 分钟

## 学习目标

- 解释门控交叉注意力如何通过 tanh(gate) = 0 在初始化时保留冻结 LLM 的文本能力。
- 讲解 Perceiver 重采样器：N 个图像 patch -> K 个固定的"潜在"查询，通过交叉注意力实现。
- 描述 Flamingo 如何处理交错图像-文本序列，使用尊重图像位置的因果掩码。
- 重现一个少样本多模态提示结构（3 个图像-标题示例，然后一个查询图像）。

## 问题

BLIP-2 将 32 个视觉 token 输入到冻结 LLM 的输入层。适用于每个提示一张图像。但如果你想在一个提示中喂入*多张*与文本交错的图像呢，比如"这是图像 A，给它配标题；这是图像 B，给它配标题；现在这是图像 C，给它配标题"？LLM 的自注意力需要在单个流中处理图像 token 和文本 token，而哪些位置可以关注哪些图像的问题变得复杂。

Flamingo 的答案：不要改变 LLM 的输入流。在现有 LLM 块之间插入额外的交叉注意力层。文本 token 仍然像往常一样流经 LLM 的因果自注意力。在每几个 LLM 块之间，文本 token 还通过一个新的门控层交叉关注图像特征。门（初始化为零）意味着在零步时新层是空操作——模型的行为与预训练的 LLM 完全相同。随着训练的进行，门打开，视觉信息开始流动。

Flamingo 回答的第二个问题：如何处理每个提示中可变数量的图像（0、1 或多张）？一个 Perceiver 重采样器——一个小型交叉注意力模块，接受任意数量的 patch 并产生固定数量的视觉潜在 token。无论提示中有多少张图像，LLM 交叉注意力层看到的形状都是相同的。

## 概念

### 冻结的 LLM

Flamingo 从一个冻结的 Chinchilla 70B LLM 开始。所有 70B 权重保持不变。现有的文本自注意力和 FFN 正常运行。

### Perceiver 重采样器

对于提示中的每张图像，ViT 产生 N 个 patch token。Perceiver 重采样器有 K 个固定的可学习潜在变量（Flamingo 使用 K=64）。每个重采样器块包含两个子步骤：

1. 交叉注意力：K 个潜在变量关注 N 个 patch token（Q 来自潜在变量，K/V 来自 patches）。
2. 潜在变量内的自注意力 + FFN。

经过 6 个重采样器块后，输出是 K=64 个维度为 1024 的视觉 token，无论 ViT 产生了多少个 patch。224x224 的图像（196 个 patch）和 480x480 的图像（900 个 patch）都以 64 个重采样器 token 输出。

对于视频，重采样器按时间维度应用：每帧的 patches 产生 64 个潜在变量，时间位置编码让模型区分 t=0 和 t=N。整个视频变成 T * 64 个视觉 token。

### 门控交叉注意力

在冻结 LLM 的每 M 层之间（Flamingo 使用 M=4），插入一个新的门控交叉注意力块：

```
x_after_llm_block = llm_block(x_before)
cross = cross_attn(x_after, resampler_output)
gated = tanh(alpha) * cross + x_after
x_before_next_block = gated
```

- `alpha` 是一个可学习标量，初始化为零。
- `tanh(0) = 0`，因此在初始化时门控分支贡献为零。
- 当 `alpha` 偏离零时，交叉注意力的贡献平滑增长。
- 残差连接意味着即使门完全打开，也不会覆盖 LLM 的文本表示；它只是在上面添加视觉信息。

这是 Flamingo 中最重要的单一设计选择：视觉条件作用是加法的、门控的，并且在初始化时为零。零步时的 Flamingo 在纯文本输入上是一个完美的 Chinchilla 70B。

### 用于交错输入的掩码交叉注意力

在像"<image A> caption A <image B> caption B <image C> ?"这样的提示中，每个文本 token 只能看到序列中在它之前的图像。交叉注意力掩码强制执行：位置 `t` 处的文本 token 只关注图像索引 `i < i_t` 的图像重采样器 token，其中 `i_t` 是位置 `t` 之前最近的图像。"只看到前一个最近的图像"或"看到所有前面的图像"都是有效的选择；Flamingo 选择了前者。

### 上下文中的少样本学习

一个 Flamingo 提示看起来像：

```
<image1> A photo of a cat. <image2> A photo of a dog. <image3> A photo of a
```

模型看到完成模式并输出"bird"（或 image3 显示的任何内容）。没有梯度步骤。冻结 LLM 的上下文学习能力通过门控交叉注意力传递——这是论文的关键结论，也是它重要的原因。

### 训练数据

Flamingo 在三个数据集上训练：

1. 多模态大规模网络（M3W）：4300 万带有交错图像和文本的网页，重构阅读顺序。
2. 图像-文本对（ALIGN + LTIP）：44 亿对。
3. 视频-文本对（VTP）：2700 万短视频片段。

OBELICS（2023 年）是交错网络语料库的开源复现，Idefics、Idefics2 和大多数开源的"类 Flamingo"模型都基于此训练。

### OpenFlamingo 和 Otter

OpenFlamingo（2023 年）是开源复现。架构完全相同（Perceiver 重采样器 + 冻结 LLaMA 或 MPT 上的门控交叉注意力）。检查点有 3B、4B、9B。由于基础 LLM 更小且数据更少，质量落后于 Flamingo。

Otter（2023 年）在 OpenFlamingo 的基础上使用 MIMIC-IT（一个多模态指令数据集）进行指令微调，展示了门控交叉注意力也适用于指令跟随。

### 后代

- Idefics / Idefics2 / Idefics3：Hugging Face 的门控交叉注意力家族，逐渐简化（Idefics2 去掉了重采样器，转而使用带自适应池化的直接 patch token）。
- Flamingo 到 Chameleon 的过渡：到 2024 年，许多团队转向早期融合（课程 12.11）；Flamingo 风格的门控交叉注意力在需要冻结骨干的生产环境中仍然存在。
- Gemini 的交错输入：概念上继承了 Flamingo 交错格式的灵活性，尽管确切的机制是专有的。

### 与 BLIP-2 的对比

| | BLIP-2 | Flamingo |
|---|---|---|
| 视觉桥接器 | 输入层一次的 Q-Former | 每 M 层的门控交叉注意力 |
| 视觉 token | 每张图像 32 个 | 每个交叉注意力层每张图像 64 个 |
| 冻结 LLM | 是 | 是 |
| 少样本上下文学习 | 弱 | 强——论文的核心 |
| 交错输入 | 无原生支持 | 是——设计目标 |
| 训练数据 | 1.3 亿对 | 13 亿对 + 4300 万交错页面 |
| 参数量 | 1.88 亿可训练 | 约 100 亿可训练（交叉注意力层） |
| 计算量 | 8 个 A100 上数天 | 数千个 TPUv4 上数周 |

在预算有限的情况下，为单图像 VQA 选择 BLIP-2。为交错、少样本或多图像推理选择 Flamingo/Idefics2。

## 使用它

`code/main.py` 演示了：

1. 在 36 个假 patch token 上使用 8 个可学习潜在变量的 Perceiver 重采样器（纯 Python 交叉注意力）。
2. 一个门控交叉注意力步骤，`alpha = 0` -> 输出等于输入（LLM 不变），然后 `alpha = 2.0` -> 混合了视觉贡献。
3. 一个交错掩码构建器，为"(image 1) (text 1) (image 2) (text 2)"序列生成 2D 注意力掩码。

## 交付物

本课程产出 `outputs/skill-gated-bridge-diagnostic.zh.md`。给定一个开源 VLM 的配置（重采样器 Y/N、交叉注意力频率、门控方案），它识别 Flamingo 家族元素并解释冻结策略。用于调试为什么微调降低了文本性能（答案：门开得太快太宽）。

## 练习

1. 计算 Flamingo-9B 的视觉参数量：9B LLM + 1.4B 门控交叉注意力层 + 64M 重采样器。总参数中可训练的部分占比多少？

2. 在 PyTorch 中实现门控残差 `y = tanh(alpha) * cross + x`。通过实验证明 `alpha=0` 时，`y==x` 在初始化时完全相等。

3. 阅读 OpenFlamingo 第 3.2 节（arXiv:2308.01390），了解当每个提示的图像数量不同时，它们如何处理批次中的多张图像。描述填充策略。

4. 为什么 Flamingo 的交叉注意力掩码让文本 token 只关注*最近的前一个*图像，而不是所有前面的图像？阅读 Flamingo 论文第 2.4 节并解释其中的权衡。

5. 少样本上下文学习：为一个新的 Flamingo 变体构建一个包含 4 个"图像 -> 主要物体颜色"示例的提示。描述当你改变示例数量从 0 到 8 时预期的准确率模式。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| Perceiver 重采样器 | "固定潜在变量的交叉注意力" | 从可变数量的输入 patch 中产生 K 个固定 token 的模块 |
| 门控交叉注意力 | "Tanh 门控桥接器" | 残差层 `y = tanh(alpha)*cross + x`，可学习的 alpha，初始化 0 |
| 交错输入 | "混合序列" | 提示格式，图像和文本按阅读顺序自由混合 |
| 冻结 LLM | "无 LLM 梯度" | 文本 LLM 的权重不更新；只有重采样器 + 交叉注意力层训练 |
| 少样本 | "上下文示例" | 在提示中给几个（图像, 答案）对；模型无需微调即可泛化 |
| OBELICS | "交错网络语料库" | 1.41 亿网页的数据集，包含按阅读顺序排列的图像和文本 |
| Chinchilla | "70B 冻结基础" | Flamingo 的冻结文本 LLM，来自 DeepMind 的 Chinchilla 论文 |
| 门控调度 | "alpha 如何移动" | 训练期间交叉注意力门打开的速率 |
| 交叉注意力频率 | "每 M 层" | 门控交叉注意力块插入的频率；Flamingo 使用 M=4 |
| OpenFlamingo | "开源复现" | MosaicML/LAION 的开源检查点，3-9B；架构与 Flamingo 相同 |

## 延伸阅读

- [Alayrac 等人 — Flamingo (arXiv:2204.14198)](https://arxiv.org/abs/2204.14198) — 原始论文。
- [Awadalla 等人 — OpenFlamingo (arXiv:2308.01390)](https://arxiv.org/abs/2308.01390) — 开源复现。
- [Laurencon 等人 — OBELICS (arXiv:2306.16527)](https://arxiv.org/abs/2306.16527) — 交错网络语料库。
- [Jaegle 等人 — Perceiver IO (arXiv:2107.14795)](https://arxiv.org/abs/2107.14795) — 通用 Perceiver 架构。
- [Li 等人 — Otter (arXiv:2305.03726)](https://arxiv.org/abs/2305.03726) — 指令微调的 Flamingo 后代。
- [Laurencon 等人 — Idefics2 (arXiv:2405.02246)](https://arxiv.org/abs/2405.02246) — Flamingo 方法的现代简化版。
