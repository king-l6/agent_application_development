# 命名实体识别

> 提取出名称。听起来简单，直到你遇到模糊的边界、嵌套实体和领域行话。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 02（BoW + TF-IDF），阶段 5 · 03（词嵌入）
**时间：** ~75 分钟

## 问题

"Apple sued Google over its iPhone search deal in the US." 五个实体：Apple（ORG）、Google（ORG）、iPhone（PRODUCT）、search deal（可能）、US（GPE）。一个好的 NER 系统能提取所有实体并给出正确的类型。一个差的 NER 系统会漏掉 iPhone，把 Apple（公司）与 Apple（水果）混淆，并将 "US" 标注为 PERSON。

NER 是每个结构化提取流程背后的主力。简历解析、合规日志扫描、医疗记录匿名化、搜索查询理解、聊天机器人响应的 grounding、法律合同提取。你从未直接看到它，但你始终依赖它。

本课程从经典路径（基于规则、HMM、CRF）走向现代路径（BiLSTM-CRF，然后是 transformer）。每一步都解决了前一步的特定局限性。这个模式本身就是课程内容。

## 概念

**BIO 标注**（或 BILOU）将实体提取转化为序列标注问题。每个词元标注为 `B-TYPE`（实体开始）、`I-TYPE`（实体内部）或 `O`（实体外部）。

```
Apple    B-ORG
sued     O
Google   B-ORG
over     O
its      O
iPhone   B-PRODUCT
search   O
deal     O
in       O
the      O
US       B-GPE
.        O
```

多词元实体链：`New B-GPE`、`York I-GPE`、`City I-GPE`。一个理解 BIO 的模型可以提取任意跨度的实体。

架构演进：

- **基于规则。** 正则表达式 + 地名词典查找。对已知实体精确率高，对新实体覆盖率为零。
- **HMM。** 隐马尔可夫模型。给定标签下词元的发射概率，标签到标签的转移概率。Viterbi 解码。在标注数据上训练。
- **CRF。** 条件随机场。类似于 HMM 但具有判别性，因此你可以混合任意特征（词形、大小写、相邻词）。在 2026 年仍然是低资源部署的经典生产主力。
- **BiLSTM-CRF。** 用神经特征替代手工特征。LSTM 双向读取句子，顶部的 CRF 层强制一致的标签序列。
- **基于 Transformer。** 使用词元分类头部微调 BERT。准确率最高。计算量最大。

```figure
ner-bio-tagging
```

## 动手构建

### 第 1 步：BIO 标注辅助函数

```python
def spans_to_bio(tokens, spans):
    labels = ["O"] * len(tokens)
    for start, end, label in spans:
        labels[start] = f"B-{label}"
        for i in range(start + 1, end):
            labels[i] = f"I-{label}"
    return labels


def bio_to_spans(tokens, labels):
    spans = []
    current = None
    for i, label in enumerate(labels):
        if label.startswith("B-"):
            if current:
                spans.append(current)
            current = (i, i + 1, label[2:])
        elif label.startswith("I-") and current and current[2] == label[2:]:
            current = (current[0], i + 1, current[2])
        else:
            if current:
                spans.append(current)
                current = None
    if current:
        spans.append(current)
    return spans
```

```python
>>> tokens = ["Apple", "sued", "Google", "over", "iPhone", "sales", "."]
>>> labels = ["B-ORG", "O", "B-ORG", "O", "B-PRODUCT", "O", "O"]
>>> bio_to_spans(tokens, labels)
[(0, 1, 'ORG'), (2, 3, 'ORG'), (4, 5, 'PRODUCT')]
```

### 第 2 步：手工特征

对于经典（非神经）NER，特征就是一切。有用的特征：

```python
def token_features(token, prev_token, next_token):
    return {
        "lower": token.lower(),
        "is_upper": token.isupper(),
        "is_title": token.istitle(),
        "has_digit": any(c.isdigit() for c in token),
        "suffix_3": token[-3:].lower(),
        "shape": word_shape(token),
        "prev_lower": prev_token.lower() if prev_token else "<BOS>",
        "next_lower": next_token.lower() if next_token else "<EOS>",
    }


def word_shape(word):
    out = []
    for c in word:
        if c.isupper():
            out.append("X")
        elif c.islower():
            out.append("x")
        elif c.isdigit():
            out.append("d")
        else:
            out.append(c)
    return "".join(out)
```

`word_shape("iPhone")` 返回 `xXxxxx`。`word_shape("USA-2024")` 返回 `XXX-dddd`。大小写模式对专有名词是强信号。

### 第 3 步：简单的基于规则 + 词典基线

