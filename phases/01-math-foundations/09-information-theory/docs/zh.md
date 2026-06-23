# 信息论

> 信息论衡量的是惊讶程度。损失函数建立在其基础之上。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 1，第 06 课（概率）
**时间：** ~60 分钟

## 学习目标

- 从头计算熵、交叉熵和 KL 散度，并解释它们之间的关系
- 推导为什么最小化交叉熵损失等价于最大化对数似然
- 计算特征与目标之间的互信息以对特征重要性进行排序
- 解释困惑度作为语言模型选择的有效词汇量大小

## 问题

你在训练的每个分类模型中都调用了 `CrossEntropyLoss()`。你在每篇语言模型论文中都看到了"困惑度"。你读到过 VAE、知识蒸馏和 RLHF 中的 KL 散度。这些不是不相关的概念。它们都是同一个想法穿上了不同的外衣。

信息论为你提供了推理不确定性、压缩和预测的语言。克劳德·香农在 1948 年为了解决通信问题而发明了它。事实证明，训练神经网络就是一个通信问题：模型试图通过一个学习权重的噪声信道传输正确的标签。

本课程从头构建每一个公式，让你看到它们来自哪里以及为什么有效。

## 概念

### 信息含量（惊喜度）

当不太可能的事件发生时，它携带更多的信息。硬币落地正面？不令人惊讶。中彩票？非常令人惊讶。

一个概率为 p 的事件的信息含量是：

```
I(x) = -log(p(x))
```

使用以 2 为底的对数得到比特（bits）。使用自然对数得到奈特（nats）。同样的想法，不同的单位。

```
事件              概率      惊喜度（比特）
公平硬币正面     0.5        1.0
掷出 6           0.167      2.58
千分之一事件     0.001      9.97
确定事件         1.0        0.0
```

确定事件携带的信息为零。你已经知道它们会发生。

### 熵（平均惊喜度）

熵是一个分布所有可能结果上的期望惊喜度。

```
H(P) = -sum( p(x) * log(p(x)) )  对所有 x
```

对于二元变量，公平硬币的熵最大：1 比特。有偏硬币（99% 正面）的熵很低：0.08 比特。你已经知道会发生什么，所以每次翻转几乎不告诉你任何信息。

```
公平硬币：   H = -(0.5 * log2(0.5) + 0.5 * log2(0.5)) = 1.0 比特
有偏硬币：   H = -(0.99 * log2(0.99) + 0.01 * log2(0.01)) = 0.08 比特
```

熵衡量一个分布中不可约的不确定性。你不能将其压缩到低于这个值。

### 交叉熵（你每天使用的损失函数）

交叉熵衡量当你使用分布 Q 来编码实际来自分布 P 的事件时的平均惊喜度。

```
H(P, Q) = -sum( p(x) * log(q(x)) )  对所有 x
```

P 是真实分布（标签）。Q 是你模型的预测。如果 Q 完美匹配 P，交叉熵等于熵。任何不匹配都会使其更大。

在分类中，P 是一个独热向量（真实类别的概率为 1，其他均为 0）。这简化了交叉熵为：

```
H(P, Q) = -log(q(true_class))
```

这就是分类的完整交叉熵损失公式。最大化正确类别的预测概率。

### KL 散度（分布之间的距离）

KL 散度衡量你因使用 Q 而不是 P 而获得的额外惊喜度。

```
D_KL(P || Q) = sum( p(x) * log(p(x) / q(x)) )  对所有 x
             = H(P, Q) - H(P)
```

交叉熵等于熵加上 KL 散度。由于真实分布的熵在训练期间是常数，最小化交叉熵等同于最小化 KL 散度。你正在将模型的分布推向真实分布。

KL 散度不是对称的：D_KL(P || Q) != D_KL(Q || P)。它不是真正的距离度量。

### 互信息

互信息衡量知道一个变量能告诉你多少关于另一个变量的信息。

```
I(X; Y) = H(X) - H(X|Y)
        = H(X) + H(Y) - H(X, Y)
```

如果 X 和 Y 独立，互信息为零。知道一个不会告诉你关于另一个的任何信息。如果它们完全相关，互信息等于任一变量的熵。

在特征选择中，特征与目标之间的高互信息意味着该特征有用。低互信息意味着它是噪声。

### 条件熵

H(Y|X) 衡量在观察到 X 之后，关于 Y 还有多少不确定性。

```
H(Y|X) = H(X,Y) - H(X)
```

两个极端：
- 如果 X 完全决定了 Y，那么 H(Y|X) = 0。知道 X 消除了关于 Y 的所有不确定性。例如：X = 摄氏度温度，Y = 华氏度温度。
- 如果 X 告诉你关于 Y 的任何信息，那么 H(Y|X) = H(Y)。知道 X 完全没有减少你的不确定性。例如：X = 硬币翻转，Y = 明天的天气。

