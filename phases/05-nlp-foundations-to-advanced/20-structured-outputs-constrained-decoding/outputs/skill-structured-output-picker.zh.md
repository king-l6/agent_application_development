---
name: structured-output-picker
description: 选择结构化输出方法、Schema 设计和验证方案。
version: 1.0.0
phase: 5
lesson: 20
tags: [nlp, llm, structured-output]
---

给定一个用例（提供商、延迟预算、Schema 复杂度、容错能力），输出：

1. 机制。原生供应商结构化输出、Instructor 重试、Outlines FSM 或 XGrammar CFG。一句话理由。
2. Schema 设计。字段顺序（推理在前，答案在后），"unknown"的可空字段，枚举 vs 正则，必填字段。
3. 失败策略。最大重试次数、回退模型、优雅的 `null` 处理、超出分布时的拒绝策略。
4. 验证方案。Schema 合规率（目标 100%）、语义有效性（LLM 评判）、字段覆盖率、延迟 p50/p99。

拒绝任何将 `answer` 或 `decision` 放在推理字段之前的设计。拒绝使用没有 schema 的纯 JSON 模式。标记使用仅 FSM 库处理递归 schema 的情况。
