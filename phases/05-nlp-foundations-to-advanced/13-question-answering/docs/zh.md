# 问答系统

> 三个系统塑造了现代问答。抽取式找到答案片段。检索增强将答案扎根于文档中。生成式产生答案。每一个现代 AI 助手都是这三者的混合。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 11（机器翻译）、阶段 5 · 10（注意力机制）
**时间：** ~75 分钟

## 问题

用户输入"第一代 iPhone 是什么时候发布的？"期望得到"2007 年 6 月 29 日。"而不是"苹果的历史悠久而多样。"也不是孤零零的"2007"连个句子都没有。一个直接、有依据、正确的答案。

三种架构在过去十年中主导了问答。

- **抽取式问答。** 给定一个已知包含答案的段落和问题，找出答案片段在段落中的起始和结束索引。SQuAD 是标准基准数据集。
- **开放域问答。** 不预先给定段落。先检索相关段落，然后抽取或生成答案。这是今天每个 RAG 管道的基础。
- **生成式 / 闭书问答。** 大型语言模型从其参数化记忆中回答。无需检索。推理最快，事实可靠性最低。

2026 年的趋势是混合式：检索最佳的几个段落，然后提示生成模型以这些段落为基础回答。这就是 RAG，第 14 课深入覆盖了检索部分。本节课构建问答部分。

## 概念

![问答架构：抽取式、检索增强式、生成式](../assets/qa.svg)

**抽取式。** 用变压器（BERT 系列）一起编码问题和段落。训练两个预测答案起始和结束 token 索引的头部。损失是有效位置上的交叉熵。输出是段落中的一个片段。从不产生幻觉（按设计如此），也从不处理段落无法回答的问题（按设计如此）。

**检索增强式（RAG）。** 两个阶段。首先，检索器从语料库中找到 Top-k 个段落。其次，阅读器（抽取式或生成式）使用这些段落产生答案。检索器-阅读器分离使两者可以独立训练和评估。现代 RAG 通常在两者之间添加重排序器。

**生成式。** 仅解码器的 LLM（GPT、Claude、Llama）从学习到的权重中回答。没有检索步骤。在常识知识上表现优异，在罕见或近期事实上表现灾难。幻觉率与预训练数据中的事实频率呈负相关。

## 构建

### 步骤 1：使用预训练模型的抽取式问答

```python
from transformers import pipeline

qa = pipeline("question-answering", model="deepset/roberta-base-squad2")

passage = (
    "Apple Inc. released the first iPhone on June 29, 2007. "
    "The device was announced by Steve Jobs at Macworld in January 2007."
)
question = "When was the first iPhone released?"

answer = qa(question=question, context=passage)
print(answer)
```

```python
{'score': 0.98, 'start': 57, 'end': 70, 'answer': 'June 29, 2007'}
```

`deepset/roberta-base-squad2` 在 SQuAD 2.0 上训练，其中包含不可回答的问题。默认情况下，`question-answering` 管道即使模型的空值分数胜出时也会返回得分最高的片段——它*不会*自动返回空答案。要获得明确的"无答案"行为，请将 `handle_impossible_answer=True` 传递给管道调用：然后管道仅在空值分数超过每个片段分数时返回空答案。无论如何，始终检查 `score` 字段。

### 步骤 2：检索增强管道（草图）

```python
from sentence_transformers import SentenceTransformer
import numpy as np

encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

corpus = [
    "Apple Inc. released the first iPhone on June 29, 2007.",
    "Macworld 2007 featured the iPhone announcement by Steve Jobs.",
    "Android launched in 2008 as Google's mobile operating system.",
    "The first iPod was released in 2001.",
]
corpus_embeddings = encoder.encode(corpus, normalize_embeddings=True)


def retrieve(question, top_k=2):
    q_emb = encoder.encode([question], normalize_embeddings=True)
    sims = (corpus_embeddings @ q_emb.T).squeeze()
    order = np.argsort(-sims)[:top_k]
    return [corpus[i] for i in order]


def answer(question):
    passages = retrieve(question, top_k=2)
    combined = " ".join(passages)
    return qa(question=question, context=combined)


print(answer("When was the first iPhone released?"))
```

两阶段管道。密集检索器（Sentence-BERT）通过语义相似性找到相关段落。抽取式阅读器（RoBERTa-SQuAD）从合并的 Top 段落中提取答案片段。适用于小型语料库。对于百万级文档的语料库，使用 FAISS 或向量数据库。

### 步骤 3：带 RAG 的生成式问答

```python
def rag_generate(question, llm):
    passages = retrieve(question, top_k=3)
    prompt = f"""上下文：
{chr(10).join('- ' + p for p in passages)}

问题：{question}

仅使用上述上下文回答。如果上下文不包含答案，请说"我不知道。"
"""
    return llm(prompt)
```

提示模式很重要。明确告诉模型扎根于上下文，并在上下文不足时返回"我不知道"，与朴素提示相比可将幻觉率降低 40-60%。更精细的模式会添加引用、置信度分数和结构化提取。

### 步骤 4：反映真实世界的评估

SQuAD 使用**精确匹配（EM）**和**token 级别的 F1**。EM 是归一化后的严格匹配（小写、去除标点、移除冠词）——要么预测完全匹配，要么得 0 分。F1 通过预测和参考答案之间的 token 重叠计算，给予部分分数。两者都低估了改写："June 29, 2007"与"June 29th, 2007"通常 EM 得 0（序数打破了归一化），但由于重叠 token 仍能获得可观的 F1。

