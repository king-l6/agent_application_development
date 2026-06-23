# 机器翻译

> 翻译是支撑了 NLP 研究三十年并在继续付账的任务。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段5·10（注意力机制），阶段5·04（GloVe、FastText、子词）
**时间：** 约75分钟

## 问题

一个模型读取一种语言的句子，产生另一种语言的句子。长度会变化。词序会变化。有些源词映射到多个目标词，反之亦然。习语拒绝一一对应。"I miss you" 在法语中是 "tu me manques"——字面上是 "you are lacking to me"。没有任何词级别的对齐能处理这种情况。

机器翻译是迫使 NLP 发明编码器-解码器、注意力、Transformer，以及最终整个 LLM 范式的任务。每一步进步的到来，都是因为翻译质量是可测量的，而人类与机器之间的差距是顽固的。

本课跳过历史课，教授 2026 年的工作流水线：预训练的多语言编码器-解码器（NLLB-200 或 mBART）、子词词元化、束搜索、BLEU 和 chrF 评估，以及仍然未被发现就上线的少数失败模式。

## 概念

![MT 流水线：词元化 → 编码 → 带注意力的解码 → 去词元化](../assets/mt-pipeline.svg)

现代 MT 是在平行文本上训练的 Transformer 编码器-解码器。编码器以其语言的词元化读取源。解码器通过交叉注意力（第 10 课）使用编码器的输出，一次生成一个子词。解码使用束搜索以避免贪心解码陷阱。输出被去词元化、去大小写还原，并与参考译文进行评分。

三个操作选择决定了真实世界的 MT 质量。

- **分词器。** 在混合语言语料库上训练的 SentencePiece BPE。跨语言共享词汇表使 NLLB 中的零样本翻译对成为可能。
- **模型大小。** NLLB-200 distilled 600M 可放在笔记本上。NLLB-200 3.3B 是发布的生产默认设置。54.5B 是研究上限。
- **解码。** 一般内容用束宽 4-5。长度惩罚以避免输出过短。需要术语一致性时使用约束解码。

## 动手构建

### 第 1 步：调用预训练 MT

```python
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

model_id = "facebook/nllb-200-distilled-600M"
tok = AutoTokenizer.from_pretrained(model_id, src_lang="eng_Latn")
model = AutoModelForSeq2SeqLM.from_pretrained(model_id)

src = "The cats are running."
inputs = tok(src, return_tensors="pt")

out = model.generate(
    **inputs,
    forced_bos_token_id=tok.convert_tokens_to_ids("fra_Latn"),
    num_beams=5,
    length_penalty=1.0,
    max_new_tokens=64,
)
print(tok.batch_decode(out, skip_special_tokens=True)[0])
```

```text
Les chats courent.
```

这里有三件事重要。`src_lang` 告诉分词器应用哪个脚本和切分规则。`forced_bos_token_id` 告诉解码器生成哪种语言。两者都是 NLLB 特定的技巧；mBART 和 M2M-100 使用它们自己的约定，并且不能互换。

### 第 2 步：BLEU 和 chrF

BLEU 测量输出和参考之间的 n-gram 重叠。四个参考 n-gram 大小（1-4），几何平均精确率，对过短输出有简短惩罚。分数在 [0, 100] 范围内。广泛使用。解释起来令人沮丧：30 BLEU 是"可用"；40 是"好"；50 是"优秀"；低于 1 BLEU 的差异是噪声。

chrF 测量字符级别的 F 分数。对形态丰富的语言更敏感，BLEU 在这些语言上会低估匹配。通常与 BLEU 一起报告。

```python
import sacrebleu

hypotheses = ["Les chats courent."]
references = [["Les chats courent."]]

bleu = sacrebleu.corpus_bleu(hypotheses, references)
chrf = sacrebleu.corpus_chrf(hypotheses, references)
print(f"BLEU: {bleu.score:.1f}  chrF: {chrf.score:.1f}")
```

