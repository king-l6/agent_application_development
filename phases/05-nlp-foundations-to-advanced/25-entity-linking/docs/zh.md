# 实体链接与消歧

> NER 找到了"Paris"。实体链接决定：是法国巴黎？帕丽斯·希尔顿？得克萨斯州巴黎？还是（特洛伊王子）帕里斯？没有链接，你的知识图谱就一直模棱两可。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 06（命名实体识别），阶段 5 · 24（共指消解）
**时间：** ~60 分钟

## 问题

一个句子写着："Jordan 击败了媒体。"你的 NER 将"Jordan"标记为 PERSON。好。但是*哪个* Jordan？

- 迈克尔·乔丹（篮球）？
- 迈克尔·B·乔丹（演员）？
- 迈克尔·I·乔丹（伯克利 ML 教授——没错，这种混淆在 ML 论文中真实存在）？
- 约旦（国家）？
- Jordan（希伯来语名字）？

实体链接（EL）将每个提及解析到知识库中的唯一条目：维基数据、维基百科、DBpedia 或你的领域知识库。两个子任务：

1. **候选生成。** 给定"Jordan"，哪些 KB 条目是合理的？
2. **消歧。** 给定上下文，哪个候选是正确的？

两个步骤都是可学习的。两者都有基准测试。组合流水线已经稳定了十年——变化的是消歧器的质量。

## 概念

![实体链接流水线：提及 → 候选 → 消歧后的实体](../assets/entity-linking.svg)

**候选生成。** 给定提及的表面形式（"Jordan"），在别名索引中查找候选。维基百科别名词典覆盖大多数命名实体："JFK" → 约翰·F·肯尼迪、杰奎琳·肯尼迪、JFK 机场、《JFK》（电影）。典型索引每次提及返回 10-30 个候选。

**消歧：三种方法。**

1. **先验 + 上下文（Milne & Witten, 2008）。** `P(实体 | 提及) × 上下文相似度(实体, 文本)`。效果好，速度快，无需训练。
2. **基于嵌入（ESS / REL / Blink）。** 编码提及 + 上下文。编码每个候选的描述。选取最大余弦相似度。2020-2024 年的默认方法。
3. **生成式（GENRE, 2021；基于 LLM, 2023+）。** 逐 token 解码实体的规范名称。约束到有效实体名称的字典树，确保输出是有效的 KB ID。

**端到端 vs 流水线。** 现代模型（ELQ、BLINK、ExtEnD、GENRE）在一次传递中完成 NER + 候选生成 + 消歧。流水线系统在生产中仍然占主导地位，因为你可以替换组件。

### 两个测量指标

- **提及召回率（候选生成）。** 正确的 KB 条目出现在候选列表中的黄金提及的比例。整个流水线的下限。
- **消歧准确率 / F1。** 给定正确的候选，top-1 正确的频率。

始终报告两者。一个在 80% 候选召回率上有 99% 消歧准确率的系统，实际上是一个 80% 的流水线。

## 动手实现

### 步骤 1：从维基百科重定向构建别名索引

```python
alias_to_entities = {
    "jordan": ["Q41421 (Michael Jordan)", "Q810 (Jordan, country)", "Q254110 (Michael B. Jordan)"],
    "paris":  ["Q90 (Paris, France)", "Q663094 (Paris, Texas)", "Q55411 (Paris Hilton)"],
    "apple":  ["Q312 (Apple Inc.)", "Q89 (apple, fruit)"],
}
```

维基百科别名数据：约 1800 万个（别名，实体）对。从维基数据转储下载。存储为倒排索引。

### 步骤 2：基于上下文的消歧

```python
def disambiguate(mention, context, alias_index, entity_desc):
    candidates = alias_index.get(mention.lower(), [])
    if not candidates:
        return None, 0.0
    context_words = set(tokenize(context))
    best, best_score = None, -1
    for entity_id in candidates:
        desc_words = set(tokenize(entity_desc[entity_id]))
        union = len(context_words | desc_words)
        score = len(context_words & desc_words) / union if union else 0.0
        if score > best_score:
            best, best_score = entity_id, score
    return best, best_score
```

Jaccard 重叠只是一个玩具示例。替换为嵌入上的余弦相似度（参见 `code/main.py` 步骤 2 中的 transformer 版本）。

### 步骤 3：基于嵌入的消歧（BLINK 风格）

```python
from sentence_transformers import SentenceTransformer
encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

def embed_mention(text, mention_span):
    start, end = mention_span
    marked = f"{text[:start]} [MENTION] {text[start:end]} [/MENTION] {text[end:]}"
    return encoder.encode([marked], normalize_embeddings=True)[0]

def embed_entity(entity_id, description):
    return encoder.encode([f"{entity_id}: {description}"], normalize_embeddings=True)[0]
```

在索引时，一次嵌入每个 KB 实体。在查询时，一次嵌入提及 + 上下文，与候选池做点积，选取最大值。

### 步骤 4：生成式实体链接（概念）

GENRE 逐字符解码实体的维基百科标题。受约束的解码（参见第 20 课）确保只能输出有效的标题。与 KB 支持的字典树紧密集成。现代的继承者是 REL-GEN 和带有结构化输出的 LLM 提示 EL。

```python
prompt = f"""Text: {text}
Mention: {mention}
List the best Wikipedia title for this mention.
Respond with JSON: {{"title": "..."}}"""
```

