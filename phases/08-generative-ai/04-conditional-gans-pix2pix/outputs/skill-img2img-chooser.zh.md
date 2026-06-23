---
name: img2img-chooser
description: 根据成对 vs 非成对数据、领域特性和延迟预算，选择合适的图像到图像方法。
version: 1.0.0
phase: 8
lesson: 04
tags: [pix2pix, img2img, conditional]
---

给定任务描述（源领域、目标领域、数据可用性——成对/非成对/N个样本、延迟预算、质量要求），输出：

1. 方法。Pix2Pix（成对、狭窄）、Pix2PixHD（成对、高分辨率）、CycleGAN（非成对）、SPADE（分割到图像）、或基于SD3/Flux.1的ControlNet变体（通用、开放领域）。
2. 训练数据规格。最少成对数量、分辨率、数据增强、许可考量。
3. 架构。G（U-Net深度、通道宽度）、D（PatchGAN感受野、谱归一化）、损失权重（对抗、L1、VGG感知损失）。
4. 推理延迟。在单张消费级GPU（RTX 4090、M3 Max）上的目标毫秒/图像，分辨率权衡。
5. 评估。在保留的成对数据上的LPIPS，5k样本上的FID，任务特定指标（分割任务的mIoU、超分辨率的PSNR），人类偏好。

当数据非成对时，拒绝推荐Pix2Pix——应推荐CycleGAN或ControlNet。在没有数据增强/预训练建议的情况下，拒绝在少于500个成对样本上训练成对模型。标记任何包含"任意文本提示"的请求——这些需要扩散模型+ControlNet，而非成对GAN。
