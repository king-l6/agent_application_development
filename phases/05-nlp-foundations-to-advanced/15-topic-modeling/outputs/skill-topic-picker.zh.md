---
name: topic-picker
description: 为语料库选择 LDA 或 BERTopic。指定库、参数、评估。
version: 1.0.0
phase: 5
lesson: 15
tags: [nlp, topic-modeling]
---

给定语料库描述（文档数量、平均长度、领域、语言、计算预算），输出：

1. 算法。LDA / NMF / BERTopic / Top2Vec / FASTopic。一句话理由。
2. 配置。主题数量（从 ~sqrt(n_docs) 开始）、`min_df` / `max_df` 过滤、神经方法的嵌入模型。
3. 评估。通过 `gensim.models.CoherenceModel` 的主题连贯性（c_v）、主题多样性，外加 20 样本人工阅读。
4. 需要探测的失败模式。对于 LDA，吸收停用词和常见词的"垃圾主题"。对于 BERTopic，吞没歧义文档的 -1 离群聚类。

拒绝在长于嵌入模型上下文窗口的文档上使用 BERTopic，除非有分块策略。拒绝在非常短的文本（推文、少于 10 token 的评论）上使用 LDA，因为连贯性会崩溃。标记任何低于 5 或高于 200 的主题数量选择，认为对真实数据很可能错误。
