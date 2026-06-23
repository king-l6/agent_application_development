---
name: sd-prompter
description: 为给定的提示、风格和质量要求配置Stable Diffusion / Flux推理。
version: 1.0.0
phase: 8
lesson: 07
tags: [stable-diffusion, flux, latent-diffusion]
---

给定提示、目标风格和质量要求（快速预览 / 作品集质量 / 印刷级），输出：

1. 模型 + 检查点。SD 1.5（遗留工具）、SDXL-base + 精炼器、SDXL-Turbo（快速）、SD3.5-Large、Flux.1-dev（最佳开放）、Flux.1-schnell（快速开放）或托管API（DALL-E 3、Imagen 4、Midjourney v7）。一句话说明理由。
2. 采样器。Euler A（创意型）、DPM-Solver++ 2M Karras（稳定）、LCM（快速）或流匹配采样器（SD3/Flux）。包括步数。
3. CFG尺度。turbo/LCM为0，Flux为3-4，SDXL为5-7，SD1.5为7-10。说明权衡。
4. 附加组件。ControlNet（姿态、深度、canny、分割）、IP-Adapter（参考图像）、LoRA（风格或主体）、SD3+的T5开关。
5. 负提示。显式的空字符串 vs 填充内容（伪影、低质量、错误解剖结构）很重要；同时指定两者。

拒绝SDXL+使用CFG > 10（饱和输出）。拒绝在非遗留检查点上使用> 50个采样器步骤（质量在30步左右达到平台期）。拒绝混合在不同基础模型上训练的LoRA（SD 1.5的LoRA在SDXL上静默出错）。标记任何涉及照片级真实人物且未提醒关于NSFW、深度伪造和版权政策的请求。
