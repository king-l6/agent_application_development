---
name: summary-picker
description: 选择抽取式或生成式，命名库，添加事实性检查。
version: 1.0.0
phase: 5
lesson: 12
tags: [nlp, summarization]
---

给定一个任务（文档类型、合规要求、长度、计算预算），输出：

1. 方法。抽取式或生成式。用一句话解释原因。
2. 起始模型/库。命名它。`sumy.TextRankSummarizer`、`facebook/bart-large-cnn`、`google/pegasus-pubmed` 或 LLM 提示。
3. 评估计划。ROUGE-1、ROUGE-2、ROUGE-L（使用带词干还原的 `rouge-score`）。如果是生成式，外加事实性检查。
4. 一个需要探查的失败模式。实体替换是生成式新闻摘要中最常见的；标记源实体未出现在摘要中的样本。

拒绝在医疗、法律、金融或受监管内容上使用生成式摘要而不加事实性检查门控。标记输入超过模型上下文窗口为需要分块的 map-reduce 摘要，而不仅仅是截断。
