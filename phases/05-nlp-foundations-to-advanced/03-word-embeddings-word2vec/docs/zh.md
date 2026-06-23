# 词嵌入 —— 从头实现 Word2Vec

> 由伴而知词。在这个想法上训练一个浅层网络，几何性质便会自然涌现。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 02（BoW + TF-IDF），阶段 3 · 03（从头实现反向传播）
**时间：** ~75 分钟

## 问题

TF-IDF 知道 `dog` 和 `puppy` 是不同的词。但它不知道它们的意思几乎相同。一个在 `dog` 上训练的分类器无法泛化到关于 `puppy` 的评论。你可以通过列举同义词来掩盖这个问题，但这对稀有词、领域行话以及你没有预料到的每种语言都会失效。

你需要的是一种表示，其中 `dog` 和 `puppy` 在空间中彼此靠近。其中 `king - man + woman` 接近于 `queen`。其中在 `dog` 上训练的模型能免费将一些信号迁移到 `puppy`。

Word2Vec 给了我们这种空间。两层神经网络，万亿词元的训练规模，发表于 2013 年。其架构简直简单得令人尴尬。但结果却重塑了 NLP 十年之久。

## 概念

**分布假说**（Firth, 1957）："由伴而知词。"如果两个词出现在相似的上下文中，它们很可能表示相似的意思。

Word2Vec 有两种变体，都利用了这一想法。

- **Skip-gram。** 给定中心词，预测周围的词。窗口大小为 2 时：`cat -> (the, sat, on)`。
- **CBOW（连续词袋）。** 给定周围的词，预测中心的词。`(the, sat, on) -> cat`。

Skip-gram 训练速度较慢，但能更好地处理稀有词。它成为了默认选择。

该网络有一个不带非线性激活函数的隐藏层。输入是词汇表上的 one-hot 向量。输出是词汇表上的 softmax。训练完成后，丢弃输出层。隐藏层的权重就是嵌入。

```
one-hot(center) ── W ──▶ hidden (d-dim) ── W' ──▶ softmax(vocab)
                          ^
                          这就是嵌入
```

关键技巧：在 10 万个词上做 softmax 代价高得令人望而却步。Word2Vec 使用**负采样**将其转化为二分类任务。预测"这个上下文词是否曾出现在这个中心词附近——是或否"。对每个训练对采样少量负例（非共现词），而不是在整个词汇表上计算 softmax。

```figure
word-vector-arithmetic
```

## 动手构建

### 第 1 步：从语料库生成训练对

```python
def skipgram_pairs(docs, window=2):
    pairs = []
    for doc in docs:
        for i, center in enumerate(doc):
            for j in range(max(0, i - window), min(len(doc), i + window + 1)):
                if i == j:
                    continue
                pairs.append((center, doc[j]))
    return pairs
```

```python
>>> skipgram_pairs([["the", "cat", "sat", "on", "mat"]], window=2)
[('the', 'cat'), ('the', 'sat'),
 ('cat', 'the'), ('cat', 'sat'), ('cat', 'on'),
 ('sat', 'the'), ('sat', 'cat'), ('sat', 'on'), ('sat', 'mat'),
 ...]
```

窗口内的每个（中心词，上下文词）对都是一个正训练样本。

### 第 2 步：嵌入表

两个矩阵。`W` 是中心词嵌入表（你要保留的那个）。`W'` 是上下文词表（通常被丢弃，有时与 `W` 平均）。

```python
import numpy as np


def init_embeddings(vocab_size, dim, seed=0):
    rng = np.random.default_rng(seed)
    W = rng.normal(0, 0.1, size=(vocab_size, dim))
    W_prime = rng.normal(0, 0.1, size=(vocab_size, dim))
    return W, W_prime
```

小的随机初始化。词汇表大小 1 万、维度 100 是现实的；教学中，50 个词汇 x 16 维足以看到几何性质。

### 第 3 步：负采样目标函数

对每个正对 `(center, context)`，从词汇表中采样 `k` 个随机词作为负例。训练模型使得正对的点积 `W[center] · W'[context]` 高，负对的点积低。

