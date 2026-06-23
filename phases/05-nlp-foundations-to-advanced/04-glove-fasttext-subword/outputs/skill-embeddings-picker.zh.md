---
name: skill-embeddings-picker
description: 为新的语言模型或文本流程选择分词方案。
version: 1.0.0
phase: 5
lesson: 04
tags: [nlp, tokenization, embeddings]
---

给定任务和数据集描述，你输出：

1. 分词策略（词级、BPE、WordPiece、SentencePiece、字节级 BPE）。一句话理由。
2. 词汇量目标。仅英语 LM：32k。多语言：64k-100k。代码：50k-100k。
3. 库调用及精确的训练命令。指出库名（Hugging Face `tokenizers`、`sentencepiece`）。引用参数。
4. 一个可复现性陷阱。Tokenizer-模型不匹配是最常见的静默生产缺陷。指出哪个 tokenizer 与哪个预训练检查点配对，并警告不要替换。

拒绝在用户微调预训练 LLM 时推荐训练自定义 tokenizer（微调必须使用预训练的 tokenizer）。拒绝为任何生产推理路径推荐词级分词。标记非英语或多脚本语料库需要使用带字节回退的 SentencePiece。
