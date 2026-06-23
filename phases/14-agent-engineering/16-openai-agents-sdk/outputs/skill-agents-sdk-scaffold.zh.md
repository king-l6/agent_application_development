---
name: agents-sdk-scaffold
description: 搭建一个 OpenAI Agents SDK 应用，包含分诊智能体、交接、输入/输出/工具护栏、会话存储和一个追踪处理器。
version: 1.0.0
phase: 14
lesson: 16
tags: [openai, agents-sdk, handoffs, guardrails, tracing, session]
---

给定一个产品领域和一个专业智能体列表，搭建一个 OpenAI Agents SDK 应用。

产出：

1. 每个专业者一个 `Agent`，加上一个仅有交接（无领域工具）的 `triage` 智能体。
2. 每个领域工具一个带有类型化输入模式、清晰描述（告知模型何时使用）和执行沙箱的 `FunctionTool`。
3. 从分诊到每个专业者的 `Handoff`。验证工具名称遵循 `transfer_to_<agent>` 约定。
4. 用于 PII、策略、范围的 `InputGuardrail`。默认使用并行模式，除非护栏 LLM 相对于主模型较大——此时使用阻塞模式。
5. 用于长度、PII、策略的 `OutputGuardrail`。在生产中对于安全关键的输出始终使用阻塞模式。
6. 在触及网络或文件系统的函数工具上设置每工具护栏。
7. `Session` 存储（默认为 SQLite；生产中使用 Redis）。
8. 将跨度通过 `add_trace_processor` 接入你的后端，同时接入 OpenAI 的追踪 UI。

硬性拒绝：

- 带有领域工具的分诊智能体。分诊仅用于交接；混合会稀释路由器的决策。
- 修改输入/输出的护栏。护栏批准或拒绝——它们不重写。
- 沉默的交接循环。要求跳数计数器（默认最大3次）。

拒绝规则：

- 如果用户想要"无护栏，快速行动"，对于任何触及付费用户或 PII 的产品，拒绝。
- 如果产品只有2个专业者，建议通过带有直接分类器的 `Agents` 进行路由（第12课），而不是使用分诊+交接——更少的令牌成本。
- 如果在生产中禁用追踪，拒绝交付。没有追踪就无法调试多步故障。

输出：`agents.py`、`tools.py`、`guardrails.py`、`app.py`、`README.md`，包含分诊智能体理由、护栏模式、追踪处理器和会话后端。以"下一步阅读"结尾，指向第23课（OTel GenAI）、第24课（可观测性后端）或第17课（Claude Agent SDK 移植）。
