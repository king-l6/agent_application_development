# 序列到序列模型

> 两个 RNN 假装成一个翻译器。它们遇到的瓶颈正是注意力存在的原因。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段5·08（用于文本的 CNN + RNN），阶段3·11（PyTorch 入门）
**时间：** 约75分钟

## 问题

分类将一个可变长度的序列映射到单个标签。翻译将一个可变长度的序列映射到另一个可变长度的序列。输入和输出存在于不同的词汇表中，可能是不同的语言，且不能保证长度一致。

Seq2Seq 架构（Sutskever, Vinyals, Le, 2014）用一个有意简单的方案解决了这个问题。两个 RNN。一个读取源句子并产生一个固定大小的上下文向量。另一个读取该向量，并逐个词元地生成目标句子。和你为第 8 课编写的代码相同，只是组装方式不同。

这值得学习有两个原因。首先，上下文向量瓶颈是 NLP 中最具教学意义的失败。它促使了注意力和 Transformer 的所有优点。其次，训练方案（教师强制、计划采样、推理时的束搜索）仍然适用于包括 LLM 在内的每个现代生成系统。

## 概念

**编码器。** 一个读取源句子的 RNN。它的最终隐藏状态是**上下文向量**——整个输入的固定大小摘要。理想情况下，不丢失源句的任何信息。

**解码器。** 另一个从上下文向量初始化的 RNN。每一步它接收之前生成的词元作为输入，并产生目标词汇表上的一个概率分布。使用采样或 argmax 选择下一个词元。将其反馈回解码器。重复直到产生 `<EOS>` 词元或达到最大长度。

**训练：** 每个解码器步骤的交叉熵损失，在序列上求和。通过两个网络的标准时间反向传播。

**教师强制。** 在训练期间，解码器在步骤 `t` 的输入是位置 `t-1` 的*真实*词元，而不是解码器自己的前一个预测。这稳定了训练；没有它，早期错误会级联放大，模型永远学不会。在推理时，你不得不使用模型自己的预测，因此训练和推理之间总是存在分布差异。这个差异称为**暴露偏差**。

**瓶颈。** 编码器学到的关于源的所有信息必须被压缩到那一个上下文向量中。长句子丢失细节。生僻词被模糊化。词序变化（chat noir vs. black cat）必须被记住，而不是计算出来。

注意力（第 10 课）通过让解码器查看*每个*编码器隐藏状态来解决这个问题，而不仅仅是最后一个。这就是全部的要点。

## 动手构建

### 第 1 步：编码器

```python
import torch
import torch.nn as nn


class Encoder(nn.Module):
    def __init__(self, src_vocab_size, embed_dim, hidden_dim):
        super().__init__()
        self.embed = nn.Embedding(src_vocab_size, embed_dim, padding_idx=0)
        self.gru = nn.GRU(embed_dim, hidden_dim, batch_first=True)

    def forward(self, src):
        e = self.embed(src)
        outputs, hidden = self.gru(e)
        return outputs, hidden
```

`outputs` 的形状是 `[batch, seq_len, hidden_dim]`——每个输入位置一个隐藏状态。`hidden` 的形状是 `[1, batch, hidden_dim]`——最后一步的隐藏状态。第 8 课说"对输出进行池化用于分类"。这里我们保留最后隐藏状态作为上下文向量，而忽略每步的输出。

### 第 2 步：解码器

```python
class Decoder(nn.Module):
    def __init__(self, tgt_vocab_size, embed_dim, hidden_dim):
        super().__init__()
        self.embed = nn.Embedding(tgt_vocab_size, embed_dim, padding_idx=0)
        self.gru = nn.GRU(embed_dim, hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, tgt_vocab_size)

    def forward(self, token, hidden):
        e = self.embed(token)
        out, hidden = self.gru(e, hidden)
        logits = self.fc(out)
        return logits, hidden
```