对于生产环境的问答：

- **答案准确率**（LLM 评判或人工评判，因为指标不捕捉语义等价性）。
- **引用准确率。** 引用的段落是否实际支持答案？通过生成引用与检索段落之间的字符串匹配自动检查很简单。
- **拒绝校准。** 当答案不在检索段落中时，系统是否正确地说"我不知道"？测量虚假置信率。
- **检索召回率。** 在评估阅读器之前，先测量检索器是否将正确的段落放入 Top-k。阅读器无法修复遗漏的段落。

### RAGAS：2026 年的生产评估框架

`RAGAS` 专门为 RAG 系统构建，是 2026 年的部署默认选择。它在四个维度上评分，无需黄金参考答案：

- **忠实度。** 答案中的每个声明是否来自检索到的上下文？通过基于 NLI 的蕴含关系测量。你的主要幻觉指标。
- **答案相关性。** 答案是否回答了问题？通过从答案生成假设性问题并与真实问题比较来测量。
- **上下文精度。** 检索到的块中有多少比例是实际相关的？低精度 = 提示中的噪声。
- **上下文召回率。** 检索到的集合是否包含所有必要信息？低召回率 = 阅读器无法成功。

无参考评分让你可以在无人工标注黄金答案的生产流量上评估。对于开放式问题，在顶层叠加 LLM-as-judge。

`pip install ragas`。接入你的检索器 + 阅读器。每次查询得到四个标量。监控回归。

## 使用

2026 年的技术栈。

| 用例 | 推荐 |
|---------|-------------|
| 给定段落，找答案片段 | `deepset/roberta-base-squad2` |
| 在固定语料库上，不接受闭书方式 | RAG：密集检索器 + LLM 阅读器 |
| 在文档存储上实时查询 | 带混合（BM25 + 密集）检索器 + 重排序器的 RAG（第 14 课） |
| 对话式问答（追问） | 带对话历史的 LLM + 每轮 RAG |
| 高事实性监管领域 | 在权威语料库上的抽取式问答；绝不单独使用生成式 |

抽取式问答在 2026 年不那么流行了，因为带 LLM 的 RAG 能处理更多情况。但它仍在需要逐字引用的场景中部署：法律研究、法规合规、审计工具。

## 产出

保存为 `outputs/skill-qa-architect.md`：

```markdown
---
name: qa-architect
description: 选择问答架构、检索策略和评估计划。
version: 1.0.0
phase: 5
lesson: 13
tags: [nlp, qa, rag]
---

给定需求（语料库大小、问题类型、事实性约束、延迟预算），输出：

1. 架构。抽取式、带抽取式阅读器的 RAG、带生成式阅读器的 RAG 或闭书 LLM。一句话理由。
2. 检索器。无、BM25、密集（命名编码器）或混合。
3. 阅读器。SQuAD 调优模型、命名 LLM 或"领域微调 DistilBERT"。
4. 评估。抽取式基准用 EM + F1；生产环境用答案准确率 + 引用准确率 + 拒绝校准。说明测量什么以及如何测量。

拒绝为监管或合规敏感问题提供闭书 LLM 答案。拒绝任何没有检索召回率基线的问答系统（不知道检索器是否正确找出段落就无法评估阅读器）。标记需要多跳推理的问题，指出需要专门的多跳检索器，如 HotpotQA 训练的系统。
```

## 练习

1. **（简单）** 在上述 10 篇维基百科段落上设置 SQuAD 抽取式管道。手动编写 10 个问题。测量答案正确的频率。如果段落和问题干净，你应该会看到 7-9 个正确。
2. **（中等）** 添加拒绝分类器。当 Top 检索分数低于阈值（比如余弦 0.3）时，返回"我不知道"而不是调用阅读器。在保留集上调优阈值。
3. **（困难）** 在你选择的 10,000 文档语料库上构建 RAG 管道。实现混合检索（BM25 + 密集）与 RRF 融合（见第 14 课）。测量有无混合步骤时的答案准确率。记录哪些问题类型受益最大。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| 抽取式 QA | 找答案片段 | 预测答案在给定段落中的起始和结束索引。 |
| 开放域 QA | 在语料库上的问答 | 不预先给定段落；必须检索再回答。 |
| RAG | 检索后生成 | 检索增强生成。检索器 + 阅读器管道。 |
| SQuAD | 标准基准 | 斯坦福问答数据集。EM + F1 指标。 |
| 幻觉 | 编造答案 | 阅读器输出不受检索上下文支持。 |
| 拒绝校准 | 知道何时闭嘴 | 系统在无法回答时正确地说"我不知道"。 |

## 延伸阅读

- [Rajpurkar et al. (2016). SQuAD: 100,000+ Questions for Machine Comprehension of Text](https://arxiv.org/abs/1606.05250) — 基准论文。
- [Karpukhin et al. (2020). Dense Passage Retrieval for Open-Domain QA](https://arxiv.org/abs/2004.04906) — DPR，问答的标准密集检索器。
- [Lewis et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — 命名 RAG 的论文。
- [Gao et al. (2023). Retrieval-Augmented Generation for Large Language Models: A Survey](https://arxiv.org/abs/2312.10997) — 全面的 RAG 综述。
