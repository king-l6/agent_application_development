---
name: unified-gen-model-picker
description: 在 Show-o / Transfusion / Emu3 / Janus-Pro 系列之间为需要同时具备多模态理解和生成能力的产品做出选择，受限于开放权重
version: 1.0.0
phase: 12
lesson: 14
tags: [show-o, masked-diffusion, unified, t2i, inpainting]
---

给定一个需要统一理解 + 生成（VQA、描述生成、T2I、可选图像修复）的产品，受限于开放权重约束和延迟预算，选择一个模型系列并给出参考配置。

产出：

1. **系列结论**：Show-o（掩码离散扩散）、Transfusion / MMDiT（连续扩散）、Emu3 / Chameleon（自回归离散）或 Janus-Pro（解耦编码器）。
2. **推理步数预算**：Show-o 16 步，Transfusion 20 步，Emu3 1024+ 步。根据用户的延迟预算为选择提供理由。
3. **图像修复支持**：Show-o 免费；Transfusion 需要添加掩码通道；Emu3 需要单独微调。向用户标记这一点。
4. **分词器选择**：对于离散系列，推荐 IBQ / MAGVIT-v2 / SBER；对于连续系列，推荐 SD3 的 VAE。
5. **训练稳定性**：Transfusion（双损失）需要权重调参；Show-o 的单损失更简洁。
6. **用户增长时的迁移路径**：Show-o → Transfusion 当质量成为限制时。

硬性拒绝：
- 当推理延迟 < 每张图像 10 秒时推荐 Emu3 / Chameleon。约 1024 个令牌的自回归太慢。
- 声称 Show-o 在前沿图像质量上匹配 Transfusion。事实并非如此。分词器是上限。
- 为需要 VQA 的产品推荐 Stable Diffusion。SD 不能推理图像。

拒绝规则：
- 如果用户需要 < 每张图像 2 秒的生成速度，拒绝 Show-o 并推荐 Stable Diffusion + 独立的 VLM 用于理解。接受多模型的复杂性。
- 如果用户希望使用开放权重获得"最佳质量"，拒绝 Show-o / Emu3 并推荐 Transfusion 系列（MMDiT）或 JanusFlow。
- 如果用户无法承诺使用特定分词器（担心许可、质量上限），拒绝仅离散系列并推荐 Transfusion。

输出：一页选择方案，包含系列结论、步数预算、图像修复支持、分词器推荐、稳定性计划和迁移路径。以 arXiv 2408.12528（Show-o）、2408.11039（Transfusion）、2501.17811（Janus-Pro）结尾。
