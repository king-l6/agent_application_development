# 子词分词 — BPE、WordPiece、Unigram、SentencePiece

> 词级分词器在未见过词上卡住。字符级分词器使序列长度爆炸。子词分词器两者兼顾。每个现代 LLM 都搭载其中一种。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 01（文本处理）、阶段 5 · 04（GloVe / FastText / 子词）
**时间：** ~60 分钟

## 问题

你的词汇表有 50,000 个词。用户输入"untokenizable"。你的分词器返回 `[UNK]`。模型现在对该词没有任何信号。更糟糕的是：你语料库中的第 90 百分位文档有 40 个稀有词，这意味着每个文档丢失 40 位信息。

子词分词解决了这个问题。常见词保持单一 token。稀有词分解为有意义的片段：`untokenizable` → `un`、`token`、`izable`。训练数据覆盖一切，因为任何字符串最终都是字节序列。

2026 年每个前沿 LLM 都搭载三种算法之一（BPE、Unigram、WordPiece），包装在三个库之一中（tiktoken、SentencePiece、HF Tokenizers）。不选择一个，你就无法部署语言模型。

## 概念

![BPE vs Unigram vs WordPiece，逐字符](../assets/subword-tokenization.svg)

**BPE（字节对编码）。** 从字符级词汇表开始。计数每个相邻对。将最频繁的对合并为新的 token。重复直到达到目标词汇表大小。主导算法：GPT-2/3/4、Llama、Gemma、Qwen2、Mistral。

**字节级 BPE。** 相同算法，但在原始字节（256 个基础 token）上而不是 Unicode 字符上。保证零 `[UNK]` token——任何字节序列都能编码。GPT-2 使用 50,257 个 token（256 字节 + 50,000 合并 + 1 个特殊 token）。

**Unigram。** 从一个巨大的词汇表开始。为每个 token 分配一个 unigram 概率。迭代剪枝那些移除后对语料库 log 似然损害最小的 token。推理时是概率性的：可以采样分词（对通过子词正则化的数据增强有用）。T5、mBART、ALBERT、XLNet、Gemma 使用。

**WordPiece。** 合并最大化训练语料库似然的 pair，而非原始频率。BERT、DistilBERT、ELECTRA 使用。

**SentencePiece vs tiktoken。** SentencePiece 是*训练*词汇表的库（BPE 或 Unigram），直接在原始 Unicode 文本上操作，将空白编码为 `▁`。tiktoken 是 OpenAI 的快速*编码器*，针对预构建词汇表；它不训练。

经验法则：

- **训练新词汇表：** SentencePiece（多语言，无需预分词）或 HF Tokenizers。
- **针对 GPT 词汇表的快速推理：** tiktoken（cl100k_base、o200k_base）。
- **两者都需要：** HF Tokenizers——一个库，训练 + 服务。

```figure
bpe-merge
```

## 构建

### 步骤 1：从零实现 BPE

见 `code/main.py`。循环：

```python
def train_bpe(corpus, num_merges):
    vocab = {tuple(word) + ("</w>",): count for word, count in corpus.items()}
    merges = []
    for _ in range(num_merges):
        pairs = Counter()
        for symbols, freq in vocab.items():
            for a, b in zip(symbols, symbols[1:]):
                pairs[(a, b)] += freq
        if not pairs:
            break
        best = pairs.most_common(1)[0][0]
        merges.append(best)
        vocab = apply_merge(vocab, best)
    return merges
```

算法编码的三个事实。`</w>` 标记词尾，因此"low"（后缀）和"lower"（前缀）保持不同。频率加权使高频对早期胜出。合并列表是有序的——推理按训练顺序应用合并。

### 步骤 2：用学习到的合并进行编码

```python
def encode_bpe(word, merges):
    symbols = list(word) + ["</w>"]
    for a, b in merges:
        i = 0
        while i < len(symbols) - 1:
            if symbols[i] == a and symbols[i + 1] == b:
                symbols = symbols[:i] + [a + b] + symbols[i + 2:]
            else:
                i += 1
    return symbols
```

朴素 O(n·|merges|)。生产实现（tiktoken、HF Tokenizers）使用带优先队列的合并排名查找，运行在近线性时间。

### 步骤 3：SentencePiece 实践

```python
import sentencepiece as spm

spm.SentencePieceTrainer.train(
    input="corpus.txt",
    model_prefix="my_tokenizer",
    vocab_size=8000,
    model_type="bpe",          # 或 "unigram"
    character_coverage=0.9995, # CJK 文字降低（英语 0.9995，日语 0.995）
    normalization_rule_name="nmt_nfkc",
)

sp = spm.SentencePieceProcessor(model_file="my_tokenizer.model")
print(sp.encode("untokenizable", out_type=str))
# ['▁un', 'token', 'izable']
```

注意：无需预分词，空格编码为 `▁`，`character_coverage` 控制保留稀有字符与映射为 `<unk>` 的激进程度。

### 步骤 4：用于 OpenAI 兼容词汇表的 tiktoken

```python
import tiktoken
enc = tiktoken.get_encoding("o200k_base")
print(enc.encode("untokenizable"))        # [127340, 101028]
print(len(enc.encode("Hello, world!")))   # 4
```

