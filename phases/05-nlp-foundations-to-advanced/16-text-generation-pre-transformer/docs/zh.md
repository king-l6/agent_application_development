# Transformer 之前的文本生成 — N-gram 语言模型

> 如果一个词令人意外，模型就不够好。困惑度将"意外"变成一个数字。平滑化让它保持有限。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 01（文本处理）、阶段 2 · 14（朴素贝叶斯）
**时间：** ~45 分钟

## 问题

在变压器之前，在 RNN 之前，在词嵌入之前，语言模型通过统计一个词跟随前 `n-1` 个词的频率来预测下一个词。统计"the cat" → "sat" 47 次，"the cat" → "jumped" 12 次，"the cat" → "refrigerator" 0 次。归一化后得到概率分布。

这就是 n-gram 语言模型。从 1980 年到 2015 年，它运行着每一个语音识别器、每一个拼写检查器和每一个基于短语的机器翻译系统。当你需要廉价的设备端语言建模时，它仍然在运行。

有趣的问题是如何处理未见过的 n-gram。原始的基于计数的模型给任何未见过的内容分配零概率，这是灾难性的，因为句子很长，几乎每个长句子都至少包含一个未见过的序列。五十年的平滑化研究解决了这个问题。Kneser-Ney 平滑化就是这项研究的成果，现代深度学习继承了其经验传统。

## 概念

![N-gram 模型：计数、平滑、生成](../assets/ngram.svg)

**N-gram 概率：** `P(w_i | w_{i-n+1}, ..., w_{i-1})`。固定 `n`（通常三元为 3，四元为 4）。从计数计算：

```text
P(w | context) = count(context, w) / count(context)
```

**零计数问题。** 任何在训练中未见过的 n-gram 概率为零。2007 年一项关于 Brown 语料库的研究发现，即使是一个 4-gram 模型，也有 30% 的保留 4-gram 在训练中未见。没有平滑化，你无法在任何真实文本上进行评估。

**平滑化方法，按复杂度排序：**

1. **Laplace（加一）。** 每个计数加 1。简单，在稀有事件上表现糟糕。
2. **Good-Turing。** 根据频率的频次将概率质量从高频事件重新分配给未见事件。
3. **插值。** 结合 n-gram、(n-1)-gram 等估计，使用可调权重。
4. **回退。** 如果 n-gram 计数为零，回退到 (n-1)-gram。Katz 回退对其归一化。
5. **绝对折扣。** 从所有计数中减去固定折扣 `D`，重新分配给未见事件。
6. **Kneser-Ney。** 绝对折扣加上对低阶模型的巧妙选择：使用*延续概率*（一个词出现在多少种上下文中）而不是原始频率。

Kneser-Ney 的洞察很深刻。"San Francisco"是一个常见的二元组。一元组"Francisco"主要出现在"San"之后。朴素绝对折扣给"Francisco"很高的一元概率（因为计数高）。Kneser-Ney 注意到"Francisco"只出现在一种上下文中，因此相应地降低其延续概率。结果是：以"Francisco"结尾的未见过二元组得到适当的低概率。

**评估：困惑度。** 保留测试集上每个词平均负对数似然的指数。越低越好。困惑度为 100 意味着模型与从 100 个词中均匀选择一样困惑。

```text
perplexity = exp(- (1/N) * Σ log P(w_i | context_i))
```

```figure
ngram-backoff
```

## 构建

### 步骤 1：三元组计数

```python
from collections import Counter, defaultdict


def train_ngram(corpus_tokens, n=3):
    ngrams = Counter()
    contexts = Counter()
    for sentence in corpus_tokens:
        padded = ["<s>"] * (n - 1) + sentence + ["</s>"]
        for i in range(len(padded) - n + 1):
            ctx = tuple(padded[i:i + n - 1])
            word = padded[i + n - 1]
            ngrams[ctx + (word,)] += 1
            contexts[ctx] += 1
    return ngrams, contexts


def raw_probability(ngrams, contexts, context, word):
    ctx = tuple(context)
    if contexts.get(ctx, 0) == 0:
        return 0.0
    return ngrams.get(ctx + (word,), 0) / contexts[ctx]
```

输入是分词后的句子列表。输出是 n-gram 计数和上下文计数。`<s>` 和 `</s>` 是句子边界。

### 步骤 2：Laplace 平滑化

```python
def laplace_probability(ngrams, contexts, vocab_size, context, word):
    ctx = tuple(context)
    numerator = ngrams.get(ctx + (word,), 0) + 1
    denominator = contexts.get(ctx, 0) + vocab_size
    return numerator / denominator
```

每个计数加 1。平滑了，但过度分配概率质量给未见事件，也损害了稀有已知事件。

### 步骤 3：Kneser-Ney（二元组，插值）

```python
def kneser_ney_bigram_model(corpus_tokens, discount=0.75):
    unigrams = Counter()
    bigrams = Counter()
    unigram_contexts = defaultdict(set)

    for sentence in corpus_tokens:
        padded = ["<s>"] + sentence + ["</s>"]
        for i, w in enumerate(padded):
            unigrams[w] += 1
            if i > 0:
                prev = padded[i - 1]
                bigrams[(prev, w)] += 1
                unigram_contexts[w].add(prev)

    total_unique_bigrams = sum(len(ctx_set) for ctx_set in unigram_contexts.values())
    continuation_prob = {
        w: len(ctx_set) / total_unique_bigrams for w, ctx_set in unigram_contexts.items()
    }

    context_totals = Counter()
    for (prev, w), count in bigrams.items():
        context_totals[prev] += count

    unique_follow = defaultdict(set)
    for (prev, w) in bigrams:
        unique_follow[prev].add(w)

    def prob(prev, w):
        count = bigrams.get((prev, w), 0)
        denom = context_totals.get(prev, 0)
        if denom == 0:
            return continuation_prob.get(w, 1e-9)
        first_term = max(count - discount, 0) / denom
        lambda_prev = discount * len(unique_follow[prev]) / denom
        return first_term + lambda_prev * continuation_prob.get(w, 1e-9)

    return prob
```

