# 词性标注与句法分析

> 语法曾一度不受追捧。后来每个大语言模型流程都需要验证结构化提取，它又回来了。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段5·01（文本处理），阶段2·14（朴素贝叶斯）
**时间：** 约45分钟

## 问题

第一课曾承诺，词形还原需要词性标签。不知道 `running` 是动词，词形还原器就无法将其还原为 `run`。不知道 `better` 是形容词，就无法还原为 `good`。

这个承诺背后隐藏着整个子领域。词性标注赋予词语法类别。句法分析恢复句子的树结构：哪个词修饰哪个词，哪个动词支配哪些论元。经典 NLP 花了二十年完善这两项技术。然后深度学习把它们压缩成了基于预训练 Transformer 的词元分类任务，研究社区转向了新的方向。

但应用社区没有。每个结构化提取流程仍然在底层使用词性和依存树。LLM 生成的 JSON 需根据语法约束进行验证。问答系统使用依存分析分解查询。机器翻译质量评估器检查分析树的对齐情况。

值得了解。本课介绍标签集、基线方法，以及你不再从头实现而改用 spaCy 的时机。

## 概念

**词性标注**为每个词元赋予一个语法类别。**宾州树库**标签集是英文默认标准。36 个标签，区分细致到让普通读者觉得繁琐：`NN` 单数名词、`NNS` 复数名词、`NNP` 专有名词单数、`VBD` 动词过去式、`VBZ` 动词第三人称单数现在时，等等。**通用依存关系**标签集更粗略（17 个标签），且语言无关；它已成为跨语言工作的默认选择。

```
The/DET cats/NOUN were/AUX running/VERB at/ADP 3pm/NOUN ./PUNCT
```

**句法分析**生成一棵树。两种主要风格：

- **成分分析。** 名词短语、动词短语、介词短语层层嵌套。输出是一棵非终止类别（NP、VP、PP）的树，单词作为叶子节点。
- **依存分析。** 每个词有一个它依赖的中心词，标有语法关系。输出是一棵树，每条边是一个（中心词、从属词、关系）三元组。

依存分析在 2010 年代胜出，因为它能干净地推广到各种语言，尤其是自由词序的语言。

```
running 是 ROOT
cats 是 running 的 nsubj
were 是 running 的 aux
at 是 running 的 prep
3pm 是 at 的 pobj
```

## 动手构建

### 第 1 步：最常见标签基线

最简单的有效词性标注器。对每个词，预测它在训练中出现次数最多的标签。

```python
from collections import Counter, defaultdict


def train_mft(train_examples):
    word_tag_counts = defaultdict(Counter)
    all_tags = Counter()
    for tokens, tags in train_examples:
        for token, tag in zip(tokens, tags):
            word_tag_counts[token.lower()][tag] += 1
            all_tags[tag] += 1
    word_best = {w: c.most_common(1)[0][0] for w, c in word_tag_counts.items()}
    default_tag = all_tags.most_common(1)[0][0]
    return word_best, default_tag


def predict_mft(tokens, word_best, default_tag):
    return [word_best.get(t.lower(), default_tag) for t in tokens]
```

在 Brown 语料库上，这个基线能达到约 85% 的准确率。不算好，但这是任何严肃模型不应低于的底线。

### 第 2 步：二元 HMM 标注器

对整个序列的联合概率建模：

```
P(tags, words) = prod P(tag_i | tag_{i-1}) * P(word_i | tag_i)
```

两个表格：转移概率（给定前一个标签的当前标签概率）、发射概率（给定标签的单词概率）。从计数中估计两者，使用拉普拉斯平滑。用维特比算法解码（在标签格上动态规划）。

