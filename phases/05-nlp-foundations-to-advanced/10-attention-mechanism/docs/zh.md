# 注意力机制——突破

> 解码器不再眯着眼看压缩摘要，而是开始查看整个源。此后的一切都是注意力加工程。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段5·09（序列到序列模型）
**时间：** 约45分钟

## 问题

第 9 课的结局是一个可测量的失败。在玩具复制任务上训练的 GRU 编码器-解码器从长度 5 时的 89% 准确率下降到长度 80 时的接近随机水平。原因是结构性的，而非训练错误：编码器获得的每一点信息都必须装进一个固定大小的隐藏状态，而解码器从未看到其他任何东西。

Bahdanau、Cho 和 Bengio 在 2014 年发表了一个三行的修复方案。与其只给解码器最终的编码器状态，不如保留每个编码器状态。在每个解码器步骤，计算编码器状态的加权平均，其中的权重表示"解码器现在需要多大程度地查看编码器位置 `i`？"这个加权平均就是上下文，并且它在每个解码器步骤都会变化。

这就是全部的想法。Transformer 对其进行了扩展。自注意力将其应用于单个序列。多头注意力并行运行它。但 2014 年的版本已经打破了瓶颈，一旦你掌握了它，转向 Transformer 就只是工程问题，而非概念问题。

## 概念

![Bahdanau 注意力：解码器查询所有编码器状态](../assets/attention.svg)

在每个解码器步骤 `t`：

1. 使用前一个解码器隐藏状态 `s_{t-1}` 作为**查询**。
2. 对其与每个编码器隐藏状态 `h_1, ..., h_T` 进行打分。每个编码器位置一个标量。
3. 对分数进行 Softmax 操作，得到注意力权重 `α_{t,1}, ..., α_{t,T}`，这些权重之和为 1。
4. 上下文向量 `c_t = Σ α_{t,i} * h_i`。编码器状态的加权平均。
5. 解码器将 `c_t` 与前一个输出词元结合，产生下一个词元。

加权平均就是关键。当解码器需要将 "Je" 翻译成 "I" 时，它将编码器在 "Je" 位置上的权重设高，其他位置设低。当需要 "not" 时，它将 "pas" 的权重设高。上下文向量每一步都在重塑。

## 形状（最容易出错的地方）

这是每个注意力实现第一次都会出错的地方。请仔细阅读。

| 事物 | 形状 | 备注 |
|------|------|------|
| 编码器隐藏状态 `H` | `(T_enc, d_h)` | 如果是 BiLSTM，则 `d_h = 2 * d_hidden` |
| 解码器隐藏状态 `s_{t-1}` | `(d_s,)` | 一个向量 |
| 注意力分数 `e_{t,i}` | 标量 | 每个编码器位置一个 |
| 注意力权重 `α_{t,i}` | 标量 | 对所有 `i` 进行 softmax 后 |
| 上下文向量 `c_t` | `(d_h,)` | 与编码器状态形状相同 |

**Bahdanau（加性）分数。** `e_{t,i} = v_α^T * tanh(W_a * s_{t-1} + U_a * h_i)`。

- `s_{t-1}` 形状为 `(d_s,)`，`h_i` 形状为 `(d_h,)`。
- `W_a` 形状为 `(d_attn, d_s)`。`U_a` 形状为 `(d_attn, d_h)`。
- 它们在 tanh 内部的和形状为 `(d_attn,)`。
- `v_α` 形状为 `(d_attn,)`。与 `v_α` 的内积坍缩为一个标量。**这就是 `v_α` 的作用。** 它不是魔法。它是将注意力维度的向量转换为标量分数的投影。

**Luong（乘性）分数。** 三种变体：

- `dot`：`e_{t,i} = s_t^T * h_i`。要求 `d_s == d_h`。硬性约束。如果你的编码器是双向的，跳过这个。
- `general`：`e_{t,i} = s_t^T * W * h_i`，其中 `W` 形状为 `(d_s, d_h)`。去除了等维约束。
- `concat`：本质上是 Bahdanau 形式。由于前两种更便宜，很少使用。

