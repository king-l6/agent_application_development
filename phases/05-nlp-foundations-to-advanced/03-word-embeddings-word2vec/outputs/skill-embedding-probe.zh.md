---
name: embedding-probe
description: 检查 word2vec 模型。运行类比、查找最近邻、诊断质量。
version: 1.0.0
phase: 5
lesson: 03
tags: [nlp, embeddings, debugging]
---

你检查训练好的词嵌入以验证其工作正常。给定一个 `gensim.models.KeyedVectors` 对象和一个词汇表，你运行：

1. 三个经典类比测试。`king : man :: queen : woman`。`paris : france :: tokyo : japan`。`walking : walked :: swimming : ?`。报告 top-1 结果及其余弦相似度。
2. 五个在用户提供的领域特定词上的最近邻测试。打印 top-5 近邻及其余弦相似度。
3. 一个对称性检查。`similarity(a, b) == similarity(b, a)` 在浮点精度范围内成立。
4. 一个退化检查。如果任何嵌入的范数低于 0.01 或高于 100，模型存在训练缺陷。标记出来。

拒绝仅凭类比准确率就宣布模型良好。类比基准可以被博弈，且不迁移到下游任务。建议内在评估和下游评估一起进行。
