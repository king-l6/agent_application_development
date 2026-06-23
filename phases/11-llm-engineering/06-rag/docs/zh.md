# RAG（检索增强生成）

> 你的大语言模型知道其训练截止日期之前的一切。它对你公司的文档、你的代码库或上周的会议记录一无所知。RAG 通过检索相关文档并将其塞入提示词来解决这个问题。它是生产 AI 中部署最广泛的模式。如果你从本课程中只构建一样东西，那就构建一个 RAG 流水线。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 10（从头构建大语言模型），阶段 11 课程 01-05
**时间：** 约 90 分钟
**关联：** 阶段 5 · 23（RAG 的分块策略）了解六种分块算法及各自适用场景。阶段 5 · 22（嵌入模型深度剖析）用于选择嵌入器。阶段 11 · 07（高级 RAG）用于混合搜索、重排序和查询转换。

## 学习目标

- 构建完整的 RAG 流水线：文档加载、分块、嵌入、向量存储、检索和生成
- 使用带有正确索引的向量数据库（ChromaDB、FAISS 或 Pinecone）实现语义搜索
- 解释为什么在知识密集型应用中 RAG 优于微调（成本、新鲜度、可归因性）
- 使用检索指标（精确率、召回率）和生成指标（忠实度、相关性）评估 RAG 质量

## 问题

你为公司构建了一个聊天机器人。客户问"企业套餐的退款政策是什么？"大语言模型用关于典型 SaaS 退款政策的通用答案回复。实际政策埋藏在一份 200 页的内部维基中，上面写着企业客户享有 60 天窗口期并按比例退款。大语言模型从未见过这份文档。它不可能知道它没有训练过的事情。

微调是一种解决方案。拿一个大语言模型，在你的内部文档上训练，然后部署更新后的模型。这是有效的，但有严重的问题。微调在计算上花费数千美元。文档一变，模型就过时了。你无法知道模型从哪个来源提取了信息。而且如果公司下个月收购了另一个产品线，你又要再次微调。

RAG 是另一种解决方案。保持模型不变。当问题进来时，在文档库中搜索相关段落，将它们粘贴到问题之前的提示词中，让模型使用这些段落作为上下文来回答。文档库可以在几分钟内更新。你可以确切地看到哪些文档被检索到了。模型本身从不改变。这就是为什么 RAG 是生产中的主导模式：它更便宜、更新鲜、更可审计，并且适用于任何大语言模型。

## 概念

### RAG 模式

整个模式包含四个步骤：

```mermaid
graph LR
    Q["用户查询"] --> R["检索"]
    R --> A["增强提示词"]
    A --> G["生成"]
    G --> Ans["答案"]

    subgraph "检索"
        R --> Embed["嵌入查询"]
        Embed --> Search["搜索向量库"]
        Search --> TopK["返回 top-k 块"]
    end

    subgraph "增强"
        TopK --> Format["将块格式化为提示词"]
        Format --> Combine["与用户问题合并"]
    end

    subgraph "生成"
        Combine --> LLM["LLM 生成答案"]
        LLM --> Cite["答案基于检索到的文档"]
    end
```

查询 -> 检索 -> 增强提示词 -> 生成。每个 RAG 系统都遵循这个模式。生产级 RAG 系统之间的区别在于每个步骤的细节：你如何分块、如何嵌入、如何搜索、以及如何构建提示词。

### 为什么 RAG 胜过微调

| 关注点 | 微调 | RAG |
|-------|------|-----|
| 成本 | 每次训练 $1,000-$100,000+ | 每次查询 $0.01-$0.10（嵌入 + LLM） |
| 新鲜度 | 过时直到重新训练 | 通过重新索引文档在几分钟内更新 |
| 可审计性 | 无法追溯答案来源 | 可以显示确切的检索段落 |
| 幻觉 | 仍然自由地产生幻觉 | 基于检索到的文档 |
| 数据隐私 | 训练数据固化为权重 | 文档留在你的向量库中 |