**一个值得指出的 Bahdanau/Luong 陷阱。** Bahdanau 使用 `s_{t-1}`（生成当前词*之前*的解码器状态）。Luong 使用 `s_t`（*之后*的状态）。混淆它们会产生微妙的错误梯度，极难调试。选择一篇论文并坚持其约定。

## 动手构建

### 第 1 步：加性（Bahdanau）注意力

```python
import numpy as np


def additive_attention(decoder_state, encoder_states, W_a, U_a, v_a):
    projected_dec = W_a @ decoder_state
    projected_enc = encoder_states @ U_a.T
    combined = np.tanh(projected_enc + projected_dec)
    scores = combined @ v_a
    weights = softmax(scores)
    context = weights @ encoder_states
    return context, weights


def softmax(x):
    x = x - np.max(x)
    e = np.exp(x)
    return e / e.sum()
```

对照上表检查你的形状。`encoder_states` 形状为 `(T_enc, d_h)`。`projected_enc` 形状为 `(T_enc, d_attn)`。`projected_dec` 形状为 `(d_attn,)` 并进行广播。`combined` 形状为 `(T_enc, d_attn)`。`scores` 形状为 `(T_enc,)`。`weights` 形状为 `(T_enc,)`。`context` 形状为 `(d_h,)`。可以交付。

### 第 2 步：Luong 点积和通用形式

```python
def dot_attention(decoder_state, encoder_states):
    scores = encoder_states @ decoder_state
    weights = softmax(scores)
    return weights @ encoder_states, weights


def general_attention(decoder_state, encoder_states, W):
    projected = W.T @ decoder_state
    scores = encoder_states @ projected
    weights = softmax(scores)
    return weights @ encoder_states, weights
```

每个三行。这就是 Luong 的论文落地的方式。大多数任务上相同的准确率，代码少得多。

### 第 3 步：数值示例

给定三个编码器状态（大致对应"cat"、"sat"、"mat"）和一个与第一个最对齐的解码器状态，注意力分布集中在位置 0 上。如果解码器状态转向与最后一个对齐，注意力移到位置 2。上下文向量随之移动。

```python
H = np.array([
    [1.0, 0.0, 0.2],
    [0.5, 0.5, 0.1],
    [0.1, 0.9, 0.3],
])

s_close_to_cat = np.array([0.9, 0.1, 0.2])
ctx, w = dot_attention(s_close_to_cat, H)
print("weights:", w.round(3))
```

```
weights: [0.464 0.305 0.231]
```

第一行胜出。然后将解码器状态移近第三个编码器状态，观察权重变化。就是这样。注意力就是显式对齐。

### 第 4 步：为什么这是通往 Transformer 的桥梁

将上面的语言翻译成 Q/K/V：

- **查询** = 解码器状态 `s_{t-1}`
- **键** = 编码器状态（我们用来打分的对象）
- **值** = 编码器状态（我们加权求和的对象）

在经典注意力中，键和值是同一个东西。自注意力将它们分开：你可以用不同的 K 和 V 学习投影对一个序列查询自身。多头注意力用不同的学习投影并行运行它。Transformer 将整个阶段堆叠多次并移除 RNN。

数学是一样的。形状是一样的。从 Bahdanau 注意力到缩放点积注意力的教学跳跃主要是符号上的变化。

## 使用

PyTorch 和 TensorFlow 直接提供了注意力。

```python
import torch
import torch.nn as nn

mha = nn.MultiheadAttention(embed_dim=128, num_heads=8, batch_first=True)
query = torch.randn(2, 5, 128)
key = torch.randn(2, 10, 128)
value = torch.randn(2, 10, 128)

output, weights = mha(query, key, value)
print(output.shape, weights.shape)
```

```
torch.Size([2, 5, 128]) torch.Size([2, 5, 10])
```

这就是一个 Transformer 注意力层。5 个位置的查询批次，10 个位置的键/值批次，128 维，8 个头。`output` 是新的上下文增强查询。`weights` 是你可以可视化的 5x10 对齐矩阵。

