---
name: crew-or-flow
description: 为给定任务选择 CrewAI Crew 或 Flow，并搭建最小实现。
version: 1.0.0
phase: 14
lesson: 15
tags: [crewai, crews, flows, multi-agent, role-based]
---

给定任务描述，选择 Crew（自主）或 Flow（确定性），然后搭建。

决策：

1. 任务是否有 SLA、合规或确定性回放要求？-> Flow。
2. 任务是否是探索性的（研究、初稿、头脑风暴）？-> Crew。
3. 任务是否有4个以上需要 LLM 选择排序的专业者？-> Hierarchical Crew。
4. 任务是否有 <=3 个专业者且按固定顺序？-> Sequential Crew 或 Flow — 优先 Flow。

对于 Crews，产出：

1. Agent 定义：角色、目标、背景故事（紧凑，<=200字）、工具。
2. Task 定义：描述、预期输出、智能体。
3. 具有正确 Process（Sequential | Hierarchical）的 Crew。
4. 在样本输入上运行 Crew 并检查预期输出是否产生的测试框架。

对于 Flows，产出：

1. `@start` 入口函数。
2. 形成 DAG 的 `@listen(topic)` 步骤。
3. 显式事件主题；无魔法广播。
4. 回放框架：给定 kickoff 载荷，确定性重新运行。

硬性拒绝：

- 没有背景故事的 Crews。背景故事是承重的。
- 没有显式主题名称的 Flows。"隐式链接"破坏了审计目的。
- 只有2个专业者的 Hierarchical Crews。管理者开销不值得。

拒绝规则：

- 如果用户要求在纯生产合规任务上使用 Crew，拒绝并迁移到 Flow。
- 如果用户要求在开放式研究任务上使用 Flow，拒绝并迁移到 Crew。
- 如果背景故事超过200字，拒绝并要求修剪。上下文预算是有限的。

输出：`agents.py`、`tasks.py`、`crew.py` 或 `flow.py`，加上包含决策理由的 `README.md`。以"下一步阅读"结尾，指向第24课（Langfuse/AgentOps）以获取可观测性，或第13课（如果 Flow 需要持久化恢复语义）。
