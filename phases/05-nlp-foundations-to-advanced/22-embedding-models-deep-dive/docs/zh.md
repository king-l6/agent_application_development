# 嵌入模型 —— 2026 深度解析

> Word2Vec 给你每个单词一个向量。现代嵌入模型给你每个段落一个向量，跨语言，提供稀疏、稠密和多向量视角，大小适配你的索引。选错了，你的 RAG 就会检索到错误的内容。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 03（Word2Vec），阶段 5 · 14（信息检索）
**时间：** ~60 分钟

## 问题

你的 RAG 系统 40% 的时间检索到错误的段落。罪魁祸首很少是向量数据库或提示词，而是嵌入模型。

2026 年选择嵌入需要从五个维度考虑：

1. **稠密 vs 稀疏 vs 多向量。** 每个段落一个向量，或者每个 token 一个向量，或者稀疏加权词袋。
2. **语言覆盖。** 单语英语模型在仅英语任务上仍然胜出。多语言模型在语料混合时胜出。
3. **上下文长度。** 512 token vs 8,192 vs 32,768 —— 实际有效容量通常是标称最大值的 60-70%。
4. **维度预算。** 全精度 3,072 个浮点数 = 每个向量 12 KB。1 亿个向量时，存储成本为每月 1,300 美元。Matryoshka 截断可将此降低 4 倍。
5. **开源 vs 托管。** 开源权重意味着你控制堆栈和数据。托管意味着你用控制权换取始终最新。

本课阐明这些权衡，让你能基于证据做选择，而不是跟上季度的流行趋势。

## 概念

![稠密、稀疏和多向量嵌入](../assets/embedding-modes.svg)

**稠密嵌入。** 每个段落一个向量（通常 384-3,072 维）。余弦相似度按语义接近度对段落排序。OpenAI `text-embedding-3-large`、BGE-M3 稠密模式、Voyage-3。默认选择。

**稀疏嵌入。** SPLADE 风格。Transformer 为每个词表 token 预测一个权重，然后将大部分权重归零。结果是大小为 |vocab| 的稀疏向量。捕获词汇匹配（如 BM25），但使用学习到的词权重。在关键词密集型查询上表现强劲。

**多向量（延迟交互）。** ColBERTv2、Jina-ColBERT。每个 token 一个向量。使用 MaxSim 评分：对每个查询 token，找到最相似的文档 token，求和得分。存储和评分成本更高，但在长查询和特定领域语料上胜出。

**BGE-M3：三者合一。** 单个模型同时输出稠密、稀疏和多向量表示。每种模式可独立查询；分数通过加权和融合。当你想从一个检查点获得灵活性时，这是 2026 年的默认选择。

**Matryoshka 表示学习。** 训练使得向量的前 N 维本身形成一个有用的独立嵌入。将 1,536 维向量截断为 256 维，以约 1% 的准确率代价节省 6 倍的存储。OpenAI text-3、Cohere v4、Voyage-4、Jina v5、Gemini Embedding 2、Nomic v1.5+ 均支持。

### MTEB 排行榜只讲了一半的故事

大规模文本嵌入基准 —— 启动时（2022 年）涵盖 8 个任务类型的 56 个任务，在 MTEB v2 中扩展到 100+ 个任务。2026 年初，Gemini Embedding 2 在检索任务上领先（67.71 MTEB-R）。Cohere embed-v4 在通用任务上领先（65.2 MTEB）。BGE-M3 在开源权重的多语言任务上领先（63.0）。排行榜是必要的但不充分 —— 始终在你的领域上进行基准测试。

### 三层模式

| 用例 | 模式 |
|----------|---------|
| 快速初筛 | 稠密双编码器（BGE-M3、text-3-small） |
| 召回率提升 | 稀疏（SPLADE、BGE-M3 稀疏）+ RRF 融合 |
| 前 50 名精排 | 多向量（ColBERTv2）或交叉编码器重排序器 |

大多数生产堆栈三者都使用。

## 动手构建