### 经典注意力什么时候仍然重要

- 教学用途。单头、单层、基于 RNN 的版本使每个概念可见。
- 设备端序列任务，Transformer 无法容纳。
- 任何 2014-2017 年的论文。不了解 Bahdanau 的约定，你会误读它。
- 机器翻译中的细粒度对齐分析。原始注意力权重即使对 Transformer 模型也是一种可解释性工具，阅读它们需要知道它们是什么。

### 注意力权重作为解释的陷阱

注意力权重看起来是可解释的。它们是跨位置求和为 1 的权重；你可以绘制它们；高值表示"看了这里"。审稿人喜欢它们。

它们并不像看起来那么可解释。Jain 和 Wallace（2019）表明，注意力分布可以被置换并替换为任意的替代方案，而对某些任务的模型预测没有影响。在没有消融或反事实检查的情况下，切勿将注意力权重报告为推理的证据。

## 交付

保存为 `outputs/prompt-attention-shapes.md`：

```markdown
---
name: attention-shapes
description: 调试注意力实现中的形状错误。
phase: 5
lesson: 10
---

给定一个出错的注意力实现，你识别形状不匹配。输出：

1. 哪个矩阵形状错误。命名张量。
2. 根据 (d_s, d_h, d_attn, T_enc, T_dec, batch_size) 推导出其应有的形状。
3. 一行修复。转置、重塑或投影。
4. 一个用于捕获回归的测试。通常：断言 `output.shape == (batch, T_dec, d_h)` 且 `weights.shape == (batch, T_dec, T_enc)` 且 `weights.sum(dim=-1) 接近 1`。

拒绝推荐静默广播的修复。隐藏广播的错误会在后来表现为悄无声息的准确率下降，最糟糕的注意力错误类型。

对于 Bahdanau 混淆，坚持解码器输入是 `s_{t-1}`（步前状态）。对于 Luong，是 `s_t`（步后状态）。对于点积注意力，标记查询和键之间的维度不匹配为最常见的初学错误。
```

## 练习

1. **简单。** 实现 `softmax` 掩码，使编码器中的填充词元得到零注意力权重。在可变长度序列的批次上进行测试。
2. **中等。** 为 Luong `general` 形式添加多头注意力。将 `d_h` 拆分为 `n_heads` 组，每个头运行注意力，然后拼接。验证单头情况与之前实现匹配。
3. **困难。** 在第 9 课的玩具复制任务上训练一个带有 Bahdanau 注意力的 GRU 编码器-解码器。绘制准确率与序列长度的关系图。与无注意力的基线进行比较。你应该看到随着长度增长差距扩大，确认注意力解除了瓶颈。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 注意力 | 看东西 | 值序列的加权平均，权重从查询-键相似度计算得出。 |
| 查询、键、值 | QKV | 三个投影：Q 提问，K 是要匹配的内容，V 是要返回的内容。 |
| 加性注意力 | Bahdanau | 前馈分数：`v^T tanh(W q + U k)`。 |
| 乘性注意力 | Luong 点积/通用 | 分数为 `q^T k` 或 `q^T W k`。更便宜，大多数任务上相同准确率。 |
| 对齐矩阵 | 漂亮的图片 | 作为 `(T_dec, T_enc)` 网格的注意力权重。阅读它可以看到模型关注了什么。 |

## 延伸阅读

- [Bahdanau, Cho, Bengio (2014). Neural Machine Translation by Jointly Learning to Align and Translate](https://arxiv.org/abs/1409.0473) — 论文。
- [Luong, Pham, Manning (2015). Effective Approaches to Attention-based Neural Machine Translation](https://arxiv.org/abs/1508.04025) — 三种分数变体及其比较。
- [Jain and Wallace (2019). Attention is not Explanation](https://arxiv.org/abs/1902.10186) — 可解释性注意事项。
- [Dive into Deep Learning — Bahdanau Attention](https://d2l.ai/chapter_attention-mechanisms-and-transformers/bahdanau-attention.html) — 使用 PyTorch 的可运行讲解。
