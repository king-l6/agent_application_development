---
name: vlm-recipe-picker
description: 选择开放权重 VLM 配方（编码器、连接器、LLM、数据配比、分辨率调度），每个选择附带消融表引用。
version: 1.0.0
phase: 12
lesson: 07
tags: [vlm, mm1, idefics2, molmo, cambrian, prismatic, ablation]
---

给定任务组合（OCR、图表、UI 智能体、推理、定位）、计算预算（LLM 参数量、训练 GPU 小时数或推理延迟目标）和部署约束（边缘、云端、设备端），输出完整的开放权重 VLM 配方并附上引用。

输出：

1. 编码器选择。默认使用 SigLIP 2 SO400m/14；如果任务组合中包含定位/分割，则与 DINOv2 ViT-g/14 拼接；引用 MM1 表 3 和 Cambrian-1 的视觉编码器匹配结果。
2. 连接器选择。默认使用 2 层 MLP，除非受到 token 限制（此时使用 Q-Former 32 查询）；引用 Prismatic VLMs 的连接器消融实验显示差异不到 1 个百分点。
3. LLM 选择。根据预算选择：小于 10B 使用 Qwen2.5-7B，大于 30B 使用 Llama-3.1-70B 或 Qwen2.5-72B。标记 70B 后 MMMU 的平台期。
4. 数据配比。默认使用 PixMo + ShareGPT4V + Cauldron；引用 Molmo 的详细人工描述结果（相同 token 计数下比蒸馏高 2-3 MMMU）。
5. 分辨率调度。默认动态（256-1280），第一阶段使用固定 384 的对齐预训练；引用 Idefics2 分辨率消融实验（AnyRes 使 DocVQA 提升 3-5 个点）和 Qwen2.5-VL 动态 M-RoPE。
6. 训练阶段。第一阶段仅投影器，第二阶段全参数微调，第三阶段特定任务微调。

硬性拒绝：
- 推荐 CLIP ViT-L/14 作为默认编码器而不指出其已被 SigLIP 2 取代用于新项目。
- 建议 Q-Former 作为相对于 MLP 的质量提升。它是 token 预算的杠杆，而非质量杠杆。
- 当有人工描述替代方案时，提议将合成 GPT-4V 描述作为主要训练数据。引用 Molmo。
- 声称连接器架构解释了实际上来自 token 数量的方差。

拒绝规则：
- 如果用户想要 1-3B 的 VLM 用于推理密集型任务，拒绝并推荐更大的 LLM；推理上限由 LLM 决定。
- 如果用户无法负担详细人工描述数据，明确标记预期 2-3 个 MMMU 的上限损失，并提供尽力而为的蒸馏后备方案。
- 如果任务组合包含冻结编码器部署上的 4K+ 文档图像，拒绝 AnyRes 并推荐使用原生分辨率 M-RoPE 编码器（如 Qwen2.5-VL）。

输出：一页配方卡，包含每轴选择、消融引用（arXiv ID）、训练阶段计划和预期基准范围。最后附上接下来要阅读的三篇消融论文：arXiv 2403.09611（MM1）、2405.02246（Idefics2）、2409.17146（Molmo）。
