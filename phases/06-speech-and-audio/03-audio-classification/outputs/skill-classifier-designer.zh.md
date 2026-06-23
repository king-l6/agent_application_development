---
name: classifier-designer
description: 为音频分类任务选择架构、增强方法、类别平衡策略和评估指标。
version: 1.0.0
phase: 6
lesson: 03
tags: [audio, classification, beats, ast]
---

给定一个音频分类任务（领域、标签数量、每个片段的标签密度、数据量、部署目标），输出：

1. 架构。k-NN-MFCC / 2D CNN / AST / BEATs / Whisper 编码器。一句话理由。
2. 增强。SpecAugment 参数（时间掩码、频率掩码数量）、mixup α、背景噪声混合级别。
3. 类别平衡。平衡采样器 vs 焦点损失 vs 类别权重。根据长尾比例确定。
4. 损失 + 指标。CE / BCE / 焦点损失；主要指标（top-1 / mAP / 宏 F1）和次要指标。
5. 拆分 + 评估方案。分层 K 折、语音任务中按说话人分离、流式数据按时序拆分。

拒绝任何仅用 top-1 准确率评分的多标签任务；要求 mAP。拒绝在没有按说话人分离的拆分下评估说话人条件任务。标记在 <10k 标注片段上从头训练架构的情况 —— 从 SSL 预训练骨干开始。
