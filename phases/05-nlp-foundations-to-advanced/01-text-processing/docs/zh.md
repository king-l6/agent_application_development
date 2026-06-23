# 文本处理 —— 分词、词干提取、词形还原

> 语言是连续的。模型是离散的。预处理是桥梁。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 2 · 14（朴素贝叶斯）
**时间：** ~45 分钟

## 问题

模型无法读取 "The cats were running." 这类文本。它只能读取整数。

每个 NLP 系统都从同样的三个问题开始。词的边界在哪里。词的根是什么。如何在不同场景下，将 "run"、"running"、"ran" 视为同一个东西（当这有帮助时），或视为不同的东西（当这没有帮助时）。

分词做错了，模型就会从垃圾中学习。如果你的分词器将 `don't` 当作一个词元，而 `do n't` 当作两个词元，训练数据的分布就会分裂。如果你的词干提取器将 `organization` 和 `organ` 归为同一个词干，主题建模就会失效。如果你的词形还原器需要词性上下文但你却没有提供，动词就会被当作名词处理。

本课程从头构建三个预处理步骤，然后展示 NLTK 和 spaCy 如何完成相同的工作，让你看到其中的权衡取舍。

## 概念

三种操作。每种都有其职责和失败模式。

**分词**将字符串拆分为词元。"词元"这个术语故意定义得比较模糊，因为正确的粒度取决于具体任务。经典 NLP 用词级分词。Transformer 用子词分词。对于没有空格的语言用字符级分词。

**词干提取**通过规则去除后缀。速度快、激进、粗暴。`running -> run`。`organization -> organ`。第二个例子就是其失败模式。

**词形还原**利用语法知识将词汇归为其词典形式。速度较慢、结果准确，需要查找表或形态分析器。`ran -> run`（需要知道 "ran" 是 "run" 的过去式）。`better -> good`（需要知道比较级形式）。

经验法则。当速度重要且能容忍噪声时使用词干提取（搜索索引、粗略分类）。当语义重要时使用词形还原（问答、语义搜索、任何用户会直接看到的内容）。

```figure
edit-distance
```

## 动手构建

### 第 1 步：一个正则表达式分词器

最简单的实用分词器基于非字母数字字符进行拆分，同时将标点符号保留为独立的词元。不完美，也不是最终方案，但一行代码即可运行。

```python
import re

def tokenize(text):
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+|[^\sA-Za-z0-9]", text)
```

按优先级排列的三种模式。带可选内部撇号的单词（`don't`, `it's`）。纯数字。作为独立词元的单个非空白、非字母数字字符（标点符号）。

```python
>>> tokenize("The cats weren't running at 3pm.")
['The', 'cats', "weren't", 'running', 'at', '3', 'pm', '.']
```

需要注意的失败模式：`3pm` 被拆分为 `['3', 'pm']`，因为我们交替匹配了字母序列和数字序列。对大多数任务来说已经够好。URL、电子邮件、话题标签都会出问题。生产环境中，在通用模式之前添加针对性模式。

### 第 2 步：一个 Porter 词干提取器（仅第 1a 步）

完整的 Porter 算法有五个阶段的规则。仅第 1a 步就覆盖了最常见的英语后缀，同时也能展示其模式。

```python
def stem_step_1a(word):
    if word.endswith("sses"):
        return word[:-2]
    if word.endswith("ies"):
        return word[:-2]
    if word.endswith("ss"):
        return word
    if word.endswith("s") and len(word) > 1:
        return word[:-1]
    return word
```

```python
>>> [stem_step_1a(w) for w in ["caresses", "ponies", "caress", "cats"]]
['caress', 'poni', 'caress', 'cat']
```

从上到下依次匹配规则。`ies -> i` 这条规则导致 `ponies -> poni`，而不是 `pony`。真正的 Porter 算法有第 1b 步可以修正这个问题。规则之间相互竞争。较早匹配的规则胜出。规则顺序比任何单条规则都更重要。

### 第 3 步：一个基于查找表的词形还原器