三个活动部分。`continuation_prob` 捕捉"这个词出现在多少种不同的上下文中？"（Kneser-Ney 的创新）。`lambda_prev` 是折扣释放的质量，用于加权回退。最终概率是折扣后的主项加上加权后的延续项。

### 步骤 4：通过采样生成文本

```python
import random


def generate(prob_fn, vocab, prefix, max_len=30, seed=0):
    rng = random.Random(seed)
    tokens = list(prefix)
    for _ in range(max_len):
        candidates = [(w, prob_fn(tokens[-1], w)) for w in vocab]
        total = sum(p for _, p in candidates)
        r = rng.random() * total
        acc = 0.0
        for w, p in candidates:
            acc += p
            if r <= acc:
                tokens.append(w)
                break
        if tokens[-1] == "</s>":
            break
    return tokens
```

按概率比例采样。每个种子总是给出不同输出。如需类似波束搜索的输出，在每一步选 argmax（贪心）并加一个小的随机旋钮（温度）。

### 步骤 5：困惑度

```python
import math


def perplexity(prob_fn, sentences):
    total_log_prob = 0.0
    total_tokens = 0
    for sentence in sentences:
        padded = ["<s>"] + sentence + ["</s>"]
        for i in range(1, len(padded)):
            p = prob_fn(padded[i - 1], padded[i])
            total_log_prob += math.log(max(p, 1e-12))
            total_tokens += 1
    return math.exp(-total_log_prob / total_tokens)
```

越低越好。对于 Brown 语料库，调优良好的 4-gram KN 模型困惑度约 140。Transformer LM 在同一测试集上达到 15-30。差距约 10 倍。这个差距就是为什么该领域继续前进了。

## 使用

- **经典 NLP 教学。** 你能得到的最清晰的平滑化、MLE 和困惑度的介绍。
- **KenLM。** 生产级 n-gram 库。用于低延迟重要的语音和 MT 系统中的重新评分。
- **设备端自动补全。** 键盘中的三元组模型。至今仍在用。
- **基线。** 在宣称你的神经 LM 很好之前，始终先计算一个 n-gram LM 的困惑度。如果你的 transformer 没有大幅超过 KN，说明有问题。

## 产出

保存为 `outputs/prompt-lm-baseline.md`：

```markdown
---
name: lm-baseline
description: 在训练神经 LM 之前构建一个可重现的 n-gram 语言模型基线。
phase: 5
lesson: 16
---

给定语料库和目标用途（下一词预测、重新评分、困惑度基线），输出：

1. N-gram 阶数。一般英语用三元组，语料库大用 4-gram，语音重评分用 5-gram。
2. 平滑化。修改版 Kneser-Ney 是默认选择；Laplace 仅用于教学。
3. 库。生产环境用 `kenlm`，教学用 `nltk.lm`，仅为了学习数学原理时自己实现。
4. 评估。保留集困惑度，训练集和测试集之间保持一致的分词。

拒绝报告使用不同分词方式计算的困惑度——困惑度数字仅在相同的分词方式下可比。标记测试集中的 OOV 率；除非你在训练期间预留了特殊的 `<UNK>` token，否则 KN 对 OOV 处理不佳。
```

## 练习

1. **（简单）** 在 1000 句莎士比亚语料库上训练三元组 LM。生成 20 个句子。它们会在局部合理但全局不连贯。这是经典演示。
2. **（中等）** 在你的 KN 模型上为保留的莎士比亚数据集实现困惑度计算。与 Laplace 比较。你应该看到 KN 困惑度降低 30-50%。
3. **（困难）** 构建一个三元组拼写校正器：给定拼写错误的词及其上下文，生成修正并按在 LM 下的上下文概率排序。在 Birkbeck 拼写语料库（公开）上评估。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| N-gram | 词序列 | `n` 个连续 token 的序列。 |
| 平滑化 | 避免零概率 | 重新分配概率质量，使未见事件获得非零概率。 |
| 困惑度 | LM 质量指标 | 保留数据上的 `exp(-平均 log 概率)`。越低越好。 |
| 回退 | 回退到更短上下文 | 如果三元组计数为零，使用二元组。Katz 回退将其形式化。 |
| Kneser-Ney | 最佳 n-gram 平滑化 | 绝对折扣 + 低阶模型的延续概率。 |
| 延续概率 | KN 特有 | `P(w)` 按 `w` 出现的上下文数量加权，而不是按原始计数。 |

## 延伸阅读

- [Jurafsky and Martin — Speech and Language Processing, Chapter 3 (2026 draft)](https://web.stanford.edu/~jurafsky/slp3/3.pdf) — n-gram LM 和平滑化的权威处理。
- [Chen and Goodman (1998). An Empirical Study of Smoothing Techniques for Language Modeling](https://dash.harvard.edu/handle/1/25104739) — 确定 Kneser-Ney 为最佳 n-gram 平滑器的论文。
- [Kneser and Ney (1995). Improved Backing-off for M-gram Language Modeling](https://ieeexplore.ieee.org/document/479394) — 原始 KN 论文。
- [KenLM](https://kheafield.com/code/kenlm/) — 快速生产级 n-gram LM，2026 年仍用于延迟敏感的应用。
