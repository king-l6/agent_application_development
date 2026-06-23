# 综合项目 14 — 推测解码推理服务器

> vLLM 0.7 中的 EAGLE-3 在真实流量上实现了 2.5-3 倍吞吐量。AWS 2026 年的 P-EAGLE 将并行推测推向了更远。SGLang 的 SpecForge 大规模训练草稿头。Red Hat 的 Speculators 中心为常见开源模型发布了对齐的草稿。TensorRT-LLM 使推测解码在 NVIDIA 上成为一等公民。2026 年的生产服务栈是带有 EAGLE 系列草稿、FP8 或 INT4 量化以及在队列等待上的 HPA 的 vLLM 或 SGLang。这个综合项目是使用两个开源模型，以超过基线 2.5 倍的吞吐量提供服务，并提供完整的尾部延迟报告。

**类型：** 综合项目
**语言：** Python（服务）、C++ / CUDA（内核检查）、YAML（配置）
**前置知识：** 阶段 3（深度学习）、阶段 7（Transformer）、阶段 10（从零构建 LLM）、阶段 17（基础设施）
**涉及阶段：** P3 · P7 · P10 · P17
**时间：** 30 小时

## 问题

推测解码在 2026 年成为了一种商品。EAGLE-3 草稿头在目标模型的隐藏状态上训练，预测 N 个后续令牌；目标模型在一次前向传递中验证。60-80% 的接受率转化为 2-3 倍的端到端吞吐量。vLLM 0.7 原生集成了这一点。SGLang + SpecForge 提供了训练流水线。Red Hat 的 Speculators 发布了 Llama 3.3 70B、Qwen3-Coder-30B MoE、GPT-OSS-120B 的对齐草稿。

技巧在于服务运维，而非模型。接受率随流量分布（ShareGPT vs 代码 vs 领域数据）而变化。拒绝下的尾部延迟比没有推测更差——你必须报告多个批量大小下的 p99，而不仅仅是稳态的令牌/秒。与 Anthropic / OpenAI API 对比的每 1M 令牌成本是可信度的杠杆。

## 概念

推测解码有两层。一个**草稿**模型（EAGLE-3 头、n-gram 或更小的目标对齐模型）每步提出 k 个候选令牌。**目标**模型在一次前向传递中验证所有 k 个；任何接受的前缀替换贪婪路径。接受率取决于草稿-目标对齐和输入分布。

EAGLE-3 在大多数流量上优于 n-gram 草稿。P-EAGLE 运行并行推测以获得更深的草稿树。权衡：拒绝时的 P99 延迟更高，因为验证传递更大。服务配置必须报告批量大小分桶的延迟以揭示这一点。

部署在 Kubernetes 上。vLLM 0.7 每个 GPU 或张量并行分片运行一个副本。HPA 根据队列等待（而非 CPU）自动扩展。FP8（Marlin）和 INT4（AWQ）量化将 GPU 内存保持在 H100 / H200 的范围内。端到端报告包括吞吐量、接受率、批量 1/8/32 下的 p50/p99，以及 $/1M 令牌。

## 架构

```
请求入口
    |
    v
vLLM 服务器 (0.7) 或 SGLang (0.4)
    |
    +-- 草稿: EAGLE-3 头 | P-EAGLE 并行 | n-gram 回退
    +-- 目标: Llama 3.3 70B | Qwen3-Coder-30B | GPT-OSS-120B
    |     量化 FP8-Marlin 或 INT4-AWQ
    |
    v
验证传递: 批量将 k 个草稿令牌通过目标模型
    |
    v (接受前缀; 对拒绝的后缀重新采样)
    v
令牌流返回客户端
    |
    v
Prometheus 指标: 吞吐量, 接受率, 队列等待, p50/p99 延迟
    |
    v
基于队列等待指标的 HPA
```

## 技术栈

- 服务：vLLM 0.7 或 SGLang 0.4
- 推测方法：EAGLE-3 草稿头、P-EAGLE 并行推测、n-gram 回退
- 草稿训练：SpecForge（SGLang）或 Red Hat Speculators
- 目标模型：Llama 3.3 70B、Qwen3-Coder-30B MoE、GPT-OSS-120B
- 量化：FP8（Marlin）、INT4 AWQ
- 部署：Kubernetes + NVIDIA device plugin；基于队列等待指标的 HPA
- 评估：ShareGPT、MT-Bench-v2、GSM8K、HumanEval，用于领域分布接受率测量
- 参考：用于供应商基线的 TensorRT-LLM 推测解码

## 构建步骤

1. **目标模型准备。** 选择 Llama 3.3 70B。通过 Marlin 量化为 FP8。在 1xH100（或 2x 张量并行）上使用 vLLM 0.7 部署。

