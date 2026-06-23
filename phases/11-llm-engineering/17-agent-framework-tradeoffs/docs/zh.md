# 代理框架权衡 —— LangGraph vs CrewAI vs AutoGen vs Agno

> 每个框架都演示同样的示例（研究代理生成报告）并隐藏同样的错误（状态模式与编排层冲突）。选择其抽象与你问题形状匹配的框架；其他的一切都是你重复编写的胶水代码。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 11 · 09（函数调用），阶段 11 · 16（LangGraph）
**时间：** ~45 分钟

## 问题

你有一个需要多次 LLM 调用的任务。可能是一个研究工作流（规划、搜索、总结、引用）。可能是一个代码审查流水线（解析 diff、评审、补丁、验证）。可能是一个多轮对话助手，负责预订航班、撰写电子邮件和提交报销报告。你选择一个框架。

三天后，你发现框架的抽象层有漏洞。CrewAI 给了你角色，但当"研究员"需要将结构化计划交给"写手"时却与你对抗。AutoGen 在代理之间提供了聊天功能，但没有头等状态，所以你的检查点是一个对话日志的 pickle。LangGraph 给了你一个状态图，但迫使你在知道代理将要做什么之前命名每一个转换。Agno 给了你一个单代理抽象，当你试图扇出到三个并发工作者时它会报错。

解决办法不是"选择最好的框架"。而是将框架的核心抽象与你问题的形状匹配。这节课绘制了这张地图。

## 概念

![代理框架矩阵：核心抽象 vs 问题形状](../assets/framework-matrix.svg)

四个框架主导了 2026 年的格局。它们的核心抽象各不相同。

| 框架 | 核心抽象 | 最适合 | 最不适合 |
|-----------|----------|--------|---------|
| **LangGraph** | `StateGraph` — 类型化状态、节点、条件边、检查点器。 | 具有显式状态和人工参与中断的工作流；需要时光回溯调试的生产环境代理。 | 松散的、角色驱动的头脑风暴，其中拓扑未知。 |
| **CrewAI** | `Crew` — 角色（目标、背景故事）、任务、流程（顺序或层级）。 | 具有简短线性/层级计划的角色扮演或角色驱动的工作流。 | 任何超出团队轮次历史的有状态场景；复杂的分支。 |
| **AutoGen** | `ConversableAgent` 对——两个或多个代理轮流说话直到退出条件满足。 | 多代理*对话*（教师-学生、提议者-批评者、行动者-审查者），其中思考从聊天中涌现。 | 具有已知 DAG 的确定性工作流；任何需要在重启后保持持久状态的情况。 |
| **Agno** | `Agent` — 单个 LLM + 工具 + 记忆，可组合成团队。 | 快速构建的单代理和轻量级团队；强大的多模态和内置存储驱动。 | 具有自定义归约器的深度显式分支图。 |

### "抽象"实际含义

框架的核心抽象是你在宣讲架构时在白板上画的东西。

- **LangGraph** → 你画一个图。节点是步骤，边是转换，每个点的状态对象是类型化的。思维模型是状态机。
- **CrewAI** → 你画一个组织结构图。每个角色有一个职位描述，一个管理者路由任务。思维模型是一个小型专家团队。
- **AutoGen** → 你画一个 Slack 私信。两个代理相互发消息；如果需要主持人，第三个加入。思维模型是聊天。
- **Agno** → 你画一个带有挂载工具的单一盒子。盒子并排放置组成团队。思维模型是"电池全包型代理"。

### 状态问题

状态是大多数框架选择在生产环境中崩溃的地方。

- **LangGraph。** 类型化状态（`TypedDict` 或 Pydantic 模型）、每个字段的归约器、头等检查点器（SQLite/Postgres/Redis）。恢复、中断和时光回溯都是免费获得的。*（参见阶段 11 · 16。）*
- **CrewAI。** 状态通过 `context` 字段在任务之间以字符串形式流动，或通过 `output_pydantic` 结构化。没有开箱即用的持久化每团队存储；如果团队必须在重启后存活，你需要自己添加。
- **AutoGen。** 状态是聊天历史和任何用户定义的 `context`。对话记录持久化；任意工作流状态不会持久化，除非你编写适配器。
- **Agno。** 通过 `storage=` 附加到 `Agent` 的内置存储驱动（SQLite、Postgres、Mongo、Redis、DynamoDB）——对话会话和用户记忆自动持久化。不是完整的图检查点器；是会话存储。

