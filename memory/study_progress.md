# 学习进度

> 跨终端、跨会话的唯一进度真相源。开新终端先读这个文件，就知道学到哪了。
> 浏览器 localStorage（site/progress.js）和 playground 模块都不可靠，以本文件为准。

## 当前进度

- **正在学**：Phase 14 · Agent 工程（共 42 课），已学到第 12 课 `12-anthropic-workflow-patterns` ✅，下一课第 13 课
- **最后更新**：2026/07/01

## Phase 11 · LLM 工程（课程清单）

| # | 课程目录 | 状态 | Playground 模块 |
|---|---|---|---|
| 01 | 01-prompt-engineering | ✅ 已完成 | prompt_analyzer |
| 02 | 02-few-shot-cot | ✅ 已完成 | cot_prompt_builder |
| 03 | 03-structured-outputs | ✅ 已完成 | json_validator |
| 04 | 04-embeddings | ❓ 待确认 | embedding_similarity（疑似） |
| 05 | 05-context-engineering | ✅ 已完成 | context_budget_planner |
| 06 | 06-rag | ❓ 待确认 | — |
| 07 | 07-advanced-rag | ❓ 待确认 | — |
| 08 | 08-fine-tuning-lora | ❓ 待确认 | — |
| 09 | 09-function-calling | ✅ 已完成 | function_call_simulator |
| 10 | 10-evaluation | ❓ 待确认 | — |
| 11 | 11-caching-cost | ❓ 待确认 | cost_estimator（疑似） |
| 12 | 12-guardrails | ❓ 待确认 | — |
| 13 | 13-production-app | ❓ 待确认 | — |
| 14 | 14-model-context-protocol | ❓ 待确认 | — |
| 15 | 15-prompt-caching | ✅ 已完成 | cache_friendliness |
| 16 | 16-langgraph-state-machines | ✅ 已完成 | langgraph_simulator（模拟）+ checkpoint_viewer（解码真实库） |
| 17 | 17-agent-framework-tradeoffs | ✅ 已完成 | framework_picker |

> ❓ 待确认：这几课缺独立 playground 模块，无法从代码倒推是否学过，需用户确认。

## Phase 14 · Agent 工程（共 42 课）

| # | 课程目录 | 状态 | Playground 模块 |
|---|---|---|---|
| 01 | 01-the-agent-loop | ✅ 已完成 | react_loop_tracer |
| 02 | 02-rewoo-plan-and-execute | ✅ 已完成 | rewoo_planner |
| 03 | 03-reflexion-verbal-rl | ✅ 已完成 | reflexion_coder |
| 04 | 04-tree-of-thoughts-lats | ✅ 已完成 | tot_search |
| 05 | 05-self-refine-and-critic | ✅ 已完成 | self_refine_critic |
| 06 | 06-tool-use-and-function-calling | ✅ 已完成 | tool_use |
| 07 | 07-memory-virtual-context-memgpt | ✅ 已完成 | memgpt_virtual_context |
| 08 | 08-memory-blocks-sleep-time-compute | ✅ 已完成 | memory_blocks_sleep |
| 09 | 09-hybrid-memory-mem0 | ✅ 已完成 | mem0_hybrid |
| 10 | 10-skill-libraries-voyager | ✅ 已完成 | voyager_skills |
| 11 | 11-planning-htn-and-evolutionary | ✅ 已完成 | htn_evolutionary |
| 12 | 12-anthropic-workflow-patterns | ✅ 已完成 | confidence_router |
| .. | （13-42 见 phases/14-agent-engineering/） | ⬜ 未开始 | — |

## 维护约定

- 每学完一节课：把该行状态改为 ✅，更新"正在学"和"最后更新"，并补上 Playground 模块名。
- 这是课后三件事之一（见 MEMORY.md 的 after-lesson-routine）。
