# 主题建模 — LDA 和 BERTopic

> LDA：文档是主题的混合，主题是词上的分布。BERTopic：文档在嵌入空间中聚类，聚类就是主题。相同目标，不同分解。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 02（BoW + TF-IDF）、阶段 5 · 03（Word2Vec）
**时间：** ~45 分钟

## 问题

你有 10,000 个客户支持工单、50,000 篇新闻文章或 200,000 条推文。你需要知道这个集合是关于什么的，而不必阅读全部。你没有标注的类别。你甚至不知道有多少个类别存在。

主题模型无需监督就能回答这个问题。给它一个语料库，它返回一个小的连贯主题集合，以及每个文档在这些主题上的分布。

两个算法家族占主导地位。LDA（2003）将每个文档视为潜在主题的混合，每个主题是词上的分布。推理是贝叶斯的。它在需要混合成员主题分配和可解释的词级概率分布的生产环境中仍然部署。

BERTopic（2020）用 BERT 编码文档，用 UMAP 降维，用 HDBSCAN 聚类，通过基于类别的 TF-IDF 提取主题词。它在短文本、社交媒体以及任何语义相似性比词重叠更重要的场景中胜出。一个文档得到一个主题，这对长文本来说是一个限制。

本节课构建对两者的直觉，并说明为给定语料库选择哪一个。

## 概念

![LDA 混合模型 vs BERTopic 聚类](../assets/topic-modeling.svg)

**LDA 生成故事。** 每个主题是词上的分布。每个文档是主题的混合。要生成文档中的词，从文档的混合中采样一个主题，然后从该主题的分布中采样一个词。推理反转这个过程：给定观察到的词，推断每个文档的主题分布和每个主题的词分布。折叠吉布斯采样或变分贝叶斯完成数学计算。

关键 LDA 输出：

- `doc_topic`：矩阵 `(n_docs, n_topics)`，每行和为 1（文档的主题混合）。
- `topic_word`：矩阵 `(n_topics, vocab_size)`，每行和为 1（主题的词分布）。

**BERTopic 管道。**

1. 用一句话变压器编码每个文档（例如 `all-MiniLM-L6-v2`）。384 维向量。
2. 用 UMAP 降维到约 5 个维度。BERT 嵌入对聚类来说维度过高。
3. 用 HDBSCAN 聚类。基于密度，产生可变大小的聚类和一个"离群点"标签。
4. 对于每个聚类，在聚类文档上计算基于类别的 TF-IDF 以提取 Top 词。

输出是每个文档一个主题（加上 -1 离群点标签）。可选地，通过 HDBSCAN 的概率向量实现软成员关系。

## 构建

### 步骤 1：通过 scikit-learn 的 LDA

```python
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
import numpy as np


def fit_lda(documents, n_topics=5, max_features=1000):
    cv = CountVectorizer(
        max_features=max_features,
        stop_words="english",
        min_df=2,
        max_df=0.9,
    )
    X = cv.fit_transform(documents)
    lda = LatentDirichletAllocation(
        n_components=n_topics,
        random_state=42,
        max_iter=50,
        learning_method="online",
    )
    doc_topic = lda.fit_transform(X)
    feature_names = cv.get_feature_names_out()
    return lda, cv, doc_topic, feature_names


def print_top_words(lda, feature_names, n_top=10):
    for idx, topic in enumerate(lda.components_):
        top_idx = np.argsort(-topic)[:n_top]
        words = [feature_names[i] for i in top_idx]
        print(f"topic {idx}: {' '.join(words)}")
```

注意：停用词已移除，min_df 和 max_df 过滤稀有和普遍词，使用 CountVectorizer（而不是 TfidfVectorizer），因为 LDA 期望原始计数。

### 步骤 2：BERTopic（生产环境）

```python
from bertopic import BERTopic

topic_model = BERTopic(
    embedding_model="sentence-transformers/all-MiniLM-L6-v2",
    min_topic_size=15,
    verbose=True,
)

topics, probs = topic_model.fit_transform(documents)
info = topic_model.get_topic_info()
print(info.head(20))
valid_topics = info[info["Topic"] != -1]["Topic"].tolist()
for topic_id in valid_topics[:5]:
    print(f"topic {topic_id}: {topic_model.get_topic(topic_id)[:10]}")
```

对 `Topic != -1` 的过滤丢弃了 BERTopic 的离群桶（HDBSCAN 无法聚类的文档）。`min_topic_size` 控制 HDBSCAN 的最小聚类大小；BERTopic 库默认值是 10。此示例明确设置为 15 以适应该课的规模。对于超过 10,000 个文档的语料库，增加到 50 或 100。

### 步骤 3：评估

两种方法都输出主题词。问题是这些词是否连贯。

- **主题连贯性（c_v）。** 结合滑动窗口上下文中 Top 词对的 NPMI（归一化点间互信息），将分数聚合成主题向量，并通过余弦相似度比较这些向量。越高越好。使用 `gensim.models.CoherenceModel` 并设置 `coherence="c_v"`。
- **主题多样性。** 所有主题 Top 词中唯一词的比例。越高越好（主题不重叠）。
- **定性检查。** 阅读每个主题的 Top 词。它们是否对应真实概念？人工判断仍是最后一道防线。