仅编码。快速（Rust 后端）。与 GPT-4/5 分词精确匹配，用于字节计数、成本估算、上下文窗口预算。

## 2026 年仍然存在的陷阱

- **分词器漂移。** 用词汇表 A 训练，用词汇表 B 部署。Token ID 不同；模型输出乱码。在 CI 中检查 `tokenizer.json` 的哈希。
- **空白符歧义。** BPE 中"hello"与" hello"产生不同的 token。始终显式指定 `add_special_tokens` 和 `add_prefix_space`。
- **多语言训练不足。** 英语为主的语料库产生的词汇表将非拉丁文字分割为 5-10 倍更多 token。在 GPT-3.5 上，日文/阿拉伯文同样提示花费 5-10 倍更多。o200k_base 部分修复了这个问题。
- **表情符号分割。** 一个表情符号可能需要 5 个 token。在预算上下文时检查表情符号处理。

## 使用

2026 年的技术栈：

| 情况 | 选择 |
|-----------|------|
| 从头训练单语言模型 | HF Tokenizers（BPE） |
| 训练多语言模型 | SentencePiece（Unigram，`character_coverage=0.9995`） |
| 服务 OpenAI 兼容 API | tiktoken（GPT-4+ 用 `o200k_base`） |
| 领域特定词汇表（代码、数学、蛋白质） | 在领域语料库上训练自定义 BPE，与基础词汇表合并 |
| 边缘推理，小模型 | Unigram（较小词汇表效果更好） |

词汇表大小是一个扩展决策，不是常数。粗略启发式：小于 1B 参数用 32k，1-10B 用 50-100k，多语言/前沿用 200k+。

## 产出

保存为 `outputs/skill-bpe-vs-wordpiece.md`：

```markdown
---
name: tokenizer-picker
description: 为给定的语料库和部署目标选择分词器算法、词汇表大小和库。
version: 1.0.0
phase: 5
lesson: 19
tags: [nlp, tokenization]
---

给定语料库（大小、语言、领域）和部署目标（从头训练 / 微调 / API 兼容推理），输出：

1. 算法。BPE、Unigram 或 WordPiece。一句话理由。
2. 库。SentencePiece、HF Tokenizers 或 tiktoken。理由。
3. 词汇表大小。四舍五入到最近千。理由与模型大小和语言覆盖范围相关。
4. 覆盖设置。`character_coverage`、`byte_fallback`、特殊 token 列表。
5. 验证计划。保留集上的平均每词 token 数、OOV 率、压缩比、往返解码一致性。

拒绝在包含稀有文字内容的语料库上训练 character_coverage < 0.995 的分词器。拒绝在没有冻结的 `tokenizer.json` 哈希检查在 CI 中的情况下部署词汇表。标记任何低于 16k 词汇表的单语言分词器为可能不达标。
```

## 练习

1. **（简单）** 在 `code/main.py` 的微小语料库上训练一个 500 合并的 BPE。编码三个保留词。多少个产生恰好 1 个 token vs 大于 1 个 token？
2. **（中等）** 比较 100 句英语 Wikipedia 句子在 `cl100k_base`、`o200k_base` 和你训练的词汇表大小为 32k 的 SentencePiece BPE 上的 token 数量。报告各压缩比。
3. **（困难）** 用 BPE、Unigram 和 WordPiece 训练相同的语料库。在小情感分类器上使用每种分词器时测量下游准确率。选择是否影响超过 1 个 F1 点？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| BPE | 字节对编码 | 最频繁字符对的贪心合并，直到达到目标词汇表大小。 |
| 字节级 BPE | 永无未知 token | 在原始 256 字节上的 BPE；GPT-2 / Llama 使用此方式。 |
| Unigram | 概率分词器 | 使用对数似然从大型候选集剪枝；T5、Gemma 使用。 |
| SentencePiece | 处理空格的那个 | 在原始文本上训练 BPE/Unigram 的库；空格编码为 `▁`。 |
| tiktoken | 快速的那个 | OpenAI 的 Rust 后端 BPE 编码器，用于预构建词汇表。无训练功能。 |
| 合并列表 | 魔法数字 | 有序的 `(a, b) → ab` 合并列表；推理按顺序应用。 |
| 字符覆盖率 | 多稀有才算太稀有？ | 分词器必须覆盖的训练语料库字符比例；通常约 0.9995。 |

## 延伸阅读

- [Sennrich, Haddow, Birch (2015). Neural Machine Translation of Rare Words with Subword Units](https://arxiv.org/abs/1508.07909) — BPE 论文。
- [Kudo (2018). Subword Regularization with Unigram Language Model](https://arxiv.org/abs/1804.10959) — Unigram 论文。
- [Kudo, Richardson (2018). SentencePiece: A simple and language independent subword tokenizer](https://arxiv.org/abs/1808.06226) — 该库的论文。
- [Hugging Face — Summary of the tokenizers](https://huggingface.co/docs/transformers/tokenizer_summary) — 简洁参考。
- [OpenAI tiktoken repo](https://github.com/openai/tiktoken) — 示例代码 + 编码列表。