条件熵总是非负的，且永远不超过 H(Y)：

```
0 <= H(Y|X) <= H(Y)
```

在机器学习中，条件熵出现在决策树中。在每个分裂点，算法选择使 H(Y|X) 最小的特征 X——即消除关于标签 Y 最多不确定性的特征。

### 联合熵

H(X,Y) 是 X 和 Y 一起的联合分布的熵。

```
H(X,Y) = -sum sum p(x,y) * log(p(x,y))   对所有 x, y
```

关键性质：

```
H(X,Y) <= H(X) + H(Y)
```

当 X 和 Y 独立时等式成立。如果它们共享信息，联合熵小于单个熵之和。"缺失"的熵恰好就是互信息。

```mermaid
graph TD
    subgraph "信息维恩图"
        direction LR
        HX["H(X)"]
        HY["H(Y)"]
        MI["I(X;Y)<br/>互<br/>信息"]
        HXgY["H(X|Y)<br/>= H(X) - I(X;Y)"]
        HYgX["H(Y|X)<br/>= H(Y) - I(X;Y)"]
        HXY["H(X,Y) = H(X) + H(Y) - I(X;Y)"]
    end

    HXgY --- MI
    MI --- HYgX
    HX -.- HXgY
    HX -.- MI
    HY -.- MI
    HY -.- HYgX
    HXY -.- HXgY
    HXY -.- MI
    HXY -.- HYgX
```

关系：
- H(X,Y) = H(X) + H(Y|X) = H(Y) + H(X|Y)
- I(X;Y) = H(X) - H(X|Y) = H(Y) - H(Y|X)
- H(X,Y) = H(X) + H(Y) - I(X;Y)

### 互信息（深入探讨）

互信息 I(X;Y) 量化知道一个变量能减少多少关于另一个变量的不确定性。

```
I(X;Y) = H(X) - H(X|Y)
       = H(Y) - H(Y|X)
       = H(X) + H(Y) - H(X,Y)
       = sum sum p(x,y) * log(p(x,y) / (p(x) * p(y)))
```

性质：
- I(X;Y) >= 0 始终成立。你永远不会因为观察到某事而失去信息。
- I(X;Y) = 0 当且仅当 X 和 Y 独立。
- I(X;Y) = I(Y;X)。它是对称的，与 KL 散度不同。
- I(X;X) = H(X)。一个变量与自身共享其全部信息。

**用于特征选择的互信息。** 在 ML 中，你需要对目标有信息量的特征。互信息给出了一个原则性的方法来排序特征：

1. 对每个特征 X_i，计算 I(X_i; Y)，其中 Y 是目标变量。
2. 按 MI 分数对特征排序。
3. 保留前 k 个特征。

这对特征和目标之间的任何关系都有效——线性的、非线性的、单调的或非单调的。相关性只能捕捉线性关系。MI 能捕捉一切。

| 方法 | 检测能力 | 计算成本 | 处理分类特征？ |
|------|---------|---------|--------------|
| 皮尔逊相关 | 线性关系 | O(n) | 否 |
| 斯皮尔曼相关 | 单调关系 | O(n log n) | 否 |
| 互信息 | 任何统计依赖 | O(n log n)（带分箱） | 是 |

### 标签平滑与交叉熵

标准分类使用硬目标：[0, 0, 1, 0]。真实类别概率为 1，其他为 0。标签平滑用软目标替代：

```
soft_target = (1 - epsilon) * hard_target + epsilon / num_classes
```

epsilon = 0.1 且有 4 个类别时：
- 硬目标：[0, 0, 1, 0]
- 软目标：[0.025, 0.025, 0.925, 0.025]

从信息论的角度看，标签平滑增加了目标分布的熵。硬独热目标的熵为 0——没有不确定性。软目标具有正熵。

为什么这有帮助：
- 防止模型将 logits 驱动到极端值（在交叉熵下，无限 logits 才能完美匹配独热目标）
- 充当正则化：模型不能 100% 自信
- 改善校准：预测概率更好地反映真实不确定性
- 缩小训练和推理行为之间的差距

带标签平滑的交叉熵损失变为：

```
L = (1 - epsilon) * CE(hard_target, prediction) + epsilon * H_uniform(prediction)
```

第二项惩罚远离均匀分布的预测——直接对信心进行正则化。

### 为什么交叉熵是分类的损失函数

三个视角，同一个结论。

**信息论视角。** 交叉熵衡量你通过使用模型分布而不是真实分布浪费了多少比特。最小化它使你的模型成为现实的最有效编码器。

