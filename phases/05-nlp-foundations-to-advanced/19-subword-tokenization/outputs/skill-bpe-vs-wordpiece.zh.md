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
