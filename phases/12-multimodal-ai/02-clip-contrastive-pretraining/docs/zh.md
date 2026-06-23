# CLIP 与对比视觉-语言预训练

> OpenAI 的 CLIP（2021 年）证明了一个足以驱动未来五年的理念：仅使用嘈杂的网络图像-标题对和一个对比损失函数，将图像编码器和文本编码器对齐在同一个向量空间中。零监督标签。400M 对数据。由此产生的嵌入空间可以进行零样本分类、图像-文本检索，并作为每个 2026 年 VLM 的视觉塔。SigLIP 2（2025 年）用 sigmoid 替换了 softmax，以更低的成本超越 CLIP。本节课从 InfoNCE 到 sigmoid 逐对损失推演数学原理，并用标准库 Python 构建训练步骤。

**类型：** 构建
**语言：** Python（标准库，InfoNCE + sigmoid 损失实现）
**前置知识：** 阶段 12 · 01（ViT patches），阶段 7（Transformer）
**时间：** ~180 分钟

## 学习目标

- 从互信息推导 InfoNCE 损失，并实现一个数值稳定的向量化版本。
- 解释为什么 sigmoid 逐对损失（SigLIP）可以扩展到 batch 32768+，而不需要 softmax 所需的 all-gather 开销。
- 通过构建文本模板（`a photo of a {class}`）并取余弦相似度的 argmax，运行零样本 ImageNet 分类。
- 说出 CLIP / SigLIP 预训练给你的四个杠杆：batch 大小、温度、提示模板、数据质量。

## 问题

CLIP 之前的视觉是监督式的。收集带标签的数据集（ImageNet：120 万张图像，1000 个类别），训练 CNN，部署。标签昂贵，标签偏向于标注者能达成一致的内容，而且标签不能在没有微调的情况下转移到新任务上。

图像-标题网络上有超过十亿个松散标记的免费对。一张金毛犬的图片配以替代文本"my dog Max in the park"携带监督信号——文本描述了图像。问题：你能将其转化为有用的训练吗？

CLIP 的答案：将图像-标题对视为一个匹配任务。给定一个批次 N 张图像和 N 个标题，学习将每张图像与其自己的标题匹配，对抗 N-1 个干扰项。监督信号是"这两个属于一起；这 N-1 对不属于一起。"没有类别标签。没有人工标注。只需要一个对比损失。

由此产生的嵌入空间做的事情比 CLIP 被训练做的更多。ImageNet 零样本有效，因为"a photo of a cat"嵌入到从未被显式标记为猫的猫图片附近。这就是孕育每个 2026 VLM 的豪赌。

## 概念

### 双编码器

CLIP 有两个塔：

- 图像编码器 `f`：ViT 或 ResNet，每张图像输出一个 D 维向量。
- 文本编码器 `g`：小型 transformer，每个标题输出一个 D 维向量。

两个塔都将其输出归一化到单位长度。相似度是 `cos(f(x), g(y)) = f(x)^T g(y)`，因为两者都是单位范数。

对于一个 N 对（图像, 标题）的批次，构建形状为 `(N, N)` 的相似度矩阵 `S`：

```
S[i, j] = cos(f(x_i), g(y_j)) / tau
```

其中 `tau` 是学习到的温度（CLIP 初始化为 0.07；在 log 空间中学习）。

### InfoNCE 损失

CLIP 使用行和列上的对称交叉熵：

```
loss_i2t = CE(S, labels=identity)     # 每张图像的正例是其自己的标题
loss_t2i = CE(S^T, labels=identity)   # 每个标题的正例是其自己的图像
loss = (loss_i2t + loss_t2i) / 2
```

这就是 InfoNCE。CE 中的 softmax 迫使每张图像与其标题的匹配度超过批次中的每个其他标题。"负例"是所有其他的批次项。更大的批次 = 更多的负例 = 更强的信号。CLIP 以 batch 32k 训练；规模很重要。

### 温度

