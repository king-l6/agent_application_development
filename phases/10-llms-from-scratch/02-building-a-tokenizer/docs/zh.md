# 从头构建分词器

> 第01课给了你一个玩具。本课给你一件武器。

**类型：** 构建
**语言：** Python
**前置知识：** Phase 10，第01课（分词器：BPE、WordPiece、SentencePiece）
**时间：** ~90分钟

## 学习目标

- 构建一个生产级BPE分词器，处理Unicode、空白归一化和特殊token
- 实现字节级回退，使分词器能够编码任何输入（包括表情符号、中日韩文字和代码）而不会产生未知token
- 添加预分词正则表达式模式，在应用BPE合并之前在词边界处分隔文本
- 在语料上训练自定义分词器，并在多语言文本上评估其相对于tiktoken的压缩比

## 问题

你在第01课中的BPE分词器可以在英语文本上工作。现在拿日语来试。或者表情符号。或者混合制表符和空格的Python代码。

它就会出问题。

不是BPE错了——而是实现不完整。一个生产分词器处理任何编码中的原始字节、在分割前归一化Unicode、管理永不合并的特殊token、将预分词与子词分割链在一起，并且所有这些都足够快，不会成为处理15万亿token的训练管道的瓶颈。

GPT-2的分词器有50,257个token。Llama 3有128,256个。GPT-4大致有100,000个。这些都不是玩具数字。这些词汇表背后的合并表是在数百GB文本上训练的，而周围的机制——归一化、预分词、特殊token注入、聊天模板格式化——正是区分"能处理hello world"的分词器和"能处理整个互联网"的分词器的关键。

你要去构建那个机制。

## 概念

### 完整管道

一个生产分词器不是一个单一算法。它是一个包含五个阶段的管道，每个阶段解决不同的问题。

```mermaid
graph LR
    A[原始文本] --> B[归一化]
    B --> C[预分词]
    C --> D[BPE合并]
    D --> E[特殊Token]
    E --> F[Token ID]

    style A fill:#1a1a2e,stroke:#e94560,color:#fff
    style B fill:#1a1a2e,stroke:#e94560,color:#fff
    style C fill:#1a1a2e,stroke:#e94560,color:#fff
    style D fill:#1a1a2e,stroke:#e94560,color:#fff
    style E fill:#1a1a2e,stroke:#e94560,color:#fff
    style F fill:#1a1a2e,stroke:#e94560,color:#fff
```

每个阶段都有特定的工作：

| 阶段 | 作用 | 为什么重要 |
|-------|-------------|----------------|
| 归一化 | NFKC Unicode，可选小写化、可选去重音符号 | "fi"连字（U+FB01）变成"fi"（两个字符）。没有这个，同一个词会得到不同的token。 |
| 预分词 | 在BPE之前将文本分割成块 | 防止BPE跨词边界合并。"the cat"绝不应该产生"e c"这样的token。 |
| BPE合并 | 将学到的合并规则应用于字节序列 | 核心压缩。将原始字节变成子词token。 |
| 特殊Token | 注入[BOS]、[EOS]、[PAD]、聊天模板标记 | 这些token有固定的ID。它们从不参与BPE合并。模型需要它们来构建结构。 |
| ID映射 | 将token字符串转换为整数ID | 模型看到的是整数，不是字符串。 |

### 字节级BPE

第01课的分词器操作于UTF-8字节。那是正确的选择。但我们跳过了一些重要的东西：当这些字节不是有效的UTF-8时会发生什么？

字节级BPE通过将每个可能的字节值（0-255）视为有效token来解决这个问题。你的基础词汇表恰好是256个条目。任何文件——文本、二进制、损坏的——都可以被分词而不会产生未知token。

GPT-2添加了一个技巧：将每个字节映射到一个可打印的Unicode字符，使词汇表保持可读。字节0x20（空格）在其映射中变成了字符"G"。这纯粹是表面上的。算法不在乎。

真正的力量：字节级BPE处理地球上的每种语言。中文字符每个是3个UTF-8字节。日语可以是3-4字节。阿拉伯语、梵文、表情符号——都只是字节序列。BPE算法在这些字节序列中找到模式的方式与在英语ASCII字节中找到模式的方式完全相同。

### 预分词

在BPE接触你的文本之前，你需要将其分割成块。这可以防止合并算法创建跨越词边界的token。

GPT-2使用正则表达式模式来分割文本：

```
'(?:[sdmt]|ll|ve|re)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+
```

这个模式在缩略词（"don't"变成"don" + "'t"）、带可选前导空格的单词、数字、标点和空白处进行分割。前导空格保持附在单词上——所以"the cat"变成[" the", " cat"]，而不是["the", " ", "cat"]。