始终使用 `sacrebleu`。它标准化了词元化，使分数在论文之间可比。自己实现 BLEU 计算是误导性基准测试的发生方式。

### 三层评估层级（2026）

现代 MT 评估使用三个互补的度量族。至少交付两个。

- **启发式**（BLEU、chrF）。快速、基于参考、可解释、对释义不敏感。用于遗留比较和回归检测。
- **学习型**（COMET、BLEURT、BERTScore）。在人类判断上训练的神经模型；比较翻译与源和参考的语义相似度。自 2023 年以来 COMET 与 MT 研究的关联度最高，是在质量重要的场景下的 2026 生产默认选择。
- **LLM 作为评判者**（无参考）。提示大型模型对翻译的流畅度、充分性、语气、文化适宜性进行评分。当评分标准设计良好时，GPT-4 作为评判者的结果与人类的一致性约 80%。用于不存在参考的开放性内容。

实用的 2026 技术栈：`sacrebleu` 用于 BLEU 和 chrF，`unbabel-comet` 用于 COMET，以及提示 LLM 作为最终面向人类的信号。在信任其在生产数据上的表现之前，先用 50-100 个人工标注的样本校准每个度量。

无参考度量（COMET-QE、BLEURT-QE、LLM 作为评判者）让你无需参考即可评估翻译，这对不存在参考译文的长尾语言对非常重要。

### 第 3 步：生产环境中什么会出问题

上述工作流水线 80% 的时间会流畅翻译，剩余 20% 的时间会悄无声息地失败。已知的失败模式：

- **幻觉。** 模型编造源中不存在的内容。常见于不熟悉的领域词汇。症状：输出流畅但声称源中没有陈述的事实。缓解措施：对领域术语进行约束解码，对受监管内容进行人工审核，监控输出是否比输入长很多。
- **脱靶生成。** 模型翻译成错误的语言。NLLB 在稀有的语言对上出人意料地容易出现这个问题。缓解措施：验证 `forced_bos_token_id` 并始终使用语言 ID 模型检查输出进行解码。
- **术语不一致。** "Sign up" 在文档 1 中变成 "s'inscrire"，在文档 2 中变成 "créer un compte"。对于 UI 文本和面向用户的字符串，一致性比原始质量更重要。缓解措施：词汇表约束解码或事后编辑词典。
- **语域不匹配。** 法语的 "tu" 与 "vous"，日语的礼貌级别。模型会选择训练中更常见的形式。对于面向客户的翻译，这通常是错误的。缓解措施：如果模型支持的话使用带语域标记的提示前缀，或仅在正式语料上微调一个小模型。
- **短输入的长度爆炸。** 很短的输入句子通常会产生过长的翻译，因为长度惩罚在源低于约 5 个词元时会急剧下降。缓解措施：与源长度成比例的硬性最大长度限制。

### 第 4 步：针对领域的微调

预训练模型是通才。法律、医学或游戏对话翻译可以通过在领域平行数据上微调获得可衡量的改进。方案并不特别：

```python
from transformers import Trainer, TrainingArguments
from datasets import Dataset

pairs = [
    {"src": "The defendant pleaded guilty.", "tgt": "L'accusé a plaidé coupable."},
]

ds = Dataset.from_list(pairs)


def preprocess(ex):
    return tok(
        ex["src"],
        text_target=ex["tgt"],
        truncation=True,
        max_length=128,
        padding="max_length",
    )


ds = ds.map(preprocess, remove_columns=["src", "tgt"])

args = TrainingArguments(output_dir="out", per_device_train_batch_size=4, num_train_epochs=3, learning_rate=3e-5)
Trainer(model=model, args=args, train_dataset=ds).train()
```

几千个高质量平行样本胜过几十万个噪声网络爬取样本。训练数据的质量是生产中最大的杠杆。

## 使用

2026 年 MT 的生产技术栈：

