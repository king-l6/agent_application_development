# 情感分析

> 经典的 NLP 任务。关于经典文本分类你需要知道的大部分内容都体现在这里。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 02（BoW + TF-IDF），阶段 2 · 14（朴素贝叶斯）
**时间：** ~75 分钟

## 问题

"The food was not great." 是正面还是负面？

情感分析听起来很简单。评论者说他们喜欢或不喜欢某样东西。给句子打标签。它之所以成为经典 NLP 任务，是因为每个看似简单的例子背后都隐藏着一个难题。否定会翻转含义。讽刺会逆转它。"Not bad at all" 尽管包含两个负面编码的词，却是正面的。表情符号比周围文本携带更多信号。领域词汇很重要（音乐评论中的 `tight` 与时尚评论中的 `tight` 含义不同）。

情感分析是经典 NLP 的实用实验室。如果你理解为什么每个朴素基线都有特定的失败模式，你就理解为什么每个更丰富的模型被发明出来。本课程从头构建一个朴素贝叶斯基线，添加逻辑回归，并指出那些使生产级情感分析成为合规级问题的陷阱。

## 概念

经典情感分析是一个两步配方。

1. **表示。** 将文本转换为特征向量。BoW、TF-IDF 或 n-gram。
2. **分类。** 在标注样本上拟合一个线性模型（朴素贝叶斯、逻辑回归、SVM）。

朴素贝叶斯是能工作的最简单的模型。假设在给定标签的条件下每个特征都是独立的。从计数中估计 `P(word | positive)` 和 `P(word | negative)`。推理时，将概率相乘。"朴素"的独立性假设荒谬地错误，但结果却惊人地强。原因：对于稀疏的文本特征和中等规模的数据，分类器更关心每个词倾向于哪一侧，而不是精确的程度。

逻辑回归修复了独立性假设。它为每个特征学习一个权重，包括负权重。`not good` 作为二元词组特征获得一个负权重。朴素贝叶斯无法为它从未标注过的二元词组做到这一点。

```figure
sentiment-logits
```

## 动手构建

### 第 1 步：一个真正的小型数据集

```python
POSITIVE = [
    "absolutely loved this movie",
    "beautiful cinematography and a great story",
    "one of the best films of the year",
    "brilliant acting from the lead",
    "heartwarming and funny",
]

NEGATIVE = [
    "boring and far too long",
    "not worth your time",
    "the plot made no sense",
    "terrible acting, awful script",
    "i want my two hours back",
]
```

故意保持小规模。实际工作使用数万个样本（IMDb、SST-2、Yelp 极性）。数学原理完全相同。

### 第 2 步：从头实现多项朴素贝叶斯

```python
import math
from collections import Counter


def train_nb(docs_by_class, vocab, alpha=1.0):
    class_priors = {}
    class_word_probs = {}
    total_docs = sum(len(d) for d in docs_by_class.values())

    for cls, docs in docs_by_class.items():
        class_priors[cls] = len(docs) / total_docs
        counts = Counter()
        for doc in docs:
            for token in doc:
                counts[token] += 1
        total = sum(counts.values()) + alpha * len(vocab)
        class_word_probs[cls] = {
            w: (counts[w] + alpha) / total for w in vocab
        }
    return class_priors, class_word_probs


def predict_nb(doc, class_priors, class_word_probs):
    scores = {}
    for cls in class_priors:
        s = math.log(class_priors[cls])
        for token in doc:
            if token in class_word_probs[cls]:
                s += math.log(class_word_probs[cls][token])
        scores[cls] = s
    return max(scores, key=scores.get)
```

加法平滑（alpha=1.0）即拉普拉斯平滑。没有它，在某个类别中未出现过的词的概率为零，对数将爆炸。`alpha=0.01` 在实践中很常见。`alpha=1.0` 是教学默认值。

### 第 3 步：从头实现逻辑回归