微调永久性地改变模型的权重。RAG 临时性地改变模型的上下文。对于大多数应用，临时上下文就是你想要的。

微调胜出的唯一情况：当你需要模型采用无法仅通过提示实现的特定风格、语气或推理模式时。对于事实知识检索，RAG 每次都胜出。

### 嵌入模型

嵌入模型将文本转换为稠密向量。相似的文本产生在这个高维空间中靠近的向量。"如何重置我的密码？"和"我需要更改我的密码"尽管共享很少的词语，却产生几乎相同的向量。"猫坐在垫子上"产生一个非常不同的向量。

常见嵌入模型（2026 年阵容——参见阶段 5 · 22 了解完整分析）：

| 模型 | 维度 | 提供者 | 备注 |
|------|------|-------|------|
| text-embedding-3-small | 1536（Matryoshka） | OpenAI | 大多数用例的最佳性价比 |
| text-embedding-3-large | 3072（Matryoshka） | OpenAI | 更高准确性，可截断至 256/512/1024 |
| Gemini Embedding 2 | 3072（Matryoshka） | Google | MTEB 检索排名第一；8K 上下文 |
| voyage-4 | 1024/2048（Matryoshka） | Voyage AI | 领域变体（代码、金融、法律） |
| Cohere embed-v4 | 1024（Matryoshka） | Cohere | 强大多语言能力，128K 上下文 |
| BGE-M3 | 1024（稠密 + 稀疏 + ColBERT） | BAAI（开放权重） | 同一模型三种视图 |
| Qwen3-Embedding | 4096（Matryoshka） | 阿里巴巴（开放权重） | 顶级开放权重检索分数 |
| all-MiniLM-L6-v2 | 384 | 开放权重（Sentence Transformers） | 原型设计基线 |

对于本课程，我们使用 TF-IDF 构建自己的简单嵌入。不是因为 TF-IDF 是生产系统使用的，而是因为它让概念具体化：文本输入，向量输出，相似文本产生相似向量。

### 向量相似度

给定两个向量，如何衡量相似度？三种选择：

**余弦相似度**：两个向量之间夹角的余弦。范围从 -1（相反）到 1（相同）。忽略大小，只关心方向。这是 RAG 的默认选择。

```
cosine_sim(a, b) = dot(a, b) / (||a|| * ||b||)
```

**点积**：原始内积。更大的向量获得更高的分数。当大小携带信息时有用（较长的文档可能更相关）。

```
dot(a, b) = sum(a_i * b_i)
```

**L2（欧几里得）距离**：向量空间中的直线距离。距离越小 = 越相似。对大小差异敏感。

```
L2(a, b) = sqrt(sum((a_i - b_i)^2))
```

余弦相似度是标准选择。它优雅地处理不同长度的文档，因为它通过大小进行归一化。当有人说"向量搜索"时，他们几乎总是意味着余弦相似度。

### 分块策略

文档太长，不能作为单个向量嵌入。一份 50 页的 PDF 可能产生一个糟糕的嵌入，因为它包含几十个主题。相反，你将文档分割成块并分别嵌入每个块。

**固定大小分块**：每 N 个词元切分一次。简单且可预测。512 词元块配 50 词元重叠意味着块 1 是词元 0-511，块 2 是词元 462-973，以此类推。重叠确保你不会在不幸的边界处切分一个句子。

**语义分块**：在自然边界切分。段落、章节或 Markdown 标题。每个块是一个连贯的意义单元。实现起来更复杂，但产生更好的检索。

**递归分块**：首先尝试在最大的边界（章节标题）切分。如果一个章节仍然太大，在段落边界切分。如果一个段落仍然太大，在句子边界切分。这就是 LangChain RecursiveCharacterTextSplitter 的方法，在实践中效果良好。

块大小比人们想象的更重要：

