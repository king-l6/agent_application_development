# 推理指标 —— TTFT、TPOT、ITL、Goodput、P99

> 有四个指标决定一个推理部署是否正常工作。TTFT 是预填充加队列加网络。TPOT（等同于 ITL）是每个 token 的内存受限解码成本。端到端延迟是 TTFT 加上 TPOT 乘以输出长度。吞吐量是整个集群每秒处理的 token 总数。但对产品真正重要的是 goodput —— 同时满足所有 SLO 的请求比例。高吞吐量但低 goodput 意味着你处理的 token 从未及时到达用户手中。2026 年在 TRT-LLM 上 Llama-3.1-8B-Instruct 的参考数据：平均 TTFT 162 ms，平均 TPOT 7.33 ms，平均 E2E 1,093 ms。始终报告 P50、P90、P99 —— 绝不只报告平均值。注意测量陷阱：GenAI-Perf 在 ITL 计算中排除 TTFT，LLMPerf 包含它；两种工具对同一运行给出不同的 TPOT 结果。

**类型：** 学习
**语言：** Python（标准库，玩具百分位计算器和 goodput 报告器）
**前置知识：** 阶段 17 · 04（vLLM 服务内部机制）
**时间：** 约 60 分钟

## 学习目标

- 精确定义 TTFT、TPOT、ITL、E2E、吞吐量和 goodput，并说明每个指标衡量的组成部分。
- 解释为什么平均值是 LLM 服务的错误统计量，以及如何解读 P50/P90/P99。
- 构建一个多约束 SLO（例如 TTFT<500 ms 且 TPOT<15 ms 且 E2E<2 s）并据此计算 goodput。
- 说出两个对同一运行给出不同 TPOT 结果的基准测试工具，并解释原因。

## 问题

"我们的吞吐量是每秒 15,000 个 token。"那又怎样？如果 40% 的请求端到端超过 2 秒，用户已经放弃了会话。吞吐量本身并不能告诉你产品是否正常工作。

推理有多个延迟维度，每个维度的失败方式不同。预填充是计算受限的，随提示长度扩展。解码是内存受限的，随批处理大小扩展。排队延迟是操作问题。网络是物理距离问题。你需要针对每个维度使用不同的指标，需要百分位数，还需要一个综合指标来回答"用户是否得到了他们期望的体验" —— 这就是 goodput。

## 概念

### TTFT —— 首 token 时间

`TTFT = 排队时间 + 网络请求时间 + 预填充时间`

当提示较长时，预填充占主导地位。在 Llama-3.3-70B FP8 on H100 上，32k 提示大约需要 800 ms 的纯预填充时间。排队时间是负载下的调度器行为。网络请求时间包括 TLS 的线路时间。TTFT 是用户在流式返回任何内容之前看到的延迟。

### TPOT / ITL —— token 间延迟

同一个量有多个名称。`TPOT`（每个输出 token 的时间）、`ITL`（token 间延迟）、`每 token 解码延迟` —— 都是同一个概念。它是第一个 token 之后连续流式 token 之间的时间。

`TPOT = (解码前向时间 + 调度器开销) / 产生的 token 数`

在同样的 Llama-3.3-70B H100 技术栈上，使用分块预填充时，TPOT 平均约 7 ms。如果没有分块预填充，在相邻序列的长预填充期间，TPOT 可能飙升到 50 ms。关注 P99，而不是平均值。

### E2E 延迟

`E2E = TTFT + TPOT * 输出 token 数 + 网络响应时间`

对于长输出（>500 token），E2E 由 TPOT 主导。对于短输出但长提示，E2E 由 TTFT 主导。报告按输出长度分层的 E2E。

### 吞吐量

`吞吐量 = 总输出 token 数 / 经过时间`

聚合指标。告诉你集群效率。不能告诉你单个请求的健康状况。

### Goodput —— 你真正关心的指标

`goodput = 满足 (TTFT <= a) 且 (TPOT <= b) 且 (E2E <= c) 的请求比例`

SLO 是一个多约束条件。一个请求只有在每个约束都满足时才被认为是"好的"。Goodput 就是这个比例。高吞吐量但 60% 的 goodput 是失败的。低吞吐量但 99% 的 goodput 才是目标。

2026 年，goodput 是 MLPerf 推理 v6.0 提交和 AI 平台提供商内部 SLA 跟踪中使用的指标。

### 为什么平均值是错误的统计量

LLM 延迟分布是右偏的。一个解码批次中，如果有一个长预填充的邻居，可能 500 个 token 的 TPOT 约 7 ms，而 20 个 token 的 TPOT 约 60 ms。平均 TPOT 是 9 ms。P99 TPOT 是 65 ms。用户经常遇到 P99 —— 这就是他们离开的原因。

始终报告三元组（P50、P90、P99）。对于用户体验，P99 是你需要优化的指标。

### 参考数据 —— Llama-3.1-8B-Instruct on TRT-LLM, 2026