Llama使用SentencePiece，完全跳过正则表达式。它将原始字节流视为一个长序列，让BPE算法自己找出边界。这更简单，但给了BPE更多自由来创建跨词token。

选择很重要。GPT-2的正则表达式防止分词器学习到一个词末尾的"the"和下一个词开头的"the"应该合并。SentencePiece允许这样做，这有时会产生更高效的压缩，但token的可解释性较差。

### 特殊Token

每个生产分词器都为结构性标记保留token ID：

| Token | 用途 | 使用方 |
|-------|---------|---------|
| `[BOS]` / `<s>` | 序列开始 | Llama 3、GPT |
| `[EOS]` / `</s>` | 序列结束 | 所有模型 |
| `[PAD]` | 批量对齐的填充 | BERT、T5 |
| `[UNK]` | 未知token（字节级BPE消除了这个） | BERT、WordPiece |
| `<\|im_start\|>` | 聊天消息边界开始 | ChatGPT、Qwen |
| `<\|im_end\|>` | 聊天消息边界结束 | ChatGPT、Qwen |
| `<\|user\|>` | 用户轮次标记 | Llama 3 |
| `<\|assistant\|>` | 助手轮次标记 | Llama 3 |

特殊token永远不会被BPE分割。它们在合并算法运行之前被精确匹配，替换为固定ID，周围的文本被正常分词。

### 聊天模板

这是大多数人感到困惑、大多数实现出问题的地方。

当你向聊天模型发送消息时，API接受一个消息列表：

```
[
  {"role": "system", "content": "You are helpful."},
  {"role": "user", "content": "Hello"},
  {"role": "assistant", "content": "Hi there!"}
]
```

模型看到的不是JSON。它看到的是扁平的token序列。聊天模板使用特殊token将消息转换为那个扁平序列。每个模型的做法不同：

```
Llama 3：
<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are helpful.<|eot_id|><|start_header_id|>user<|end_header_id|>

Hello<|eot_id|><|start_header_id|>assistant<|end_header_id|>

Hi there!<|eot_id|>

ChatGPT：
<|im_start|>system
You are helpful.<|im_end|>
<|im_start|>user
Hello<|im_end|>
<|im_start|>assistant
Hi there!<|im_end|>
```

模板弄错了，模型就会产生垃圾。它是在一种精确格式上训练的。任何偏差——少一个换行、交换一个token、多一个空格——都会使输入落在训练分布之外。

### 速度

Python对于生产分词来说太慢了。

tiktoken（OpenAI）用Rust编写，带有Python绑定。HuggingFace tokenizers也是Rust。SentencePiece是C++。它们比纯Python快10-100倍。

换个角度来看：为Llama 3预训练分词化15万亿个token，如果以每秒100万个token（快速Python）的速度，需要174天。以每秒1亿个token（Rust）的速度，只需1.7天。

你在用Python构建是为了理解算法。在生产中，你会使用编译实现，只接触Python包装器。

```figure
weight-tying
```

## 动手构建

### 第1步：字节级编码

基础。将任何字符串转换为字节序列，将每个字节映射为可打印字符用于显示，并逆转这个过程。

```python
def bytes_to_tokens(text):
    return list(text.encode("utf-8"))

def tokens_to_text(token_bytes):
    return bytes(token_bytes).decode("utf-8", errors="replace")
```

在多语言文本上测试以查看字节计数：

```python
texts = [
    ("English", "hello"),
    ("Chinese", "你好"),
    ("Emoji", "🔥"),
    ("Mixed", "hello你好🔥"),
]

for label, text in texts:
    b = bytes_to_tokens(text)
    print(f"{label}: {len(text)} chars -> {len(b)} bytes -> {b}")
```

"hello"是5字节。"你好"是6字节（每字符3字节）。火焰表情符号是4字节。字节级分词器不在乎是什么语言。字节就是字节。

### 第2步：带正则表达式的预分词器

使用GPT-2正则表达式模式将文本分割成块。每个块由BPE独立分词。

```python
import re

try:
    import regex
    GPT2_PATTERN = regex.compile(
        r"""'(?:[sdmt]|ll|ve|re)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+"""
    )
except ImportError:
    GPT2_PATTERN = re.compile(
        r"""'(?:[sdmt]|ll|ve|re)| ?[a-zA-Z]+| ?[0-9]+| ?[^\s\w]+|\s+(?!\S)|\s+"""
    )

def pre_tokenize(text):
    return [match.group() for match in GPT2_PATTERN.finditer(text)]
```

`regex` 模块支持Unicode属性转义（`\p{L}` 表示字母，`\p{N}` 表示数字）。标准库 `re` 模块不支持，所以我们回退到ASCII字符类。对于生产多语言分词器，安装 `regex`。