```python
import numpy as np


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -20, 20)))


def train_lr(X, y, epochs=500, lr=0.05, l2=0.01):
    n_features = X.shape[1]
    w = np.zeros(n_features)
    b = 0.0
    for _ in range(epochs):
        logits = X @ w + b
        preds = sigmoid(logits)
        err = preds - y
        grad_w = X.T @ err / len(y) + l2 * w
        grad_b = err.mean()
        w -= lr * grad_w
        b -= lr * grad_b
    return w, b


def predict_lr(X, w, b):
    return (sigmoid(X @ w + b) >= 0.5).astype(int)
```

L2 正则化在此至关重要。文本特征是稀疏的；没有 L2，模型会记住训练样本。从 `0.01` 开始并调优。

### 第 4 步：处理否定（失败模式）

考虑 "not good" 和 "not bad"。一个 BoW 分类器看到 `{not, good}` 和 `{not, bad}`，并根据训练中出现较多的情况进行学习。一个二元词组分类器看到 `not_good` 和 `not_bad`，并将它们作为不同的特征学习。这通常就足够了。

一个更粗糙的修复方法，在你没有二元词组时有效：**否定范围标记**。将否定词之后的词元前缀加上 `NOT_`，直到下一个标点符号。

```python
NEGATION_WORDS = {"not", "no", "never", "nor", "none", "nothing", "neither"}
NEGATION_TERMINATORS = {".", "!", "?", ",", ";"}


def apply_negation(tokens):
    out = []
    negate = False
    for token in tokens:
        if token in NEGATION_TERMINATORS:
            negate = False
            out.append(token)
            continue
        if token in NEGATION_WORDS:
            negate = True
            out.append(token)
            continue
        out.append(f"NOT_{token}" if negate else token)
    return out
```

```python
>>> apply_negation(["not", "good", "at", "all", ".", "but", "funny"])
['not', 'NOT_good', 'NOT_at', 'NOT_all', '.', 'but', 'funny']
```

现在 `good` 和 `NOT_good` 是不同的特征。分类器可以对它们赋予相反的权重。三行预处理代码，在情感分析基准测试上获得可衡量的准确率提升。

### 第 5 步：真正重要的评估指标

如果类别不平衡，仅靠准确率会误导人。真实的情感语料库通常 70-80% 是正面或 70-80% 是负面；一个始终预测多数类的分类器能达到 80% 的准确率，却毫无价值。报告以下每一项：

- **每个类别的精确率和召回率。** 每个类别一对。对它们进行宏平均，得到尊重类别平衡的单一数值。
- **宏平均 F1（不平衡数据的主要指标）。** 每个类别 F1 分数的等权平均。当类别不平衡时，使用这个而不是准确率。
- **加权平均 F1（替代方案）。** 与宏平均相同，但按类别频率加权。当不平衡本身具有业务含义时，与宏平均 F1 一起报告。
- **混淆矩阵。** 原始计数。在信任任何标量指标之前始终检查它；它能揭示模型混淆了哪对类别。
- **每个类别的错误样本。** 每个类别抽取 5 个错误预测。阅读它们。没有比阅读实际错误更能替代的了。

对于严重不平衡的数据（> 95-5 比例），报告 **AUROC** 和 **AUPRC** 而不是准确率。AUPRC 对少数类别更敏感，而这通常是你关心的（垃圾邮件、欺诈、稀有情感）。

**要避免的常见错误。** 在不平衡数据上报告微平均 F1 而非宏平均 F1 会得到一个看起来很高的数字，因为它主要由多数类主导。宏平均 F1 迫使你看到少数类别的性能。

```python
def evaluate(y_true, y_pred):
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "precision": precision, "recall": recall, "f1": f1}
```

## 使用现成工具

scikit-learn 用六行代码正确完成。

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