结合白名单（Outlines `choice`），这是 2026 年最容易部署的 EL 流水线。

### 步骤 5：在 AIDA-CoNLL 上评估

AIDA-CoNLL 是标准的 EL 基准：1,393 篇路透社文章，34,000 个提及，维基百科实体。报告知识库内准确率（`P@1`）和知识库外 NIL 检测率。

## 陷阱

- **NIL 处理。** 有些提及不在知识库中（新兴实体、小众人物）。系统必须预测 NIL 而不是猜测错误实体。单独测量。
- **提及边界错误。** 上游 NER 遗漏部分跨度（"Bank of America" 只被标注为 "Bank"）。EL 召回率下降。
- **流行度偏差。** 训练过的系统过度预测频繁实体。ML 论文中提到的"Michael I. Jordan"常常链接到篮球明星乔丹。
- **跨语言 EL。** 将中文文本中的提及映射到英文维基百科实体。需要多语言编码器或翻译步骤。
- **知识库过时。** 新公司、新事件、新人物不在去年的维基百科转储中。生产流水线需要更新循环。

## 应用

2026 年的技术栈：

| 场景 | 选择 |
|-----------|------|
| 通用英文 + 维基百科 | BLINK 或 REL |
| 跨语言，知识库 = 维基百科 | mGENRE |
| LLM 友好，少量提及/天 | 用候选列表提示 Claude/GPT-4 + 受约束 JSON |
| 特定领域知识库（医疗、法律） | 定制 BERT + 知识库感知检索 + 在领域 AIDA 风格数据集上微调 |
| 极低延迟 | 仅精确匹配先验（Milne-Witten 基线） |
| 研究最新水平 | GENRE / ExtEnD / 生成式 LLM-EL |

2026 年投产的生产模式：NER → 共指 → 对每个提及做 EL → 将簇折叠为每个簇一个规范实体。输出：文档中每个实体一个 KB ID，而不是每个提及一个。

## 交付

保存为 `outputs/skill-entity-linker.md`：

```markdown
---
name: entity-linker
description: 设计实体链接流水线 — 知识库、候选生成器、消歧器、评估。
version: 1.0.0
phase: 5
lesson: 25
tags: [nlp, entity-linking, knowledge-graph]
---

给定一个用例（领域知识库、语言、数据量、延迟预算），输出：

1. 知识库。Wikidata / Wikipedia / 自定义知识库。版本日期。刷新频率。
2. 候选生成器。别名索引、嵌入或混合方法。目标提及召回率 @ K。
3. 消歧器。先验 + 上下文、基于嵌入、生成式或 LLM 提示。
4. NIL 策略。最高分阈值、分类器或显式 NIL 候选。
5. 评估。在留出集上计算提及召回率 @ 30、top-1 准确率、NIL 检测 F1。

拒绝任何没有提及召回率基线的 EL 流水线（不了解候选生成是否找到了正确实体，就无法评估消歧器）。拒绝任何使用 LLM 提示 EL 但没有受约束输出到有效 KB ID 的流水线。标记流行度偏差影响小众实体（如名称冲突）而未进行领域微调的系统。
```

## 练习

1. **简单。** 在 `code/main.py` 中实现先验+上下文消歧器，处理 10 个有歧义的提及（Paris、Jordan、Apple）。手动标注正确实体。测量准确率。
2. **中等。** 使用句子 transformer 编码 50 个有歧义的提及。嵌入每个候选的描述。比较基于嵌入的消歧与 Jaccard 上下文重叠的效果。
3. **困难。** 构建一个 1k 实体的领域知识库（如你公司的员工 + 产品）。实现端到端的 NER + EL。在 100 个留出句子上测量精确率和召回率。

## 关键术语

| 术语 | 通常说法 | 实际含义 |
|------|-----------------|-----------------------|
| 实体链接（EL） | 链接到维基百科 | 将提及映射到唯一的 KB 条目。 |
| 候选生成 | 可能是谁？ | 返回一个提及的合理 KB 条目候选列表。 |
| 消歧 | 选出正确的 | 使用上下文对候选进行评分，选出胜者。 |
| 别名索引 | 查找表 | 从表面形式到候选实体的映射。 |
| NIL | 不在知识库中 | 明确预测没有匹配的 KB 条目。 |
| KB | 知识库 | Wikidata、Wikipedia、DBpedia 或你的领域知识库。 |
| AIDA-CoNLL | 基准测试 | 1,393 篇路透社文章，带有黄金标准实体链接。 |

## 延伸阅读

- [Milne, Witten (2008). Learning to Link with Wikipedia](https://www.cs.waikato.ac.nz/~ihw/papers/08-DM-IHW-LearningToLinkWithWikipedia.pdf) — 基础性的先验+上下文方法。
- [Wu 等 (2020). Zero-shot Entity Linking with Dense Entity Retrieval (BLINK)](https://arxiv.org/abs/1911.03814) — 基于嵌入的主力方法。
- [De Cao 等 (2021). Autoregressive Entity Retrieval (GENRE)](https://arxiv.org/abs/2010.00904) — 带约束解码的生成式 EL。
- [Hoffart 等 (2011). Robust Disambiguation of Named Entities in Text (AIDA)](https://www.aclweb.org/anthology/D11-1072.pdf) — 基准论文。
- [REL: An Entity Linker Standing on the Shoulders of Giants (2020)](https://arxiv.org/abs/2006.01969) — 开源生产栈。