```python
def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -20, 20)))


def train_pair(W, W_prime, center_idx, context_idx, negative_indices, lr):
    v_c = W[center_idx]
    u_pos = W_prime[context_idx]
    u_negs = W_prime[negative_indices]

    pos_score = sigmoid(v_c @ u_pos)
    neg_scores = sigmoid(u_negs @ v_c)

    grad_center = (pos_score - 1) * u_pos
    for i, u in enumerate(u_negs):
        grad_center += neg_scores[i] * u

    W[context_idx] = W[context_idx]
    W_prime[context_idx] -= lr * (pos_score - 1) * v_c
    for i, neg_idx in enumerate(negative_indices):
        W_prime[neg_idx] -= lr * neg_scores[i] * v_c
    W[center_idx] -= lr * grad_center
```

神奇的公式：正对的逻辑损失（希望 sigmoid 接近 1）加上负对的逻辑损失（希望 sigmoid 接近 0）。梯度流向两个表。完整的推导在原始论文中；如果你想牢固掌握，用纸笔推导一遍。

### 第 4 步：在玩具语料库上训练

```python
def train(docs, dim=16, window=2, k_neg=5, epochs=100, lr=0.05, seed=0):
    vocab = build_vocab(docs)
    vocab_size = len(vocab)
    rng = np.random.default_rng(seed)
    W, W_prime = init_embeddings(vocab_size, dim, seed=seed)
    pairs = skipgram_pairs(docs, window=window)

    for epoch in range(epochs):
        rng.shuffle(pairs)
        for center, context in pairs:
            c_idx = vocab[center]
            ctx_idx = vocab[context]
            negs = rng.integers(0, vocab_size, size=k_neg)
            negs = [n for n in negs if n != ctx_idx and n != c_idx]
            train_pair(W, W_prime, c_idx, ctx_idx, negs, lr)
    return vocab, W
```

在大语料库上经过足够的轮次训练后，共享上下文的词具有相似的中心嵌入。在玩具语料库上，你能隐约看到这种效果。在数十亿词元上，效果会非常显著。

### 第 5 步：类比技巧

```python
def nearest(vocab, W, target_vec, topk=5, exclude=None):
    exclude = exclude or set()
    inv_vocab = {i: w for w, i in vocab.items()}
    norms = np.linalg.norm(W, axis=1, keepdims=True) + 1e-9
    W_norm = W / norms
    target = target_vec / (np.linalg.norm(target_vec) + 1e-9)
    sims = W_norm @ target
    order = np.argsort(-sims)
    out = []
    for i in order:
        if i in exclude:
            continue
        out.append((inv_vocab[i], float(sims[i])))
        if len(out) == topk:
            break
    return out


def analogy(vocab, W, a, b, c, topk=5):
    v = W[vocab[b]] - W[vocab[a]] + W[vocab[c]]
    return nearest(vocab, W, v, topk=topk, exclude={vocab[a], vocab[b], vocab[c]})
```

在预训练的 300 维 Google News 向量上：

```python
>>> analogy(vocab, W, "man", "king", "woman")
[('queen', 0.71), ('monarch', 0.62), ('princess', 0.59), ...]
```

`king - man + woman = queen`。不是因为模型知道王室是什么。而是因为向量 `(king - man)` 捕捉到了类似"王室"的含义，将其加到 `woman` 上就落到了王室-女性区域附近。

## 使用现成工具

从头写 Word2Vec 是为了教学。生产环境使用 `gensim`。

```python
from gensim.models import Word2Vec

sentences = [
    ["the", "cat", "sat", "on", "the", "mat"],
    ["the", "dog", "ran", "across", "the", "room"],
]

model = Word2Vec(
    sentences,
    vector_size=100,
    window=5,
    min_count=1,
    sg=1,
    negative=5,
    workers=4,
    epochs=30,
)

print(model.wv["cat"])
print(model.wv.most_similar("cat", topn=3))
```

在实际工作中，你几乎从不会自己训练 Word2Vec。你直接下载预训练向量。

- **GloVe** —— 斯坦福的共现矩阵分解方法。提供 50d、100d、200d、300d 的检查点。通用覆盖好。课程 04 专门介绍 GloVe。
- **fastText** —— Facebook 的 Word2Vec 扩展，嵌入了字符 n-gram。通过组合子词来处理词汇表外单词。课程 04。
- **Google News 上的预训练 Word2Vec** —— 300 维，300 万词词汇表，发表于 2013 年。至今仍每天被下载。

### Word2Vec 在 2026 年仍然胜出的场景

