# T5、BART — 编码器-解码器模型

> 编码器理解。解码器生成。将它们重新组合，你就得到了一个专为输入 → 输出任务构建的模型：翻译、摘要、重写、转录。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 7 · 05（完整 Transformer），阶段 7 · 06（BERT），阶段 7 · 07（GPT）
**时间：** ~45 分钟

## 问题

解码器专用的 GPT 和编码器专用的 BERT 各自为了不同目标精简了 2017 年的架构。但许多任务天然是输入-输出的：

- 翻译：英语 → 法语。
- 摘要：5,000 token 的文章 → 200 token 的摘要。
- 语音识别：音频 token → 文本 token。
- 结构化提取：散文 → JSON。

对于这些任务，编码器-解码器是最合适的。编码器生成源的密集表示。解码器生成输出，每一步都通过交叉注意力关注该表示。训练是在输出端移位一位。与 GPT 相同的损失，只是以编码器输出为条件。

两篇论文定义了现代方案：

1. **T5**（Raffel 等人，2019）。"Text-to-Text Transfer Transformer。"每个 NLP 任务都被重新定义为文本输入、文本输出。单一架构、单一词汇表、单一损失。在掩码跨度预测（在输入中破坏跨度，在输出中解码它们）上预训练。
2. **BART**（Lewis 等人，2019）。"Bidirectional and Auto-Regressive Transformer。"去噪自编码器：以多种方式破坏输入（打乱、掩码、删除、旋转），让解码器重建原始内容。

在 2026 年，编码器-解码器格式在输入结构重要的地方继续存在：

- Whisper（语音 → 文本）。
- Google 的翻译堆栈。
- 一些具有独特上下文和编辑结构的代码补全/修复模型。
- Flan-T5 及其变体用于结构化推理任务。

解码器专用模型赢得了聚光灯，但编码器-解码器从未消失。

## 概念

![带有交叉注意力的编码器-解码器](../assets/encoder-decoder.svg)

### 前向循环

```
source tokens ─▶ encoder ─▶ (N_src, d_model)  ──┐
                                                 │
target tokens ─▶ decoder block                   │
                 ├─▶ masked self-attention       │
                 ├─▶ cross-attention ◀───────────┘
                 └─▶ FFN
                ↓
              next-token logits
```

关键的是，编码器每个输入只运行一次。解码器自回归运行，但在每一步都交叉关注**同一个**编码器输出。缓存编码器输出对于长输入来说是一个免费的速度提升。

### T5 预训练——跨度破坏

随机选取输入的跨度（平均长度 3 个 token，总计 15%）。用唯一的哨兵 token 替换每个跨度：`<extra_id_0>`、`<extra_id_1>` 等。解码器只输出被破坏的跨度及其哨兵前缀：

```
source: The quick <extra_id_0> fox jumps <extra_id_1> dog
target: <extra_id_0> brown <extra_id_1> over the lazy
```

比预测整个序列的信号更廉价。在 T5 论文的消融实验中，与 MLM（BERT）和 prefix-LM（UniLM）具有竞争力。

### BART 预训练——多种噪声去噪

BART 尝试了五种加噪函数：

1. Token 掩码。
2. Token 删除。
3. 文本填充（掩码一个跨度，解码器插入正确的长度）。
4. 句子排列。
5. 文档旋转。

文本填充 + 句子排列的组合在下游指标上效果最好。解码器始终重建原始内容。BART 的输出是完整序列，而不仅仅是破坏的跨度——因此预训练计算量高于 T5。

### 推理

与 GPT 相同的自回归生成。Greedy / 束 / top-p 采样都适用。束搜索（宽度 4-5）是翻译和摘要的标准，因为输出分布比聊天更窄。

### 2026 年如何选择变体

| 任务 | 编码器-解码器？ | 原因 |
|------|------------------|------|
| 翻译 | 通常是 | 清晰的源序列；固定的输出分布；束搜索有效 |
| 语音转文本 | 是（Whisper） | 输入模态与输出不同；编码器塑造音频特征 |
| 聊天 / 推理 | 否，解码器专用 | 没有持久的"输入"——对话就是序列本身 |
| 代码补全 | 通常否 | 长上下文的解码器专用模型胜出；Qwen 2.5 Coder 等代码模型是解码器专用的 |
| 摘要 | 两者皆可 | BART、PEGASUS 超越了早期解码器专用基线；现代解码器专用 LLM 能匹配它们 |
| 结构化提取 | 两者皆可 | T5 很简洁因为"文本 → 文本"吸收了任何输出格式 |

2022 年以来的趋势：解码器专用模型接管了编码器-解码器曾经拥有的任务，因为（a）经过指令微调的解码器专用 LLM 通过提示就能泛化到任何任务，（b）一种架构比两种更容易扩展，（c）RLHF 假设解码器架构。编码器-解码器在输入模态不同（语音、图像）或束搜索质量重要的情况下保持优势。

