# 从头实现自注意力

> 注意力就像一个查找表，每个词都在问"谁对我重要？"——然后学会答案。

**类型：** 构建
**语言：** Python
**前置要求：** 阶段 3（深度学习核心）、阶段 5 第 10 课（序列到序列）
**时间：** ~90 分钟

## 学习目标

- 仅使用 NumPy 从头实现缩放点积自注意力，包括查询/键/值投影和 softmax 加权求和
- 构建一个多头注意力层，实现头的分割、并行注意力计算和结果拼接
- 追踪注意力矩阵如何捕捉 token 之间的关系，并解释为什么除以 sqrt(d_k) 可以防止 softmax 饱和
- 应用因果掩码将双向注意力转换为自回归（解码器风格）注意力

## 问题

RNN 逐个处理序列 token。当你到达第 50 个 token 时，第 1 个 token 的信息已经被压缩了 50 次。长距离依赖被挤压进一个固定大小的隐藏状态——这是一个无论多少 LSTM 门控都无法完全解决的瓶颈。

2014 年 Bahdanau 的注意力论文展示了修复方法：让解码器回顾每个编码器位置，并决定哪些对当前步骤重要。但它仍然是嫁接在 RNN 上的。2017 年的论文《Attention Is All You Need》提出了一个更尖锐的问题：如果注意力是*唯一*的机制呢？没有循环。没有卷积。只有注意力。

自注意力让序列中的每个位置在单个并行步骤中关注所有其他位置。这就是 transformer 快速、可扩展和占据主导地位的原因。

## 概念

### 数据库查找类比

把注意力想象成一次软性数据库查找：

```
传统数据库：
  查询："法国的首都是" --> 精确匹配 --> "巴黎"

注意力：
  查询："法国的首都是" --> 与所有键的相似度 --> 所有值的加权混合
```

每个 token 生成三个向量：
- **查询 (Q)**："我在找什么？"
- **键 (K)**："我包含什么？"
- **值 (V)**："如果被选中，我提供什么信息？"

查询与所有键的点积产生注意力分数。高分意味着"这个键匹配我的查询"。这些分数用于加权值。输出是值的加权和。

### Q、K、V 计算

每个 token 嵌入通过三个学习到的权重矩阵进行投影：

```
输入嵌入（n 个 token 的序列，每个 d 维）：

  X = [x1, x2, x3, ..., xn]       形状：(n, d)

三个权重矩阵：

  Wq  形状：(d, dk)
  Wk  形状：(d, dk)
  Wv  形状：(d, dv)

投影：

  Q = X @ Wq    形状：(n, dk)     每个 token 的查询
  K = X @ Wk    形状：(n, dk)     每个 token 的键
  V = X @ Wv    形状：(n, dv)     每个 token 的值
```

对于单个 token 的可视化：

```
             Wq
  x_i ------[*]------> q_i    "我在找什么？"
       |
       |     Wk
       +----[*]------> k_i    "我包含什么？"
       |
       |     Wv
       +----[*]------> v_i    "我提供什么？"
```

### 注意力矩阵

一旦你有了所有 token 的 Q、K、V，注意力分数就形成了一个矩阵：

```
分数 = Q @ K^T    形状：(n, n)

              k1    k2    k3    k4    k5
        +-----+-----+-----+-----+-----+
   q1   | 2.1 | 0.3 | 0.1 | 0.8 | 0.2 |   <- q1 对每个键的注意力
        +-----+-----+-----+-----+-----+
   q2   | 0.4 | 1.9 | 0.7 | 0.1 | 0.3 |
        +-----+-----+-----+-----+-----+
   q3   | 0.2 | 0.6 | 2.3 | 0.5 | 0.1 |
        +-----+-----+-----+-----+-----+
   q4   | 0.9 | 0.1 | 0.4 | 1.7 | 0.6 |
        +-----+-----+-----+-----+-----+
   q5   | 0.1 | 0.3 | 0.2 | 0.5 | 2.0 |
        +-----+-----+-----+-----+-----+

每一行：一个 token 对整个序列的注意力
```

