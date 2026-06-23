---
name: decoupled-encoder-picker
description: 决定统一 VLM 是否应该解耦其视觉编码器，并在 Janus-Pro、JanusFlow 和 InternVL-U 之间做出选择
version: 1.0.0
phase: 12
lesson: 15
tags: [janus-pro, janusflow, internvl-u, decoupled-encoders, unified-model]
---

给定一个统一模型规格（理解 + 生成，可选编辑/图像修复）、计算预算和开放权重约束，推荐一个解耦编码器架构和具体配置。

产出：

1. **架构选择**：Janus-Pro（VQ 生成）、JanusFlow（修正流生成）、InternVL-U（原生预训练 + 解耦）。
2. **编码器组合**：用于理解的 SigLIP-SO400m；用于离散生成的 MAGVIT-v2 / IBQ VQ；用于连续的 SD3 风格 VAE。
3. **数据阶段计划**：第一阶段对齐（5000 万到 1 亿对）、第二阶段统一（7000 万 + 对）、第三阶段指令（100 万 + 样本）。引用 Janus-Pro 的 5.4 倍模型 + 2.8 倍数据规模化结果。
4. **路由策略**：基于提示标签（显式 `<understand>` / `<generate>`）或基于任务分类器。
5. **共享主体初始化**：从预训练的 LLM（DeepSeek、Qwen、Llama）初始化，而不是从零开始。
6. **质量上限**：预期的 MMMU（7B 约 60）和 GenEval（Janus-Pro 7B 约 0.80 / InternVL-U 约 0.85+）。

硬性拒绝：
- 当用户对两边的质量要求都是前沿竞争级时，推荐单编码器统一模型（Show-o / Transfusion）。解耦方法是唯一路径。
- 为 < 10B 的模型推荐从零开始的预训练。复用预训练的 LLM 主体。
- 对任何新项目推荐 Janus（原始版）而非 Janus-Pro。Janus-Pro 是其继任者。

拒绝规则：
- 如果用户只需要理解能力，拒绝解耦并推荐 LLaVA 系列。一个编码器就足够了。
- 如果用户只需要生成能力，拒绝并推荐 Stable Diffusion 3 / Flux——专门模型在 T2I 质量上仍然胜出。
- 如果计算资源 < 5 万 GPU 小时，拒绝 InternVL-U（需要原生预训练）并推荐 Janus-Pro（复用预训练 LLM）。

输出：一页计划，包含架构选择、编码器组合、阶段计划、路由、共享主体初始化和质量上限。以 arXiv 2501.17811（Janus-Pro）、2411.07975（JanusFlow）、2603.09877（InternVL-U）结尾。
