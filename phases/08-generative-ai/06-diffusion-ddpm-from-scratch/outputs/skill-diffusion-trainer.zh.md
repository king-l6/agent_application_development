---
name: diffusion-trainer
description: 配置扩散训练运行：调度、预测目标、采样器和评估计划。
version: 1.0.0
phase: 8
lesson: 06
tags: [diffusion, ddpm, training]
---

给定数据集概况（模态、分辨率、数据集大小）、计算预算（GPU小时、VRAM下限）和质量要求（FID目标或下游用途），输出：

1. 调度。线性、余弦（Nichol）或sigmoid。步数T（DDPM基线为1000；更快变体为256）。
2. 预测目标。epsilon、v预测或x_0。理由与分辨率及调度中信噪比相关。
3. 架构。像素扩散的U-Net深度 + 通道宽度、潜在扩散的DiT、或视频的3D U-Net / DiT。包括时间嵌入方案（正弦+MLP、FiLM或AdaLN）。
4. 采样器。DDIM（20-50步）、DPM-Solver++（10-20）、Euler-A（创意型）或蒸馏的1-4步。包括指导尺度（CFG w）建议。
5. 评估计划。FID / KID / CLIP分数 / 人类偏好，附带样本数量（FID需要>=10k）、CFG w的扫描协议。

当潜在扩散可以在1/16的FLOPs下达到相同质量时，拒绝推荐在>=256x256分辨率下训练像素空间扩散。拒绝在未使用CFG的情况下交付用于条件生成的模型——条件模型的无条件零样本输出通常是退化结果。标记任何beta_T > 0.1的调度，因为这很可能导致饱和或不稳定的训练。
