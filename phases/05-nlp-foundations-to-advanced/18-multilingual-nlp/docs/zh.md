# 多语言 NLP

> 一个模型，100+ 种语言，对大多数语言零训练数据。跨语言迁移是 2020 年代实用的奇迹。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 04（GloVe、FastText、子词）、阶段 5 · 11（机器翻译）
**时间：** ~45 分钟

## 问题

英语有数十亿的标注样本。乌尔都语有几千。迈蒂利语几乎没有。任何服务全球受众的实用 NLP 系统都必须在那些没有任务特定训练数据的"长尾"语言上工作。

多语言模型通过同时在多种语言上训练一个模型来解决这个问题。共享表示让模型将在高资源语言中学到的技能迁移到低资源语言。在英语情感分析上微调模型，它在乌尔都语上开箱即用地产生出奇好的情感预测。这就是零样本跨语言迁移，它重塑了 NLP 向世界交付的方式。

本节课介绍其中的权衡、经典模型，以及一个让刚接触多语言工作的团队容易犯错的关键决定：为迁移选择源语言。

## 概念

![通过共享多语言嵌入空间进行跨语言迁移](../assets/multilingual.svg)

**共享词汇表。** 多语言模型使用在目标语言文本上训练的 SentencePiece 或 WordPiece 分词器。词汇表是共享的：相同的子词单元在相关语言中表示相同的语素。英语和意大利语中的 `anti-` 得到相同的 token。

**共享表示。** 一个在多种语言上预训练了掩码语言建模的变压器，学习到不同语言中语义相似的句子产生相似的隐藏状态。mBERT、XLM-R 和 NLLB 都表现出这一点。英语中"cat"的嵌入靠近法语中"chat"和西班牙语中"gato"的嵌入，完整句子嵌入也是如此。

**零样本迁移。** 在一种语言（通常是英语）的标注数据上微调模型。推理时，在模型支持的任何其他语言上运行。不需要目标语言的标注。对类型学相关的语言结果强，对远亲语言结果较弱。

**少样本微调。** 添加 100-500 个目标语言的标注示例。分类任务上的准确率跃升至英语基线的 95-98%。这是多语言 NLP 中成本效益最高的杠杆。

## 模型

| 模型 | 年份 | 覆盖范围 | 说明 |
|-------|------|----------|-------|
| mBERT | 2018 | 104 种语言 | 在 Wikipedia 上训练。第一个实用的多语言 LM。低资源上较弱。 |
| XLM-R | 2019 | 100 种语言 | 在 CommonCrawl 上训练（远大于 Wikipedia）。设定跨语言基线。Base 270M，Large 550M。 |
| XLM-V | 2023 | 100 种语言 | XLM-R 带 100 万 token 词汇表（vs 25 万）。低资源上更好。 |
| mT5 | 2020 | 101 种语言 | 用于多语言生成的 T5 架构。 |
| NLLB-200 | 2022 | 200 种语言 | Meta 的翻译模型；包括 55 种低资源语言。 |
| BLOOM | 2022 | 46 种语言 + 13 种编程语言 | 开放的 176B 多语言训练的 LLM。 |
| Aya-23 | 2024 | 23 种语言 | Cohere 的多语言 LLM。在阿拉伯语、印地语、斯瓦希里语上表现强劲。 |

根据用例选择。分类方面 XLM-R-base 是明智的默认选择。生成任务需要 mT5 或 NLLB，取决于翻译还是开放式生成。LLM 风格的工作与 Aya-23 或 Claude 配合显式的多语言提示。

## 源语言决策（2026 年研究）

大多数团队默认使用英语作为微调源语言。最近的研究（2026）显示这通常是错误的。

语言相似性比语料库原始大小更能预测迁移质量。对于斯拉夫语目标，德语或俄语通常优于英语。对于印度语目标，印地语通常优于英语。**qWALS** 相似性度量（2026，基于世界语言结构地图集特征）量化了这一点。**LANGRANK**（Lin et al., ACL 2019）是一个独立的、更早的方法，通过语言相似性、语料库大小和遗传相关性的组合对候选源语言进行排序。

实用规则：如果你的目标语言有一种类型学上接近的高资源亲属语言，先尝试在那种语言上微调，然后与英语微调结果比较。

## 构建

### 步骤 1：零样本跨语言分类

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

tok = AutoTokenizer.from_pretrained("joeddav/xlm-roberta-large-xnli")
model = AutoModelForSequenceClassification.from_pretrained("joeddav/xlm-roberta-large-xnli")


