---
name: inference-server
description: 交付一个带有 EAGLE-3 或 P-EAGLE 草稿、K8s 自动扩展和完整吞吐量/延迟/成本报告的推测解码推理服务器。
version: 1.0.0
phase: 19
lesson: 14
tags: [capstone, inference, vllm, sglang, eagle-3, p-eagle, speculative-decoding, quantization, hpa]
---

给定两个开源目标模型（Llama 3.3 70B 和 Qwen3-Coder-30B MoE 或 GPT-OSS-120B），交付一个带有推测解码、量化和 Kubernetes 自动扩展的生产服务栈。发布测量的加速比和尾部延迟数字。

构建计划：

1. 在 vLLM 0.7（或 SGLang 0.4）下部署目标模型，使用 FP8 Marlin 量化。
2. 从 Red Hat Speculators 加载对齐的 EAGLE-3 草稿（或通过 SpecForge 训练一个）。
3. 基线数字：批量 1/8/32 下的令牌/秒和 p50/p99 延迟，无推测。
4. 启用 EAGLE-3。重新运行相同基准。报告加速比、接受率、p99 尾部延迟差异。
5. 启用 P-EAGLE 并行推测；报告更深树有助于 vs 有害的转折点。
6. 跨分布运行基准：ShareGPT、HumanEval、领域数据。发布接受率漂移。
7. 在第二个目标模型（MoE）上重复；识别草稿接受中的路由噪声敏感性。
8. 在 Kubernetes 上部署，HPA 跟踪 `queue_wait_ms`。当负载变为三倍时演示扩展。
9. 比较 $/1M 令牌 vs 在匹配评估上的 Anthropic Claude Sonnet 4.7 和 OpenAI GPT-5.4。

评估评分标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 相比基线的实测加速比 | 在两个模型上以匹配质量实现 2.5 倍以上吞吐量 |
| 20 | 真实流量上的接受率 | 按分布的接受率报告 |
| 20 | P99 尾部延迟纪律 | 批量 1/8/32 下有和没有推测的 p99 |
| 20 | 运维 | K8s 部署、基于队列等待的 HPA、平滑发布、先排空后升级 |
| 15 | 文档和方法论 | 清晰的指标推导、匹配的基线 |

硬性拒绝：

- 报告稳态吞吐量而没有尾部延迟。
- HPA 基于 CPU 而非队列等待。在 GPU 饱和下会抖动。
- 忽略草稿-目标版本对齐。漂移的草稿比没有推测更昂贵。
- 省略托管 API 提示缓存折扣的成本比较。

拒绝规则：

- 拒绝在没有发布排空的情况下提供服务。在请求进行中原地升级是不合格的。
- 拒绝报告跨分布聚合的接受率。按分布是强制性的。
- 拒绝在 bs=32 下声称推测解码胜利而没有匹配的非推测数字。

输出：一个包含 vLLM / SGLang 配置、EAGLE-3 草稿下载脚本、K8s 部署清单、基于队列等待的 HPA 配置、ShareGPT / HumanEval / 领域数据的基准测试工具、$/1M 令牌比较表的仓库，以及一份命名推测解码引入的三个尾部延迟回归以及修复每个回归的缓解措施（批量门控、n-gram 回退、量化调整）的文档。
