# 自然语言推理 —— 文本蕴含

> "t 蕴含 h" 意味着阅读 t 的人会得出 h 为真的结论。NLI 是预测蕴含/矛盾/中立的任务。表面看来很平淡，但在生产中却是承重结构。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 05（情感分析），阶段 5 · 13（问答）
**时间：** ~60 分钟

## 问题

你构建了一个摘要生成器。它产生了一份摘要。你如何知道摘要不包含幻觉？

你构建了一个聊天机器人。它回答了"是"。你如何知道这个答案得到检索段落支持？

你需要按主题分类 10,000 篇新闻文章。你没有训练标签。你能重用模型吗？

这三个问题都归结为自然语言推理。NLI 问：给定前提 `t` 和假设 `h`，`h` 是否被 `t` 蕴含、矛盾或中立（无关）？

- **幻觉检查：** `t` = 源文档，`h` = 摘要中的声明。不是蕴含 = 幻觉。
- **有据可依的问答：** `t` = 检索到的段落，`h` = 生成的答案。不是蕴含 = 捏造。
- **零样本分类：** `t` = 文档，`h` = 表述化的标签（"这是关于体育的"）。蕴含 = 预测的标签。

一个任务，三个生产用途。这就是为什么每个 RAG 评估框架都内置了一个 NLI 模型。

## 概念

![NLI：三路分类，前提 vs 假设](../assets/nli.svg)

**三个标签。**

- **蕴含。** `t` → `h`。"猫在垫子上"蕴含"有一只猫。"
- **矛盾。** `t` → ¬`h`。"猫在垫子上"矛盾"没有猫。"
- **中立。** 无法推断。"猫在垫子上"对"猫饿了"是中立的。

**不是逻辑蕴含。** NLI 是*自然*语言推理 —— 典型人类读者会推断什么，而不是严格的逻辑。"John walked his dog" 在 NLI 中蕴含 "John has a dog"，但严格的一阶逻辑只有在你公理化"拥有"关系时才承认这一点。

**数据集。**

- **SNLI**（2015 年）。57 万个人工标注对，以图片说明为前提。领域狭窄。
- **MultiNLI**（2017 年）。涵盖 10 种文体、43.3 万对。2026 年的标准训练语料。
- **ANLI**（2019 年）。对抗性 NLI。人类专门编写了旨在破坏现有模型的例子。更难。
- **DocNLI、ConTRoL**（2020-21 年）。文档长度前提。测试多跳和长距离推理。

**架构。** Transformer 编码器（BERT、RoBERTa、DeBERTa）读取 `[CLS] premise [SEP] hypothesis [SEP]`。`[CLS]` 表示送入三路 softmax。在 MNLI 上训练，在留出基准上评估，在分布内配对上可获得 90%+ 的准确率。

**通过 NLI 实现零样本。** 给定一个文档和候选标签，将每个标签转化为一个假设（"这段文字是关于体育的"）。计算每个的蕴含概率。选择最大的。这是 Hugging Face 的 `zero-shot-classification` 管道的底层机制。

## 动手构建

### 步骤 1：运行预训练的 NLI 模型

```python
from transformers import pipeline

nli = pipeline("text-classification",
               model="facebook/bart-large-mnli",
               top_k=None)  # 返回所有标签；替代已弃用的 return_all_scores=True

premise = "The cat is sleeping on the couch."
hypothesis = "There is a cat in the room."

result = nli({"text": premise, "text_pair": hypothesis})[0]
print(result)
# [{'label': 'entailment', 'score': 0.97},
#  {'label': 'neutral', 'score': 0.02},
#  {'label': 'contradiction', 'score': 0.01}]
```

对于生产级 NLI，`facebook/bart-large-mnli` 和 `microsoft/deberta-v3-large-mnli` 是开源默认选择。DeBERTa-v3 在排行榜上领先。

### 步骤 2：零样本分类

```python
zs = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")

text = "The stock market rallied after the central bank cut interest rates."
labels = ["finance", "sports", "politics", "technology"]

result = zs(text, candidate_labels=labels)
print(result)
# {'labels': ['finance', 'politics', 'technology', 'sports'],
#  'scores': [0.92, 0.05, 0.02, 0.01]}
```

默认模板是 "This example is about {label}。"。使用 `hypothesis_template` 自定义。不需要训练数据。不需要微调。开箱即用。

### 步骤 3：RAG 的忠实性检查

```python
def is_faithful(answer, context, threshold=0.5):
    result = nli({"text": context, "text_pair": answer})[0]
    entail = next(s for s in result if s["label"] == "entailment")
    return entail["score"] > threshold
```

这是 RAGAS 忠实性的核心。将生成的答案拆分为原子声明。对照检索到的上下文检查每个声明。报告蕴含的比例。

### 步骤 4：手写 NLI 分类器（概念性）

参见 `code/main.py` 中仅使用 stdlib 的玩具实现：通过词汇重叠 + 否定检测来比较前提和假设。无法与 Transformer 模型竞争 —— 但它展示了任务的形式：两个文本输入，三路标签输出，损失 = 对 `{entail, contradict, neutral}` 的交叉熵。

