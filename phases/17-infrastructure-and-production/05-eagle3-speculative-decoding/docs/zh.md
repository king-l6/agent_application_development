# 生产环境中的 EAGLE-3 推测解码

> 推测解码将快速的草稿模型与目标模型配对。草稿模型提出 K 个 token；目标模型在单个前向传播中验证；被接受的 token 是免费的。2026 年，EAGLE-3 是生产级变体 — 它在目标模型的隐藏状态上（而非原始 token 上）训练草稿头，将通用对话的接受率 alpha 推至 0.6-0.8 区间。正确的问题不是"草稿模型有多快"，而是"我的流量上的 alpha 是多少？"如果 alpha 降至约 0.55 以下，推测解码在高并发下是净负面的，因为每个被拒绝的草稿都导致第二次目标前向传播。本课教你先测量 alpha，再翻转标志。

**类型：** 学习
**语言：** Python（标准库，玩具接受率模拟器）
**前置知识：** 阶段 17 · 04（vLLM 服务内部原理）、阶段 10 · 18（多 token 预测）
**时间：** ~60 分钟

## 学习目标

- 说出推测解码的三代演进，并解释 EAGLE-3 相比 EAGLE-2 和经典草稿模型的变化。
- 定义接受率 alpha，从 alpha 和 K（草稿长度）计算预期加速比，并为你的目标并发度识别盈亏平衡 alpha。
- 解释为什么推测解码在 2026 年的 vLLM 中是 opt-in（非默认），以及为什么未测量 alpha 就开启它是一个生产反模式。
- 编写一个测量计划：使用哪个基准测试、哪个提示分布、哪个并发点、哪个指标作为门控条件。

## 问题

解码是内存受限的。在运行 Llama 3.3 70B FP8 的 H100 上，每个解码 token 读取约 140 GB/s 的权重并产生一个 token。在解码期间 GPU 计算几乎空闲 — 瓶颈是 HBM 带宽，而非 matmul 吞吐量。

推测解码利用这一差距。用一个廉价的草稿模型生成 K 个候选 token，然后让目标模型在单个前向传播中验证全部 K 个。每个被验证的 token 实际上是免费的（摊销到目标模型本来就需要执行的一批 K 个前向传播中）。

经典的草稿模型方法使用同一家族的较小模型（Llama 3.2 1B 为 Llama 3.3 70B 做草稿）。它有效，但接受率一般 — 较小模型的分布与目标偏离。EAGLE、EAGLE-2、然后 EAGLE-3 直接在目标模型的内部状态上训练一个轻量级草稿头，因此草稿的分布与目标紧密得多。这就是为什么 alpha 从草稿模型的 0.4 提升到 EAGLE-3 的 0.6-0.8。

问题是：EAGLE-3 在 2026 年的 vLLM 中是 opt-in。`speculative_config` 必须明确设置。没有标志，就没有加速。未测量真实流量上的 alpha 就开启它的团队经常发现尾部延迟变得更糟，而非更好。

## 概念

### 推测解码实际带来的收益

无推测解码时，每个 token 的成本是一次目标前向传播。使用推测解码，草稿长度为 K，接受率为 alpha，每个目标前向传播的预期 token 数为 `1 + K * alpha`。加速比为 `(1 + K * alpha) / (1 + epsilon)`，其中 epsilon 是草稿加验证的开销。对于 K=5, alpha=0.7：`(1 + 5*0.7) / (1 + 0.1) = 4.5 / 1.1 = 4.1x`。实际数字集中在 2-3x 左右，因为 alpha 在生产流量上很少那么高，且 epsilon 在大批次大小下会增长。

### 为什么 alpha 是唯一重要的指标

被拒绝的 token 不会消失 — 它们强制对第一个被拒绝的 token 进行第二次目标前向传播。在工作负载 alpha 降至 0.4 的情况下，你付出草稿开销加验证开销加重试开销。在高并发下（比如 256 并发），解码批次已经足够大，"单独目标"和"带验证的目标"之间的内存带宽差距缩小。在大多数 2026 年硬件上，alpha 低于 0.55 时，推测解码为净负面。

Alpha 因工作负载而异。在 ShareGPT 风格的通用对话上，在 ShareGPT 上训练的 EAGLE-3 达到 0.6-0.8。在领域特定流量（代码、医疗、法律）上，在通用数据上训练的草稿头降至 0.4-0.6。训练领域特定的草稿头可以恢复 alpha — 与目标微调相比，这是一个轻量、快速的训练任务。

### EAGLE 世代一览

- **经典草稿模型**：同一家族的小模型。Alpha 0.3-0.5。基础架构简单 — 加载两个模型，草稿为每个目标前向传播运行 K 次前向传播。
- **EAGLE-1（2024）**：在目标隐藏状态（最后一层）上训练的单个草稿头。Alpha 约 0.5-0.6。在目标之上参数开销小。
- **EAGLE-2（2025）**：自适应草稿长度和基于树的草稿（在一次目标传播中验证多个分支）。Alpha 约 0.6-0.7。更复杂的草稿调度器。
- **EAGLE-3（2025-2026）**：在多个目标层（不仅仅是最后一层）上训练的草稿头，更好的对齐。通用对话上 Alpha 约 0.6-0.8。

### 2026 年生产配方

1. 先单独部署目标模型。在目标并发度下测量基线 TTFT、ITL、吞吐量。
2. 通过 vLLM `speculative_config` 启用 EAGLE-3 草稿。重新运行基准测试。
3. 记录接受率 alpha。vLLM V1 将其报告为 `spec_decode_metrics.accepted_tokens_per_request`。除以请求的草稿长度得到 alpha。
4. 如果在生产流量分布上 alpha < 0.55，禁用推测解码或训练领域特定的 EAGLE-3 草稿。
5. 在生产并发度下重新运行。确认 P99 ITL 没有变差。