pipe = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, stop_words=None)),
    ("clf", LogisticRegression(C=1.0, max_iter=1000)),
])
pipe.fit(X_train, y_train)
print(pipe.score(X_test, y_test))
```

需要留意的三件事。`stop_words=None` 保留否定词。`ngram_range=(1, 2)` 添加二元词组，使 `not_good` 成为一个特征。`sublinear_tf=True` 抑制重复词。这三个标志是 75% 准确率基线与 SST-2 上 85% 准确率基线之间的区别。

### 何时使用 transformer

- 讽刺检测。经典模型在此完全失败。
- 情感在文档中段发生变化的长评论。
- 基于方面的情感分析。"相机很棒但电池很糟糕。"你需要将情感归因于不同方面。仅限 transformer 或结构化输出模型。
- 非英语、低资源语言。多语言 BERT 免费为你提供一个零样本基线。

如果你需要以上任何一项，请跳转到阶段 7（transformer 深入探讨）。否则，基于 TF-IDF 加二元词组加否定处理的朴素贝叶斯或逻辑回归就是你 2026 年的生产基线。

### 可复现性陷阱（再次强调）

重新训练情感模型是常规操作。重新评估它们则不是。论文中报告的准确率使用特定的数据划分、特定的预处理、特定的分词器。如果你不使用完全相同的流程将你的新模型与基线进行比较，你会得到误导性的差异。始终在你的流程上重新生成基线，而不是使用论文中的数字。

## 交付

保存为 `outputs/prompt-sentiment-baseline.md`：

```markdown
---
name: sentiment-baseline
description: 为新数据集设计情感分析基线。
phase: 5
lesson: 05
---

给定数据集描述（领域、语言、规模、标签粒度、延迟预算），你输出：

1. 特征提取方案。指定分词器、n-gram 范围、停用词策略（通常保留）、否定处理（范围标记或二元词组）。
2. 分类器。朴素贝叶斯用于基线，逻辑回归用于生产，仅当领域需要讽刺/方面/跨语言能力时使用 transformer。
3. 评估计划。报告精确率、召回率、F1、混淆矩阵和每类错误样本（不仅仅是标量指标）。
4. 部署后需监控的一个失败模式。领域漂移和讽刺是最重要的两个。

拒绝为情感任务推荐丢弃停用词。拒绝在类别不平衡时仅报告准确率作为唯一指标。标记子词丰富的语言为需要使用 FastText 或 transformer 嵌入而非词级 TF-IDF。
```

## 练习

1. **简单。** 在 scikit-learn 流程中将 `apply_negation` 作为预处理步骤添加，并在一个小型情感数据集上测量 F1 的差异。
2. **中等。** 实现类别加权的逻辑回归（向 scikit-learn 传递 `class_weight="balanced"`，或自己推导梯度）。在合成 90-10 类别不平衡数据上测量效果。
3. **困难。** 通过在情感模型残差上训练第二个分类器来构建一个讽刺检测器。记录你的实验设置。当你的准确率低于随机水平时警告读者（二分类讽刺的随机水平约为 50%，大多数首次尝试都落在这个水平）。

## 关键术语

| 术语 | 人们通常说的 | 实际含义 |
|------|-----------------|-----------------------|
| 极性 | 正面或负面 | 二分类标签；有时扩展到中性或细粒度（5 星）。 |
| 基于方面的情感 | 每方面极性 | 将情感归属于文本中提到的特定实体或属性。 |
| 否定范围标记 | 翻转附近词元 | 在 "not" 之后的词元上添加 `NOT_` 前缀，直到遇到标点符号。 |
| 拉普拉斯平滑 | 计数加 1 | 防止朴素贝叶斯中出现零概率特征。 |
| L2 正则化 | 缩小权重 | 向损失添加 `lambda * sum(w^2)`。对于稀疏文本特征至关重要。 |

## 延伸阅读

- [Pang and Lee (2008). Opinion Mining and Sentiment Analysis](https://www.cs.cornell.edu/home/llee/opinion-mining-sentiment-analysis-survey.html) —— 基础性综述。很长，但前四节涵盖了经典方法的所有内容。
- [Wang and Manning (2012). Baselines and Bigrams: Simple, Good Sentiment and Topic Classification](https://aclanthology.org/P12-2018/) —— 这篇论文表明二元词组加朴素贝叶斯在短文本上难以被击败。
- [scikit-learn 文本特征提取文档](https://scikit-learn.org/stable/modules/feature_extraction.html#text-feature-extraction) —— `CountVectorizer`、`TfidfVectorizer` 和你将调优的每个参数的参考资料。
