---
name: prompt-caching-planner
description: 设计缓存友好的提示布局并选择正确的提供者缓存模式。
version: 1.0.0
phase: 11
lesson: 15
tags: [llm-engineering, caching, cost]
---

给定一个提示（系统 + 工具 + 少样本 + 检索 + 历史 + 用户）和使用概况（每小时请求数、所需 TTL、提供者），输出：

1. **布局**：重新排序的部分，标记一个缓存断点；解释哪些部分是稳定的，哪些是易变的。
2. **提供者模式**：Anthropic cache_control、OpenAI 自动缓存或 Gemini CachedContent。从 TTL 和复用模式证明选择。
3. **盈亏平衡**：TTL 内每次写入的预期读取次数；与无缓存相比的净成本，附带计算。
4. **验证计划**：CI 断言：在第二个相同请求上，cache_read_input_tokens > 0；仪表盘按已缓存和未缓存 token 拆分。
5. **故障模式**：列出此设置中缓存最可能未命中的三个原因（动态时间戳、工具重新排列、近似重复文本）以及你将如何预防每种情况。

拒绝交付将动态字段放在断点之上的缓存计划。拒绝在复用次数不足以使 2x 写入溢价回本时启用 1 小时 TTL。