### 生产陷阱：P99 尾部

平均 ITL 随推测解码下降。如果不调优，P99 可能变差。被拒绝的草稿触发两遍序列（草稿 + 验证失败 + 重试）。在全批次下，这两遍会序列化。关注 P99 ITL，而非 P50。

### EAGLE-3 已在部署的地方

Google 在 2025 年的 AI Overviews 中部署了推测解码（相同质量，更快响应）。vLLM V1 提供 `speculative_config` 作为文档记录的接口；V1 中的 N-gram GPU 推测解码是与 chunked prefill 兼容的变体。SGLang 支持 EAGLE-3 作为前缀繁重工作负载的推荐草稿路径。

### 一行盈亏平衡计算

预期加速比：`S(alpha, K) = (1 + K*alpha) / (1 + verify_overhead)`。令 `S = 1` 解出 alpha：`alpha_breakeven = verify_overhead / K`。对于典型 verify_overhead 约 0.15 和 K=5：`alpha_breakeven = 0.03`。但这是原始解码计算。在高并发下验证开销上升，解码批次已经跨序列摊销内存读取，因此在实践中有效 alpha_breakeven 升至约 0.45-0.55。

### 何时不应使用推测解码

- 延迟无关紧要的 Batch-1 离线生成。使用单独目标模型。
- 非常短的输出（低于 50 token）。草稿开销和验证成本占主导。
- 没有领域训练草稿头的专门领域。Alpha 太低。
- vLLM v0.18.0 加草稿模型推测解码加 `--enable-chunked-prefill`。此组合无法编译。文档记录的唯一例外是 V1 中的 N-gram GPU 推测解码。

## 使用它

`code/main.py` 模拟一个带和不带推测解码的解码循环，涵盖一系列 alpha 值和草稿长度 K。它打印盈亏平衡 alpha、测量加速比和尾部行为。在多个 (alpha, K) 组合上运行它，以准确查看推测解码在何处停止回报。

## 交付物

本课产出 `outputs/skill-eagle3-rollout.md`。给定目标模型、流量分布描述和并发度目标，它产生一个分阶段的 EAGLE-3 推出计划 — 基准测试基线、启用配置、测量 alpha、以 alpha >= 0.55 为门控、监控 P99 ITL。

## 练习

1. 运行 `code/main.py`。在 K=5 时，你需要多少 alpha 才能获得 2 倍加速？3 倍加速？这对比 verify_overhead 有多敏感？
2. 想象生产流量 70% 通用对话、30% 代码。通用对话使用在 ShareGPT 上训练的 EAGLE-3 达到 alpha 0.7；代码达到 alpha 0.4。混合 alpha 是多少？推测解码是净正面的吗？
3. 阅读 vLLM `speculative_config` 文档。指出三种模式（草稿模型、EAGLE、N-gram）以及与 chunked prefill 兼容的是哪一种。
4. 你看到启用 EAGLE-3 后平均 ITL 下降了 25%，但 P99 ITL 上升了 15%。诊断并提出缓解方案。
5. 计算 Llama 3.3 70B 的 EAGLE-3 草稿头的内存成本。与将 Llama 3.2 1B 作为经典草稿模型运行相比如何？

## 关键术语

| 术语 | 人们说的是 | 实际含义 |
|------|-----------|---------|
| 推测解码 | "草稿加验证" | 用廉价模型提出 K 个 token，在一个目标前向传播中验证全部 K 个 |
| 接受率 alpha | "推测接受率" | 被目标接受的草稿 token 比例；唯一重要的指标 |
| 草稿长度 K | "推测 k" | 草稿每个目标前向传播提出的 token 数；典型值 4-8 |
| 验证开销 epsilon | "推测开销" | 与普通目标前向传播相比，验证和重试的额外成本；随批次增长 |
| EAGLE-3 | "最新 EAGLE" | 2025-2026 变体；在多个目标层上训练草稿头；通用对话上 alpha 0.6-0.8 |
| `speculative_config` | "vLLM 推测配置" | vLLM V1 中明确的 opt-in；无默认值意味着无加速 |
| N-gram 推测解码 | "N-gram 草稿" | 使用提示中 N-gram 查找的 GPU 端草稿；与 chunked prefill 兼容 |
| 盈亏平衡 alpha | "无效果 alpha" | 推测解码给出零加速时的 alpha；在生产并发度下关注此值 |
| 拒绝草稿两遍 | "重试成本" | 草稿被拒绝时的两次目标前向传播；驱动 P99 尾部 |

## 进一步阅读

- [vLLM — 推测解码文档](https://docs.vllm.ai/en/latest/features/spec_decode/) — 关于 `speculative_config` 和 V1 中 chunked-prefill 兼容性的权威来源。
- [vLLM Speculative Config API](https://docs.vllm.ai/en/latest/api/vllm/config/speculative/) — 确切的字段集。
- [EAGLE 论文（arXiv:2401.15077）](https://arxiv.org/abs/2401.15077) — 原始 EAGLE 草稿头公式。
- [EAGLE-2 论文（arXiv:2406.16858）](https://arxiv.org/abs/2406.16858) — 自适应草稿和树。
- [UC Berkeley EECS-2025-224](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2025/EECS-2025-224.html) — 带推测解码的高效 LLM 系统。
- [BentoML — 推测解码](https://bentoml.com/llm/inference-optimization/speculative-decoding) — 生产推出清单。
