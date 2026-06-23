# BERT——掩码语言建模

> GPT 预测下一个词。BERT 预测缺失的词。一句话的差别——以及长达五年、一切嵌入形状的时代。

**类型：** 构建
**语言：** Python
**前置要求：** 阶段 7 · 05（完整 Transformer）、阶段 5 · 02（文本表示）
**时间：** ~45 分钟

## 问题

在 2018 年，每个 NLP 任务——情感分析、NER、问答、蕴含——都在自己的标注数据上从头训练自己的模型。没有预先训练好的"理解英语"的检查点可供微调。ELMo（2018）展示了可以用双向 LSTM 预训练上下文嵌入；它有所帮助，但没有泛化。

BERT（Devlin 等，2018）提出了一个问题：如果我们采用 transformer 编码器，在互联网上的每个句子上训练它，并迫使它从两侧的上下文中预测缺失的词，会怎样？然后你在下游任务上微调一个头。参数效率令人震惊。

结果：在 18 个月内，BERT 及其变体（RoBERTa、ALBERT、ELECTRA）主宰了当时存在的每个 NLP 排行榜。到 2020 年，地球上每个搜索引擎、内容审核系统和语义搜索系统内部都有一个 BERT。

在 2026 年，编码器专用模型仍然是分类、检索和结构化提取的正确工具——它们每个 token 的运行速度比解码器快 5-10 倍，且它们的嵌入是现代每个检索堆栈的骨干。ModernBERT（2024 年 12 月）通过 Flash Attention + RoPE + GeGLU 将架构推到了 8K 上下文。

## 概念

![掩码语言建模：选择 token，掩码它们，预测原始内容](../assets/bert-mlm.svg)

### 训练信号

取一个句子：`the quick brown fox jumps over the lazy dog`。

随机掩码 15% 的 token：

```
输入：  the [MASK] brown fox jumps [MASK] the lazy dog
目标：  the  quick brown fox jumps  over  the lazy dog
```

训练模型在掩码位置预测原始 token。因为编码器是双向的，预测位置 1 的 `[MASK]` 可以使用位置 2+ 的 `brown fox jumps`。这就是 GPT 做不到的事情。

### BERT 掩码规则

在被选中进行预测的 15% 的 token 中：

- 80% 被替换为 `[MASK]`。
- 10% 被替换为随机 token。
- 10% 保持不变。

为什么不是总是 `[MASK]`？因为 `[MASK]` 在推理时从不出现。训练模型在 100% 的掩码位置期望 `[MASK]` 会在预训练和微调之间造成分布偏移。10% 随机 + 10% 不变让模型保持诚实。

### 下一句预测（NSP）——以及它为什么被抛弃

原始 BERT 还训练了 NSP：给定两个句子 A 和 B，预测 B 是否跟在 A 后面。RoBERTa（2019）做了消融实验，显示 NSP 有害无益。现代编码器跳过它。

### 2026 年的变化：ModernBERT

2024 年的 ModernBERT 论文用 2026 年的基元重建了模块：

| 组件 | 原始 BERT（2018） | ModernBERT（2024） |
|-----------|----------------------|-------------------|
| 位置编码 | 学习绝对 | RoPE |
| 激活函数 | GELU | GeGLU |
| 归一化 | LayerNorm | Pre-norm RMSNorm |
| 注意力 | 全密集 | 交替局部（128）+ 全局 |
| 上下文长度 | 512 | 8192 |
| 分词器 | WordPiece | BPE |

与 2018 年技术栈不同，它是 Flash-Attention 原生的。在序列长度 8K 下，推理速度比 DeBERTa-v3 快 2-3 倍，且 GLUE 分数更高。

### 2026 年仍会选择编码器的用例

| 任务 | 为什么编码器胜过解码器 |
|------|---------------------------|
| 检索 / 语义搜索嵌入 | 双向上下文 = 更高质量的每 token 嵌入 |
| 分类（情感、意图、毒性） | 一次前向传播；无生成开销 |
| NER / token 标注 | 逐位置输出，原生双向 |
| 零样本蕴含（NLI） | 编码器顶部的分类器头 |
| RAG 的重排序器 | 交叉编码器评分，比 LLM 重排序器快 10 倍 |

```figure
transformer-residual
```

## 构建

### 步骤 1：掩码逻辑

参见 `code/main.py`。函数 `create_mlm_batch` 接收 token ID 列表、词表大小和掩码概率。返回输入 ID（应用了掩码）和标签（仅在掩码位置，其他位置为 -100——PyTorch 的忽略索引约定）。