```python
import math


def train_hmm(train_examples, alpha=0.01):
    transitions = defaultdict(Counter)
    emissions = defaultdict(Counter)
    tags = set()
    vocab = set()

    for tokens, ts in train_examples:
        prev = "<BOS>"
        for token, tag in zip(tokens, ts):
            transitions[prev][tag] += 1
            emissions[tag][token.lower()] += 1
            tags.add(tag)
            vocab.add(token.lower())
            prev = tag
        transitions[prev]["<EOS>"] += 1

    return transitions, emissions, tags, vocab


def log_prob(table, given, key, smooth_denom, alpha):
    return math.log((table[given].get(key, 0) + alpha) / smooth_denom)


def viterbi(tokens, transitions, emissions, tags, vocab, alpha=0.01):
    tags_list = list(tags)
    n = len(tokens)
    V = [[0.0] * len(tags_list) for _ in range(n)]
    back = [[0] * len(tags_list) for _ in range(n)]

    for j, tag in enumerate(tags_list):
        em_denom = sum(emissions[tag].values()) + alpha * (len(vocab) + 1)
        tr_denom = sum(transitions["<BOS>"].values()) + alpha * (len(tags_list) + 1)
        tr = log_prob(transitions, "<BOS>", tag, tr_denom, alpha)
        em = log_prob(emissions, tag, tokens[0].lower(), em_denom, alpha)
        V[0][j] = tr + em
        back[0][j] = 0

    for i in range(1, n):
        for j, tag in enumerate(tags_list):
            em_denom = sum(emissions[tag].values()) + alpha * (len(vocab) + 1)
            em = log_prob(emissions, tag, tokens[i].lower(), em_denom, alpha)
            best_prev = 0
            best_score = -1e30
            for k, prev_tag in enumerate(tags_list):
                tr_denom = sum(transitions[prev_tag].values()) + alpha * (len(tags_list) + 1)
                tr = log_prob(transitions, prev_tag, tag, tr_denom, alpha)
                score = V[i - 1][k] + tr + em
                if score > best_score:
                    best_score = score
                    best_prev = k
            V[i][j] = best_score
            back[i][j] = best_prev

    last_best = max(range(len(tags_list)), key=lambda j: V[n - 1][j])
    path = [last_best]
    for i in range(n - 1, 0, -1):
        path.append(back[i][path[-1]])
    return [tags_list[j] for j in reversed(path)]
```

二元 HMM 在 Brown 上达到约 93% 的准确率。从 85% 到 93% 的提升主要来自转移概率——模型学习到 `DET NOUN` 是常见的，而 `NOUN DET` 是罕见的。

### 第 3 步：为什么现代标注器更优秀

转移概率和发射概率是局部的。它们无法捕捉到 `saw` 在 "I bought a saw" 中是名词，但在 "I saw the movie" 中是动词。带有任意特征（后缀、词形、前后词、词本身）的 CRF 能达到约 97%。BiLSTM-CRF 或 Transformer 能达到 98% 以上。

这个任务的上限由标注者间一致性决定。人类标注者在宾州树库上的一致性约为 97%。超过 98% 的模型可能在对测试集过拟合。

### 第 4 步：依存分析概要

从头实现完整的依存分析超出了本课范围；标准教科书式讲解见 Jurafsky 和 Martin。需要了解的两个经典类型：

- **基于转移**的分析器（arc-eager、arc-standard）类似于移进-归约分析器：它们读取词元，将其压入栈，然后执行创建弧的归约动作。贪心解码速度快。经典实现是 MaltParser。现代神经版本：Chen 和 Manning 的基于转移分析器。
- **基于图**的分析器（Eisner 算法、Dozat-Manning biaffine）为每个可能的中心词-从属词边打分，选择最大生成树。速度较慢但更准确。

对于大多数应用工作，直接调用 spaCy：

```python
import spacy

nlp = spacy.load("en_core_web_sm")
doc = nlp("The cats were running at 3pm.")
for token in doc:
    print(f"{token.text:10s} tag={token.tag_:5s} pos={token.pos_:6s} dep={token.dep_:10s} head={token.head.text}")
```

```
The        tag=DT    pos=DET    dep=det        head=cats
cats       tag=NNS   pos=NOUN   dep=nsubj      head=running
were       tag=VBD   pos=AUX    dep=aux        head=running
running    tag=VBG   pos=VERB   dep=ROOT       head=running
at         tag=IN    pos=ADP    dep=prep       head=running
3pm        tag=NN    pos=NOUN   dep=pobj       head=at
.          tag=.     pos=PUNCT  dep=punct      head=running
```

从底向上阅读 `dep` 列，句子的语法结构便呈现出来。

## 使用

每个生产级 NLP 库都将词性标注器和依存分析器作为标准流水线的一部分提供。