试试：

```python
print(pre_tokenize("Hello, world! Don't stop."))
# [' Hello', ',', ' world', '!', " Don", "'t", ' stop', '.']
```

前导空格保持附在单词上。缩略词在撇号处分割。标点成为自己的块。BPE永远不会跨越这些边界合并token。

### 第3步：对字节序列的BPE

来自第01课的核心算法，但现在独立地操作于预分词的块。

```python
from collections import Counter

def get_byte_pairs(chunks):
    pairs = Counter()
    for chunk in chunks:
        byte_seq = list(chunk.encode("utf-8"))
        for i in range(len(byte_seq) - 1):
            pairs[(byte_seq[i], byte_seq[i + 1])] += 1
    return pairs

def apply_merge(byte_seq, pair, new_id):
    merged = []
    i = 0
    while i < len(byte_seq):
        if i < len(byte_seq) - 1 and byte_seq[i] == pair[0] and byte_seq[i + 1] == pair[1]:
            merged.append(new_id)
            i += 2
        else:
            merged.append(byte_seq[i])
            i += 1
    return merged
```

### 第4步：特殊Token处理

特殊token需要精确匹配和固定ID。它们完全绕过BPE。

```python
class SpecialTokenHandler:
    def __init__(self):
        self.special_tokens = {}
        self.pattern = None

    def add_token(self, token_str, token_id):
        self.special_tokens[token_str] = token_id
        escaped = [re.escape(t) for t in sorted(self.special_tokens.keys(), key=len, reverse=True)]
        self.pattern = re.compile("|".join(escaped))

    def split_with_specials(self, text):
        if not self.pattern:
            return [(text, False)]
        parts = []
        last_end = 0
        for match in self.pattern.finditer(text):
            if match.start() > last_end:
                parts.append((text[last_end:match.start()], False))
            parts.append((match.group(), True))
            last_end = match.end()
        if last_end < len(text):
            parts.append((text[last_end:], False))
        return parts
```

### 第5步：完整分词器类

将所有部分链在一起：归一化、在特殊token上分割、预分词、BPE合并、映射到ID。

```python
import unicodedata

class ProductionTokenizer:
    def __init__(self):
        self.merges = {}
        self.vocab = {i: bytes([i]) for i in range(256)}
        self.special_handler = SpecialTokenHandler()
        self.next_id = 256

    def normalize(self, text):
        return unicodedata.normalize("NFKC", text)

    def train(self, text, num_merges):
        text = self.normalize(text)
        chunks = pre_tokenize(text)
        chunk_bytes = [list(chunk.encode("utf-8")) for chunk in chunks]

        for i in range(num_merges):
            pairs = Counter()
            for seq in chunk_bytes:
                for j in range(len(seq) - 1):
                    pairs[(seq[j], seq[j + 1])] += 1
            if not pairs:
                break
            best = max(pairs, key=pairs.get)
            new_id = self.next_id
            self.next_id += 1
            self.merges[best] = new_id
            self.vocab[new_id] = self.vocab[best[0]] + self.vocab[best[1]]
            chunk_bytes = [apply_merge(seq, best, new_id) for seq in chunk_bytes]

    def add_special_token(self, token_str):
        token_id = self.next_id
        self.next_id += 1
        self.special_handler.add_token(token_str, token_id)
        self.vocab[token_id] = token_str.encode("utf-8")
        return token_id

    def encode(self, text):
        text = self.normalize(text)
        parts = self.special_handler.split_with_specials(text)
        all_ids = []
        for part_text, is_special in parts:
            if is_special:
                all_ids.append(self.special_handler.special_tokens[part_text])
            else:
                for chunk in pre_tokenize(part_text):
                    byte_seq = list(chunk.encode("utf-8"))
                    for pair, new_id in self.merges.items():
                        byte_seq = apply_merge(byte_seq, pair, new_id)
                    all_ids.extend(byte_seq)
        return all_ids

    def decode(self, ids):
        byte_parts = []
        for token_id in ids:
            if token_id in self.vocab:
                byte_parts.append(self.vocab[token_id])
        return b"".join(byte_parts).decode("utf-8", errors="replace")

    def vocab_size(self):
        return len(self.vocab)
```

### 第6步：多语言测试

真正的测试。把英语、中文、表情符号和代码都扔进去。