```python
def create_mlm_batch(tokens, vocab_size, mask_prob=0.15, rng=None):
    input_ids = list(tokens)
    labels = [-100] * len(tokens)
    for i, t in enumerate(tokens):
        if rng.random() < mask_prob:
            labels[i] = t
            r = rng.random()
            if r < 0.8:
                input_ids[i] = MASK_ID
            elif r < 0.9:
                input_ids[i] = rng.randrange(vocab_size)
            # else: 保持原样
    return input_ids, labels
```

### 步骤 2：在小型语料库上运行 MLM 预测

在一个 20 个词、200 个句子的词表上训练一个 2 层编码器 + MLM 头。没有梯度——我们做前向传递的合理性检查。完整训练需要 PyTorch。

### 步骤 3：比较掩码类型

展示三路规则如何使模型在没有 `[MASK]` 的情况下仍可正常使用。在未掩码的句子和掩码的句子上进行预测。两者都应该产生合理的 token 分布，因为模型在训练中看到了两种模式。

### 步骤 4：微调头

将 MLM 头替换为用于玩具情感数据集的分类头。只有头进行训练；编码器被冻结。这是每个 BERT 应用遵循的模式。

## 使用

```python
from transformers import AutoModel, AutoTokenizer

tok = AutoTokenizer.from_pretrained("answerdotai/ModernBERT-base")
model = AutoModel.from_pretrained("answerdotai/ModernBERT-base")

text = "Attention is all you need."
inputs = tok(text, return_tensors="pt")
out = model(**inputs).last_hidden_state   # (1, N, 768)
```

**嵌入模型是微调过的 BERT。** 像 `all-MiniLM-L6-v2` 这样的 `sentence-transformers` 模型是用对比损失训练的 BERT。编码器是一样的。损失变了。

**交叉编码器重排序器也是微调过的 BERT。** 在 `[CLS] query [SEP] doc [SEP]` 上的对分类。查询和文档之间的双向注意力正是交叉编码器在质量上优于双编码器的原因。

**2026 年何时不选择 BERT。** 任何生成式任务。编码器没有合理的方式来自回归生成 token。此外：任何低于 1B 参数的任务，其中小型解码器可以以更大灵活性匹配质量（Phi-3-Mini、Qwen2-1.5B）。

## 交付

参见 `outputs/skill-bert-finetuner.zh.md`。该技能为新的分类或提取任务规划 BERT 微调（骨干选择、头规格、数据、评估、停止条件）。

## 练习

1. **简单。** 运行 `code/main.py` 并打印 10,000 个 token 上的掩码分布。确认约 15% 被选中，其中约 80% 变成了 `[MASK]`。
2. **中等。** 实现整词掩码：如果一个词被分词为子词，则要么全部掩码要么不掩码。测量这在 500 句语料库上是否提高了 MLM 准确率。
3. **困难。** 在来自公开数据集的 10,000 个句子上训练一个微型（2 层，d=64）BERT。微调 `[CLS]` token 用于 SST-2 情感分析。与同等参数量的解码器专用基线比较——哪个胜出？

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------------|-----------------------|
| MLM | "掩码语言建模" | 训练信号：随机替换 15% 的 token 为 `[MASK]`，预测原始 token。 |
| 双向 | "同时看两边" | 编码器注意力没有因果掩码——每个位置能看到所有其他位置。 |
| `[CLS]` | "汇聚 token" | 在每个序列前添加的特殊 token；其最终嵌入用作句子级表示。 |
| `[SEP]` | "分段分隔符" | 分隔成对序列（如查询/文档、句子 A/B）。 |
| NSP | "下一句预测" | BERT 的第二个预训练任务；在 RoBERTa 中被证明无用，2019 年后被抛弃。 |
| 微调 | "适应任务" | 保持编码器大部分冻结；在顶部为下游任务训练一个小型头。 |
| 交叉编码器 | "重排序器" | 一个 BERT，同时接收查询和文档作为输入，输出相关性分数。 |
| ModernBERT | "2024 年刷新" | 用 RoPE、RMSNorm、GeGLU、交替局部/全局注意力、8K 上下文重建的编码器。 |

## 延伸阅读

- [Devlin et al. (2018). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding](https://arxiv.org/abs/1810.04805) —— 原始论文。
- [Liu et al. (2019). RoBERTa: A Robustly Optimized BERT Pretraining Approach](https://arxiv.org/abs/1907.11692) —— 如何正确训练 BERT；去掉了 NSP。
- [Clark et al. (2020). ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators](https://arxiv.org/abs/2003.10555) —— 在相同计算量下，替换 token 检测胜过 MLM。
- [Warner et al. (2024). Smarter, Better, Faster, Longer: A Modern Bidirectional Encoder](https://arxiv.org/abs/2412.13663) —— ModernBERT 论文。
- [HuggingFace `modeling_bert.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/bert/modeling_bert.py) —— 规范编码器参考。
