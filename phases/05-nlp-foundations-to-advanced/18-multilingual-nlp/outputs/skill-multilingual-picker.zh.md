---
name: multilingual-picker
description: 为多语言 NLP 任务选择源语言、目标模型和评估计划。
version: 1.0.0
phase: 5
lesson: 18
tags: [nlp, multilingual, cross-lingual]
---

给定需求（目标语言、任务类型、每种语言可用的标注数据），输出：

1. 微调的源语言。默认英语；如果目标语言有类型学上接近的高资源语言，检查 LANGRANK 或 qWALS。
2. 基础模型。XLM-R（分类）、mT5（生成）、NLLB（翻译）、Aya-23（生成式 LLM）。
3. 少样本预算。如果可用，从 100-500 个目标语言示例开始。仅当标注不可行时使用零样本。
4. 评估计划。每种语言的准确率（不聚合）、跨语言一致性、非拉丁文字上的实体级 F1。

拒绝在没有每种语言评估的情况下部署多语言模型——聚合指标隐藏长尾失败。标记分词覆盖率低的文字（阿姆哈拉语、提格雷语、许多非洲语言）为需要使用带字节回退的模型（SentencePiece 带 byte_fallback=True，或字节级分词器如 GPT-2）。
