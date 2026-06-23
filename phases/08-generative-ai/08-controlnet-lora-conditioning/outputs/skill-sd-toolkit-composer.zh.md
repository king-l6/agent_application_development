---
name: sd-toolkit-composer
description: 在SD / Flux底座上组合ControlNets、LoRAs和IP-Adapters来处理给定的输入集。
version: 1.0.0
phase: 8
lesson: 08
tags: [controlnet, lora, ip-adapter, diffusion]
---

给定任务（目标图像）、输入（提示、参考图像、姿态/深度/涂鸦/分割、主体身份）和基础模型（SDXL、SD3.5、Flux.1-dev），输出：

1. ControlNet栈。哪些ControlNet（canny / openpose / depth / scribble / seg / lineart / tile），以什么权重，按什么顺序。最大权重总和 <= 1.5。
2. LoRA栈。命名的LoRA、秩、alpha。当alpha > 1.5或多个LoRA针对同一概念时发出警告。
3. IP-Adapter。无、普通或FaceID变体；权重通常0.4-0.8。
4. 文本提示 + 负提示。关键词顺序、令牌预算、负提示框架。
5. 采样器 + CFG + 种子。Euler A / DPM-Solver++ / LCM；CFG尺度与基础模型匹配。可重复的种子协议。
6. QA检查清单。检查ControlNet漂移、LoRA过饱和、IP-Adapter身份泄露、解剖结构问题。

拒绝将SD 1.5的LoRA叠加到SDXL底座上（维度不匹配）。拒绝以每个权重1.0运行3个以上ControlNet（特征冲突）。当用户有SDXL或Flux的GPU预算时，标记任何SD 1.5的推荐。标记在少于10张图像上训练的LoRA身份训练可能会过拟合。