### 分支问题

每个非平凡的代理都需要分支。谁决定分支很重要。

- **LangGraph** — 你决定，通过条件边。路由是一个具有命名分支的 Python 函数。分支在编译图中是一级概念；检查点器记录哪个分支被采用。
- **CrewAI** — 管理者在层级模式下决定；在顺序模式下你在构建时决定。路由隐式存在于任务列表中；管理者提示之外没有一级的"if"。
- **AutoGen** — 代理通过聊天决定。分支从谁下一步发言中涌现。`GroupChatManager` 选择下一个发言者；你可以手写一个 `speaker_selection_method`，但默认是由 LLM 驱动的。
- **Agno** — 代理通过下一步调用哪个工具来决定。团队有协调者/路由器/协作者模式；除此之外的分支是开发者的责任。

### 可观测性问题

- **LangGraph** — 通过 LangSmith 或任何 OTel 导出器的 OpenTelemetry。每个节点转换是一个追踪跨度；检查点兼作可重放追踪。LangSmith 是第一方选项；Langfuse/Phoenix 也有适配器。
- **CrewAI** — 自 2025 年底起提供一级 OpenTelemetry 支持；与 Langfuse、Phoenix、Opik、AgentOps 集成。
- **AutoGen** — 通过 `autogen-core` 的 OpenTelemetry 集成；AgentOps 和 Opik 有连接器。追踪粒度是按代理消息而非按节点。
- **Agno** — 内置 `monitoring=True` 标志加 OpenTelemetry 导出器；与 Langfuse 紧密集成用于会话追踪。

### 成本和延迟

四个框架都增加了每次调用的开销（框架逻辑、验证、序列化）。开销递增的大致顺序：Agno ≈ LangGraph < CrewAI ≈ AutoGen。差异主要来自框架做了多少额外的 LLM 路由。CrewAI 的层级管理者花费 token 决定谁下一步发言；AutoGen 的 `GroupChatManager` 也是如此。LangGraph 只在你写 `llm.invoke` 的地方花费 token。Agno 的单代理路径很薄。

当每次运行的成本很重要时，优先选择显式路由（LangGraph 边、AutoGen `speaker_selection_method`）而不是 LLM 选择的路由。

### 互操作性

- **LangGraph** ↔ **LangChain** 工具、检索器、LLM。头等 MCP 适配器（工具作为 MCP 服务器导入）。
- **CrewAI** ↔ 工具继承自 `BaseTool`；LangChain 工具、LlamaIndex 工具和 MCP 工具都可以适配。通过 `allow_delegation=True` 进行团队间委托。
- **AutoGen** → `FunctionTool` 包装任何 Python 可调用对象；MCP 适配器可用。与 AG2 生态系统紧密耦合用于代理间模式。
- **Agno** → `@tool` 装饰器或 BaseTool 子类；MCP 适配器；工具可以在代理和团队之间共享。

## 技能

> 你能用一句话解释为什么某个框架适合某个代理问题。

构建前检查清单：

1. **画出形状。** 这是一个图（类型化状态、命名转换）吗？一个角色扮演（专家移交工作）吗？一个聊天（代理交谈直到完成）吗？一个带工具的单代理吗？
2. **决定谁分支。** 开发者决定分支 → LangGraph。管理者代理决定 → CrewAI 层级模式。聊天涌现 → AutoGen。工具调用决定 → Agno。
3. **检查状态预算。** 你需要从检查点恢复吗？时光回溯？运行中的人工中断？如果是，LangGraph 是默认选择；Agno 会话涵盖会话范围内的状态。
4. **检查成本预算。** LLM 选择的路由每轮消耗额外的 token。如果代理每天运行数千次，优先选择显式路由。
5. **预算框架开销。** 每个框架都是额外的依赖。如果任务只是两次 LLM 调用加一个工具，写 30 行纯 Python；没有框架比没有框架更快。

拒绝在你能画出图、组织结构图、聊天或代理框之前就选择框架。拒绝选择一个强迫你与它的状态模型对抗的框架。

## 决策矩阵