2. **草稿来源。** 从 Red Hat Speculators 拉取对齐的 EAGLE-3 草稿头（或通过 SpecForge 训练一个）。加载到 vLLM 的推测解码配置中。

3. **基线数字。** 推测前：批量 1/8/32 下的令牌/秒、p50/p99 延迟、GPU 利用率。发布。

4. **启用 EAGLE-3。** 切换配置；重新运行相同的基准测试。报告加速比、接受率、p99 尾部延迟差异。

5. **P-EAGLE。** 启用并行推测；测量更深的草稿树 vs 串行 EAGLE-3。报告 P-EAGLE 有帮助 vs 有害的转折点。

6. **领域流量。** 通过同一服务器运行 ShareGPT vs HumanEval vs 领域特定流量。测量每种分布下的接受率。识别草稿何时漂移。

7. **第二个目标模型。** 在 Qwen3-Coder-30B MoE 上运行相同的流水线。草稿更棘手（MoE 路由噪声）。报告。

8. **K8s HPA。** 在 K8s 上部署，HPA 跟踪 `queue_wait_ms`。当负载变为三倍时演示扩展。

9. **成本比较。** 在同一评估上计算 $/1M 令牌 vs Anthropic Claude Sonnet 4.7 和 OpenAI GPT-5.4。发布。

## 使用方式

```
$ curl https://infer.example.com/v1/chat/completions -d '{"messages":[...]}'
[serve]     vLLM 0.7, Llama 3.3 70B FP8, EAGLE-3 活跃
[decode]    bs=8, accepted_tokens_per_step=3.2, acceptance_rate=0.76
[latency]   首令牌 42ms, 完整响应 980ms (620 令牌)
[cost]      在持续吞吐量下每 1M 输出令牌 $0.34
```

## 交付产出

`outputs/skill-inference-server.md` 描述交付产出。一个经过测量的服务栈，具有推测解码、完整的基准测试报告和 K8s 部署。

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 相比基线的实测加速比 | 在两个模型上以匹配质量实现 2.5 倍以上吞吐量 |
| 20 | 真实流量上的接受率 | 按分布报告的接受率 |
| 20 | P99 尾部延迟纪律 | 批量 1/8/32 下有和没有推测的 p99 |
| 20 | 运维 | K8s 部署、基于队列等待的 HPA、平滑发布 |
| 15 | 文档和方法论 | 清晰解释变化的内容和原因 |
| **100** | | |

## 练习

1. 测量当草稿落后目标一个版本时（例如，Llama 3.3 -> 3.4 漂移）接受率的下降。构建监控告警。

2. 实现 n-gram 回退：如果 EAGLE-3 接受率低于阈值，切换到 n-gram 草稿。报告可靠性改进。

3. 进行受控 MoE 实验：同样的 Qwen3-Coder-30B，注入路由噪声 vs 无噪声。测量草稿接受率敏感性。

4. 扩展到 H200（141 GB）。报告获得的每副本模型大小余量，以及是否可以服务未量化的 Llama 3.3 70B。

5. 在同一 H100 硬件上基准测试 TensorRT-LLM 推测解码。报告其相对于 vLLM 的优势。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 草稿模型 | "推测器" | 提出 N 个令牌供目标验证的小模型 |
| EAGLE-3 | "2026 草稿架构" | 在目标隐藏状态上训练的草稿头；约 75% 接受率 |
| P-EAGLE | "并行推测" | 草稿分支树，在一个目标传递中验证 |
| 接受率 | "命中率" | 无需重采样即可接受的草稿令牌比例 |
| 量化 | "FP8 / INT4" | 低精度权重，以在 GPU 内存中容纳更多模型 |
| 队列等待 | "HPA 指标" | 请求在开始推理之前在等待队列中的时间 |
| Speculators 中心 | "对齐草稿" | Red Hat Neural Magic 的常见开源模型 EAGLE 草稿中心 |

## 延伸阅读

- [vLLM EAGLE and P-EAGLE 文档](https://docs.vllm.ai) — 参考服务栈
- [P-EAGLE (AWS 2026)](https://aws.amazon.com/blogs/machine-learning/p-eagle-faster-llm-inference-with-parallel-speculative-decoding-in-vllm/) — 并行推测解码论文 + 集成
- [SGLang SpecForge](https://github.com/sgl-project/SpecForge) — 草稿头训练流水线
- [Red Hat Speculators](https://github.com/neuralmagic/speculators) — 对齐草稿中心
- [TensorRT-LLM 推测解码](https://nvidia.github.io/TensorRT-LLM/) — 供应商替代方案
- [Fireworks.ai 服务架构](https://fireworks.ai/blog) — 商业参考
- [EAGLE-3 论文 (arXiv:2503.01840)](https://arxiv.org/abs/2503.01840) — 方法论文
- [vLLM 仓库](https://github.com/vllm-project/vllm) — 代码和基准测试