### 步骤 1：基准 —— 使用 Sentence-BERT 的稠密嵌入

```python
from sentence_transformers import SentenceTransformer
import numpy as np

encoder = SentenceTransformer("BAAI/bge-small-en-v1.5")
corpus = [
    "The first iPhone launched in 2007.",
    "Apple released the iPod in 2001.",
    "Android is an operating system from Google.",
]
emb = encoder.encode(corpus, normalize_embeddings=True)

query = "When was the iPhone released?"
q_emb = encoder.encode([query], normalize_embeddings=True)[0]
scores = emb @ q_emb
print(sorted(enumerate(scores), key=lambda x: -x[1]))
```

`normalize_embeddings=True` 使点积等于余弦相似度。始终设置它。

### 步骤 2：Matryoshka 截断

```python
def truncate(vectors, dim):
    out = vectors[:, :dim]
    return out / np.linalg.norm(out, axis=1, keepdims=True)

emb_256 = truncate(emb, 256)
emb_128 = truncate(emb, 128)
```

截断后重新归一化。Nomic v1.5、OpenAI text-3 和 Voyage-4 经过训练，在前几层截断时这是无损的。非 Matryoshka 模型（原始 Sentence-BERT）在截断时会急剧退化。

### 步骤 3：BGE-M3 多功能

```python
from FlagEmbedding import BGEM3FlagModel

model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)

output = model.encode(
    corpus,
    return_dense=True,
    return_sparse=True,
    return_colbert_vecs=True,
)
# output["dense_vecs"]:    (n_docs, 1024)
# output["lexical_weights"]: list of dict {token_id: weight}
# output["colbert_vecs"]:  list of (n_tokens, 1024) arrays
```

三个索引，一次推理调用。分数融合：

```python
dense_score = ... # cosine over dense_vecs
sparse_score = model.compute_lexical_matching_score(q_lex, d_lex)
colbert_score = model.colbert_score(q_col, d_col)
final = 0.4 * dense_score + 0.2 * sparse_score + 0.4 * colbert_score
```

在你的领域上调整权重。

### 步骤 4：在自定义任务上进行 MTEB 评估

```python
from mteb import MTEB

tasks = ["ArguAna", "SciFact", "NFCorpus"]
evaluation = MTEB(tasks=tasks)
results = evaluation.run(encoder, output_folder="./mteb-results")
```

在一个*有代表性的*子集上运行你的候选模型。不要仅仅相信排行榜排名 —— 你的领域很重要。

### 步骤 5：从头实现余弦相似度

参见 `code/main.py`。平均哈希技巧嵌入（仅 stdlib）。无法与 Transformer 嵌入竞争，但展示了基本形式：分词 → 向量 → 归一化 → 点积。

## 陷阱

- **查询和文档使用同一模型。** 一些模型（Voyage、Jina-ColBERT）使用非对称编码 —— 查询和文档通过不同的路径。始终检查模型卡片。
- **缺少前缀。** `bge-*` 模型需要在查询前添加 `"Represent this sentence for searching relevant passages: "`。忘记的话会有 3-5 个百分点的召回率差距。
- **过度截断 Matryoshka。** 1,536 → 256 通常是安全的。1,536 → 64 则不安全。在你的评估集上验证。
- **上下文截断。** 大多数模型对超过最大长度的输入静默截断。长文档需要分块（见第 23 课）。
- **忽略延迟尾部分布。** MTEB 分数隐藏了 p99 延迟。一个 600M 模型可能比 335M 模型高 2 个百分点，但每次查询成本高出 3 倍。

## 场景应用

2026 年的技术选择：

| 场景 | 选择 |
|-----------|------|
| 仅英语，快速，API | `text-embedding-3-large` 或 `voyage-3-large` |
| 开源权重，英语 | `BAAI/bge-large-en-v1.5` |
| 开源权重，多语言 | `BAAI/bge-m3` 或 `Qwen3-Embedding-8B` |
| 长上下文（32k+） | Voyage-3-large、Cohere embed-v4、Qwen3-Embedding-8B |
| 仅 CPU 部署 | Nomic Embed v2（1.37 亿参数，MoE） |
| 存储受限 | Matryoshka 截断 + int8 量化 |
| 关键词密集型查询 | 添加 SPLADE 稀疏，与稠密进行 RRF 融合 |