def classify(text, candidate_labels, hypothesis_template="This text is about {}."):
    scores = {}
    for label in candidate_labels:
        hypothesis = hypothesis_template.format(label)
        inputs = tok(text, hypothesis, return_tensors="pt", truncation=True)
        with torch.no_grad():
            logits = model(**inputs).logits[0]
        entail_score = torch.softmax(logits, dim=-1)[2].item()
        scores[label] = entail_score
    return dict(sorted(scores.items(), key=lambda x: -x[1]))


print(classify("I love this product!", ["positive", "negative", "neutral"]))
print(classify("मुझे यह उत्पाद पसंद है!", ["positive", "negative", "neutral"]))
print(classify("J'adore ce produit !", ["positive", "negative", "neutral"]))
```

一个模型，三种语言，相同 API。XLM-R 在 NLI 数据上训练，通过蕴含技巧很好地迁移到分类。

### 步骤 2：多语言嵌入空间

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

pairs = [
    ("The cat is sleeping.", "Le chat dort."),
    ("The cat is sleeping.", "El gato está durmiendo."),
    ("The cat is sleeping.", "Die Katze schläft."),
    ("The cat is sleeping.", "The dog is barking."),
]

for eng, other in pairs:
    emb_eng = model.encode([eng], normalize_embeddings=True)[0]
    emb_other = model.encode([other], normalize_embeddings=True)[0]
    sim = float(np.dot(emb_eng, emb_other))
    print(f"  {eng!r} <-> {other!r}: cos={sim:.3f}")
```

翻译句在嵌入空间中靠得很近。不同的英语句子距离更远。这就是跨语言检索、聚类和相似性得以实现的原因。

### 步骤 3：少样本微调策略

```python
from transformers import TrainingArguments, Trainer
from datasets import Dataset


def few_shot_finetune(base_model, base_tokenizer, examples):
    ds = Dataset.from_list(examples)

    def tokenize_fn(ex):
        out = base_tokenizer(ex["text"], truncation=True, max_length=128)
        out["labels"] = ex["label"]
        return out

    ds = ds.map(tokenize_fn)
    args = TrainingArguments(
        output_dir="out",
        per_device_train_batch_size=8,
        num_train_epochs=5,
        learning_rate=2e-5,
        save_strategy="no",
    )
    trainer = Trainer(model=base_model, args=args, train_dataset=ds)
    trainer.train()
    return base_model
```

对于 100-500 个目标语言示例，`num_train_epochs=5` 和 `learning_rate=2e-5` 是安全的默认值。较高的学习率会导致多语言对齐崩溃，你得到一个仅英语模型。

## 真正有效的评估

- **每种语言在保留集上的准确率。** 不聚合。聚合会隐藏长尾。
- **与单语言基线对比。** 对于有足够数据的语言，从头训练的单语言模型有时会击败多语言模型。测试。
- **实体级测试。** 目标语言中的命名实体。多语言模型对远离拉丁字母的文字通常分词较弱。
- **跨语言一致性。** 两种语言中的相同含义应产生相同的预测。测量差距。

## 使用

2026 年的技术栈：

| 任务 | 推荐 |
|-----|-------------|
| 分类，100 种语言 | XLM-R-base（~270M）微调版 |
| 零样本文本分类 | `joeddav/xlm-roberta-large-xnli` |
| 多语言句子嵌入 | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |
| 翻译，200 种语言 | `facebook/nllb-200-distilled-600M`（见第 11 课） |
| 生成式多语言 | Claude、GPT-4、Aya-23、mT5-XXL |
| 低资源语言 NLP | XLM-V 或在相关高资源语言上的领域特定微调 |

如果性能重要，始终为目标语言的微调留出预算。零样本是起点，不是最终答案。

### 分词税（低资源语言的问题所在）

多语言模型在所有语言间共享一个分词器。该词汇表在英语、法语、西班牙语、汉语、德语主导的语料库上训练。对于主导集之外的任何语言，三种税悄无声息地叠加：

- **繁殖率税。** 低资源语言文本每个词需要比英语多得多的 token。一句印地语句子可能需要英语等效句子的 3-5 倍 token。这 3-5 倍消耗了你的上下文窗口、训练效率和延迟。
- **变体恢复税。** 每个拼写错误、变音符号变体、Unicode 归一化不匹配或大小写变化，在嵌入空间中都会变成冷启动的不相关序列。模型无法学习母语者视为理所当然的正字法对应关系。
- **容量外溢税。** 税 1 和 2 消耗上下文位置、层深度和嵌入维度。留给实际推理的容量，系统性地少于高资源语言从同一模型得到的。

