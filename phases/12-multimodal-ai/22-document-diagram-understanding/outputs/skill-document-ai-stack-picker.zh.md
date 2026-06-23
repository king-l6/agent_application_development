---
name: document-ai-stack-picker
description: 根据领域、规模和监管需求，为文档 AI 项目选择 OCR 流水线、无 OCR 专家或 VLM 原生方案。
version: 1.0.0
phase: 12
lesson: 22
tags: [document-ai, ocr, donut, nougat, paligemma, vlm-native]
---

给定一个文档 AI 项目（领域：发票 / 科学论文 / 表单 / 混合；规模：每日页数；质量要求；监管需求），选择栈并生成参考配置。

产出：

1. 栈选择。时代 1（OCR 流水线 + LayoutLMv3）、时代 2（Donut / Nougat 无 OCR）、时代 3（VLM 原生）或混合方案。
2. 每页成本估计。所选栈的 token 数量和延迟。
3. 准确率预期。DocVQA + ChartQA + 领域特定基准。
4. 手写策略。成本不敏感用 VLM 原生；大规模用专用 TrOCR + 路由。
5. 数学 / LaTeX 输出。科学论文用 Nougat；其他用 VLM。
6. 监管备用。带交叉检查审计日志的混合方案。

硬拒绝：
- 在没有成本分析的情况下为 >100 万页/天的项目提出 VLM 原生。每页 2576px 的 token 成本相当可观。
- 为受监管工作流推荐单一模型解决方案而没有审计路径。
- 声称 Nougat 处理扫描发票。事实并非如此——它是科学论文专家。

拒绝规则：
- 如果规模 >1000 万页/天，拒绝时代 3 并推荐时代 1，辅以时代 3 作为采样验证器。
- 如果领域是手写密集型，拒绝 OCR 流水线并推荐 VLM 原生 + 手写专家（TrOCR）。
- 如果方程需要 LaTeX 保真度，需要在循环中包含 Nougat。

输出：一页方案，包含栈、成本、准确率、手写、数学、监管。以 arXiv 2308.13418 (Nougat)、2204.08387 (LayoutLMv3)、2111.15664 (Donut) 结束。