## 陷阱

- **仅假设的捷径。** 模型仅从假设本身就能以约 60% 的准确率预测 SNLI 标签，因为 "not"、"nobody"、"never" 与矛盾相关。检测标签泄漏的强基线。
- **词汇重叠启发式。** 子序列启发式（"每个子序列都被蕴含"）能通过 SNLI，但在 HANS/ANLI 上失败。使用对抗性基准。
- **文档长度退化。** 单句 NLI 模型在文档长度前提上下降 20+ F1。长上下文使用 DocNLI 训练的模型。
- **零样本模板敏感性。** "This example is about {label}" vs "{label}" vs "The topic is {label}" 可以产生 10+ 个百分点的准确度波动。调整模板。
- **领域不匹配。** MNLI 在通用英语上训练。法律、医学和科学文本需要领域特定的 NLI 模型（如 SciNLI、MedNLI）。

## 场景应用

2026 年的技术选择：

| 用例 | 模型 |
|---------|-------|
| 通用 NLI | `microsoft/deberta-v3-large-mnli` |
| 快速 / 边缘设备 | `cross-encoder/nli-deberta-v3-base` |
| 零样本分类（轻量级） | `facebook/bart-large-mnli` |
| 文档级 NLI | `MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli` |
| 多语言 | `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli` |
| RAG 中的幻觉检测 | RAGAS / DeepEval 内的 NLI 层 |

2026 年的元模式：NLI 是文本理解的万能胶。每当你需要知道"A 支持 B 吗？"或"A 与 B 矛盾吗？"——在再次调用 LLM 之前，先使用 NLI。

## 交付物

保存为 `outputs/skill-nli-picker.zh.md`：

```markdown
---
name: nli-picker
description: 为分类/忠实性/零样本任务选择 NLI 模型、标签模板和评估方案。
version: 1.0.0
phase: 5
lesson: 21
tags: [nlp, nli, zero-shot]
---

给定一个用例（忠实性检查、零样本分类、文档级推理），输出：

1. 模型。命名的 NLI 检查点。理由与领域、长度、语言相关。
2. 模板（如果是零样本）。表述化模式。示例。
3. 阈值。决策规则的蕴含截断值。基于校准的理由。
4. 评估。在留出标注集上的准确率、仅假设基线、对抗性子集。

拒绝在未经 100 个示例标注合理性检查的情况下交付零样本分类。拒绝在文档长度前提上使用句子级 NLI 模型。标记任何声称 NLI 能解决幻觉的说法 —— 它能减少幻觉，但不能消除幻觉。
```

## 练习

1. **简单。** 在 20 个手工制作的（前提、假设、标签）三元组上运行 `facebook/bart-large-mnli`，覆盖所有三个类别。测量准确率。添加对抗性"子序列启发式"陷阱（"I did not eat the cake" vs "I ate the cake"），看看它是否会失败。
2. **中等。** 在 100 条 AG News 标题上比较零样本模板 `"This text is about {label}"` 与 `"The topic is {label}"` 和 `"{label}"`。报告准确率波动。
3. **困难。** 构建一个 RAG 忠实性检查器：原子声明分解 + 每个声明的 NLI。在带有黄金上下文的 50 个 RAG 生成答案上评估。与人工标签相比，测量假阳性和假阴性率。

## 关键术语

| 术语 | 人们说 | 实际含义 |
|------|-----------------|-----------------------|
| NLI | 自然语言推理 | 前提-假设关系的三路分类。 |
| RTE | 识别文本蕴含 | NLI 的旧名称；同一任务。 |
| 蕴含 | "t 意味着 h" | 典型读者会认为给定 t 则 h 为真。 |
| 矛盾 | "t 排除 h" | 典型读者会认为给定 t 则 h 为假。 |
| 中立 | "未确定" | 无法从 t 推断出 h。 |
| 零样本分类 | NLI 作为分类器 | 将标签表述为假设，选择最大蕴含值。 |
| 忠实性 | 答案是否有依据？ | 对（检索到的上下文，生成的答案）进行 NLI。 |

## 延伸阅读

- [Bowman et al. (2015). A large annotated corpus for learning natural language inference](https://arxiv.org/abs/1508.05326) — SNLI。
- [Williams, Nangia, Bowman (2017). A Broad-Coverage Challenge Corpus for Sentence Understanding through Inference](https://arxiv.org/abs/1704.05426) — MultiNLI。
- [Nie et al. (2019). Adversarial NLI](https://arxiv.org/abs/1910.14599) — ANLI 基准。
- [Yin, Hay, Roth (2019). Benchmarking Zero-shot Text Classification](https://arxiv.org/abs/1909.00161) — NLI 作为分类器。
- [He et al. (2021). DeBERTa: Decoding-enhanced BERT with Disentangled Attention](https://arxiv.org/abs/2006.03654) — 2026 年 NLI 的主力模型。