```python
ORG_GAZETTEER = {"Apple", "Google", "Microsoft", "OpenAI", "Meta", "Amazon", "Netflix"}
GPE_GAZETTEER = {"US", "USA", "UK", "India", "Germany", "France"}
PRODUCT_GAZETTEER = {"iPhone", "Android", "Windows", "ChatGPT", "Claude"}


def rule_based_ner(tokens):
    labels = []
    for token in tokens:
        if token in ORG_GAZETTEER:
            labels.append("B-ORG")
        elif token in GPE_GAZETTEER:
            labels.append("B-GPE")
        elif token in PRODUCT_GAZETTEER:
            labels.append("B-PRODUCT")
        else:
            labels.append("O")
    return labels
```

生产级地名词典有数百万个条目，从 Wikipedia 和 DBpedia 抓取。覆盖率好。歧义消除（`Apple` 公司 vs 水果）则很差。这就是统计模型胜出的原因。

### 第 4 步：CRF 步骤（草图，不是完整实现）

在没有概率论基础的情况下用 50 行代码从头实现完整的 CRF 没有启发性。改用 `sklearn-crfsuite`：

```python
import sklearn_crfsuite

def to_features(tokens):
    out = []
    for i, tok in enumerate(tokens):
        prev = tokens[i - 1] if i > 0 else ""
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        out.append({
            "word.lower()": tok.lower(),
            "word.isupper()": tok.isupper(),
            "word.istitle()": tok.istitle(),
            "word.isdigit()": tok.isdigit(),
            "word.suffix3": tok[-3:].lower(),
            "word.shape": word_shape(tok),
            "prev.word.lower()": prev.lower(),
            "next.word.lower()": nxt.lower(),
            "BOS": i == 0,
            "EOS": i == len(tokens) - 1,
        })
    return out


crf = sklearn_crfsuite.CRF(algorithm="lbfgs", c1=0.1, c2=0.1, max_iterations=100, all_possible_transitions=True)
X_train = [to_features(s) for s in sentences_tokenized]
crf.fit(X_train, bio_labels_train)
```

`c1` 和 `c2` 是 L1 和 L2 正则化。`all_possible_transitions=True` 让模型学习非法序列（例如，`O` 后的 `I-ORG`）是不可能的，这就是 CRF 无需你编写约束就能强制执行 BIO 一致性的方式。

### 第 5 步：BiLSTM-CRF 增加了什么

特征变为学习得到。输入：词元嵌入（GloVe 或 fastText）。LSTM 从左到右和从右到左读取。拼接后的隐藏状态通过 CRF 输出层。CRF 仍然强制标签序列一致性；LSTM 用学习到的特征替代了手工特征。

```python
import torch
import torch.nn as nn


class BiLSTM_CRF_Head(nn.Module):
    def __init__(self, vocab_size, embed_dim, hidden_dim, n_labels):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, embed_dim)
        self.lstm = nn.LSTM(embed_dim, hidden_dim, bidirectional=True, batch_first=True)
        self.fc = nn.Linear(hidden_dim * 2, n_labels)

    def forward(self, token_ids):
        e = self.embed(token_ids)
        h, _ = self.lstm(e)
        emissions = self.fc(h)
        return emissions
```

对于 CRF 层，使用 `torchcrf.CRF`（pip install pytorch-crf）。与手工 CRF 相比的提升是可测量的，但没有你预期的那么大——除非你有数万条标注句子。

## 使用现成工具

spaCy 开箱即用地提供生产级 NER。

```python
import spacy

nlp = spacy.load("en_core_web_sm")
doc = nlp("Apple sued Google over its iPhone search deal in the US.")
for ent in doc.ents:
    print(f"{ent.text:20s} {ent.label_}")
```

```
Apple                ORG
Google               ORG
iPhone               ORG
US                   GPE
```

注意 `iPhone` 被标注为 `ORG` 而非 `PRODUCT`——spaCy 的小模型产品实体覆盖率较弱。大模型（`en_core_web_lg`）表现更好。transformer 模型（`en_core_web_trf`）表现最佳。

Hugging Face 用于基于 BERT 的 NER：

```python
from transformers import pipeline

ner = pipeline("ner", model="dslim/bert-base-NER", aggregation_strategy="simple")
print(ner("Apple sued Google over its iPhone in the US."))
```

```
[{'entity_group': 'ORG', 'word': 'Apple', ...},
 {'entity_group': 'ORG', 'word': 'Google', ...},
 {'entity_group': 'MISC', 'word': 'iPhone', ...},
 {'entity_group': 'LOC', 'word': 'US', ...}]
```

`aggregation_strategy="simple"` 将连续的 B-X、I-X 词元合并为一个跨度。没有它，你会得到词元级别的标签，需要自行合并。

### 基于 LLM 的 NER（2026 年的选择）

零样本和少样本 LLM NER 现在在许多领域与微调模型具有竞争力，并且在标注数据稀缺时表现显著更好。

