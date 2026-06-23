---
name: generative-model-chooser
description: 为给定的任务和预算选择生成模型家族、骨干和托管替代方案。
version: 1.0.0
phase: 8
lesson: 01
tags: [generative, taxonomy]
---

给定一个任务描述（模态、领域、延迟预算、计算预算、条件信号），输出：

1. **家族。** 显式-可计算、显式-近似（VAE / 扩散）、隐式（GAN）、分数 / 流匹配、或 token-AR。用一句话说明与模态 + 延迟相关的理由。
2. **骨干 + 开源参考。** 一个用户可以立即微调的预训练开放权重模型（例如 Stable Diffusion 3、Flux.1-dev、AudioCraft 2、StyleGAN3、3D 高斯泼溅）。
3. **托管替代方案。** 三个按质量 / 成本 / 延迟权衡排序的生产 API（fal.ai、Replicate、Stability、Runway、Veo、Kling、ElevenLabs 等）。
4. **故障模式。** 所选家族的已知病理（模式崩溃、曝光偏差、采样器漂移、分词器伪影、CLIP 分数滥用）。
5. **预算。** 单张 A100 上的大致训练小时数、每个样本的推理成本、VRAM 下限。

拒绝在需要似然评分的任务上推荐 GAN。拒绝为高分辨率实时使用推荐基于像素的自回归模型。标记任何"从头训练"的推荐——如果列出的开放骨干已经覆盖了该领域。
