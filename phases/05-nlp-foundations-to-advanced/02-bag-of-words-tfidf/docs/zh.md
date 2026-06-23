# 词袋、TF-IDF 与文本表示

> 先计数，再思考。TF-IDF 在 2026 年的明确定义任务上仍然优于嵌入。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 01（文本处理），阶段 2 · 02（从头实现线性回归）
**时间：** ~75 分钟

## 问题

模型需要数字。而你只有字符串。

每个 NLP 流程都必须回答同一个问题：如何将变长的词元流转换为分类器可以消费的固定大小向量。该领域最先采用的答案是最笨但有效的方法：统计单词数量，构建一个向量。

这个向量承载的生产级 NLP 任务比任何嵌入模型都多。垃圾邮件过滤器、主题分类器、日志异常检测、搜索排序（在 BM25 之前）、第一波情感分析、第一个十年的学术 NLP 基准测试。2026 年的从业者在定义明确的窄分类任务上仍然首选它。它速度快、可解释，并且在单词出现本身就足以判断的任务上，常常与 4 亿参数的嵌入模型表现无异。

本课程从头构建词袋模型，然后是 TF-IDF。然后展示 scikit-learn 用三行代码完成相同的工作。最后指出让你转而使用嵌入的失败模式。

## 概念

**词袋（Bag of Words, BoW）** 舍弃了顺序。对每个文档，统计每个词汇表中单词出现的次数。向量的长度是词汇表大小。位置 `i` 是单词 `i` 的计数。

**TF-IDF** 对 BoW 进行重新加权。出现在每个文档中的单词没有信息量，所以降低它的权重。在整个语料库中罕见但在单个文档中频繁出现的单词是信号，所以提高它的权重。

```
TF-IDF(w, d) = TF(w, d) * IDF(w)
             = count(w in d) / |d| * log(N / df(w))
```

其中 `TF` 是词在文档中的频率，`df` 是文档频率（包含该词的文档数），`N` 是文档总数。`log` 函数确保无处不在的单词的权重有界。

关键特性：两者都产生具有可解释轴的稀疏向量。你可以查看训练好的分类器的权重，读取哪些单词将文档推向每个类别。而 768 维的 BERT 嵌入则无法做到这一点。

```figure
bow-tfidf
```

## 动手构建

### 第 1 步：构建词汇表

```python
def build_vocab(docs):
    vocab = {}
    for doc in docs:
        for token in doc:
            if token not in vocab:
                vocab[token] = len(vocab)
    return vocab
```

输入：分词后的文档列表（任何词级分词器都可以；本课的 `code/main.py` 使用一个简化的小写变体）。输出：`{word: index}` 字典。稳定的插入顺序意味着单词索引 0 是第一个文档中出现的第一个单词。不同的实现有不同的约定；scikit-learn 按字母顺序排序。

### 第 2 步：词袋

```python
def bag_of_words(docs, vocab):
    matrix = [[0] * len(vocab) for _ in docs]
    for i, doc in enumerate(docs):
        for token in doc:
            if token in vocab:
                matrix[i][vocab[token]] += 1
    return matrix
```

```python
>>> docs = [["cat", "sat", "on", "mat"], ["cat", "cat", "ran"]]
>>> vocab = build_vocab(docs)
>>> bag_of_words(docs, vocab)
[[1, 1, 1, 1, 0], [2, 0, 0, 0, 1]]
```

行代表文档。列代表词汇表索引。条目 `[i][j]` 表示"单词 `j` 在文档 `i` 中出现了多少次"。文档 1 中 `cat` 出现了两次。文档 0 中 `ran` 出现了零次。

### 第 3 步：词频和文档频率

```python
import math


def term_frequency(doc_bow, doc_length):
    return [c / doc_length if doc_length else 0 for c in doc_bow]


def document_frequency(bow_matrix):
    df = [0] * len(bow_matrix[0])
    for row in bow_matrix:
        for j, count in enumerate(row):
            if count > 0:
                df[j] += 1
    return df


def inverse_document_frequency(df, n_docs):
    return [math.log((n_docs + 1) / (d + 1)) + 1 for d in df]
```

两个值得指出的平滑技巧。`(n+1)/(d+1)` 避免了 `log(x/0)`。末尾的 `+1` 确保出现在每个文档中的单词的 IDF 仍为 1（而不是 0），与 scikit-learn 的默认行为一致。其他实现使用原始的 `log(N/df)`。两者都可行；平滑版本更友好。