- 太小（64-128 词元）：每个块缺乏上下文。"上季度增长了 15%"在不知道"它"指什么的情况下毫无意义。
- 太大（2048+ 词元）：每个块涵盖多个主题，稀释了相关性。当你搜索收入数据时，你得到一个 10% 关于收入、90% 关于员工人数的块。
- 最佳点（256-512 词元）：足够的上下文以自包含，足够聚焦以相关。

大多数生产 RAG 系统使用 256-512 词元的块，带 50 词元重叠。Anthropic 的 RAG 指南推荐这个范围。

### 向量数据库

一旦有了嵌入，你需要一个地方来存储和搜索它们。可选方案：

| 数据库 | 类型 | 最适合 |
|--------|------|--------|
| FAISS | 库（进程内） | 原型设计，中小型数据集 |
| Chroma | 轻量级数据库 | 本地开发，小型部署 |
| Pinecone | 托管服务 | 无需运维开销的生产环境 |
| Weaviate | 开源数据库 | 自托管生产 |
| pgvector | Postgres 扩展 | 已在用 Postgres |
| Qdrant | 开源数据库 | 高性能自托管 |

对于本课程，我们构建一个简单的内存向量存储。它将向量存储在一个列表中，进行暴力余弦相似度搜索。这相当于带有扁平索引的 FAISS。在变慢之前，它可以扩展到大约 10 万个向量。生产系统使用像 HNSW 这样的近似最近邻算法来在毫秒内搜索数百万个向量。

### 完整流水线

```mermaid
graph TD
    subgraph "索引（离线）"
        D["文档"] --> C["分块"]
        C --> E["嵌入每个块"]
        E --> S["存储向量 + 文本"]
    end

    subgraph "查询（在线）"
        Q["用户查询"] --> QE["嵌入查询"]
        QE --> VS["向量搜索（top-k）"]
        VS --> P["用块构建提示词"]
        P --> LLM["LLM 生成答案"]
    end

    S -.->|"相同向量空间"| VS
```

索引阶段对每个文档运行一次（或在文档更新时运行）。查询阶段在每个用户请求时运行。在生产环境中，索引可能需要在数小时内处理数百万份文档。查询必须在不到一秒的时间内响应。

### 真实数字

大多数生产 RAG 系统使用这些参数：

- **k = 5 到 10** 个每次查询检索的块
- **块大小 = 256 到 512 词元**，带 50 词元重叠
- **上下文预算**：每次查询 2,500-5,000 词元的检索内容
- **总提示词**：约 8,000-16,000 词元（系统提示词 + 检索块 + 对话历史 + 用户查询）
- **嵌入维度**：384-3072，取决于模型
- **索引吞吐量**：使用 API 嵌入每秒 100-1,000 个文档
- **查询延迟**：检索 50-200ms，生成 500-3000ms

```figure
rag-chunking
```

## 构建

### 步骤 1：文档分块

```python
def chunk_text(text, chunk_size=200, overlap=50):
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks
```

### 步骤 2：TF-IDF 嵌入

我们构建一个简单的嵌入函数。TF-IDF（词频-逆文档频率）不是神经嵌入，但它以捕获词重要性的方式将文本转换为向量。文档中频繁出现的词获得更高的 TF。整个语料库中罕见的词获得更高的 IDF。乘积给出一个向量，其中重要的、有区分度的词具有高值。

```python
import math
from collections import Counter

def build_vocabulary(documents):
    vocab = set()
    for doc in documents:
        vocab.update(doc.lower().split())
    return sorted(vocab)

def compute_tf(text, vocab):
    words = text.lower().split()
    count = Counter(words)
    total = len(words)
    return [count.get(word, 0) / total for word in vocab]

def compute_idf(documents, vocab):
    n = len(documents)
    idf = []
    for word in vocab:
        doc_count = sum(1 for doc in documents if word in doc.lower().split())
        idf.append(math.log((n + 1) / (doc_count + 1)) + 1)
    return idf

def tfidf_embed(text, vocab, idf):
    tf = compute_tf(text, vocab)
    return [t * i for t, i in zip(tf, idf)]
```

