---
name: text-encoder-picker
description: 在给定约束条件下选择文本编码器架构。
phase: 5
lesson: 08
---

给定约束条件（任务、数据量、延迟预算、部署目标、计算预算），输出：

1. 编码器架构：TextCNN、BiLSTM、BiLSTM-CRF、Transformer 微调，或"使用预训练 Transformer 作为冻结编码器 + 小型头部"。
2. 嵌入输入：随机初始化、GloVe 或 fastText 冻结、或上下文化的 Transformer 嵌入。
3. 5 行训练方案：优化器、学习率、批量大小、训练轮数、正则化。
4. 一个监控信号。RNN/CNN 模型：检查每个序列长度的准确率以发现长距离依赖失败。Transformer 微调：关注学习率过高时的微调崩溃；在前 100 步内检查训练损失。

拒绝在数据少于约 500 个标注样本时推荐微调 Transformer，除非已表明 TextCNN / BiLSTM 基线已到瓶颈。标记边缘部署（手机、微控制器、浏览器）为需要架构决策优先于一切。