真正的词形还原需要形态学知识。一个适合教学的简化版本使用一个小型词形表和一个回退方案。

```python
LEMMA_TABLE = {
    ("running", "VERB"): "run",
    ("ran", "VERB"): "run",
    ("runs", "VERB"): "run",
    ("better", "ADJ"): "good",
    ("best", "ADJ"): "good",
    ("cats", "NOUN"): "cat",
    ("cat", "NOUN"): "cat",
    ("were", "VERB"): "be",
    ("was", "VERB"): "be",
    ("is", "VERB"): "be",
}

def lemmatize(word, pos):
    key = (word.lower(), pos)
    if key in LEMMA_TABLE:
        return LEMMA_TABLE[key]
    if pos == "VERB" and word.endswith("ing"):
        return word[:-3]
    if pos == "NOUN" and word.endswith("s"):
        return word[:-1]
    return word.lower()
```

```python
>>> lemmatize("running", "VERB")
'run'
>>> lemmatize("cats", "NOUN")
'cat'
>>> lemmatize("better", "ADJ")
'good'
>>> lemmatize("watched", "VERB")
'watched'
```

最后一个例子是关键的教学时刻。`watched` 不在我们的表中，而且我们的回退方案只处理了 `ing` 结尾的情况。真正的词形还原需要处理 `ed`、不规则动词、形容词比较级、涉及音变的复数形式（`children -> child`）。这就是为什么生产系统会使用 WordNet、spaCy 的形态分析器或完整的形态分析工具。

### 第 4 步：将它们串联起来

```python
def preprocess(text, pos_tagger=None):
    tokens = tokenize(text)
    stems = [stem_step_1a(t.lower()) for t in tokens]
    tags = pos_tagger(tokens) if pos_tagger else [(t, "NOUN") for t in tokens]
    lemmas = [lemmatize(word, pos) for word, pos in tags]
    return {"tokens": tokens, "stems": stems, "lemmas": lemmas}
```

缺失的部分是一个词性标注器。阶段 5 · 07（词性标注）会构建一个。现在，将所有词性默认为 `NOUN` 并承认这个局限性。

## 使用现成工具

NLTK 和 spaCy 提供了生产版本的实现。每样只需几行代码。

### NLTK

```python
import nltk
nltk.download("punkt_tab")
nltk.download("wordnet")
nltk.download("averaged_perceptron_tagger_eng")

from nltk.tokenize import word_tokenize
from nltk.stem import PorterStemmer, WordNetLemmatizer
from nltk import pos_tag

text = "The cats were running."
tokens = word_tokenize(text)
stems = [PorterStemmer().stem(t) for t in tokens]
lemmatizer = WordNetLemmatizer()
tagged = pos_tag(tokens)


def nltk_pos_to_wordnet(tag):
    if tag.startswith("V"):
        return "v"
    if tag.startswith("J"):
        return "a"
    if tag.startswith("R"):
        return "r"
    return "n"


lemmas = [lemmatizer.lemmatize(t, nltk_pos_to_wordnet(tag)) for t, tag in tagged]
```

`word_tokenize` 处理缩写、Unicode 以及你的正则表达式遗漏的边缘情况。`PorterStemmer` 运行所有五个阶段。`WordNetLemmatizer` 需要将 NLTK 的 Penn Treebank 词性标注方案转换为 WordNet 的缩写集。上面这个转换代码正是大多数教程会跳过的那部分。

### spaCy

```python
import spacy

nlp = spacy.load("en_core_web_sm")
doc = nlp("The cats were running.")

for token in doc:
    print(token.text, token.lemma_, token.pos_)
```

```
The      the     DET
cats     cat     NOUN
were     be      AUX
running  run     VERB
.        .       PUNCT
```

spaCy 将整个流程隐藏在 `nlp(text)` 之后。分词、词性标注和词形还原一并完成。大规模使用时比 NLTK 更快。开箱即用的准确性更高。其代价是你不能方便地替换单个组件。

### 如何选择