```figure
attention-matrix
```

### 为什么要缩放？

点积的值随维度 dk 增长。如果 dk = 64，点积可以达到几十的范围，将 softmax 推入梯度消失的区域。修复方法：除以 sqrt(dk)。

```
缩放后的分数 = (Q @ K^T) / sqrt(dk)
```

这使数值保持在 softmax 能产生有用梯度的范围内。

### Softmax 将分数转换为权重

Softmax 将原始分数转换为每行上的概率分布：

```
q1 的原始分数：   [2.1, 0.3, 0.1, 0.8, 0.2]
                            |
                         softmax
                            |
注意力权重：   [0.52, 0.09, 0.07, 0.14, 0.08]   （总和约为 1.0）
```

现在每个 token 有了一组权重，表示它对每个其他 token 的关注程度。

### 值的加权和

每个 token 的最终输出是所有值向量的加权和：

```
output_i = sum( attention_weight[i][j] * v_j  for all j )

对于 token 1：
  output_1 = 0.52 * v1 + 0.09 * v2 + 0.07 * v3 + 0.14 * v4 + 0.08 * v5
```

### 完整流水线

```mermaid
flowchart LR
  X["X (输入)"] --> Q["Q = X · Wq"]
  X --> K["K = X · Wk"]
  X --> V["V = X · Wv"]
  Q --> S["Q · Kᵀ / √dk"]
  K --> S
  S --> SM["softmax"]
  SM --> WS["加权求和"]
  V --> WS
  WS --> O["输出"]
```

一行公式：

```
Attention(Q, K, V) = softmax( Q @ K^T / sqrt(dk) ) @ V
```

```figure
softmax-attention-scaling
```

## 构建

### 步骤 1：从头实现 Softmax

Softmax 将原始 logits 转换为概率。减去最大值以保证数值稳定性。

```python
import numpy as np

def softmax(x):
    shifted = x - np.max(x, axis=-1, keepdims=True)
    exp_x = np.exp(shifted)
    return exp_x / np.sum(exp_x, axis=-1, keepdims=True)

logits = np.array([2.0, 1.0, 0.1])
print(f"logits:  {logits}")
print(f"softmax: {softmax(logits)}")
print(f"sum:     {softmax(logits).sum():.4f}")
```

### 步骤 2：缩放点积注意力

核心函数。接收 Q、K、V 矩阵，返回注意力输出和权重矩阵。

```python
def scaled_dot_product_attention(Q, K, V):
    dk = Q.shape[-1]
    scores = Q @ K.T / np.sqrt(dk)
    weights = softmax(scores)
    output = weights @ V
    return output, weights
```

### 步骤 3：带学习投影的自注意力类

一个完整的自注意力模块，包含使用 Xavier 风格缩放初始化的 Wq、Wk、Wv 权重矩阵。

```python
class SelfAttention:
    def __init__(self, d_model, dk, dv, seed=42):
        rng = np.random.default_rng(seed)
        scale = np.sqrt(2.0 / (d_model + dk))
        self.Wq = rng.normal(0, scale, (d_model, dk))
        self.Wk = rng.normal(0, scale, (d_model, dk))
        scale_v = np.sqrt(2.0 / (d_model + dv))
        self.Wv = rng.normal(0, scale_v, (d_model, dv))
        self.dk = dk

    def forward(self, X):
        Q = X @ self.Wq
        K = X @ self.Wk
        V = X @ self.Wv
        output, weights = scaled_dot_product_attention(Q, K, V)
        return output, weights
```

### 步骤 4：在句子上运行

为一个句子创建假嵌入，并观察注意力权重。

