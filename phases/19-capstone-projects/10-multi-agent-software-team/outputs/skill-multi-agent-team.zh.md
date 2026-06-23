---
name: multi-agent-team
description: 构建一个多 Agent 软件工程团队，包含架构师、并行编码员、评审者和测试者；在 SWE-bench Pro 上评估并生成交接事后分析。
version: 1.0.0
phase: 19
lesson: 10
tags: [capstone, multi-agent, swe-bench, langgraph, a2a, worktree, roles]
---

给定一个 GitHub 问题 URL 和并行度，部署一个多 Agent 软件工程团队，生成可合并的 PR。在 50 个 SWE-bench Pro 问题上评估并发布交接失败直方图。

构建计划：

1. 任务板：文件后端（或 Redis）的类型化消息 JSONL 存储。消息类型：plan_request、subtask、diff_ready、review_needed、review_feedback、approved、test_needed、test_passed、test_failed、replan_needed。
2. 架构师（Opus 4.7）：阅读问题，编写计划，发出带有显式接口的子任务 DAG（接触的文件、公共函数、测试影响）。
3. N 个编码员（Sonnet 4.7）：每个认领一个子任务，生成新的 `git worktree add` + Daytona 沙盒，独立实现。
4. 合并协调者：三向合并；仅当文件级重叠时进行 LLM 介导的冲突解决。
5. 评审者（GPT-5.4）：读取合并差异；不能批准自己编写的差异；发出 approved 或 routed 到相关编码员的 review_feedback。
6. 测试者（Gemini 2.5 Pro）：在干净沙盒中运行测试套件；发出 test_passed 或带产物的 test_failed。
7. 交接记账：每个跨角色消息成为 Langfuse span，包含载荷大小和模型。计算 token 放大 = total_tokens / single_agent_baseline_tokens。
8. 注入明显错误探测（10% 的运行）以测量评审者误批准率。
9. 在 50 个 SWE-bench Pro 问题上运行；发布 pass@1、与单 Agent 基线的挂钟时间对比、每角色 token 分解、交接失败直方图。

评估标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | SWE-bench Pro pass@1 | 50 问题子集 pass@1 |
| 20 | 并行加速 | 与单 Agent 基线的挂钟时间对比 |
| 20 | 评审质量 | 注入 bug 探测中的误批准率 |
| 20 | Token 效率 | 每个解决问题的总 token 数 vs 单 Agent |
| 15 | 协调工程 | 合并冲突解决、交接失败直方图 |

硬性拒绝：

- 评审者可以批准自己编写或提出的差异。硬约束。
- 没有匹配的单 Agent 基线运行的报告。多 Agent 必须*每美元*获胜，而不仅仅是 pass@1。
- 消息是自由格式字符串而不是类型化 A2A 消息的任务板。
- 默默丢弃冲突差异而不是路由回重新规划的合并协调者。

拒绝规则：

- 拒绝在没有每角色预算上限（token + 美元）的情况下运行。
- 拒绝打开测试者未在干净沙盒中验证的 PR。
- 拒绝在单次运行中编码员超过 8 个。协调开销在此之上占主导。

输出：包含任务板 + 角色工作进程、50 问题 SWE-bench Pro 运行日志、匹配的单 Agent 基线运行、带有角色标记 span 和每角色 token 分解的 Langfuse 仪表盘、注入 bug 探测报告、以及一份命名三个最常出问题的交接以及减少每个问题的消息模式或提示变更的事后分析报告。
