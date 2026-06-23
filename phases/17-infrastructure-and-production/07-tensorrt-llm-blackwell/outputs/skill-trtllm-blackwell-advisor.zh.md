---
name: trtllm-blackwell-advisor
description: 判断在给定工作负载和预算下，Blackwell + TensorRT-LLM + Dynamo 是否值得 NVIDIA 锁定。
version: 1.0.0
phase: 17
lesson: 07
tags: [tensorrt-llm, blackwell, b200, gb200, nvfp4, fp8, dynamo]
---

给定工作负载（模型规模、活跃参数、年 token 量、质量敏感性——推理密集型或常规）、当前基础设施（H100/H200/B200 GPU、服务引擎）和预算，生成 Blackwell + TRT-LLM 迁移建议。

输出内容：

1. **当前基准**。根据报告的 token 量和每 GPU 小时定价计算当前的每百万 token 成本及年支出。如果基准已在 Blackwell + TRT-LLM 上，则标记。
2. **目标技术栈**。推荐精确的精度组合（权重：NVFP4 或 FP8；KV 缓存：FP8；激活值：NVFP4；累加器：FP32）。对于推理密集型工作负载，先推荐 FP8 权重，仅在逐块校准通过评估集验证后使用 NVFP4。
3. **预期节省**。基于 2026 年成本形态：H100 + vLLM 约 $0.09/M → B200 + TRT-LLM 约 $0.02/M → GB200 NVL72 + Dynamo 约 $0.012/M。计算工作负载 token 量的年度节省。
4. **迁移成本**。工程时间（首次迁移约 10-30 工程师周）。质量验证环节。GPU 资本支出或租赁承诺。
5. **盈亏平衡时间**。需要多少个月的生产运行才能摊销迁移成本。如果超过 18 个月，标记为边缘情况。
6. **锁定风险**。TRT-LLM 是 NVIDIA 独占。列出两种退出策略（在 H100 上使用 vLLM 作为迭代层的双技术栈；保持权重可导出为 GGUF/HF 以保证在非 NVIDIA 平台上的可移植性）。

硬性拒绝：
- 对推理密集型模型推荐 NVFP4 权重但未经过评估集验证步骤。
- 声称 7 倍差距但未指明数学计算所假设的 token 量。
- 忽略 FP4 权重转换的质量验证。始终运行验证。

拒绝规则：
- 如果年推理支出低于 $500K，拒绝迁移。工程成本无法摊销。坚持使用 vLLM + Hopper。
- 如果团队在服务中有任何 AMD/Intel GPU，在多供应商层拒绝 TRT-LLM。推荐在混合硬件上使用 vLLM。
- 如果模型在任务上的质量已经处于边缘状态，拒绝激进的量化。坚持使用 FP8 或 BF16。

输出：一页 Blackwell 建议，列出当前基准、目标技术栈、预期节省、迁移成本、盈亏平衡时间和锁定退出计划。结尾附上"下一步阅读"段落，根据主要差距推荐 MLPerf v6.0 博客、TRT-LLM 概述或 Dynamo 公告。
