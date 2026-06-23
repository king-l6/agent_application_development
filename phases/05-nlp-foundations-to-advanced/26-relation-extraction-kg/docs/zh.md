# 关系抽取与知识图谱构建

> NER找到了实体。实体链接锚定了它们。关系抽取找到了它们之间的边。知识图谱就是节点、边及其来源的总和。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 06（命名实体识别），阶段 5 · 25（实体链接）
**时间：** ~60 分钟

## 问题

分析师读到："Tim Cook 在 2011 年成为苹果公司的 CEO。"四个事实：

- `(Tim Cook, 角色, CEO)`
- `(Tim Cook, 雇主, 苹果公司)`
- `(Tim Cook, 开始日期, 2011)`
- `(苹果公司, 类型, 组织)`

关系抽取（RE）将自由文本转化为结构化的三元组 `(主体, 关系, 客体)`。在整个语料库上聚合就构成了知识图谱。聚合后即可查询，你就有了支持 RAG、分析或合规审计的推理基础。

2026 年的问题：LLM 抽取关系时过于热情。它们会幻觉出源文本不支持的三元组。没有来源追溯，你无法区分真实三元组和貌似合理的虚构。2026 年的答案是 AEVS 风格的锚定与验证流水线。

## 概念

![文本 → 三元组 → 知识图谱](../assets/relation-extraction.svg)

**三元组形式。** `(主语实体, 关系类型, 宾语实体)`。关系来自封闭本体（Wikidata 属性、FIBO、UMLS）或开放集合（OpenIE 风格，无所不包）。

**三种抽取方法。**

1. **规则 / 模式匹配。** Hearst 模式："X 如 Y" → `(Y, 是A, X)`。加上手工编写的正则表达式。脆弱、精确、可解释。
2. **监督分类器。** 给定句子中的两个实体提及，从固定集合中预测关系。在 TACRED、ACE、KBP 上训练。2015-2022 年的标准方法。
3. **生成式 LLM。** 提示模型输出三元组。开箱即用。需要来源追溯，否则会幻觉出看起来合理的垃圾。

**AEVS（锚定-抽取-验证-补充，2026）。** 当前的幻觉缓解框架：

- **锚定。** 用精确位置识别每个实体跨度和关系短语跨度。
- **抽取。** 生成链接到锚定跨度的三元组。
- **验证。** 将每个三元组元素匹配回源文本；拒绝任何不受支持的内容。
- **补充。** 覆盖度检查确保没有锚定跨度被遗漏。

幻觉率大幅下降。需要更多计算，但可审计。

**开放 vs 封闭的权衡。**

- **封闭本体。** 固定的属性列表（如 Wikidata 的 11,000+ 属性）。可预测。可查询。难以发明。
- **开放信息抽取。** 任何动词短语都成为关系。高召回率。低精确率。难以查询。

生产知识图谱通常混合使用：开放 IE 用于发现，然后在合并到主图之前将关系规范化到封闭本体上。

## 动手实现

### 步骤 1：基于模式的抽取

```python
PATTERNS = [
    (r"(?P<s>[A-Z]\w+) (?:is|was) (?:a|an|the) (?P<o>[A-Z]?\w+)", "isA"),
    (r"(?P<s>[A-Z]\w+) (?:is|was) born in (?P<o>\w+)", "bornIn"),
    (r"(?P<s>[A-Z]\w+) works? (?:at|for) (?P<o>[A-Z]\w+)", "worksAt"),
    (r"(?P<s>[A-Z]\w+) founded (?P<o>[A-Z]\w+)", "founded"),
]
```

参见 `code/main.py` 中的完整玩具抽取器。Hearst 模式仍然部署在特定领域流水线中，因为它们可调试。

### 步骤 2：监督式关系分类

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

tok = AutoTokenizer.from_pretrained("Babelscape/rebel-large")
model = AutoModelForSequenceClassification.from_pretrained("Babelscape/rebel-large")

text = "Tim Cook was born in Alabama. He later became CEO of Apple."
encoded = tok(text, return_tensors="pt", truncation=True)
output = model.generate(**encoded, max_length=200)
triples = tok.batch_decode(output, skip_special_tokens=False)
```

REBEL 是一个序列到序列的关系抽取器：输入文本，输出三元组，已经使用 Wikidata 属性 ID。在远程监督数据上微调。标准的开源权重基线。

### 步骤 3：带锚定的 LLM 提示抽取

```python
prompt = f"""Extract (subject, relation, object) triples from the text.
For each triple, include the exact character span in the source text.

Text: {text}

Output JSON:
[{{"subject": {{"text": "...", "span": [start, end]}},
   "relation": "...",
   "object": {{"text": "...", "span": [start, end]}}}}, ...]

Only include triples fully supported by the text. No inference beyond what is stated.
"""
```

针对源文本验证每个返回的跨度。拒绝任何 `text[start:end] != triple_entity` 的内容。这是 AEVS"验证"步骤的最简形式。

### 步骤 4：规范化到封闭本体

```python
RELATION_MAP = {
    "is the CEO of": "P169",       # "chief executive officer"
    "was born in":   "P19",         # "place of birth"
    "founded":        "P112",       # "founded by" (inverted subject/object)
    "works at":       "P108",       # "employer"
}


def canonicalize(relation):
    rel_low = relation.lower().strip()
    if rel_low in RELATION_MAP:
        return RELATION_MAP[rel_low]
    return None   # drop unmapped open relations or route to manual review
```

规范化通常占工程工作量的 60-80%。为此做好预算。

### 步骤 5：构建一个小型图谱并查询

```python
triples = extract(text)
graph = {}
for s, r, o in triples:
    graph.setdefault(s, []).append((r, o))