- **spaCy**（`en_core_web_sm` / `md` / `lg` / `trf`）。快速、准确，与词元化、NER 和词形还原集成。`token.tag_`（Penn）、`token.pos_`（UD）、`token.dep_`（依存关系）。
- **Stanford NLP（stanza）**。Stanford 对 CoreNLP 的继任者。在 60+ 种语言上达到最先进水平。
- **trankit**。基于 Transformer，通用依存关系准确率高。
- **NLTK**。`pos_tag`。可用、慢、较旧。适合教学。

### 2026 年这为什么仍然重要

- **词形还原。** 第一课需要词性才能正确进行词形还原。总是如此。
- **从 LLM 输出中进行结构化提取。** 验证生成的句子是否遵守语法约束（例如，主谓一致、必需的修饰语）。
- **基于方面的情感分析。** 依存分析告诉你哪个形容词修饰哪个名词。
- **查询理解。** "movies directed by Wes Anderson starring Bill Murray" 通过分析分解为结构化约束。
- **跨语言迁移。** UD 标签和依存关系是语言无关的，支持对新语言进行零样本结构化分析。
- **低算力流水线。** 如果你无法部署 Transformer，词性标注 + 依存分析 + 地名词典能让你走得出乎意料地远。

## 交付

保存为 `outputs/skill-grammar-pipeline.md`：

```markdown
---
name: grammar-pipeline
description: 为下游 NLP 任务设计经典词性 + 依存分析流水线。
version: 1.0.0
phase: 5
lesson: 07
tags: [nlp, pos, parsing]
---

给定一个下游任务（信息抽取、改写验证、查询分解、词形还原），你输出：

1. 使用的标签集。纯英文遗留流水线用宾州树库，多语言或跨语言用通用依存关系。
2. 库。大多数生产场景用 spaCy，学术级别的多语言用 stanza，最高 UD 准确率用 trankit。指定具体的模型 ID。
3. 集成模式。展示调用库并消费所需属性（`.pos_`、`.dep_`、`.head`）的 3-5 行代码。
4. 需要测试的失败模式。名词-动词歧义（`saw`、`book`、`can`）和 PP 附着歧义是经典陷阱。抽样 20 个输出目测检查。

拒绝推荐自行编写分析器。从头构建分析器是一个研究项目，不是应用任务。标记任何消费词性标签但不处理大小写变体的流水线为脆弱。
```

## 练习

1. **简单。** 在一个小型标注语料库（例如 NLTK 的 Brown 子集）上使用最常见标签基线，在保留句子上测量准确率。验证约 85% 的结果。
2. **中等。** 训练上述二元 HMM，报告每个标签的精确率和召回率。HMM 最容易混淆哪些标签？
3. **困难。** 使用 spaCy 的依存分析从 1000 句样本中提取主语-动词-宾语三元组。在 50 个手动标注的三元组上进行评估。记录提取失败的地方（通常是被动语态、并列结构和省略主语）。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| POS 标签 | 词的类别 | 语法类别。PTB 有 36 个；UD 有 17 个。 |
| 宾州树库 | 标准标签集 | 英文专用。细粒度的动词时态和名词数。 |
| 通用依存关系 | 多语言标签集 | 比 PTB 更粗略；语言中性；跨语言工作的默认选择。 |
| 依存分析 | 句子的树 | 每个词有一个中心词，每条边有一个语法关系。 |
| 维特比算法 | 动态规划 | 在给定发射概率和转移概率下找到最高概率的标签序列。 |

## 延伸阅读

- [Jurafsky and Martin — Speech and Language Processing, chapters 8 and 18](https://web.stanford.edu/~jurafsky/slp3/) — 词性标注和分析的标准教科书式讲解。
- [Universal Dependencies project](https://universaldependencies.org/) — 每个多语言分析器使用的跨语言标签集和树库集合。
- [spaCy linguistic features guide](https://spacy.io/usage/linguistic-features) — `Token` 上每个属性的实用参考。
- [Chen and Manning (2014). A Fast and Accurate Dependency Parser using Neural Networks](https://nlp.stanford.edu/pubs/emnlp2014-depparser.pdf) — 将神经分析器带入主流的论文。