### 步骤 3：余弦相似度搜索

```python
def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)

def search(query_embedding, stored_embeddings, top_k=5):
    scores = []
    for i, emb in enumerate(stored_embeddings):
        sim = cosine_similarity(query_embedding, emb)
        scores.append((i, sim))
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:top_k]
```

### 步骤 4：提示词构建

这就是 RAG 中"增强"发生的地方。取检索到的块，将它们格式化为提示词，并要求 LLM 根据提供的上下文来回答。

```python
def build_rag_prompt(query, retrieved_chunks):
    context = "\n\n---\n\n".join(
        f"[来源 {i+1}]\n{chunk}"
        for i, chunk in enumerate(retrieved_chunks)
    )
    return f"""请仅根据以下上下文回答问题。
如果上下文没有包含足够的信息，请说"我没有足够的信息来回答这个问题。"

上下文：
{context}

问题：{query}

答案："""
```

### 步骤 5：完整的 RAG 流水线

```python
class RAGPipeline:
    def __init__(self):
        self.chunks = []
        self.embeddings = []
        self.vocab = []
        self.idf = []

    def index(self, documents):
        all_chunks = []
        for doc in documents:
            all_chunks.extend(chunk_text(doc))
        self.chunks = all_chunks
        self.vocab = build_vocabulary(all_chunks)
        self.idf = compute_idf(all_chunks, self.vocab)
        self.embeddings = [
            tfidf_embed(chunk, self.vocab, self.idf)
            for chunk in all_chunks
        ]

    def query(self, question, top_k=5):
        query_emb = tfidf_embed(question, self.vocab, self.idf)
        results = search(query_emb, self.embeddings, top_k)
        retrieved = [(self.chunks[i], score) for i, score in results]
        prompt = build_rag_prompt(
            question, [chunk for chunk, _ in retrieved]
        )
        return prompt, retrieved
```

### 步骤 6：生成（模拟）

在生产中，这是你调用 LLM API 的地方。对于本课程，我们通过从检索到的上下文中提取最相关的句子来模拟生成。

```python
def simple_generate(prompt, retrieved_chunks):
    query_words = set(prompt.lower().split("问题：")[-1].split())
    best_sentence = ""
    best_score = 0
    for chunk in retrieved_chunks:
        for sentence in chunk.split("."):
            sentence = sentence.strip()
            if not sentence:
                continue
            words = set(sentence.lower().split())
            overlap = len(query_words & words)
            if overlap > best_score:
                best_score = overlap
                best_sentence = sentence
    return best_sentence if best_sentence else "我没有足够的信息。"
```

## 使用

使用真实的嵌入模型和 LLM，代码几乎不变：

```python
from openai import OpenAI

client = OpenAI()

def embed(text):
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding

def generate(prompt):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    return response.choices[0].message.content
```

或者使用 Anthropic：

```python
import anthropic

client = anthropic.Anthropic()

def generate(prompt):
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text
```

流水线是相同的。替换嵌入函数。替换生成函数。检索逻辑、分块、提示词构建——无论你使用哪些模型，所有这些都完全相同。

对于大规模向量存储，用合适的向量数据库替换暴力搜索：

```python
import chromadb

client = chromadb.Client()
collection = client.create_collection("my_docs")

collection.add(
    documents=chunks,
    ids=[f"chunk_{i}" for i in range(len(chunks))]
)

results = collection.query(
    query_texts=["退款政策是什么？"],
    n_results=5
)
```

Chroma 在内部处理嵌入（默认使用 all-MiniLM-L6-v2）并将向量存储在本地数据库中。相同的模式，不同的管道。

## 交付

