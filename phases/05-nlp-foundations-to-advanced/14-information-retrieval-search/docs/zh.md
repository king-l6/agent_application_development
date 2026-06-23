# 信息检索与搜索

> BM25 精确但脆弱。密集检索覆盖广泛但遗漏关键词。混合检索是 2026 年的默认选择。其他都是调优。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 02（BoW + TF-IDF）、阶段 5 · 04（GloVe、FastText、子词）
**时间：** ~75 分钟

## 问题

用户输入"如果有人骗钱会怎样"，希望找到实际涵盖这一点的法规："印度刑法第 420 条"。关键词搜索完全找不到（没有共享词汇）。语义搜索如果嵌入没有在法律文本上训练过也会错过。真实搜索必须处理两者。

IR 是每个 RAG 系统、每个搜索栏、每个文档站点模糊搜索的底层管道。2026 年在生产环境中有效的架构不是单一方法。它是一个互补方法的链条，每个方法捕捉上一个方法的失败。

本节课构建每个组件并说明每个组件捕捉哪些失败。

## 概念

![混合检索：BM25 + 密集 + RRF + 交叉编码器重排序](../assets/retrieval.svg)

四层。选择你需要的。

1. **稀疏检索（BM25）。** 快速，精确匹配上精确，语义上糟糕。在倒排索引上运行。在百万级文档上每个查询亚 10 毫秒。能正确找到法规引用、产品代码、错误信息、命名实体。
2. **密集检索。** 将查询和文档编码为向量。最近邻搜索。捕捉改写和语义相似性。可能遗漏相差一个字符的精确关键词匹配。使用 FAISS 或向量数据库时每个查询 50-200 毫秒。
3. **融合。** 合并稀疏和密集的排序列表。倒数排名融合（RRF）是简单的默认选择，因为它忽略原始分数（它们处于不同尺度）而仅使用排名位置。当你知道某个信号对你领域占主导时，加权融合是一种选择。
4. **交叉编码器重排序。** 取融合后的 Top-30。运行交叉编码器（查询 + 文档一起评分，每对打分）。保留 Top-5。交叉编码器每对比双编码器慢，但准确得多。你通过仅在 Top-30 上运行来摊销成本。

三路检索（BM25 + 密集 + 学习型稀疏如 SPLADE）在 2026 年基准上优于两路，但需要学习型稀疏索引的基础设施。对于大多数团队，两路加交叉编码器重排序是最佳平衡点。

## 构建

### 步骤 1：从零实现 BM25

```python
import math
import re
from collections import Counter

TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text):
    return TOKEN_RE.findall(text.lower())


class BM25:
    def __init__(self, corpus, k1=1.5, b=0.75):
        if not corpus:
            raise ValueError("corpus must not be empty")
        self.corpus = [tokenize(d) for d in corpus]
        self.k1 = k1
        self.b = b
        self.n_docs = len(self.corpus)
        self.avg_dl = sum(len(d) for d in self.corpus) / self.n_docs
        self.df = Counter()
        for doc in self.corpus:
            for term in set(doc):
                self.df[term] += 1

    def idf(self, term):
        n = self.df.get(term, 0)
        return math.log(1 + (self.n_docs - n + 0.5) / (n + 0.5))

    def score(self, query, doc_idx):
        q_tokens = tokenize(query)
        doc = self.corpus[doc_idx]
        dl = len(doc)
        freq = Counter(doc)
        score = 0.0
        for term in q_tokens:
            f = freq.get(term, 0)
            if f == 0:
                continue
            numerator = f * (self.k1 + 1)
            denominator = f + self.k1 * (1 - self.b + self.b * dl / self.avg_dl)
            score += self.idf(term) * numerator / denominator
        return score

    def rank(self, query, top_k=10):
        scored = [(self.score(query, i), i) for i in range(self.n_docs)]
        scored.sort(reverse=True)
        return scored[:top_k]
```

两个值得了解的参数。`k1=1.5` 控制词频饱和度；越高意味着词重复的权重越大。`b=0.75` 控制长度归一化；0 忽略文档长度，1 完全归一化。默认值来自原始论文的 Robertson 推荐，很少需要调整。

### 步骤 2：使用双编码器的密集检索