解码器一次被调用一步。输入：一批单个词元和当前隐藏状态。输出：下一个词元的词汇表 logits 和更新后的隐藏状态。

### 第 3 步：使用教师强制的训练循环

```python
def train_batch(encoder, decoder, src, tgt, bos_id, optimizer, teacher_forcing_ratio=0.9):
    optimizer.zero_grad()
    _, hidden = encoder(src)
    batch_size, tgt_len = tgt.shape
    input_token = torch.full((batch_size, 1), bos_id, dtype=torch.long)
    loss = 0.0
    loss_fn = nn.CrossEntropyLoss(ignore_index=0)

    for t in range(tgt_len):
        logits, hidden = decoder(input_token, hidden)
        step_loss = loss_fn(logits.squeeze(1), tgt[:, t])
        loss += step_loss
        use_teacher = torch.rand(1).item() < teacher_forcing_ratio
        if use_teacher:
            input_token = tgt[:, t].unsqueeze(1)
        else:
            input_token = logits.argmax(dim=-1)

    loss.backward()
    optimizer.step()
    return loss.item() / tgt_len
```

两个值得提及的参数。`ignore_index=0` 跳过填充词元上的损失。`teacher_forcing_ratio` 是每一步使用真实词元而非模型预测的概率。从 1.0 开始（完全教师强制），在训练过程中退火到约 0.5，以缩小暴露偏差差距。

### 第 4 步：推理循环（贪心）

```python
@torch.no_grad()
def greedy_decode(encoder, decoder, src, bos_id, eos_id, max_len=50):
    _, hidden = encoder(src)
    batch_size = src.shape[0]
    input_token = torch.full((batch_size, 1), bos_id, dtype=torch.long)
    output_ids = []
    for _ in range(max_len):
        logits, hidden = decoder(input_token, hidden)
        next_token = logits.argmax(dim=-1)
        output_ids.append(next_token)
        input_token = next_token
        if (next_token == eos_id).all():
            break
    return torch.cat(output_ids, dim=1)
```

贪心解码在每一步选择概率最高的词元。它可能会走偏：一旦你确定了一个词元，就无法撤回。**束搜索**在每一步保持前 `k` 个部分序列存活，并在最后选择得分最高的完整序列。束宽 3-5 是标准做法。

### 第 5 步：瓶颈演示

在玩具复制任务上训练模型：源 `[a, b, c, d, e]`，目标 `[a, b, c, d, e]`。增加序列长度。观察准确率。

```
seq_len=5   复制准确率: 98%
seq_len=10  复制准确率: 91%
seq_len=20  复制准确率: 62%
seq_len=40  复制准确率: 23%
```

单个 GRU 隐藏状态无法无损地记住 40 个词元的输入。信息在每个编码器步骤都存在，但解码器只看到最后状态。注意力直接解决了这个问题。

## 使用

PyTorch 有基于 `nn.Transformer` 和 `nn.LSTM` 的 seq2seq 模板。Hugging Face 的 `transformers` 库提供了在数十亿词元上训练的完整编码器-解码器模型（BART、T5、mBART、NLLB）。

```python
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

tok = AutoTokenizer.from_pretrained("facebook/bart-base")
model = AutoModelForSeq2SeqLM.from_pretrained("facebook/bart-base")

src = tok("Translate this to French: Hello, how are you?", return_tensors="pt")
out = model.generate(**src, max_new_tokens=50, num_beams=4)
print(tok.decode(out[0], skip_special_tokens=True))
```

现代编码器-解码器已用 Transformer 取代了 RNN。高层形状（编码器、解码器、逐词元生成）与 2014 年的 seq2seq 论文相同。每个模块内部的机制有所不同。

### 什么时候仍然使用基于 RNN 的 seq2seq

对于新项目，几乎从不。特定的例外情况：