本课程产出：
- `outputs/prompt-rag-architect.md` —— 用于为特定用例设计 RAG 系统的提示词
- `outputs/skill-rag-pipeline.md` —— 教智能体如何构建和调试 RAG 流水线的技能

## 练习

1. 将 TF-IDF 嵌入替换为简单的词袋方法（二进制：词存在为 1，不存在为 0）。在样本文档上比较检索质量。TF-IDF 应该更好，因为它对罕见词赋予更高权重。

2. 实验不同分块大小：对同一文档集尝试 50、100、200 和 500 词。对于每个大小，运行相同的 5 个查询，统计有多少在前 3 个结果中返回了相关块。找到检索质量达到峰值的甜点。

3. 为每个块添加元数据（源文档名称、块位置）。修改提示模板以包含来源归属，使 LLM 能够引用其来源。

4. 实现一个简单的评估：给定 10 个问答对，将每个问题通过 RAG 流水线运行，并测量有多少百分比的检索块包含答案。这就是 k 处的检索召回率。

5. 构建一个对话感知的 RAG 流水线：维护最近 3 轮对话的历史，并将其与检索到的块一起包含在提示词中。用跟进问题进行测试，如在询问定价后问"那企业套餐呢？"

## 关键术语

| 术语 | 通常说法 | 实际含义 |
|------|---------|---------|
| RAG | "能读你文档的 AI" | 检索相关文档，将其粘贴到提示词中，并生成基于这些文档的答案 |
| 嵌入 | "把文本转数字" | 文本的稠密向量表示，其中相似的含义产生相似的向量 |
| 向量数据库 | "AI 的搜索引擎" | 针对存储向量和按相似度查找最近邻进行优化的数据存储 |
| 分块 | "把文档切分成片段" | 将文档分解为较小的片段（通常为 256-512 词元），以便每个片段可以独立嵌入和检索 |
| 余弦相似度 | "两个向量有多相似" | 两个向量之间夹角的余弦；1 = 相同方向，0 = 正交，-1 = 相反 |
| Top-k 检索 | "获取 k 个最佳匹配" | 从向量库中返回与查询最相似的 k 个块 |
| 上下文窗口 | "LLM 能看到多少文本" | LLM 在单次请求中能处理的最大词元数；检索到的块必须适应此限制 |
| 增强生成 | "用给定的上下文回答" | 使用检索到的文档作为上下文（而非仅依赖训练知识）生成回复 |
| TF-IDF | "词重要性评分" | 词频乘以逆文档频率；根据词在语料库中的独特性加权 |
| 索引 | "为搜索准备文档" | 对文档进行分析、嵌入和存储的离线过程，以便在查询时可以搜索 |

## 进一步阅读

- Lewis 等人，"面向知识密集型 NLP 任务的检索增强生成"（2020）—— Facebook AI Research 的原始 RAG 论文，形式化了检索-生成模式
- Anthropic 的 RAG 文档（docs.anthropic.com）—— 关于块大小、提示词构建和评估的实践指南
- Pinecone 学习中心，"什么是 RAG？"—— 带有生产考量的 RAG 流水线清晰可视化解释
- Sentence-BERT：Reimers & Gurevych（2019）—— all-MiniLM 嵌入模型背后的论文，展示如何训练双编码器进行语义相似度
- [Karpukhin 等人，"开放域问答的稠密段落检索"（EMNLP 2020）](https://arxiv.org/abs/2004.04906) —— DPR 论文，证明稠密双编码器检索在开放域问答上击败 BM25，并为现代 RAG 检索器设定了模式
- [LlamaIndex 高层概念](https://docs.llamaindex.ai/en/stable/getting_started/concepts.html) —— 构建 RAG 流水线时需要了解的主要概念：数据加载器、节点解析器、索引、检索器、回复合成器
- [LangChain RAG 教程](https://python.langchain.com/docs/tutorials/rag/) —— 不同风格的编排器；可运行链视角下的相同检索-生成模式
