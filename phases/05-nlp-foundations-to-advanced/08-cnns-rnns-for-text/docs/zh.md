# 用于文本的 CNN 与 RNN

> 卷积学习 n-gram。循环负责记忆。两者都被注意力超越。但两者在受限硬件上仍然重要。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段3·11（PyTorch 入门），阶段5·03（词嵌入），阶段4·02（从头实现卷积）
**时间：** 约75分钟

## 问题

TF-IDF 和 Word2Vec 生成了忽略词序的扁平向量。基于它们构建的分类器无法区分 `dog bites man` 和 `man bites dog`。词序有时承载着信号。

在 Transformer 出现之前，两类架构填补了这一空白。

**用于文本的卷积网络（TextCNN）。** 对词嵌入序列应用一维卷积。宽度为 3 的滤波器是一个可学习的三元组检测器：它跨越三个单词并输出一个分数。堆叠不同的宽度（2、3、4、5）以检测多尺度模式。使用最大池化得到固定大小的表示。扁平、并行、快速。

**循环网络（RNN、LSTM、GRU）。** 逐个处理词元，维护一个向前传递信息的状态。顺序处理、具有记忆、输入长度灵活。从 2014 年到 2017 年主导了序列建模，然后注意力出现了。

本课将构建这两者，然后指出促使注意力诞生的失败。

## 概念

**TextCNN**（Kim, 2014）。词元被嵌入。一个宽度为 `k` 的一维卷积在连续的 `k`-gram 嵌入上滑动滤波器，生成特征图。对该图进行全局最大池化选取最强的激活。将多个滤波器宽度的最大池化输出拼接起来。输入分类头。

为什么有效。一个滤波器就是一个可学习的 n-gram。最大池化是位置无关的，因此 "not good" 无论是在评论的开头还是中间都会触发相同的特征。三个滤波器宽度各 100 个滤波器，你就得到了 300 个可学习的 n-gram 检测器。训练是并行的，没有顺序依赖。

**RNN。** 在每个时间步 `t`，隐藏状态 `h_t = f(W * x_t + U * h_{t-1} + b)`。在时间上共享 `W`、`U`、`b`。时间 `T` 的隐藏状态是整个前缀的摘要。对于分类，在 `h_1 ... h_T` 上进行池化（最大、平均或最后）。

普通 RNN 存在梯度消失问题。**LSTM** 增加了决定遗忘什么、存储什么和输出什么的门控，通过长序列稳定了梯度。**GRU** 将 LSTM 简化为两个门控；参数更少但性能相似。

**双向 RNN** 分别运行一个前向 RNN 和一个后向 RNN，拼接隐藏状态。每个词元的表示同时看到左右上下文。对标注意任务至关重要。

## 动手构建

### 第 1 步：PyTorch 中的 TextCNN

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class TextCNN(nn.Module):
    def __init__(self, vocab_size, embed_dim, n_classes, filter_widths=(2, 3, 4), n_filters=64, dropout=0.3):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.convs = nn.ModuleList([
            nn.Conv1d(embed_dim, n_filters, kernel_size=k)
            for k in filter_widths
        ])
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(n_filters * len(filter_widths), n_classes)

    def forward(self, token_ids):
        x = self.embed(token_ids).transpose(1, 2)
        pooled = []
        for conv in self.convs:
            c = F.relu(conv(x))
            p = F.max_pool1d(c, c.size(2)).squeeze(2)
            pooled.append(p)
        h = torch.cat(pooled, dim=1)
        return self.fc(self.dropout(h))
```

`transpose(1, 2)` 将 `[batch, seq_len, embed_dim]` 重塑为 `[batch, embed_dim, seq_len]`，因为 `nn.Conv1d` 将中间轴视为通道。无论输入长度如何，池化后的输出都是固定大小的。

### 第 2 步：LSTM 分类器

```python
class LSTMClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim, hidden_dim, n_classes, bidirectional=True, dropout=0.3):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.lstm = nn.LSTM(embed_dim, hidden_dim, batch_first=True, bidirectional=bidirectional)
        factor = 2 if bidirectional else 1
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_dim * factor, n_classes)

    def forward(self, token_ids):
        x = self.embed(token_ids)
        out, _ = self.lstm(x)
        pooled = out.max(dim=1).values
        return self.fc(self.dropout(pooled))
```

在序列上进行最大池化，而不是使用最后状态池化。对于分类，最大池化通常优于取最后隐藏状态，因为长序列末尾的信息往往主导最后状态。

### 第 3 步：梯度消失演示（直观理解）

没有门控的普通 RNN 无法学习长距离依赖关系。考虑一个玩具任务：预测词元 `A` 是否出现在序列中的任何位置。如果 `A` 在位置 1，而序列有 100 个词元长，损失函数的梯度必须通过 99 次循环权重乘法传播回来。如果权重小于 1，梯度消失。如果大于 1，梯度爆炸。

```python
def vanishing_gradient_sim(seq_len, recurrent_weight=0.9):
    import math
    return math.pow(recurrent_weight, seq_len)


