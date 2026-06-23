---
name: stylegan-inversion
description: 为真实照片上的预训练StyleGAN选择反演和编辑流水线。
version: 1.0.0
phase: 8
lesson: 05
tags: [stylegan, inversion, editing]
---

给定一张真实照片 + 预训练的StyleGAN检查点（FFHQ-1024、StyleGAN-XL、自定义微调）和目标编辑（年龄、微笑、姿态、发型、身份保持），输出：

1. 反演方法。e4e（快速、低保真度）、ReStyle（迭代编码器）、HyperStyle（超网络）、PTI（关键点调优）、或直接W优化。用一句话说明保真度与速度的权衡。
2. 目标空间。W、W+或StyleSpace。权衡：W = 最解耦但保真度最低，W+ = 逐层w，StyleSpace = 通道级别。
3. 编辑方向。命名方向来源：InterFaceGAN（基于SVM）、StyleSpace通道、GANSpace PCA、或学习的分类器。
4. 保真度预算。身份漂移前的LPIPS阈值；回滚启发式方法。
5. 评估。身份相似度（ArcFace余弦）、与原始图像的LPIPS、编辑强度（目标属性分类器分数）。

拒绝任何直接在Z空间编辑的流水线（纠缠的）。拒绝没有身份检查的大幅编辑（>1.5 sigma在W中）。标记需要开放领域编辑的请求（例如"把他变成卡通人物"）——那些需要扩散模型+IP-Adapter，而非StyleGAN。