**最大似然视角。** 对于 N 个训练样本，真实类别为 y_i：

```
似然         = product( q(y_i) )
对数似然     = sum( log(q(y_i)) )
负对数似然   = -sum( log(q(y_i)) )
```

最后一行就是交叉熵损失。最小化交叉熵 = 最大化训练数据在模型下的似然。

**梯度视角。** 交叉熵对 logits 的梯度就是 (predicted - true)。简洁、稳定且计算快速。这就是为什么它与 softmax 完美搭配。

### 比特 vs 奈特

唯一的区别是对数的底。

```
以 2 为底的对数   -> 比特（bits）    （信息论传统）
自然对数          -> 奈特（nats）    （机器学习惯例）
以 10 为底的对数  -> 哈特利（hartleys）（很少使用）
```

1 nat = 1/ln(2) bits = 1.4427 bits。PyTorch 和 TensorFlow 默认使用自然对数（nats）。

### 困惑度

困惑度是交叉熵的指数。它告诉你模型在不确定的情况下在多少个等可能的选择中有效选择。

```
Perplexity = 2^H(P,Q)   （如果使用比特）
Perplexity = e^H(P,Q)   （如果使用奈特）
```

困惑度为 50 的语言模型，平均来说，就像它必须从 50 个可能的下一个 token 中均匀选择一样困惑。越低越好。

GPT-2 在常见基准上的困惑度约为 30。现代模型在代表性良好的领域为个位数。

```figure
entropy-kl
```

## 构建

### 步骤 1：信息含量和熵

```python
import math

def information_content(p, base=2):
    if p <= 0 or p > 1:
        return float('inf') if p <= 0 else 0.0
    return -math.log(p) / math.log(base)

def entropy(probs, base=2):
    return sum(
        p * information_content(p, base)
        for p in probs if p > 0
    )

fair_coin = [0.5, 0.5]
biased_coin = [0.99, 0.01]
fair_die = [1/6] * 6

print(f"公平硬币熵:   {entropy(fair_coin):.4f} bits")
print(f"有偏硬币熵: {entropy(biased_coin):.4f} bits")
print(f"公平骰子熵:    {entropy(fair_die):.4f} bits")
```

### 步骤 2：交叉熵和 KL 散度

```python
def cross_entropy(p, q, base=2):
    total = 0.0
    for pi, qi in zip(p, q):
        if pi > 0:
            if qi <= 0:
                return float('inf')
            total += pi * (-math.log(qi) / math.log(base))
    return total

def kl_divergence(p, q, base=2):
    return cross_entropy(p, q, base) - entropy(p, base)

true_dist = [0.7, 0.2, 0.1]
good_model = [0.6, 0.25, 0.15]
bad_model = [0.1, 0.1, 0.8]

print(f"真实分布的熵:     {entropy(true_dist):.4f} bits")
print(f"CE（好模型）:          {cross_entropy(true_dist, good_model):.4f} bits")
print(f"CE（差模型）:           {cross_entropy(true_dist, bad_model):.4f} bits")
print(f"KL 散度（好模型）:     {kl_divergence(true_dist, good_model):.4f} bits")
print(f"KL 散度（差模型）:      {kl_divergence(true_dist, bad_model):.4f} bits")
```

### 步骤 3：作为分类损失的交叉熵

```python
def softmax(logits):
    max_logit = max(logits)
    exps = [math.exp(z - max_logit) for z in logits]
    total = sum(exps)
    return [e / total for e in exps]

def cross_entropy_loss(true_class, logits):
    probs = softmax(logits)
    return -math.log(probs[true_class])

logits = [2.0, 1.0, 0.1]
true_class = 0

probs = softmax(logits)
loss = cross_entropy_loss(true_class, logits)

print(f"Logits:      {logits}")
print(f"Softmax:     {[f'{p:.4f}' for p in probs]}")
print(f"真实类别:  {true_class}")
print(f"损失:        {loss:.4f} nats")
print(f"困惑度:  {math.exp(loss):.2f}")
```

### 步骤 4：交叉熵等于负对数似然

```python
import random

random.seed(42)

n_samples = 1000
n_classes = 3
true_labels = [random.randint(0, n_classes - 1) for _ in range(n_samples)]
model_logits = [[random.gauss(0, 1) for _ in range(n_classes)] for _ in range(n_samples)]

ce_loss = sum(
    cross_entropy_loss(label, logits)
    for label, logits in zip(true_labels, model_logits)
) / n_samples

nll = -sum(
    math.log(softmax(logits)[label])
    for label, logits in zip(true_labels, model_logits)
) / n_samples

print(f"交叉熵损失:      {ce_loss:.6f}")
print(f"负对数似然: {nll:.6f}")
print(f"差异:              {abs(ce_loss - nll):.2e}")
```