- 平均 TTFT：162 ms
- 平均 TPOT：7.33 ms
- 平均 E2E：1,093 ms
- P99 TPOT：根据分块预填充配置在 10-25 ms 之间变化

这些是 NVIDIA 发布的参考数据。它们会随模型大小（70B 会显示 3-5 倍差异）、硬件（H100 vs B200 约 3 倍差异）和负载而变化。

### 测量陷阱

2026 年最常用的两种基准测试工具对同一运行的 TPOT 给出不同结果：

- **NVIDIA GenAI-Perf**：在 ITL 计算中排除 TTFT。ITL 从第 2 个 token 开始计算。
- **LLMPerf**：包含 TTFT。ITL 从第 1 个 token 开始计算。

对于一个 TTFT 为 500 ms、100 个输出 token 总解码时间为 700 ms 的请求，GenAI-Perf 报告 `ITL = 700/99 = 7.07 ms`，LLMPerf 报告 `ITL = 1200/100 = 12.00 ms`。工具的选择改变数字。

始终说明使用哪个工具。始终公布定义。

### 构建 SLO

2026 年面向消费者的 70B 聊天模型的合理 SLO：

- TTFT P99 <= 800 ms。
- TPOT P99 <= 25 ms。
- E2E P99 <= 3 s（输出 <300 token）。
- Goodput 目标 >= 99%。

企业级 SLO 收紧 TTFT（200-400 ms）并放松 E2E。关键在于写下来，测量所有三个指标，并将 goodput 作为单一综合指标追踪。

### 如何测量

- 运行真实流量或逼真的合成流量（LLMPerf 使用 `--mean-input-tokens 800 --stddev-input-tokens 300 --mean-output-tokens 150`）。
- 基准测试运行的目标并发度为峰值并发的 2 倍。
- 运行 30-50 次迭代，取合并样本的百分位数。
- 发布时附带工具名称、工具版本、模型、硬件、并发度、提示分布。

```figure
throughput-latency
```

## 使用它

`code/main.py` 是一个玩具 goodput 计算器。生成合成延迟分布，应用 SLO，计算 goodput。还展示了同一轨迹上 GenAI-Perf 与 LLMPerf 的 TPOT 差异。

## 交付物

本节课生成 `outputs/skill-slo-goodput-gate.zh.md`。给定工作负载和 SLO，生成一个 CI/CD 就绪的基准测试方案，以 goodput 而非吞吐量为门禁条件来卡点部署。

## 练习

1. 运行 `code/main.py`。生成一个包含 1% 尾部突刺的分布。当你将 P99 TPOT 从 30 ms 收紧到 15 ms 时，goodput 如何变化？
2. 供应商声称"Llama 3.3 70B H100 上每秒 15,000 token"。在相信之前，提出三个需要追问的问题。
3. 为什么分块预填充保护 P99 TPOT 但不保护平均 TPOT？
4. 为语音助手构建一个消费者 SLO（首 token 是听到的，不是读到的）。哪个指标对用户最可见？
5. 阅读 LLMPerf README 和 GenAI-Perf 文档。找出工具间存在分歧的其他三个指标。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| TTFT | "首 token 时间" | 队列 + 网络 + 预填充；长提示时由预填充主导 |
| TPOT | "每输出 token 时间" | 第一个 token 后的内存受限解码成本 |
| ITL | "token 间延迟" | 在大多数工具中与 TPOT 相同（并非全部——见 GenAI-Perf） |
| E2E | "端到端" | TTFT + TPOT * 输出长度；加上响应侧网络时间 |
| 吞吐量 | "tok/s" | 集群效率；没有延迟百分位就没有意义 |
| Goodput | "SLO 达标率" | 同时满足每个 SLO 约束的请求比例 |
| P99 | "尾部" | 1% 最差情况延迟；用户体验指标 |
| SLO 多约束 | "联合条件" | 所有三个延迟界限的 AND 条件；违反任何一个则请求失败 |
| GenAI-Perf vs LLMPerf | "工具陷阱" | 工具对 ITL 是否包含 TTFT 存在分歧 |

## 延伸阅读

- [NVIDIA NIM — LLM Benchmarking Metrics](https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html) — TTFT、ITL、TPOT 的规范定义。
- [Anyscale — LLM Serving Benchmarking Metrics](https://docs.anyscale.com/llm/serving/benchmarking/metrics) — 替代定义和测量方法。
- [BentoML — LLM Inference Metrics](https://bentoml.com/llm/inference-optimization/llm-inference-metrics) — 实际部署中的测量应用。
- [LLMPerf](https://github.com/ray-project/llmperf) — 基于 Ray 的开源基准测试。
- [GenAI-Perf](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/client/src/c++/perf_analyzer/genai-perf/README.html) — NVIDIA 的基准测试工具。
- [MLPerf Inference](https://mlcommons.org/benchmarks/inference-datacenter/) — 行业公认的基于 goodput 的基准测试。