2026 年模式：从 BGE-M3 或 text-3-large 开始，用 MTEB 在你的领域上评估，如果领域特定模型胜出超过 3 个百分点则替换。

## 交付物

保存为 `outputs/skill-embedding-picker.zh.md`：

```markdown
---
name: embedding-picker
description: 为给定语料和部署场景选择嵌入模型、维度和检索模式。
version: 1.0.0
phase: 5
lesson: 22
tags: [nlp, embeddings, retrieval]
---

给定语料（大小、语言、领域、平均长度）、部署目标（云端/边缘/本地）、延迟预算和存储预算，输出：

1. 模型。命名的检查点或 API。一句话理由。
2. 维度。完整 / Matryoshka 截断 / int8 量化。理由与存储预算相关。
3. 模式。稠密 / 稀疏 / 多向量 / 混合。理由。
4. 查询前缀/模板（如果模型卡片要求）。
5. 评估方案。与领域相关的 MTEB 任务 + 使用 nDCG@10 的留出领域评估。

拒绝未经领域验证就将 Matryoshka 截断到 64 维度以下的建议。拒绝为少于 10k 段落的语料推荐 ColBERTv2（开销不合理）。标记将长文档语料（>8k token）路由到具有 512 token 窗口的模型的情况。
```

## 练习

1. **简单。** 使用 `bge-small-en-v1.5` 在全维度（384）编码 100 个句子，然后使用 Matryoshka 128。在 10 个查询上测量 MRR 下降。
2. **中等。** 在你的领域中的 500 个段落上比较 BGE-M3 的稠密、稀疏和 colbert 模式。哪个在 recall@10 上胜出？RRF 融合是否优于最佳单一模式？
3. **困难。** 在你的前 2 个领域任务上，对三个候选模型运行 MTEB。报告 MTEB 分数、100 查询批次的 p99 延迟和每 100 万查询的成本。选择帕累托最优的那个。

## 关键术语

| 术语 | 人们说 | 实际含义 |
|------|-----------------|-----------------------|
| 稠密嵌入 | 向量 | 每段文本一个固定大小的向量。余弦相似度用于排序。 |
| 稀疏嵌入 | 学习版 BM25 | 每个词表 token 一个权重；大部分为零；端到端训练。 |
| 多向量 | ColBERT 风格 | 每个 token 一个向量；MaxSim 评分；索引更大，召回率更好。 |
| Matryoshka | 套娃技巧 | 前 N 维本身就是一个有效的较小嵌入。 |
| MTEB | 基准 | 大规模文本嵌入基准 —— 启动时 56 个任务，v2 中 100+。 |
| BEIR | 检索基准 | 18 个零样本检索任务；常被引用于跨领域鲁棒性。 |
| 非对称编码 | 查询 ≠ 文档路径 | 模型对查询和文档使用不同的投影。 |

## 延伸阅读

- [Reimers, Gurevych (2019). Sentence-BERT](https://arxiv.org/abs/1908.10084) — 双编码器论文。
- [Muennighoff et al. (2022). MTEB: Massive Text Embedding Benchmark](https://arxiv.org/abs/2210.07316) — 排行榜论文。
- [Chen et al. (2024). BGE-M3: Multi-lingual, Multi-functionality, Multi-granularity](https://arxiv.org/abs/2402.03216) — 统一三模式模型。
- [Kusupati et al. (2022). Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147) — 维度阶梯训练目标。
- [Santhanam et al. (2022). ColBERTv2: Effective and Efficient Retrieval via Lightweight Late Interaction](https://arxiv.org/abs/2112.01488) — 生产环境中的延迟交互。
- [MTEB leaderboard on Hugging Face](https://huggingface.co/spaces/mteb/leaderboard) — 实时排名。
