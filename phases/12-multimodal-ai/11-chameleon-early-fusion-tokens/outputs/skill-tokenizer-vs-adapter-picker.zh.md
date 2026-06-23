---
name: tokenizer-vs-adapter-picker
description: 在 Chameleon 风格的 early fusion（共享词汇表分词器）和 LLaVA 风格的 late fusion（冻结 LLM 上的适配器）之间为 VLM 项目做出选择
version: 1.0.0
phase: 12
lesson: 11
tags: [chameleon, early-fusion, vq-vae, late-fusion, adapter]
---

给定一个产品规格（仅理解或理解+生成）、目标图像质量（社交媒体/杂志/印刷/广播）和成本预算（训练+推理），推荐 Chameleon 系列或 LLaVA 系列，并给出具体的架构概要。

产出：

1. **结论**：选择 early fusion（Chameleon / Emu3 / AnyGPT）或 late fusion（LLaVA / BLIP-2 / Qwen-VL）系列。
2. **分词器选择**（针对 early fusion 结论）：VQ-VAE（Chameleon）、MAGVIT-v2、IBQ 或 SBER-MoVQGAN；列出预期的重构上限（PSNR）。
3. **训练稳定性计划**：QK-Norm、Dropout 放置、LayerNorm 顺序（针对大规模 early fusion）。
4. **成本估算**：训练 GPU 小时数和每张图像的推理延迟，对比 late fusion 替代方案。
5. **生成质量上限**：用户可以预期的 PSNR / FID 范围；产品的质量门槛是否可以通过离散令牌达到，还是需要连续（Transfusion 风格）生成。
6. **迁移路径**：如果用户业务增长且 late fusion 成为限制（需要图像输出），迁移方案是什么。

硬性拒绝：
- 为仅需理解能力的产品推荐 Chameleon 风格。Late fusion 更简单、更便宜、且对纯理解有更高的上限。
- 为生产级图像生成推荐 K<4096 的 VQ-VAE。码本太小，伪影明显。
- 声称 early fusion 推理没有额外成本。VQ 解码器每张生成图像增加 50-200ms，通常超过 LLM 输出时间。

拒绝规则：
- 如果用户需要前沿质量的图像生成（FID < 15，印刷级），拒绝离散令牌并指向 Transfusion / Stable Diffusion 3 / MMDiT（第 12.13 课）。
- 如果产品永远不需要图像输出，拒绝 early fusion——其复杂度是不必要的。
- 如果用户想要插入现有的 Llama / Qwen LLM 权重，拒绝 early fusion——它需要预训练一个全新的模型。

输出：一页计划，包含结论、分词器选择、稳定性检查清单、成本估算、质量上限、迁移路径。以 arXiv 2405.09818（Chameleon）和 2408.11039（Transfusion）结尾以进行比较阅读。