### 第 4 步：TF-IDF

```python
def tfidf(bow_matrix):
    n_docs = len(bow_matrix)
    df = document_frequency(bow_matrix)
    idf = inverse_document_frequency(df, n_docs)
    out = []
    for row in bow_matrix:
        length = sum(row)
        tf = term_frequency(row, length)
        out.append([tf_j * idf_j for tf_j, idf_j in zip(tf, idf)])
    return out
```

```python
>>> docs = [
...     ["the", "cat", "sat"],
...     ["the", "dog", "sat"],
...     ["the", "cat", "ran"],
... ]
>>> vocab = build_vocab(docs)
>>> bow = bag_of_words(docs, vocab)
>>> tfidf(bow)
```

三个文档，五个词汇表单词（`the`, `cat`, `sat`, `dog`, `ran`）。`the` 出现在所有三个文档中，因此其 IDF 很低。`dog` 只出现在一个文档中，因此其 IDF 很高。向量是稀疏的（大多数条目很小），具有区分度的单词会凸显出来。

### 第 5 步：L2 归一化行向量

```python
def l2_normalize(matrix):
    out = []
    for row in matrix:
        norm = math.sqrt(sum(x * x for x in row))
        out.append([x / norm if norm else 0 for x in row])
    return out
```

没有归一化时，较长的文档会得到更大的向量，从而主导相似度分数。L2 归一化将每个文档放在单位超球面上。行之间的余弦相似度现在就是一个点积。

## 使用现成工具

scikit-learn 提供了生产版本。

```python
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer

docs = ["the cat sat on the mat", "the dog sat on the mat", "the cat ran"]

bow_vectorizer = CountVectorizer()
bow = bow_vectorizer.fit_transform(docs)
print(bow_vectorizer.get_feature_names_out())
print(bow.toarray())

tfidf_vectorizer = TfidfVectorizer()
tfidf = tfidf_vectorizer.fit_transform(docs)
print(tfidf.toarray().round(3))
```

`CountVectorizer` 一次调用完成分词、词汇表构建和 BoW。`TfidfVectorizer` 添加了 IDF 加权和 L2 归一化。两者都返回稀疏矩阵。对于 10 万篇文档，稠密版本无法放入内存；在分类器要求稠密输入之前，请保持稀疏。

改变一切的参数：

| 参数 | 效果 |
|-----|--------|
| `ngram_range=(1, 2)` | 包含二元词组。通常能提升分类效果。 |
| `min_df=2` | 丢弃出现在少于 2 篇文档中的单词。在噪声数据上缩小词汇表。 |
| `max_df=0.95` | 丢弃出现在超过 95% 文档中的单词。无需硬编码停用词列表即可近似实现停用词移除。 |
| `stop_words="english"` | scikit-learn 的内置停用词列表。取决于任务——情感分析*不应*丢弃否定词。 |
| `sublinear_tf=True` | 使用 `1 + log(tf)` 替代原始的 `tf`。当一个词在同一篇文档中多次重复时有用。 |

### TF-IDF 在 2026 年仍然胜出的场景

- 垃圾邮件检测、主题标注、日志异常标记。单词出现本身就足够了；语义细微差别不重要。
- 低数据量场景（数百条标注样本）。TF-IDF 加逻辑回归没有预训练成本。
- 任何延迟重要的场景。TF-IDF 加线性模型在微秒级给出答案。通过 transformer 嵌入一篇文档需要 10-100 毫秒。
- 必须解释其预测结果的系统。查看分类器的系数。权重最高的正面词汇就是原因。

### TF-IDF 何时失败

语义盲区失败。考虑以下两篇文档：

- "The movie was not good at all."
- "The movie was excellent."

一篇是差评，一篇是好评。它们的 TF-IDF 交集正好是 `{the, movie, was}`。一个词袋分类器必须记住 `not` 出现在 `good` 附近会翻转标签。在有足够数据的情况下它可以学会这一点，但永远不如理解句法的模型那么优雅。

另一个失败模式：推理时遇到词汇表外的词。一个在 IMDb 评论上训练的 BoW 模型，如果从未见过 `Zoomer-approved` 这个词元，就不知道如何处理它。子词嵌入（课程 04）能处理这个问题。TF-IDF 做不到。

### 混合方案：TF-IDF 加权嵌入

2026 年中型数据分类的实用默认方案：使用 TF-IDF 权重作为对词嵌入的注意力机制。