| 用例 | 推荐起点 |
|------|---------|
| 任意到任意，200 种语言 | `facebook/nllb-200-distilled-600M`（笔记本）或 `nllb-200-3.3B`（生产） |
| 以英语为中心，高质量，50 种语言 | `facebook/mbart-large-50-many-to-many-mmt` |
| 短运行、低成本推理、英法/德/西 | Helsinki-NLP / Marian 模型 |
| 延迟关键的浏览器端 | ONNX 量化 Marian（约 50 MB） |
| 最高质量，愿意付费 | GPT-4 / Claude / Gemini 带翻译提示 |

截至 2026 年，LLM 在几个语言对上的表现已经超过专门的 MT 模型，特别是在习语内容和长上下文方面。权衡是每词元成本和延迟。当上下文长度、风格一致性或通过提示进行的领域适配比吞吐量更重要时，选择 LLM。

## 交付

保存为 `outputs/skill-mt-evaluator.md`：

```markdown
---
name: mt-evaluator
description: 评估机器翻译输出是否可以上线。
version: 1.0.0
phase: 5
lesson: 11
tags: [nlp, translation, evaluation]
---

给定源文本和候选翻译，输出：

1. 自动分数估计。你期望的 BLEU 和 chrF 范围。说明是否有参考译文可用。
2. 五点人工可验证检查清单：(a) 内容保存（无幻觉），(b) 正确语言，(c) 语域/形式匹配，(d) 如果提供词汇表则术语一致性，(e) 无截断或长度爆炸。
3. 一个需要探查的领域特定问题。例如，法律：命名实体和法规引用。医学：药物名称和剂量。UI：占位符变量 `{name}`。
4. 置信度标记。"可以上线" / "审查后上线" / "不能上线"。与第 2 步中发现问题的严重程度挂钩。

拒绝在没有语言 ID 检查的情况下上线翻译。拒绝在没有参考译文的情况下进行评估，除非用户明确选择无参考评分（COMET-QE、BLEURT-QE）。标记任何超过 1000 词元的内容可能需要分块翻译。
```

## 练习

1. **简单。** 使用 `nllb-200-distilled-600M` 将一个 5 句英文段落翻译成法语再翻译回英语。测量往返结果与原文的接近程度。你应该会看到语义保留但词汇选择有变化。
2. **中等。** 使用 `fasttext lid.176` 或 `langdetect` 实现翻译输出的语言 ID 检查。将其集成到 MT 调用中，以便在返回结果前捕获脱靶生成。
3. **困难。** 在你选择的 5,000 对领域语料库上微调 `nllb-200-distilled-600M`。在保留集上测量微调前后的 BLEU。报告哪些类型的句子改进了，哪些退步了。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| BLEU | 翻译分数 | 带简短惩罚的 n-gram 精确率。[0, 100]。 |
| chrF | 字符 F 分数 | 字符级别的 F 分数。对形态丰富语言更敏感。 |
| NMT | 神经 MT | 在平行文本上训练的 Transformer 编码器-解码器。2017+ 默认选择。 |
| NLLB | No Language Left Behind | Meta 的 200 语言 MT 模型系列。 |
| 约束解码 | 受控输出 | 强制特定词元或 n-gram 在输出中出现/不出现。 |
| 幻觉 | 编造内容 | 源中不支持的模型输出。 |

## 延伸阅读

- [Costa-jussà et al. (2022). No Language Left Behind: Scaling Human-Centered Machine Translation](https://arxiv.org/abs/2207.04672) — NLLB 论文。
- [Post (2018). A Call for Clarity in Reporting BLEU Scores](https://aclanthology.org/W18-6319/) — 为什么 `sacrebleu` 是报告 BLEU 的唯一正确方式。
- [Popović (2015). chrF: character n-gram F-score for automatic MT evaluation](https://aclanthology.org/W15-3049/) — chrF 论文。
- [Hugging Face MT guide](https://huggingface.co/docs/transformers/tasks/translation) — 实用微调讲解。