### 步骤 5：互信息

```python
def mutual_information(joint_probs, base=2):
    rows = len(joint_probs)
    cols = len(joint_probs[0])

    margin_x = [sum(joint_probs[i][j] for j in range(cols)) for i in range(rows)]
    margin_y = [sum(joint_probs[i][j] for i in range(rows)) for j in range(cols)]

    mi = 0.0
    for i in range(rows):
        for j in range(cols):
            pxy = joint_probs[i][j]
            if pxy > 0:
                mi += pxy * math.log(pxy / (margin_x[i] * margin_y[j])) / math.log(base)
    return mi

independent = [[0.25, 0.25], [0.25, 0.25]]
dependent = [[0.45, 0.05], [0.05, 0.45]]

print(f"MI（独立）: {mutual_information(independent):.4f} bits")
print(f"MI（依赖）:   {mutual_information(dependent):.4f} bits")
```

## 使用

使用 NumPy 的相同概念，你在实践中会这样使用：

```python
import numpy as np

def np_entropy(p):
    p = np.asarray(p, dtype=float)
    mask = p > 0
    result = np.zeros_like(p)
    result[mask] = p[mask] * np.log(p[mask])
    return -result.sum()

def np_cross_entropy(p, q):
    p, q = np.asarray(p, dtype=float), np.asarray(q, dtype=float)
    mask = p > 0
    return -(p[mask] * np.log(q[mask])).sum()

def np_kl_divergence(p, q):
    return np_cross_entropy(p, q) - np_entropy(p)

true = np.array([0.7, 0.2, 0.1])
pred = np.array([0.6, 0.25, 0.15])
print(f"熵:    {np_entropy(true):.4f} nats")
print(f"交叉熵:  {np_cross_entropy(true, pred):.4f} nats")
print(f"KL 散度:     {np_kl_divergence(true, pred):.4f} nats")
```

你从头构建了 `torch.nn.CrossEntropyLoss()` 内部所做的工作。现在你知道为什么训练期间损失会下降：你模型的预测分布正在接近真实分布，以浪费信息的奈特来衡量。

## 练习

1. 计算英文字母表在均匀分布下（26 个字母）的熵。然后使用实际的字母频率来估计它。哪个更高，为什么？

2. 一个模型对真实类别为 1 的样本输出 logits [5.0, 2.0, 0.5]。手工计算交叉熵损失，然后用你的 `cross_entropy_loss` 函数验证。什么样的 logits 会给出零损失？

3. 证明 KL 散度不是对称的。选择两个分布 P 和 Q，计算 D_KL(P || Q) 和 D_KL(Q || P)。解释为什么它们不同。

4. 构建一个函数来计算 token 预测序列的困惑度。给定一个 (true_token_index, predicted_logits) 对列表，返回该序列的困惑度。

## 关键术语

| 术语 | 人们说的话 | 实际含义 |
|------|----------|---------|
| 信息含量 | "惊喜度" | 编码一个事件所需的比特（或奈特）数：-log(p) |
| 熵 | "随机性" | 分布所有结果上的平均惊喜度。衡量不可约的不确定性。 |
| 交叉熵 | "损失函数" | 使用模型分布 Q 编码来自真实分布 P 的事件时的平均惊喜度。 |
| KL 散度 | "分布之间的距离" | 使用 Q 代替 P 浪费的额外比特。等于交叉熵减去熵。不对称。 |
| 互信息 | "X 和 Y 有多相关" | 知道 Y 后 X 不确定性的减少。零意味着独立。 |
| Softmax | "将 logits 变为概率" | 指数化并归一化。将任何实值向量映射为有效的概率分布。 |
| 困惑度 | "模型有多困惑" | 交叉熵的指数。模型在每个步骤有效选择的词汇量大小。 |
| 比特 | "香农的单位" | 以 2 为底的对数衡量的信息。1 比特解决一次公平硬币翻转。 |
| 奈特 | "ML 的单位" | 以自然对数衡量的信息。PyTorch 和 TensorFlow 默认使用。 |
| 负对数似然 | "NLL 损失" | 对于独热标签与交叉熵损失相同。最小化它最大化正确预测的概率。 |

## 进一步阅读

- [Shannon 1948：通信的数学理论](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf) - 原始论文，仍然可读
- [可视化信息论（Chris Olah）](https://colah.github.io/posts/2015-09-Visual-Information/) - 熵和 KL 散度的最佳可视化解释
- [PyTorch CrossEntropyLoss 文档](https://pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html) - 框架如何实现你刚刚构建的内容