| 场景 | 选择 |
|-----------|------|
| 教学、研究、需要替换组件 | NLTK |
| 生产环境、多语言、速度优先 | spaCy |
| Transformer 流程（无论如何都会使用模型的 tokenizer） | 使用 `tokenizers` / `transformers`，跳过经典预处理 |

### 两个没人提醒你的失败模式

大多数教程只教算法就结束了。但有两个问题会在真实预处理流程中给你带来麻烦，而且它们几乎从未被提及。

**可复现性漂移。** NLTK 和 spaCy 会在版本之间改变分词和词形还原的行为。在 spaCy 2.x 中产生 `['do', "n't"]` 的代码，在 3.x 中可能产生 `["don't"]`。你的模型在一个分布上训练，推理却在另一个分布上运行。准确率悄悄下降，却没人知道原因。在 `requirements.txt` 中固定库版本。编写一个预处理回归测试，冻结 20 个示例句子的预期分词结果。每次升级时运行它。

**训练/推理不匹配。** 使用激进的预处理（小写化、停用词移除、词干提取）进行训练，但在原始用户输入上部署，然后看着性能暴跌。这是最常见的生产环境 NLP 故障。如果你在训练时做了预处理，你必须在推理时运行完全相同的函数。将预处理作为一个函数封装在模型包中，而不是作为服务团队需要重写的笔记本中的一个单元格。

## 交付

一个可复用的提示（prompt），帮助工程师在不读三本教科书的情况下选择合适的预处理策略。

保存为 `outputs/prompt-preprocessing-advisor.md`：

```markdown
---
name: preprocessing-advisor
description: 为 NLP 任务推荐分词、词干提取和词形还原方案。
phase: 5
lesson: 01
---

你提供经典 NLP 预处理的建议。给定一个任务描述，你需要输出：

1. 分词方案选择（正则表达式、NLTK word_tokenize、spaCy 或 transformer tokenizer）。解释原因。
2. 是否使用词干提取、词形还原、两者都用或都不用。解释原因。
3. 具体的库调用。指出函数名称。如果涉及 NLTK，引用词性标签转换代码。
4. 用户应该测试的一个失败模式。

拒绝为用户可见的文本推荐词干提取。拒绝推荐没有词性标签的词形还原。标记非英语输入为需要不同的处理流程。
```

## 练习

1. **简单。** 扩展 `tokenize`，使 URL 保持为单个词元。测试：`tokenize("Visit https://example.com today.")` 应该生成一个 URL 词元。
2. **中等。** 实现 Porter 第 1b 步。如果单词包含元音并以 `ed` 或 `ing` 结尾，则移除后缀。处理双辅音规则（`hopping -> hop`，而不是 `hopp`）。
3. **困难。** 构建一个词形还原器，使用 WordNet 作为查找表，但在 WordNet 没有条目时回退到你的 Porter 词干提取器。在有标签的语料库上，与纯 WordNet 和纯 Porter 对比测量准确性。

## 关键术语

| 术语 | 人们通常说的 | 实际含义 |
|------|-----------------|-----------------------|
| 词元 | 一个单词 | 模型消费的任何单元。可以是词、子词、字符或字节。 |
| 词干 | 单词的根 | 基于规则的后缀去除结果。不总是一个真实的单词。 |
| 词形原形 | 词典形式 | 你会在词典里查到的形式。需要语法上下文才能正确计算。 |
| 词性标签 | 词性 | 像 NOUN、VERB、ADJ 这样的类别。需要用来准确进行词形还原。 |
| 形态学 | 词形变化规则 | 单词如何根据时态、数量、格而变化形式。词形还原依赖于此。 |

## 延伸阅读

- [Porter, M. F. (1980). An algorithm for suffix stripping](https://tartarus.org/martin/PorterStemmer/def.txt) —— 原始论文，五页，仍然是最清晰的解释。
- [spaCy 101 —— 语言特征](https://spacy.io/usage/linguistic-features) —— 真实流程是如何连接的。
- [NLTK 书籍，第 3 章](https://www.nltk.org/book/ch03.html) —— 你还没想到的分词边缘情况。