## 构建它

见 `code/main.py`。我们为一个玩具语料库实现 T5 风格的跨度破坏——这是本课最有用的部分，因为它出现在每个编码器-解码器预训练方案中。

### 步骤 1：跨度破坏

```python
def corrupt_spans(tokens, mask_rate=0.15, mean_span=3.0, rng=None):
    """选择总长度约为 ~mask_rate 比例的 token 的跨度。返回 (损坏输入, 目标)。"""
    n = len(tokens)
    n_mask = max(1, int(n * mask_rate))
    n_spans = max(1, int(round(n_mask / mean_span)))
    ...
```

目标格式遵循 T5 约定：`<sent0> span0 <sent1> span1 ...`。损坏输入将未改变的 token 与跨度位置上的哨兵 token 交错排列。

### 步骤 2：验证往返

给定损坏的输入和目标，重建原始句子。如果你的破坏是可逆的，前向传播就是明确定义的。这是一个完整性检查——真正的训练从不这样做，但这个测试成本低廉，并且能捕获跨度记账中的差一错误。

### 步骤 3：BART 加噪

五个函数：`token_mask`、`token_delete`、`text_infill`、`sentence_permute`、`document_rotate`。组合其中两个并展示结果。

## 使用它

HuggingFace 参考：

```python
from transformers import T5ForConditionalGeneration, T5Tokenizer
tok = T5Tokenizer.from_pretrained("google/flan-t5-base")
model = T5ForConditionalGeneration.from_pretrained("google/flan-t5-base")

inputs = tok("translate English to French: Attention is all you need.", return_tensors="pt")
out = model.generate(**inputs, max_new_tokens=32)
print(tok.decode(out[0], skip_special_tokens=True))
```

T5 的技巧：任务名称放在输入文本中。同一个模型处理数十种任务，因为每个任务都是文本输入、文本输出。在 2026 年，这种模式已被指令微调的解码器专用模型泛化，但 T5 是第一个将其系统化的。

## 交付它

见 `outputs/skill-seq2seq-picker.md`。该技能根据输入-输出结构、延迟和质量目标，为新的任务在编码器-解码器和解码器专用之间做出选择。

## 练习

1. **简单。** 运行 `code/main.py`，对一个 30 token 的句子应用跨度破坏，验证将非哨兵源 token 与解码后的目标跨度拼接起来能重现原始内容。
2. **中等。** 实现 BART 的 `text_infill` 噪声：将随机跨度替换为单个 `<mask>` token，解码器必须推断正确的跨度长度和内容。展示一个示例。
3. **困难。** 在一个微小的英语 → 猪拉丁语语料库（200 对）上微调 `flan-t5-small`。在保留的 50 对测试集上测量 BLEU。与在相同数据上使用相同算力微调 `Llama-3.2-1B` 进行比较。

## 关键术语

| 术语 | 大家的说法 | 实际含义 |
|------|-----------------|-----------------------|
| 编码器-解码器 | "Seq2seq transformer" | 两个堆叠：双向编码器处理输入，带交叉注意力的因果解码器处理输出。 |
| 交叉注意力 | "源与目标的对话" | 解码器的 Q × 编码器的 K/V。编码器信息进入解码器的唯一途径。 |
| 跨度破坏 | "T5 的预训练技巧" | 用哨兵 token 替换随机跨度；解码器输出这些跨度。 |
| 去噪目标 | "BART 的游戏" | 对输入应用噪声函数，训练解码器重建干净的序列。 |
| 哨兵 token | "`<extra_id_N>` 占位符" | 特殊 token，在源中标记被破坏的跨度，在目标中重新标记它们。 |
| Flan | "指令微调的 T5" | 在超过 1,800 个任务上微调的 T5；使编码器-解码器在指令遵循方面具有竞争力。 |
| 束搜索 | "解码策略" | 每一步保留前 k 个部分序列；翻译/摘要的标准方法。 |
| 教师强制 | "训练时的输入" | 在训练期间，向解码器提供真实的前一个输出 token，而不是采样的 token。 |

## 延伸阅读

- [Raffel et al. (2019). Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer](https://arxiv.org/abs/1910.10683) — T5。
- [Lewis et al. (2019). BART: Denoising Sequence-to-Sequence Pre-training for Natural Language Generation, Translation, and Comprehension](https://arxiv.org/abs/1910.13461) — BART。
- [Chung et al. (2022). Scaling Instruction-Finetuned Language Models](https://arxiv.org/abs/2210.11416) — Flan-T5。
- [Radford et al. (2022). Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356) — Whisper，2026 年编码器-解码器的典范。
- [HuggingFace `modeling_t5.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/t5/modeling_t5.py) — 参考实现。