- 流式翻译，每次消费一个词元，内存有限。
- 设备端文本生成，Transformer 内存成本过高。
- 教学用途。理解编码器-解码器瓶颈是理解 Transformer 为何胜出的最快途径。

### 暴露偏差及其缓解方法

- **计划采样。** 在训练过程中退火教师强制比率，使模型学会从自己的错误中恢复。
- **最小风险训练。** 在句子级别的 BLEU 分数上训练，而不是词元级别的交叉熵。更接近你真正想要的目标。
- **强化学习微调。** 用一个指标奖励序列生成器。用于现代 LLM 的 RLHF。

这三种方法仍然适用于基于 Transformer 的生成。

## 交付

保存为 `outputs/prompt-seq2seq-design.md`：

```markdown
---
name: seq2seq-design
description: 为给定任务设计序列到序列流水线。
phase: 5
lesson: 09
---

给定一个任务（翻译、摘要、释义、问题改写），输出：

1. 架构。预训练 Transformer 编码器-解码器（BART、T5、mBART、NLLB）是默认选择。仅在有特定约束时使用基于 RNN 的 seq2seq。
2. 起始检查点。命名它（`facebook/bart-base`、`google/flan-t5-base`、`facebook/nllb-200-distilled-600M`）。使检查点与任务和语言覆盖范围匹配。
3. 解码策略。确定输出用贪心，质量用束搜索（宽度 4-5），多样性用带温度的采样。一句话理由。
4. 交付前需验证的一个失败模式。暴露偏差表现为较长输出上的生成漂移；在第 90 百分位长度上抽样 20 个输出并目测检查。

拒绝推荐在少于一百万个并行样本时从头训练 seq2seq。标记任何对面向用户的内容使用贪心解码的流水线为脆弱（贪心会重复和循环）。
```

## 练习

1. **简单。** 实现玩具复制任务。在目标等于源的输入-输出对上训练 GRU seq2seq。测量长度 5、10、20 时的准确率。重现瓶颈。
2. **中等。** 添加束宽为 3 的束搜索解码。在一个小型平行语料库上测量 BLEU，与贪心解码对比。记录束搜索在哪些地方胜出（通常是最后的词元）以及在哪些地方没有区别。
3. **困难。** 在 10k 对释义数据集上微调 `facebook/bart-base`。将微调模型的束宽 4 输出与基础模型在保留输入上的输出进行比较。报告 BLEU 并挑选 10 个定性示例。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 编码器 | 输入 RNN | 读取源。产生每步隐藏状态和最终上下文向量。 |
| 解码器 | 输出 RNN | 从上下文向量初始化。每次生成一个目标词元。 |
| 上下文向量 | 摘要 | 编码器的最终隐藏状态。固定大小。注意力解决的瓶颈。 |
| 教师强制 | 使用真实词元 | 训练时馈送真实的先前词元。稳定学习。 |
| 暴露偏差 | 训练/测试差距 | 模型在真实词元上训练，从未练习从自己的错误中恢复。 |
| 束搜索 | 更好的解码 | 在每一步保持前 k 个部分序列存活，而不是贪心地确定一个。 |

## 延伸阅读

- [Sutskever, Vinyals, Le (2014). Sequence to Sequence Learning with Neural Networks](https://arxiv.org/abs/1409.3215) — 原始 seq2seq 论文。4 页。
- [Cho et al. (2014). Learning Phrase Representations using RNN Encoder-Decoder for Statistical Machine Translation](https://arxiv.org/abs/1406.1078) — 引入了 GRU 和编码器-解码器框架。
- [Bahdanau, Cho, Bengio (2014). Neural Machine Translation by Jointly Learning to Align and Translate](https://arxiv.org/abs/1409.0473) — 注意力论文。读完本课后立即阅读。
- [PyTorch NLP from Scratch tutorial](https://pytorch.org/tutorials/intermediate/seq2seq_translation_tutorial.html) — 可构建的 seq2seq + 注意力代码。