```python
corpus = (
    "The quick brown fox jumps over the lazy dog. "
    "The quick brown fox runs through the forest. "
    "Machine learning models process natural language. "
    "Deep learning transforms how we build software. "
    "def train(model, data): return model.fit(data) "
    "def predict(model, x): return model(x) "
)

tok = ProductionTokenizer()
tok.train(corpus, num_merges=50)

bos = tok.add_special_token("<|begin|>")
eos = tok.add_special_token("<|end|>")

test_texts = [
    "The quick brown fox.",
    "你好世界",
    "Hello 🌍 World",
    "def foo(x): return x + 1",
    f"<|begin|>Hello<|end|>",
]

for text in test_texts:
    ids = tok.encode(text)
    decoded = tok.decode(ids)
    print(f"Input:   {text}")
    print(f"Tokens:  {len(ids)} ids")
    print(f"Decoded: {decoded}")
    print()
```

中文字符每个产生3个字节。表情符号产生4个字节。这些都不会使分词器崩溃。都不会产生未知token。这就是字节级BPE的力量。

## 应用

### 比较真正的分词器

加载Llama 3、GPT-4和Mistral的实际分词器。看看每个如何处理相同的多语言段落。

```python
import tiktoken

gpt4_enc = tiktoken.get_encoding("cl100k_base")

test_paragraph = "Machine learning is powerful. 机器学习很强大。 L'apprentissage automatique est puissant. 🤖💪"

tokens = gpt4_enc.encode(test_paragraph)
pieces = [gpt4_enc.decode([t]) for t in tokens]
print(f"GPT-4 ({len(tokens)} tokens): {pieces}")
```

```python
from transformers import AutoTokenizer

llama_tok = AutoTokenizer.from_pretrained("meta-llama/Meta-Llama-3-8B")
mistral_tok = AutoTokenizer.from_pretrained("mistralai/Mistral-7B-v0.1")

for name, tok in [("Llama 3", llama_tok), ("Mistral", mistral_tok)]:
    tokens = tok.encode(test_paragraph)
    pieces = tok.convert_ids_to_tokens(tokens)
    print(f"{name} ({len(tokens)} tokens): {pieces[:20]}...")
```

你会看到相同文本的不同token计数。Llama 3的128K词汇表在合并常见模式上更激进。GPT-4的100K居中。Mistral的32K产生更多token，但嵌-入层更小。

权衡始终是一样的：更大的词汇表意味着更短的序列但更多的参数。

## 交付

本课程产出一个用于构建和调试生产分词器的提示。见 `outputs/prompt-tokenizer-builder.md`。

## 练习

1. **简单：** 添加一个 `get_token_bytes(id)` 方法，显示任何token ID的原始字节。用它来检查你最常用的合并token实际上代表什么。
2. **中等：** 实现Llama风格的预分词器，在空白和数字上分割，但保留前导空格。在同一语料上比较其词汇表与GPT-2正则表达式方法。
3. **困难：** 添加一个聊天模板方法，接受 `{"role": ..., "content": ...}` 消息列表，并生成符合Llama 3聊天格式的正确token序列。将其与HuggingFace实现进行测试比较。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------------|----------------------|
| 字节级BPE | "在字节上工作的分词器" | 基础词汇表为256个字节值的BPE——处理任何输入，无未知token |
| 预分词 | "BPE之前的分割" | 防止BPE跨词边界合并的正则表达式或基于规则的分割 |
| NFKC归一化 | "Unicode清理" | 规范分解后跟兼容组合——"fi"连字变成"fi"，全角"A"变成"A" |
| 聊天模板 | "消息如何变成token" | 将角色/内容消息列表转换为扁平token序列的确切格式——模型特有，必须与训练格式匹配 |
| 特殊token | "控制token" | 绕过BPE的保留token ID——[BOS]、[EOS]、[PAD]、聊天标记——在合并前精确匹配 |
| 生育率 | "每个词的token数" | 输出token与输入词的比率——GPT-4英语为1.3，韩语为2-3，越高表示上下文浪费越多 |
| tiktoken | "OpenAI分词器" | Rust BPE实现，带Python绑定——比纯Python快10-100倍 |
| 合并表 | "词汇表" | 训练期间学到的字节对合并的有序列表——这就是分词器学到的知识 |

## 延伸阅读

- [OpenAI tiktoken源码](https://github.com/openai/tiktoken) — GPT-3.5/4使用的Rust BPE实现
- [HuggingFace tokenizers](https://github.com/huggingface/tokenizers) — 支持BPE、WordPiece、Unigram的Rust分词器库
- [Llama 3论文（Meta，2024年）](https://arxiv.org/abs/2407.21783) — 关于128K词汇表和分词器训练的详细信息
- [SentencePiece（Kudo & Richardson，2018年）](https://arxiv.org/abs/1808.06226) — 语言无关的分词技术
- [GPT-2分词器源码](https://github.com/openai/gpt-2/blob/master/src/encoder.py) — 原始的字节到Unicode映射