```python
sentence = ["The", "cat", "sat", "on", "the", "mat"]
n_tokens = len(sentence)
d_model = 8
dk = 4
dv = 4

rng = np.random.default_rng(42)
X = rng.normal(0, 1, (n_tokens, d_model))

attn = SelfAttention(d_model, dk, dv, seed=42)
output, weights = attn.forward(X)

print("Attention weights (each row: where that token looks):\n")
print(f"{'':>6}", end="")
for token in sentence:
    print(f"{token:>6}", end="")
print()

for i, token in enumerate(sentence):
    print(f"{token:>6}", end="")
    for j in range(n_tokens):
        w = weights[i][j]
        print(f"{w:6.3f}", end="")
    print()
```

### 步骤 5：用 ASCII 热图可视化注意力

将注意力权重映射为字符以实现快速可视化。

```python
def ascii_heatmap(weights, tokens, chars=" ░▒▓█"):
    n = len(tokens)
    print(f"\n{'':>6}", end="")
    for t in tokens:
        print(f"{t:>6}", end="")
    print()

    for i in range(n):
        print(f"{tokens[i]:>6}", end="")
        for j in range(n):
            level = int(weights[i][j] * (len(chars) - 1) / weights.max())
            level = min(level, len(chars) - 1)
            print(f"{'  ' + chars[level] + '   '}", end="")
        print()

ascii_heatmap(weights, sentence)
```

## 使用

PyTorch 的 `nn.MultiheadAttention` 做的正是我们构建的内容，还加上多头分割和输出投影：

```python
import torch
import torch.nn as nn

d_model = 8
n_heads = 2
seq_len = 6

mha = nn.MultiheadAttention(embed_dim=d_model, num_heads=n_heads, batch_first=True)

X_torch = torch.randn(1, seq_len, d_model)

output, attn_weights = mha(X_torch, X_torch, X_torch)

print(f"Input shape:            {X_torch.shape}")
print(f"Output shape:           {output.shape}")
print(f"Attention weight shape: {attn_weights.shape}")
print(f"\nAttn weights (averaged over heads):")
print(attn_weights[0].detach().numpy().round(3))
```

关键区别：多头注意力并行运行多个注意力函数，每个函数有自己的 Q、K、V 投影，大小为 dk = d_model / n_heads，然后拼接结果。这让模型能够同时关注不同类型的关系。

## 交付

本课程产出：
- `outputs/prompt-attention-explainer.zh.md` - 一个通过数据库查找类比解释注意力机制的提示词

## 练习

1. 修改 `scaled_dot_product_attention`，使其接受一个可选的掩码矩阵，在 softmax 前将某些位置设为负无穷（这就是因果/解码器掩码的工作方式）
2. 从头实现多头注意力：将 Q、K、V 分割成 `n_heads` 块，对每个块运行注意力，拼接，然后通过最终的权重矩阵 Wo 进行投影
3. 取两个长度相同但内容不同的句子，输入同一个 SelfAttention 实例，比较它们的注意力模式。哪些变了？哪些没变？

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|----------------|----------------------|
| 查询 (Q) | "问题向量" | 输入的学习投影，表示这个 token 在寻找什么信息 |
| 键 (K) | "标签向量" | 输入的学习投影，表示这个 token 包含什么信息，与查询匹配 |
| 值 (V) | "内容向量" | 携带实际信息的学习投影，根据注意力分数进行聚合 |
| 缩放点积注意力 | "注意力公式" | softmax(QK^T / sqrt(dk)) @ V - 缩放防止高维下 softmax 饱和 |
| 自注意力 | "token 关注自己和他人" | Q、K、V 都来自同一序列，让每个位置关注所有其他位置 |
| 注意力权重 | "关注程度" | 通过 softmax 在缩放点积上产生的关于位置的概率分布 |
| 多头注意力 | "并行注意力" | 用不同投影运行多个注意力函数，然后拼接结果以获得更丰富的表示 |

## 延伸阅读

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - 原始 transformer 论文
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) - 全架构最佳可视化讲解
- [The Annotated Transformer (Harvard NLP)](https://nlp.seas.harvard.edu/annotated-transformer/) - 逐行 PyTorch 实现与解释
