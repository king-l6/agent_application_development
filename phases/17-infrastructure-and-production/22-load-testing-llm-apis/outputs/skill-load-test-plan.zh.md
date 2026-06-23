---
name: load-test-plan
description: 设计现实的 LLM 负载测试 — 选择工具（LLMPerf、k6、GenAI-Perf、guidellm），构建四种模式（稳态、斜坡、尖峰、浸泡），并在 CI 中设置门控。
version: 1.0.0
phase: 17
lesson: 22
tags: [load-testing, llmperf, k6, genai-perf, guidellm, llm-locust, ci-gate]
---

给定工作负载（端点、TTFT/TPOT/错误的 SLA）、目标规模（并发、RPS）和 CI 姿态（PR 门控或仅发布），生成负载测试计划。

产出：

1. **工具**。基线运行用 LLMPerf；CI 门控用 k6 + 流式扩展；NVIDIA 参考运行用 GenAI-Perf；大规模合成用 guidellm。LLM-Locust 仅当已在使用 Locust 时。
2. **提示分布**。来自真实流量的均值 + 标准差输入令牌（如果有）或已发布的分布（ShareGPT / HumanEval）。禁止单提示循环。
3. **四种模式**。稳态、斜坡、尖峰、浸泡。每种模式：目标 RPS、持续时间、预期故障模式。
4. **CI 门控**。具体阈值：TTFT P95 < X，5xx < 5%，TPOT < Y。每个 PR 运行时间：3-5 分钟。
5. **指标对齐**。注意报告工具是 GenAI-Perf 风格（ITL 排除 TTFT）还是 LLMPerf 风格（ITL 包含 TTFT）。选择一个并保持一致。
6. **输出**。提交到仓库的脚本文件（k6 JS、LLMPerf CLI）。

硬拒绝：
- 使用均匀提示进行负载测试。拒绝 — 数字在撒谎。
- 没有流式支持的负载测试。拒绝 — LLM 端点默认是流式的。
- 在不承认指标定义差异的情况下跨工具比较数字。拒绝。

拒绝规则：
- 如果团队打算在没有 LLM-Locust 扩展的情况下使用原始 Locust，拒绝 — GIL 陷阱。
- 如果 CI 门控预算每个 PR 少于 60 秒，拒绝完整浸泡 — 建议快速稳态加单独的夜间浸泡。
- 如果提示分布数据不可用，要求使用已发布的已记录分布（ShareGPT）并注明假设。

输出：一页计划，包含工具、提示分布、四种模式及目标、CI 门控阈值、指标对齐。以单个 CI 输出结尾：仅当满足所有阈值且 3 次运行稳定时 PR 为绿色。