- **零样本提示。** 给 LLM 一个实体类型列表和一个示例模式。要求输出 JSON。开箱即用；在新领域上准确率中等。
- **ZeroTuneBio 风格提示。** 将任务分解为候选提取 -> 含义解释 -> 判断 -> 重新检查。多阶段提示（非一次性）在生物医学 NER 上大幅提升准确率。同样的模式适用于法律、金融和科学领域。
- **带 RAG 的动态提示。** 对每个推理调用，从小型标注种子集中检索最相似的标注样本；动态构建少样本提示。在 2026 年的基准测试中，这使 GPT-4 的生物医学 NER F1 值比静态提示提高了 11-12%。
- **按实体类型分解。** 对于长文档，一次调用就提取所有实体类型会随着长度增长而丢失召回率。每实体类型进行一次提取。推理成本更高，但准确率显著更高。这是临床笔记和法律合同的标准模式。

截至 2026 年的生产建议：在收集训练数据之前，先从 LLM 零样本基线开始。通常 F1 值已经足够好，你永远不需要进行微调。

### 经典 NER 仍然胜出的场景

即使有了 LLM，经典 NER 在以下情况仍然胜出：

- 延迟预算低于 50 毫秒。
- 你有数千条标注样本，需要 98%+ 的 F1。
- 领域具有稳定的本体，预训练的 CRF 或 BiLSTM 迁移良好。
- 监管要求使用本地部署的非生成式模型。

### 它的失败之处

- **领域迁移。** 在 CoNLL 上训练的 NER 在法律合同上的表现比地名词典还差。在你的领域上进行微调。
- **嵌套实体。** "Bank of America Tower" 同时是 ORG 和 FACILITY。标准 BIO 无法表示重叠跨度。你需要嵌套 NER（多遍或基于跨度的模型）。
- **长实体。** "United States Federal Deposit Insurance Corporation。" 词元级模型有时会拆分它。使用 `aggregation_strategy` 或后处理。
- **稀疏类型。** 医学 NER 标签如 DRUG_BRAND、ADVERSE_EVENT、DOSE。通用模型一无所知。Scispacy 和 BioBERT 是那里的起点。

## 交付

保存为 `outputs/skill-ner-picker.md`：

```markdown
---
name: ner-picker
description: 为给定的提取任务选择正确的 NER 方法。
version: 1.0.0
phase: 5
lesson: 06
tags: [nlp, ner, extraction]
---

给定任务描述（领域、标签集、语言、延迟、数据量），输出：

1. 方法。基于规则 + 地名词典、CRF、BiLSTM-CRF 或 transformer 微调。
2. 起始模型。指出名称（spaCy 模型 ID、Hugging Face 检查点 ID，或"自定义，从头训练"）。
3. 标注策略。BIO、BILOU 或基于跨度。用一句话说明理由。
4. 评估。使用 `seqeval`。始终报告实体级 F1（而非词元级）。

拒绝在标注样本不足 500 条时推荐微调 transformer，除非用户已有预训练领域模型。标记嵌套实体为需要使用基于跨度或多遍模型。如果用户提到"生产规模"且标签与 CoNLL-2003 相同，要求进行地名词典审计。
```

## 练习

1. **简单。** 实现 `bio_to_spans`（`spans_to_bio` 的逆函数），并在 10 个句子上验证往返一致性。
2. **中等。** 在 CoNLL-2003 英语 NER 数据集上训练上述 sklearn-crfsuite CRF。使用 `seqeval` 报告每实体 F1。典型结果：约 84 F1。
3. **困难。** 在领域特定的 NER 数据集（医学、法律或金融）上微调 `distilbert-base-cased`。与 spaCy 小模型进行比较。记录数据泄露检查，并写下让你惊讶的发现。

## 关键术语

| 术语 | 人们通常说的 | 实际含义 |
|------|-----------------|-----------------------|
| NER | 提取名称 | 用类型（PERSON、ORG、GPE、DATE 等）标注词元跨度。 |
| BIO | 标注方案 | `B-X` 开始，`I-X` 继续，`O` 外部。 |
| BILOU | 更好的 BIO | 增加了 `L-X`（最后一个）、`U-X`（单元），用于更清晰的边界。 |
| CRF | 结构化分类器 | 建模标签之间的转移，不仅仅是发射概率。强制有效序列。 |
| 嵌套 NER | 重叠实体 | 一个跨度是与它的子跨度不同的实体。BIO 无法表达这一点。 |
| 实体级 F1 | 正确的 NER 指标 | 预测跨度必须与真实跨度完全匹配。词元级 F1 高估了准确率。 |

## 延伸阅读

- [Lample et al. (2016). Neural Architectures for Named Entity Recognition](https://arxiv.org/abs/1603.01360) —— BiLSTM-CRF 论文。经典之作。
- [Devlin et al. (2018). BERT: Pre-training of Deep Bidirectional Transformers](https://arxiv.org/abs/1810.04805) —— 介绍了成为标准的词元分类模式。
- [spaCy 语言特征 —— 命名实体](https://spacy.io/usage/linguistic-features#named-entities) —— `Doc.ents` 和 `Span` 上每个属性的实用参考。
- [seqeval](https://github.com/chakki-works/seqeval) —— 正确的指标库。始终使用它。