`tau` 控制 softmax 的锐度。低 tau → 尖锐分布，具有难负例挖掘效果。高 tau → 柔和，所有样本都有贡献。CLIP 学习 log(1/tau)，通过截断防止崩溃。SigLIP 2 固定初始 tau 并使用学习到的偏置代替。

### 为什么 sigmoid 缩放更好（SigLIP）

Softmax 需要整个相似度矩阵同步。在分布式训练中，你必须将每个嵌入 all-gather 到每个副本，然后做 softmax。这在通信方面是世界规模的二次方。

SigLIP 用逐元素 sigmoid 替换了 softmax：对于每对 `(i, j)`，损失是对"这是匹配对吗？"的二元分类。正类标签是对角线，其他一切都是负标签。损失为：

```
L = -1/N sum over (i, j) [ y_ij log sigmoid(S[i,j]) + (1-y_ij) log sigmoid(-S[i,j]) ]
```

`y_ij = 1` 如果 `i == j`，否则为 0。每对的损失是独立的。不需要 all-gather。每个 GPU 计算其本地块并求和。SigLIP 2 可以廉价地扩展到 batch 32k-512k，而 CLIP 需要相应更多的通信。

### 零样本分类

给定 N 个类别名称，为每个类别构建文本模板：

```
"a photo of a {class}"
```

用文本编码器嵌入每个模板。用图像编码器嵌入你的图像。余弦相似度的 argmax = 预测类别。不在目标类别上训练。

提示模板很重要。CLIP 的原始论文每类使用了 80 个模板（朴素、艺术、照片、绘画等）并对嵌入取平均。+3 个 ImageNet 百分点。现代使用通常选择一个或两个模板。

### 线性探针和微调

零样本是一个基线。线性探针（在你的目标类别的冻结 CLIP 特征之上训练一个线性层）在领域内任务上击败零样本。完整微调在领域内击败线性探针，但可能损害零样本迁移。三种方案，三种权衡。

### SigLIP 2：NaFlex 和密集特征

SigLIP 2（2025 年）增加了：
- NaFlex：单一模型处理可变纵横比和分辨率。
- 更好的密集特征用于分割和深度估计，目标是在 VLM 中用作冻结骨干。
- 多语言：在 100+ 语言上训练，而 CLIP 仅支持英语。
- 1B 参数量级，而 CLIP 上限为 400M。

在 2026 年的开源 VLM 中，SigLIP 2 SO400m/14 是默认的视觉塔。在纯图像-文本检索中，CLIP 仍然是默认选择，因为其特定的 LAION-2B 训练分布与你的查询模式匹配。

### ALIGN、BASIC、OpenCLIP、EVA-CLIP

ALIGN（Google，2021 年）：与 CLIP 相同的思想，18 亿对规模，90% 为噪声。证明了噪声数据可扩展。OpenCLIP（LAION）：CLIP 在 LAION-400M / 2B 上的开源复现，多个规模，是首选的开源检查点。EVA-CLIP：从掩码图像建模初始化；VLM 的强骨干。BASIC：Google 的 CLIP+ALIGN 混合体。都属于同一家族，只是数据和调优不同。

### 零样本上限

CLIP 类模型在 ImageNet 零样本上上限约为 76%（CLIP-G、OpenCLIP-G）。要超越这个水平需要要么更多的数据（SigLIP 2 达到 80%+），要么架构改变（监督头、更多参数）。基准测试正在饱和；真正的价值在于下游 VLM 消费的嵌入空间。

```figure
multimodal-fusion
```

## 使用它

`code/main.py` 实现了：

1. 一个玩具双编码器（基于哈希的图像特征，文本字符特征），让你无需 numpy 就能看到 InfoNCE 的形状。
2. 纯 Python 中的 InfoNCE 损失（通过 log-sum-exp 实现数值稳定）。
3. 用于比较的 sigmoid 逐对损失。
4. 一个零样本分类例程：计算与一组文本提示的余弦相似度，取 argmax 进行预测。

运行它并观察损失曲线。绝对值是玩具级的；形状与真实的 CLIP 训练器发出的相匹配。