| 问题形状 | 首选框架 | 原因 |
|---------|---------|------|
| 带类型化状态的 DAG 工作流、人工审批、长时间运行 | LangGraph | 头等状态、检查点器、中断、时光回溯。 |
| 具有不同角色的研究/写作流水线 | CrewAI（顺序）或 LangGraph 子图 | 每任务角色在 CrewAI 中表达很廉价；当分支变复杂时升级到 LangGraph。 |
| 提议者-批评者或教师-学生对话 | AutoGen | 双代理聊天是其原生形状。 |
| 带工具、会话、记忆的单代理 | Agno | 最薄的设置，内置存储和记忆。 |
| 带归约器的数千并行扇出 | LangGraph + `Send` | 唯一拥有头等并行分发 API 的框架。 |
| 快速原型，无框架承诺 | 纯 Python + 提供者 SDK | 没有框架是最快的框架。 |

## 练习

1. **简单。** 用 LangGraph（四个节点：计划、搜索、编写、引用）和 CrewAI（三个角色：研究员、写手、编辑）实现同一个任务——"研究 Anthropic 总部，写一篇 200 词的简报，引用来源"。报告每次运行的 token 成本和代码行数。
2. **中等。** 在 AutoGen（研究员 ↔ 写手聊天，编辑通过 `GroupChat` 加入）和 Agno（一个带有 `search_tools` 和 `write_tools` 以及会话存储的单代理）中构建相同的任务。对四个实现进行排名：(a) 每次运行成本，(b) 崩溃后恢复能力，(c) 在写入步骤前注入人工审批的能力。
3. **困难。** 构建一个决策树脚本 `pick_framework.py`，接受一个简短的问题描述（JSON: `{has_typed_state, has_roles, has_dialogue, has_parallel_fanout, needs_resume}`）并返回一个带一句话理由的建议。在你自行设计的六个案例上验证它。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 编排（Orchestration） | "代理如何协调" | 决定哪个节点/角色/代理下一步运行的层。 |
| 持久状态（Durable state） | "重启后恢复" | 在进程死亡后存活的状态，附加到检查点或会话存储。 |
| LLM 选择路由 | "让模型决定" | 规划 LLM 每轮选择下一步；灵活但每次决策消耗 token。 |
| 显式路由 | "开发者决定" | Python 函数或静态边选择下一步；廉价且可审计。 |
| Crew | "CrewAI 团队" | 角色 + 任务 + 流程（顺序或层级）绑定为一个可运行对象。 |
| GroupChat | "AutoGen 的多代理聊天" | N 个代理之间的受管理对话，带有一个发言者选择器。 |
| 团队（Agno） | "多代理 Agno" | 在一组代理上的路由/协调/协作模式。 |
| StateGraph | "LangGraph 的图" | 类型化状态、节点、条件边、检查点器抽象。 |

## 延伸阅读

- [LangGraph 文档](https://langchain-ai.github.io/langgraph/) — StateGraph、检查点器、中断、时光回溯。
- [CrewAI 文档](https://docs.crewai.com/) — Crews、Flows、Agents、Tasks、Processes。
- [AutoGen 文档](https://microsoft.github.io/autogen/) — ConversableAgent、GroupChat、teams、tools。
- [Agno 文档](https://docs.agno.com/) — Agent、Team、Workflow、storage、memory。
- [Anthropic — 构建高效代理（2024 年 12 月）](https://www.anthropic.com/research/building-effective-agents) — 模式库（提示链、路由、并行化、编排者-工作者、评估器-优化器），与框架无关。
- [Yao 等人，"ReAct: Synergizing Reasoning and Acting" (ICLR 2023)](https://arxiv.org/abs/2210.03629) — 每个框架都在包装的循环。
- [Wu 等人，"AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation" (2023)](https://arxiv.org/abs/2308.08155) — AutoGen 的设计论文。
- [Park 等人，"Generative Agents: Interactive Simulacra of Human Behavior" (UIST 2023)](https://arxiv.org/abs/2304.03442) — CrewAI 风格角色堆栈所构建的角色扮演基础。
- 阶段 11 · 16（LangGraph）— 本课程用来做基准测试的框架。
- 阶段 11 · 19（Reflexion）— 一个能干净映射到 LangGraph 但映射到 CrewAI 时很别扭的模式。
- 阶段 11 · 22（生产可观测性）— 如何对你选择的任何一个框架进行仪表化。