## 何时选择哪一个

| 情况 | 选择 |
|-----------|------|
| 短文本（推文、评论、标题） | BERTopic |
| 包含主题混合的长文档 | LDA |
| 无 GPU / 有限计算 | LDA 或 NMF |
| 需要文档级多主题分布 | LDA |
| 主题标注的 LLM 集成 | BERTopic（直接支持） |
| 资源受限的边缘部署 | LDA |
| 最大语义连贯性 | BERTopic |

最大的实际考虑因素是文档长度。BERT 嵌入有截断问题；LDA 计数适用于任何长度。对于长于嵌入模型上下文的文档，要么分块后聚合，要么使用 LDA。

## 使用

2026 年的技术栈：

- **BERTopic。** 短文本和任何语义重要的场景的默认选择。
- **`gensim.models.LdaModel`。** 经典 LDA 用于生产，成熟、久经考验。
- **`sklearn.decomposition.LatentDirichletAllocation`。** 用于实验的简易 LDA。
- **NMF。** 非负矩阵分解。LDA 的快速替代方案，短文本上质量相当。
- **Top2Vec。** 与 BERTopic 类似的设计。社区较小但在某些基准上表现良好。
- **FASTopic。** 更新，在非常大的语料库上比 BERTopic 更快。
- **基于 LLM 的标注。** 运行任何聚类，然后提示模型为每个聚类命名。

## 产出

保存为 `outputs/skill-topic-picker.md`：

```markdown
---
name: topic-picker
description: 为语料库选择 LDA 或 BERTopic。指定库、参数、评估。
version: 1.0.0
phase: 5
lesson: 15
tags: [nlp, topic-modeling]
---

给定语料库描述（文档数量、平均长度、领域、语言、计算预算），输出：

1. 算法。LDA / NMF / BERTopic / Top2Vec / FASTopic。一句话理由。
2. 配置。主题数量：`recommended = max(5, round(sqrt(n_docs)))`，语料库少于 40,000 文档时限制在 200 以内；仅在语料库确实很大（>40k）时允许超过 200，并说明增加的计算成本。`min_df` / `max_df` 过滤器和神经方法的嵌入模型也属于这一部分。
3. 评估。通过 `gensim.models.CoherenceModel` 的主题连贯性（c_v）、主题多样性以及 20 样本人工阅读。
4. 需要探测的失败模式。对于 LDA，吸收停用词和常见词的"垃圾主题"。对于 BERTopic，吞没歧义文档的 -1 离群聚类。

拒绝在长于嵌入模型上下文窗口的文档上使用 BERTopic，除非有分块策略。拒绝在非常短的文本（推文、少于 10 token 的评论）上使用 LDA，因为连贯性会崩溃。标记任何低于 5 或高于 200 的主题数量选择，认为很可能错误。标记在少于 40k 文档的语料库上超过 200 个主题很可能过度分割。
```

## 练习

1. **（简单）** 在 20 Newsgroups 数据集上用 5 个主题拟合 LDA。打印每个主题的 Top 10 词。手动标注每个主题。算法是否找到了真实的类别？
2. **（中等）** 在相同的 20 Newsgroups 子集上拟合 BERTopic。比较找到的主题数量、Top 词和定性连贯性与 LDA 的差异。哪一个更清晰地呈现了真实类别？
3. **（困难）** 为 LDA 和 BERTopic 在你的语料库上计算 c_v 连贯性。分别用 5、10、20、50 个主题运行。绘制连贯性与主题数量的关系图。报告哪种方法在不同主题数量下更稳定。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| 主题 | 语料库所涉及的一个事物 | 词上的概率分布（LDA）或相似文档的聚类（BERTopic）。 |
| 混合成员 | 文档涉及多个主题 | LDA 为每个文档分配所有主题上的分布。 |
| UMAP | 降维 | 保持局部结构的流形学习；用于 BERTopic。 |
| HDBSCAN | 密度聚类 | 查找可变大小的聚类；为离群点产生"噪声"标签（-1）。 |
| c_v 连贯性 | 主题质量指标 | 滑动窗口内 Top 主题词的平均点间互信息。 |

## 延伸阅读

- [Blei, Ng, Jordan (2003). Latent Dirichlet Allocation](https://www.jmlr.org/papers/volume3/blei03a/blei03a.pdf) — LDA 论文。
- [Grootendorst (2022). BERTopic: Neural topic modeling with a class-based TF-IDF procedure](https://arxiv.org/abs/2203.05794) — BERTopic 论文。
- [Röder, Both, Hinneburg (2015). Exploring the Space of Topic Coherence Measures](https://svn.aksw.org/papers/2015/WSDM_Topic_Evaluation/public.pdf) — 引入 c_v 的论文。
- [BERTopic documentation](https://maartengr.github.io/BERTopic/) — 生产参考。优秀的示例。
