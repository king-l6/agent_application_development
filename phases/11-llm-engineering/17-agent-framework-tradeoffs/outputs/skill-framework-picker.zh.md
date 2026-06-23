---
name: framework-picker
description: 通过将抽象与问题形状匹配，为代理任务选择 LangGraph、CrewAI、AutoGen、Agno 或纯 Python。
version: 1.0.0
phase: 11
lesson: 17
tags: [langgraph, crewai, autogen, agno, agent-framework, orchestration, decision-matrix]
---

给定任务描述（问题形状、每次运行的 LLM 调用总数、分支模式、耐久性和恢复需求、人工参与检查点、并行扇出、会话记忆、预期每日运行量），输出：

1. **形状匹配**：一句话命名适配的抽象：图（类型化状态、命名转换）、组织结构图（专家角色、管理者路由交接）、聊天（代理交谈直到完成）、带工具的单代理。如果你无法选择一个，任务还不是代理形状；停下来并分解。
2. **分支权威**：谁选择下一步：开发者（显式边）、管理者 LLM（CrewAI 层级模式）、对话涌现（AutoGen GroupChat）、工具调用自路由（Agno）。如果适用，引用 LLM 选择路由的每轮 token 成本。
3. **状态预算**：确认是否需要重启后恢复、时光回溯或人工中断。如果是，LangGraph 在状态优先的抽象上胜出；Agno 仅覆盖会话范围内的记忆。
4. **框架选择**：输出 langgraph、crewai、autogen、agno、plain_python 之一。包含将形状和状态答案映射到框架核心抽象的一句话理由。
5. **逃生口**：如果每日运行量超过 10,000 或任务是不带状态的两次或更少 LLM 调用，推荐使用纯 Python 加提供者 SDK。当任务很小时，没有框架是最快的框架。

拒绝为具有已知 DAG 的确定性工作流推荐 AutoGen；GroupChatManager 消耗 token 来选择开发者本可以静态连接的发言者。CrewAI 确实通过 `output_pydantic` / `output_json` 支持结构化任务输出（参见 [docs.crewai.com/en/concepts/tasks](https://docs.crewai.com/en/concepts/tasks)），但其 `context` 通道仍然流经下一个任务的提示字符串。当工作流依赖原始 `context` 来携带结构化状态而无需这些输出模式之一时，对 CrewAI 提出异议。对于两调用摘要器，对 LangGraph 提出异议；StateGraph 的开销是纯粹的税收。当任务扩展到超过 4 个具有归约器语义的并行子工作者时，对 Agno 提出异议；Agno 提供了一个 `Parallel` 块，其输出连接到一个按步骤名称键控的字典（参见 [docs-v1.agno.com/workflows_2/overview](https://docs-v1.agno.com/workflows_2/overview) 和 [docs.agno.com/workflows/access-previous-steps](https://docs.agno.com/workflows/access-previous-steps)），但它没有公开可与 LangGraph 的 Send 风格扇出和归约 API 相比较的 API。

**示例输入：** "长时间运行的研究工作流：规划，扇出到三个检索器，综合，人工批准简报，撰写报告，引用来源。必须在崩溃后恢复。生产环境每天 50 次运行。"

**示例输出：**
- 形状：图。类型化规划、三个并行检索器、综合和写入之间的命名转换。
- 分支：通过条件边由开发者决定。没有每轮管理者 LLM。
- 状态：需要恢复和人工中断。LangGraph 强制使用。
- 框架：langgraph。状态、Send 扇出、interrupt_before 和 PostgresSaver 都是一级支持。
- 逃生口：不适用。每天 50 次运行远低于纯 Python 阈值，且工作流状态化程度太高，无法不使用框架。
