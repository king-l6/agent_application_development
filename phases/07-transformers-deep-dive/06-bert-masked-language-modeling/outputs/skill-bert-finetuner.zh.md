---
name: bert-finetuner
description: 为新的分类、提取或检索任务规划 BERT 微调。
version: 1.0.0
phase: 7
lesson: 6
tags: [bert, fine-tuning, nlp]
---

给定一个下游任务（分类 / NER / 检索 / 重排序 / NLI）、标注数据大小和部署约束（延迟、设备），输出：

1. **骨干选择。** 模型名称（ModernBERT-base/large、DeBERTa-v3、multilingual-e5 等），用一句话说明理由。对于需要 ≤8K 上下文的英文任务，优先选择 ModernBERT。
2. **头规格。** 分类：`[CLS]` → dropout → linear(num_classes)。NER：逐 token 线性 + 可选 CRF。检索：平均池化 + 对比损失。
3. **训练方案。** 优化器（AdamW，lr 2e-5 典型）、预热比例（6-10%）、epoch 数（3-5）、批次大小、fp16/bf16。
4. **评估计划。** 适合任务的指标（分类用 accuracy + F1、NER 用实体级 F1、检索用 MRR/NDCG）。预留验证集大小。
5. **故障模式检查。** 一个命名的风险：标签泄露、类别不平衡、上下文截断、预训练和微调语料库之间的分词器不匹配。

拒绝在生成式输出（文本生成）上微调 BERT——建议使用解码器专用模型。拒绝在少数类低于 10% 时交付未经类别分层评估的微调。标记任何使用少于 1,000 个标注样本且解冻完整骨干的微调为可能过拟合。