# 在 weight=0.9 时经过 100 步：
#   0.9 ^ 100 ≈ 2.7e-5
# 从第 100 步到第 1 步的梯度实际上为零。
```

LSTM 通过一个**细胞状态**解决了这个问题——该状态仅通过加性交互在网络中运行（遗忘门会对其进行乘法缩放，但梯度仍然沿着"高速公路"流动）。GRU 用更少的参数做了类似的事情。两者都能让你在超过 100 步的序列上稳定训练。

### 第 4 步：为什么这仍然不够

即使使用 LSTM，仍然存在三个问题。

1. **顺序瓶颈。** 在长度为 1000 的序列上训练 RNN 需要 1000 个串行的前向/反向步骤。无法在时间维度上并行化。
2. **编码器-解码器设置中的固定大小上下文向量。** 解码器只看到编码器的最终隐藏状态，该状态压缩了整个输入。长输入丢失细节。第 9 课直接涉及这一问题。
3. **远距离依赖准确率上限。** LSTM 优于普通 RNN，但仍然难以在 200 步以上传播特定信息。

注意力解决了所有三个问题。Transformer 完全去除了循环。第 10 课是转折点。

## 使用

PyTorch 的 `nn.LSTM`、`nn.GRU` 和 `nn.Conv1d` 已可用于生产。训练代码是标准的。

Hugging Face 提供了预训练的嵌入，你可以将其作为输入层使用：

```python
from transformers import AutoModel

encoder = AutoModel.from_pretrained("bert-base-uncased")
for param in encoder.parameters():
    param.requires_grad = False


class BertCNN(nn.Module):
    def __init__(self, n_classes, filter_widths=(2, 3, 4), n_filters=64):
        super().__init__()
        self.encoder = encoder
        self.convs = nn.ModuleList([nn.Conv1d(768, n_filters, kernel_size=k) for k in filter_widths])
        self.fc = nn.Linear(n_filters * len(filter_widths), n_classes)

    def forward(self, input_ids, attention_mask):
        with torch.no_grad():
            out = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        x = out.transpose(1, 2)
        pooled = [F.max_pool1d(F.relu(conv(x)), kernel_size=conv(x).size(2)).squeeze(2) for conv in self.convs]
        return self.fc(torch.cat(pooled, dim=1))
```

适用性检查清单。

- **边缘/设备端推理。** 使用 GloVe 嵌入的 TextCNN 比 Transformer 小 10-100 倍。如果部署目标是手机，这就是首选方案。
- **流式/在线分类。** RNN 一次处理一个词元；Transformer 需要完整序列。对于实时输入的文本，LSTM 仍然胜出。
- **用于基线的微型模型。** 在新任务上快速迭代。在 CPU 上 5 分钟训练一个 TextCNN。
- **数据有限时的序列标注。** BiLSTM-CRF（第 6 课）仍然是 1k-10k 标记句子的生产级 NER 架构。

其他情况都使用 Transformer。

## 交付

保存为 `outputs/prompt-text-encoder-picker.md`：

```markdown
---
name: text-encoder-picker
description: 在给定约束条件下选择文本编码器架构。
phase: 5
lesson: 08
---

给定约束条件（任务、数据量、延迟预算、部署目标、计算预算），输出：

1. 编码器架构：TextCNN、BiLSTM、BiLSTM-CRF、Transformer 微调，或"使用预训练 Transformer 作为冻结编码器 + 小型头部"。
2. 嵌入输入：随机初始化、GloVe/fastText 冻结、或上下文化的 Transformer 嵌入。
3. 5 行训练方案：优化器、学习率、批量大小、训练轮数、正则化。
4. 一个监控信号。对于 RNN/CNN 模型：缺少注意力机制意味着它们会错过长距离依赖；检查按长度划分的准确率。对于 Transformer：学习率过高会导致微调崩溃；检查训练损失。

拒绝在数据少于约 500 个标注样本时推荐微调 Transformer，除非已表明 TextCNN/BiLSTM 基线已到瓶颈。标记边缘部署为需要架构优先于一切。
```

## 练习

1. **简单。** 在 3 类玩具数据集上训练 TextCNN（你可以自己创造数据）。验证多滤波器宽度（2、3、4）在平均 F1 上优于单一宽度（3）。
2. **中等。** 为 LSTM 分类器实现最大池化、平均池化和最后状态池化。在小型数据集上进行比较，记录哪种池化胜出并推测原因。
3. **困难。** 构建 BiLSTM-CRF NER 标注器（结合第 6 课和本课）。在 CoNLL-2003 上训练。与第 6 课中仅用 CRF 的基线和 BERT 微调进行比较。报告训练时间、内存和 F1。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| TextCNN | 用于文本的 CNN | 词嵌入上的一维卷积堆栈加全局最大池化。Kim (2014)。 |
| RNN | 循环网络 | 每个时间步更新隐藏状态：`h_t = f(W x_t + U h_{t-1})`。 |
| LSTM | 门控 RNN | 增加了输入/遗忘/输出门加细胞状态。在长序列上稳定训练。 |
| GRU | 简化的 LSTM | 两个门代替三个。类似准确率，更少参数。 |
| 双向 | 两个方向 | 前向 + 后向 RNN 拼接。每个词元看到其上下文的两侧。 |
| 梯度消失 | 训练信号死亡 | 普通 RNN 中 <1 权重的重复乘法使早期步骤的梯度变为零。 |

## 延伸阅读

- [Kim, Y. (2014). Convolutional Neural Networks for Sentence Classification](https://arxiv.org/abs/1408.5882) — TextCNN 论文。8 页。可读性强。
- [Hochreiter, S. and Schmidhuber, J. (1997). Long Short-Term Memory](https://www.bioinf.jku.at/publications/older/2604.pdf) — LSTM 论文。出人意料地清晰。
- [Olah, C. (2015). Understanding LSTM Networks](https://colah.github.io/posts/2015-08-Understanding-LSTMs/) — 使 LSTM 对所有人都易于理解的图解。