实际症状：你的模型在印地语上正常训练，损失曲线看起来正确，评估困惑度看起来合理，但生产输出微妙地出错。形态在句子中间崩溃。罕见的屈折形式无法恢复。**你无法通过数据规模来修复有问题的分词器。**

缓解措施：选择一个对你目标语言有良好覆盖率的分词器（XLM-V 的 100 万 token 词汇表是直接修复）；在训练前在保留的目标语言文本上验证分词繁殖率；对真正的长尾文字使用字节级回退（SentencePiece `byte_fallback=True`，GPT-2 风格的字节级 BPE），这样没有任何东西会是 OOV。

## 产出

保存为 `outputs/skill-multilingual-picker.md`：

```markdown
---
name: multilingual-picker
description: 为多语言 NLP 任务选择源语言、目标模型和评估计划。
version: 1.0.0
phase: 5
lesson: 18
tags: [nlp, multilingual, cross-lingual]
---

给定需求（目标语言、任务类型、每种语言可用的标注数据），输出：

1. 微调的源语言。默认英语；如果目标语言有类型学上接近的高资源语言，检查 LANGRANK 或 qWALS。
2. 基础模型。XLM-R（分类）、mT5（生成）、NLLB（翻译）、Aya-23（生成式 LLM）。
3. 少样本预算。如果可用，从 100-500 个目标语言示例开始。仅当标注不可行时使用零样本。
4. 评估计划。每种语言的准确率（不聚合）、跨语言一致性、非拉丁文字上的实体级 F1。

拒绝在没有每种语言评估的情况下部署多语言模型——聚合指标隐藏长尾失败。标记分词覆盖率低的文字（阿姆哈拉语、提格雷语、许多非洲语言）为需要使用带字节回退的模型（SentencePiece 带 byte_fallback=True，或字节级分词器如 GPT-2）。
```

## 练习

1. **（简单）** 在英语、法语、印地语和阿拉伯语中各 10 个句子上运行零样本分类管道。报告每种语言的准确率。你应该会看到法语很强、印地语尚可、阿拉伯语有波动。
2. **（中等）** 使用 `paraphrase-multilingual-MiniLM-L12-v2` 构建一个跨语言检索器，在一个小型混合语言语料库上运行。用英语查询，检索任何语言中的文档。测量 recall@5。
3. **（困难）** 比较英语源和印地语源微调在印地语分类任务上的效果。两种方案下都使用 500 个目标语言示例进行少样本微调。报告哪种源语言产生更好的印地语准确率以及高出多少。这是 LANGRANK 论文的微型版本。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| 多语言模型 | 一个模型，多种语言 | 跨语言共享词汇表和参数。 |
| 跨语言迁移 | 用一种语言训练，用另一种语言运行 | 在源语言上微调，在目标语言上评估，无需目标语言标注。 |
| 零样本 | 无目标语言标注 | 无需在目标语言上微调的迁移。 |
| 少样本 | 少量目标语言标注 | 用于微调的 100-500 个目标语言示例。 |
| mBERT | 第一个多语言 LM | 在 Wikipedia 上预训练的 104 语言 BERT。 |
| XLM-R | 标准跨语言基线 | 在 CommonCrawl 上预训练的 100 语言 RoBERTa。 |
| NLLB | Meta 的 200 语言 MT | No Language Left Behind。包括 55 种低资源语言。 |

## 延伸阅读

- [Conneau et al. (2019). Unsupervised Cross-lingual Representation Learning at Scale](https://arxiv.org/abs/1911.02116) — XLM-R 论文。
- [Pires, Schlinger, Garrette (2019). How Multilingual is Multilingual BERT?](https://arxiv.org/abs/1906.01502) — 开启跨语言迁移研究线的分析论文。
- [Costa-jussà et al. (2022). No Language Left Behind](https://arxiv.org/abs/2207.04672) — NLLB-200 论文。
- [Üstün et al. (2024). Aya Model: An Instruction Finetuned Open-Access Multilingual Language Model](https://arxiv.org/abs/2402.07827) — Aya，Cohere 的多语言 LLM。
- [Language Similarity Predicts Cross-Lingual Transfer Learning Performance (2026)](https://www.mdpi.com/2504-4990/8/3/65) — qWALS / LANGRANK 源语言论文。