def neighbors(node, relation=None):
    return [(r, o) for r, o in graph.get(node, []) if relation is None or r == relation]


print(neighbors("Tim Cook", relation="P108"))    # -> [(P108, Apple)]
```

这是每个基于知识图谱的 RAG 系统的基本原子。使用 RDF 三元组存储（Blazegraph、Virtuoso）、属性图（Neo4j）或向量增强图存储进行扩展。

## 陷阱

- **共指在 RE 之前。** "他创立了苹果"——RE 需要知道"他"是谁。先运行共指（第 24 课）。
- **实体规范化。** "Apple Inc" 和 "Apple" 必须解析到同一个节点。先做实体链接（第 25 课）。
- **幻觉三元组。** LLM 输出文本不支持的三元组。强制执行跨度验证。
- **关系规范化漂移。** 开放 IE 关系不一致（"出生于"、"来自"、"是……本地人"）。折叠为规范 ID，否则图谱无法查询。
- **时间错误。** "Tim Cook 是苹果公司的 CEO"——现在成立，2005 年不成立。许多关系有时间边界。使用限定符（Wikidata 的 `P580` 开始时间、`P582` 结束时间）。
- **领域不匹配。** REBEL 在维基百科上训练。法律、医学和科学文本通常需要领域微调的 RE 模型。

## 应用

2026 年的技术栈：

| 场景 | 选择 |
|-----------|------|
| 快速生产，通用领域 | REBEL 或带 Wikidata 规范化的 LlamaPred |
| 特定领域（生物医学、法律） | SciREX 风格领域微调 + 自定义本体 |
| LLM 提示，可审计输出 | AEVS 流水线：锚定 → 抽取 → 验证 → 补充 |
| 高容量新闻信息抽取 | 基于模式 + 监督混合方法 |
| 从头构建知识图谱 | 开放 IE + 人工规范化 |
| 时间知识图谱 | 带限定符（开始/结束时间，时间点）的抽取 |

集成模式：NER → 共指 → 实体链接 → 关系抽取 → 本体映射 → 图加载。每个阶段都是一个潜在的质量关卡。

## 交付

保存为 `outputs/skill-re-designer.md`：

```markdown
---
name: re-designer
description: 设计带有来源追溯和规范化功能的关系抽取流水线。
version: 1.0.0
phase: 5
lesson: 26
tags: [nlp, relation-extraction, knowledge-graph]
---

给定语料库（领域、语言、数据量）和下游用途（KG-RAG、分析、合规），输出：

1. 抽取器。基于模式 / 监督 / LLM / AEVS 混合。理由与精确率 vs 召回率目标相关。
2. 本体。封闭属性列表（Wikidata / 领域）或带规范化步骤的开放 IE。
3. 来源追溯。每个三元组携带源字符跨度 + 文档 ID。审计非商量。
4. 合并策略。规范的实体 ID + 关系 ID + 时间限定符；去重策略。
5. 评估。在 200 个人工标注的三元组上计算精确率 / 召回率 + LLM 抽取样本上的幻觉率。

拒绝任何没有跨度验证（源追溯）的基于 LLM 的 RE 流水线。拒绝任何在没有规范化的情况下将开放 IE 输出流入生产图谱的流水线。标记在时间有界关系（雇主、配偶、职位）上没有时间限定符的流水线。
```

## 练习

1. **简单。** 在 5 个新闻句子上运行 `code/main.py` 中的模式抽取器。手动检查精确率。
2. **中等。** 在相同句子上使用 REBEL（或一个小型 LLM）。比较三元组。哪个抽取器的精确率更高？召回率更高？
3. **困难。** 构建 AEVS 流水线：用 LLM 抽取 + 验证跨度与源文本对比。在 50 个维基百科风格的句子上测量验证步骤前后的幻觉率。

## 关键术语

| 术语 | 通常说法 | 实际含义 |
|------|-----------------|-----------------------|
| 三元组 | 主语-关系-宾语 | `(s, r, o)` 元组，是知识图谱的原子单位。 |
| 开放信息抽取 | 抽取一切 | 开放词汇的关系短语；高召回率，低精确率。 |
| 封闭本体 | 固定模式 | 有界的关系类型集合（Wikidata、UMLS、FIBO）。 |
| 规范化 | 统一标准化 | 将表面名称 / 关系映射到规范 ID。 |
| AEVS | 有根据的抽取 | 锚定-抽取-验证-补充流水线（2026）。 |
| 来源追溯 | 事实来源链接 | 每个三元组携带一个文档 ID + 字符跨度指向其来源。 |
| 远程监督 | 廉价标注 | 将文本与现有知识图谱对齐以创建训练数据。 |

## 延伸阅读

- [Mintz 等 (2009). Distant supervision for relation extraction without labeled data](https://www.aclweb.org/anthology/P09-1113.pdf) — 远程监督论文。
- [Huguet Cabot, Navigli (2021). REBEL: Relation Extraction By End-to-end Language generation](https://aclanthology.org/2021.findings-emnlp.204.pdf) — 序列到序列 RE 的主力模型。
- [Wadden 等 (2019). Entity, Relation, and Event Extraction with Contextualized Span Representations (DyGIE++)](https://arxiv.org/abs/1909.03546) — 联合信息抽取。
- [AEVS — Anchor-Extraction-Verification-Supplement framework](https://www.mdpi.com/2073-431X/15/3/178) — 2026 年幻觉缓解设计。
- [Wikidata SPARQL tutorial](https://www.wikidata.org/wiki/Wikidata:SPARQL_tutorial) — 规范图谱查询。
