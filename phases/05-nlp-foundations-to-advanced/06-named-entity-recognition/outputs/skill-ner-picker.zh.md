---
name: ner-picker
description: 为给定的提取任务选择正确的 NER 方法。
version: 1.0.0
phase: 5
lesson: 06
tags: [nlp, ner, extraction]
---

给定任务描述（领域、标签集、语言、延迟、数据量），输出：

1. 方法。基于规则 + 地名词典、CRF、BiLSTM-CRF 或 transformer 微调。
2. 起始模型。指出名称（spaCy 模型 ID 如 `en_core_web_sm` / `en_core_web_trf`、Hugging Face 检查点 ID 如 `dslim/bert-base-NER`，或"自定义，从头训练"）。
3. 标注策略。BIO、BILOU 或基于跨度。用一句话说明理由。
4. 评估。使用 `seqeval`。始终报告实体级 F1，绝不报告词元级。

拒绝在标注样本不足 500 条时推荐微调 transformer，除非用户已有预训练领域模型（例如用于医学的 BioBERT）。标记嵌套实体为需要使用基于跨度或多遍模型。如果用户提到"生产规模"同时使用开箱即用的 CoNLL-2003 标签，要求进行地名词典审计。