## 交付物

本课程产出 `outputs/skill-clip-zero-shot.zh.md`。给定一组图像（通过路径）和一个目标类别列表，它用 CLIP 模板构建文本提示，用指定的检查点（例如 `openai/clip-vit-large-patch14`）嵌入两边，并返回 top-1 / top-5 预测及相似度分数。该技能拒绝声称不在提示列表中的类别的结果。

## 练习

1. 手算实现一个 4 对批次的 InfoNCE。构建 4x4 相似度矩阵，运行 softmax，挑出对角线，计算交叉熵。用这个手工计算验证你的 Python 实现。

2. SigLIP 除了温度外还使用一个偏置参数 `b`：`S'[i,j] = S[i,j]/tau + b`。当批次中有很大的类别不平衡（每行负例远多于正例）时，`b` 扮演什么角色？阅读 SigLIP 第 3 节（arXiv:2303.15343）。

3. 为猫 vs 狗构建一个零样本分类器。尝试两个提示模板：`a photo of a {class}` 和 `a picture of a {class}`。在 100 张测试图像上测量准确率。模板集成是否超过单一模板？

4. 计算 512-GPU 运行中 batch 32k 时 softmax InfoNCE 与 sigmoid 逐对损失的通信成本。哪个是 O(N) 扩展，哪个是 O(N^2)？引用 SigLIP 第 4 节。

5. 阅读 OpenCLIP 缩放定律论文（arXiv:2212.07143，Cherti 等人）。从图表中重现他们关于数据缩放的结论：在固定模型大小时，ImageNet 零样本准确率与训练数据量之间的对数线性关系是什么？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| InfoNCE | "对比损失" | 批次相似度矩阵上的交叉熵；每个项的正例是其配对项，负例是其他所有项 |
| Sigmoid 损失 | "SigLIP 损失" | 每对二元交叉熵；无 softmax，无 all-gather，在分布式训练中廉价缩放 |
| 温度（Temperature） | "tau" | 在 softmax/sigmoid 之前缩放 logits 的标量；控制分布的锐度 |
| 零样本（Zero-shot） | "无需微调的分类" | 使用文本提示构建类别嵌入并通过余弦相似度分类；不在目标类别上训练 |
| 提示模板（Prompt template） | "a photo of a ..." | 围绕类别名称的文本框架；影响零样本准确率 1-5 个百分点 |
| 双编码器（Dual encoder） | "双塔" | 一个图像编码器 + 一个文本编码器，在共享的 D 维空间中输出 |
| 难负例（Hard negative） | "困难的干扰项" | 一个与正例足够相似、模型必须努力才能将其分开的负例 |
| 线性探针（Linear probe） | "冻结 + 一层" | 仅在冻结特征之上训练一个线性分类器；衡量特征质量 |
| NaFlex | "原生灵活分辨率" | SigLIP 2 的能力，无需调整大小即可按任意纵横比和分辨率输入图像 |
| 温度缩放（Temperature scaling） | "log 参数化的 tau" | CLIP 参数化 `log(1/tau)` 使梯度行为正常；截断以防止趋近零 tau |

## 延伸阅读

- [Radford 等人 — Learning Transferable Visual Models From Natural Language Supervision (arXiv:2103.00020)](https://arxiv.org/abs/2103.00020) — CLIP 论文。
- [Zhai 等人 — Sigmoid Loss for Language Image Pre-Training (arXiv:2303.15343)](https://arxiv.org/abs/2303.15343) — SigLIP。
- [Tschannen 等人 — SigLIP 2 (arXiv:2502.14786)](https://arxiv.org/abs/2502.14786) — 多语言 + NaFlex。
- [Jia 等人 — ALIGN (arXiv:2102.05918)](https://arxiv.org/abs/2102.05918) — 用噪声网络数据扩展。
- [Cherti 等人 — Reproducible scaling laws for contrastive language-image learning (arXiv:2212.07143)](https://arxiv.org/abs/2212.07143) — OpenCLIP 缩放定律。