- 轻量级特定领域的检索。在笔记本电脑上花一个小时在医学摘要上训练，获得通用模型无法捕捉的专业向量。
- 类比式的特征工程。`gender_vector = mean(man - woman pairs)`。从其他词中减去它，得到中性化的性别轴。在公平性研究中仍在使用。
- 可解释性。100 维足够小，可以通过 PCA 或 t-SNE 绘制并实际看到簇的形成。
- 任何需要在无 GPU 设备上进行推理的场景。Word2Vec 查找只是一次行读取。

### Word2Vec 的失败之处

多义词困境。`bank` 只有一个向量。`river bank` 和 `financial bank` 共享它。`table`（电子表格 vs 家具）共享它。下游分类器无法从向量中区分出不同含义。

上下文嵌入（ELMo、BERT 以及之后的每个 transformer）通过根据词周围上下文为每次出现生成不同的向量解决了这个问题。这是从 Word2Vec 到 BERT 的跨越：从静态到上下文。阶段 7 涵盖 transformer 部分。

词汇表外问题是另一个失败点。如果 `Zoomer-approved` 不在训练数据中，Word2Vec 从未见过它。没有回退方案。FastText 通过子词组合解决了这个问题（课程 04）。

## 交付

保存为 `outputs/skill-embedding-probe.md`：

```markdown
---
name: embedding-probe
description: 检查 word2vec 模型。运行类比、查找最近邻、诊断质量。
version: 1.0.0
phase: 5
lesson: 03
tags: [nlp, embeddings, debugging]
---

你检查训练好的词嵌入以验证其工作正常。给定一个 `gensim.models.KeyedVectors` 对象和一个词汇表，你运行：

1. 三个经典类比测试。`king : man :: queen : woman`。`paris : france :: tokyo : japan`。`walking : walked :: swimming : ?`。报告 top-1 结果及其余弦相似度。
2. 五个在用户提供的领域特定词上的最近邻测试。打印 top-5 近邻及其余弦相似度。
3. 一个对称性检查。`similarity(a, b) == similarity(b, a)` 在浮点精度范围内成立。
4. 一个退化检查。如果任何嵌入的范数低于 0.01 或高于 100，模型存在训练缺陷。标记出来。

拒绝仅凭类比准确率就宣布模型良好。类比基准可以被博弈，且不迁移到下游任务。建议内在评估和下游评估一起进行。
```

## 练习

1. **简单。** 在一个小型语料库（20 句关于猫和狗的句子）上运行训练循环。200 轮后，验证 `nearest(vocab, W, W[vocab["cat"]])` 的 top 3 中返回 `dog`。如果没有，增加轮次或词汇量。
2. **中等。** 添加高频词子采样。频率高于 `10^-5` 的词以与频率成正比的概率从训练对中丢弃。测量对稀有词相似度的影响。
3. **困难。** 在 20 Newsgroups 语料库上训练一个模型。计算两个偏差轴：`he - she` 和 `doctor - nurse`。将职业词投影到两个轴上。报告哪些职业的偏差差距最大。这是公平性研究人员使用的探针类型。

## 关键术语

| 术语 | 人们通常说的 | 实际含义 |
|------|-----------------|-----------------------|
| 词嵌入 | 词作为向量 | 从上下文中学习到的稠密、低维（通常 100-300）表示。 |
| Skip-gram | Word2Vec 技巧 | 从中心词预测上下文词。比 CBOW 慢，但更利于稀有词。 |
| 负采样 | 训练捷径 | 用对 `k` 个随机词的二分类替代在全词汇表上的 softmax。 |
| 静态嵌入 | 每个词一个向量 | 无论上下文如何，向量相同。在多义词上失败。 |
| 上下文嵌入 | 上下文敏感的向量 | 根据周围词，每次出现都有不同向量。这是 transformer 产生的结果。 |
| OOV | 词汇表外 | 训练中未见过的词。Word2Vec 无法为这些词生成向量。 |

## 延伸阅读

- [Mikolov et al. (2013). Distributed Representations of Words and Phrases and their Compositionality](https://arxiv.org/abs/1310.4546) —— 负采样论文。简短且易读。
- [Rong, X. (2014). word2vec Parameter Learning Explained](https://arxiv.org/abs/1411.2738) —— 梯度的最清晰推导，如果你觉得原始论文的数学太密集。
- [gensim Word2Vec 教程](https://radimrehurek.com/gensim/models/word2vec.html) —— 实际有效的生产训练设置。
