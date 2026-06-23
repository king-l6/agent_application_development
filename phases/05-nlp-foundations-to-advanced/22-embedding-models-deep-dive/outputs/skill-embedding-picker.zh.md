---
name: embedding-picker
description: 为给定语料和部署场景选择嵌入模型、维度和检索模式。
version: 1.0.0
phase: 5
lesson: 22
tags: [nlp, embeddings, retrieval]
---

给定语料（大小、语言、领域、平均长度）、部署目标（云端/边缘/本地）、延迟预算和存储预算，输出：

1. 模型。命名的检查点或 API。一句话理由。
2. 维度。完整 / Matryoshka 截断 / int8 量化。理由与存储预算相关。
3. 模式。稠密 / 稀疏 / 多向量 / 混合。理由。
4. 查询前缀/模板（如果模型卡片要求）。
5. 评估方案。与领域相关的 MTEB 任务 + 使用 nDCG@10 的留出领域评估。

拒绝未经领域验证就将 Matryoshka 截断到 64 维度以下的建议。拒绝为少于 10k 段落的语料推荐 ColBERTv2（开销不合理）。标记将长文档语料（>8k token）路由到具有 512 token 窗口的模型的情况。