```python
from sentence_transformers import SentenceTransformer
import numpy as np


def build_dense_index(corpus, model_id="sentence-transformers/all-MiniLM-L6-v2"):
    encoder = SentenceTransformer(model_id)
    embeddings = encoder.encode(corpus, normalize_embeddings=True)
    return encoder, embeddings


def dense_search(encoder, embeddings, query, top_k=10):
    q_emb = encoder.encode([query], normalize_embeddings=True)
    sims = (embeddings @ q_emb.T).flatten()
    order = np.argsort(-sims)[:top_k]
    return [(float(sims[i]), int(i)) for i in order]
```

L2 归一化嵌入，使点积等于余弦。`all-MiniLM-L6-v2` 是 384 维，速度快，对大多数英文检索来说足够强。对于多语言工作，使用 `paraphrase-multilingual-MiniLM-L12-v2`。对于最高精度，使用 `bge-large-en-v1.5` 或 `e5-large-v2`。

### 步骤 3：倒数排名融合

```python
def reciprocal_rank_fusion(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, (_, doc_idx) in enumerate(ranking):
            scores[doc_idx] = scores.get(doc_idx, 0.0) + 1.0 / (k + rank + 1)
    fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [(score, doc_idx) for doc_idx, score in fused]
```

`k=60` 常数来自原始 RRF 论文。更高的 `k` 使排名差异的贡献更平坦；更低的 `k` 使顶级排名占主导。60 是已发布的默认值，很少需要调整。

### 步骤 4：混合搜索 + 重排序

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")


def hybrid_search(query, bm25, encoder, dense_embeddings, corpus, top_k=5, pool_size=30, reranker=reranker):
    sparse_ranking = bm25.rank(query, top_k=pool_size)
    dense_ranking = dense_search(encoder, dense_embeddings, query, top_k=pool_size)
    fused = reciprocal_rank_fusion([sparse_ranking, dense_ranking])[:pool_size]

    pairs = [(query, corpus[doc_idx]) for _, doc_idx in fused]
    scores = reranker.predict(pairs)
    reranked = sorted(zip(scores, [doc_idx for _, doc_idx in fused]), reverse=True)
    return reranked[:top_k]
```

三阶段组合。BM25 找到词汇匹配。密集找到语义匹配。RRF 合并两个排名，无需分数校准。交叉编码器使用查询-文档对重新评分 Top-30，捕捉双编码器遗漏的细粒度相关性。保留 Top-5。

### 步骤 5：评估

| 指标 | 含义 |
|--------|---------|
| Recall@k | 在存在正确文档的查询中，它出现在 Top-k 中的频率 |
| MRR（平均倒数排名） | 首个相关文档的 1/排名 的平均值 |
| nDCG@k | 考虑相关性分级，不仅是二值相关/不相关 |

对于 RAG 来说，检索器的 **Recall@k** 是最重要的数字。如果正确段落不在检索集中，阅读器无法回答。

调试技巧：对于失败的查询，比较稀疏和密集排名。如果一个找到正确文档而另一个没有，你遇到了词汇不匹配（修复：添加缺失的一半）或语义歧义（修复：更好的嵌入或重排序器）。

## 使用

2026 年的技术栈：

| 规模 | 技术栈 |
|-------|-------|
| 1k-100k 文档 | 内存中的 BM25 + `all-MiniLM-L6-v2` 嵌入 + RRF。无需独立数据库。 |
| 100k-10M 文档 | 密集检索用 FAISS 或 pgvector + BM25 用 Elasticsearch / OpenSearch。并行运行。 |
| 10M+ 文档 | 支持混合检索的 Qdrant / Weaviate / Vespa / Milvus。在 Top-30 上运行交叉编码器重排序。 |
| 最佳质量前沿 | 三路（BM25 + 密集 + SPLADE）+ ColBERT 延迟交互重排序 |

无论你选择什么，都要为评估留出预算。在基准测试端到端 RAG 准确率之前，先基准测试检索召回率。阅读器无法修复检索器遗漏的内容。

### 2026 年生产 RAG 的来之不易的经验

- **80% 的 RAG 失败可追溯到数据摄入和分块，而不是模型。** 团队花费数周更换 LLM 和调整提示，而检索器每三个查询就静默返回错误上下文。先修复分块。
- **分块策略比分块大小更重要。** 固定大小的分割会破坏表格、代码和嵌套标题。句子感知是默认选择；语义或基于 LLM 的分块对技术文档和产品手册很有价值。
- **父文档模式。** 检索精确的小"子"块。当来自同一父节的多个子块出现时，换入父块以保留上下文。这无需重新训练就能持续提升答案质量。
- **k_rerank=3 通常是最优的。** 超过这个值的每个额外块都会增加 token 成本和生成延迟，而不会提升答案质量。如果 k=8 对你仍然优于 k=3，说明重排序器表现不佳。
- **HyDE / 查询扩展。** 从查询生成假设性答案，嵌入该答案，然后检索。弥合短问题和长文档之间的措辞差距。无需训练的免费精度提升。
- **上下文预算控制在 8K tokens 以内。** 在此限制下持续命中意味着重排序器阈值太宽松。
- **一切都要版本控制。** 提示、分块规则、嵌入模型、重排序器。任何漂移都会静默破坏答案质量。CI 门控检查忠实度、上下文精度和未回答问题的比率，在用户注意到之前阻止回归。
- **三路检索（BM25 + 密集 + 学习型稀疏如 SPLADE）优于两路**，在 2026 年基准上尤其适用于混合专有名词和语义的查询。当基础设施支持 SPLADE 索引时部署。

根据 2026 年的行业测量，正确的检索设计可将幻觉降低 70-90%。大多数 RAG 性能提升来自更好的检索，而不是模型微调。

## 产出

保存为 `outputs/skill-retrieval-picker.md`：

```markdown
---
name: retrieval-picker
description: 为给定的语料库和查询模式选择检索技术栈。
version: 1.0.0
phase: 5
lesson: 14
tags: [nlp, retrieval, rag, search]
---