```python
def tfidf_weighted_embedding(doc, tfidf_scores, embedding_table, dim):
    vec = [0.0] * dim
    total_weight = 0.0
    for token in doc:
        if token not in embedding_table or token not in tfidf_scores:
            continue
        weight = tfidf_scores[token]
        emb = embedding_table[token]
        for i in range(dim):
            vec[i] += weight * emb[i]
        total_weight += weight
    if total_weight == 0:
        return vec
    return [v / total_weight for v in vec]
```

你从嵌入中获得语义能力，从 TF-IDF 中获得稀有词强调。分类器在池化后的向量上训练。对于大约 5 万条以下标注样本的情感、主题和意图分类，这种混合方法优于两者中的任何一个。

## 交付

保存为 `outputs/prompt-vectorization-picker.md`：

```markdown
---
name: vectorization-picker
description: 针对文本分类任务，推荐使用 BoW、TF-IDF、嵌入或混合方案。
phase: 5
lesson: 02
---

你推荐文本向量化策略。给定一个任务描述，输出：

1. 表示方法（BoW、TF-IDF、transformer 嵌入或混合方案）。用一句话解释原因。
2. 具体的向量化器配置。指出库名。引用参数（`ngram_range`、`min_df`、`max_df`、`sublinear_tf`、`stop_words`）。
3. 交付前需测试的一个失败模式。

拒绝在用户标注样本不足 500 条时推荐嵌入，除非他们能证明 TF-IDF 基线存在语义失败。拒绝为情感分析移除停用词（否定词携带信号）。标记类别不平衡为需要超出向量化器调整的范围。

输入示例："将 3 万张客户支持工单分类为 12 个类别。大部分工单有 2-3 句话。仅英语。需要可解释性以用于审计日志。"

输出示例：

- 表示方法：TF-IDF。3 万个样本不算少；可解释性要求排除了稠密嵌入。
- 配置：`TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_df=0.95, sublinear_tf=True, stop_words=None)`。保留停用词，因为类别关键词有时本身就是停用词（"not working" 与 "working"）。
- 需测试的失败模式：验证 `min_df=3` 不会丢弃稀有的类别关键词。按类别过滤运行 `get_feature_names_out` 并人工审查。
```

## 练习

1. **简单。** 在 L2 归一化的 TF-IDF 输出上实现 `cosine_similarity(doc_vec_a, doc_vec_b)`。验证相同文档得分为 1.0，词汇表不重叠的文档得分为 0.0。
2. **中等。** 在 `bag_of_words` 中添加 `n-gram` 支持。参数 `n` 产生对 `n` 元组的计数。测试对 `["the", "cat", "sat"]` 使用 `n=2` 应产生 `["the cat", "cat sat"]` 的二元词组计数。
3. **困难。** 使用 GloVe 100 维向量（下载一次，缓存）构建上述 TF-IDF 加权嵌入混合方案。在 20 Newsgroups 数据集上比较纯 TF-IDF、纯均值池化嵌入和混合方案的分类准确率。报告各方案在哪些场景下胜出。

## 关键术语

| 术语 | 人们通常说的 | 实际含义 |
|------|-----------------|-----------------------|
| BoW | 词频向量 | 一个文档中词汇表单词的计数。舍弃了顺序。 |
| TF | 词频 | 一个词在文档中出现的次数，可选地按文档长度归一化。 |
| DF | 文档频率 | 至少包含该词一次的文档数量。 |
| IDF | 逆文档频率 | `log(N / df)` 平滑版。降低出现在所有文档中的词的权重。 |
| 稀疏向量 | 大部分为零 | 词汇表通常有 1 万到 10 万个词；大多数词在任何给定文档中都未出现。 |
| 余弦相似度 | 向量角度 | L2 归一化向量的点积。1 表示完全相同，0 表示正交。 |

## 延伸阅读

- [scikit-learn —— 从文本中提取特征](https://scikit-learn.org/stable/modules/feature_extraction.html#text-feature-extraction) —— 标准的 API 参考，包含每个参数的说明。
- [Salton, G., & Buckley, C. (1988). Term-weighting approaches in automatic text retrieval](https://www.sciencedirect.com/science/article/pii/0306457388900210) —— 使 TF-IDF 成为十年默认方案的那篇论文。
- ["Why TF-IDF Still Beats Embeddings" —— Ashfaque Thonikkadavan (Medium)](https://medium.com/@cmtwskb/why-tf-idf-still-beats-embeddings-ad85c123e1b2) —— 2026 年关于老方法何时胜出及其原因的总结。