给定需求（语料库大小、查询模式、延迟预算、质量要求、基础设施约束），输出：

1. 技术栈。仅 BM25、仅密集、混合（BM25 + 密集 + RRF）、混合 + 交叉编码器重排序或三路（BM25 + 密集 + 学习型稀疏）。
2. 密集编码器。命名特定模型。匹配语言、领域和上下文长度。
3. 重排序器。如果使用，命名特定交叉编码器模型。标记重排序在 Top-30 上增加 30-100ms 延迟。
4. 评估计划。Recall@10 是主要检索器指标。多答案用 MRR。先有基线，然后测量增量改进。

拒绝为包含命名实体、错误代码或产品 SKU 的语料库推荐仅密集检索，除非用户有证据表明密集能处理精确匹配。拒绝在高风险检索（法律、医疗）中跳过重排序，因为最终 Top-5 决定了用户的答案。
```

## 练习

1. **（简单）** 在上面 500 文档的语料库上实现 `hybrid_search`。测试 20 个查询。比较 BM25 单独、密集单独和混合的 Top-5 召回率。
2. **（中等）** 添加 MRR 计算。对于每个有已知正确文档的测试查询，在 BM25、密集和混合排名中找到正确文档的排名。报告各自的 MRR。
3. **（困难）** 使用 MultipleNegativesRankingLoss（Sentence Transformers）在你的领域上微调密集编码器。从 500 个查询-文档对构建训练集。比较微调前后的召回率。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| BM25 | 关键词搜索 | Okapi BM25。通过词频、IDF 和长度对文档评分。 |
| 密集检索 | 向量搜索 | 将查询 + 文档编码为向量，找最近邻。 |
| 双编码器 | 嵌入模型 | 独立编码查询和文档。查询时速度快。 |
| 交叉编码器 | 重排序模型 | 一起编码查询和文档。慢但准确。 |
| RRF | 排名融合 | 通过求和 `1/(k + rank)` 合并两个排名。 |
| Recall@k | 检索指标 | 相关文档在 Top-k 中的查询比例。 |

## 延伸阅读

- [Robertson and Zaragoza (2009). The Probabilistic Relevance Framework: BM25 and Beyond](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf) — BM25 的权威处理。
- [Karpukhin et al. (2020). Dense Passage Retrieval for Open-Domain QA](https://arxiv.org/abs/2004.04906) — DPR，标准双编码器。
- [Formal et al. (2021). SPLADE: Sparse Lexical and Expansion Model](https://arxiv.org/abs/2107.05720) — 缩小与密集检索差距的学习型稀疏检索器。
- [Cormack, Clarke, Büttcher (2009). Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) — RRF 论文。
- [Khattab and Zaharia (2020). ColBERT: Efficient and Effective Passage Search](https://arxiv.org/abs/2004.12832) — 延迟交互检索。
