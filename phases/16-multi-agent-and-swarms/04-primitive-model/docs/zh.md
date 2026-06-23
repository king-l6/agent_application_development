# 多智能体原语模型

> 2026年发布的每一个多智能体框架——AutoGen、LangGraph、CrewAI、OpenAI Agents SDK、Microsoft Agent Framework——都是一个四维设计空间中的一个点。四个原语，仅此而已：智能体（agent）、交接（handoff）、共享状态（shared state）、编排器（orchestrator）。本课程从零开始构建它们，在所有四个原语上运行一个玩具系统，然后将每个主要框架映射到相同的坐标轴上，这样你就能用一段话理解任何新发布。

**类型：** 学习
**语言：** Python（标准库）
**前置条件：** 第14阶段（智能体工程），第16阶段 · 01（为什么需要多智能体）
**时间：** ~60分钟

## 问题

每六个月就有一个新的多智能体框架发布。2023年的AutoGen。2024年的CrewAI。2024年的LangGraph和OpenAI Swarm。2025年4月的Google ADK。2026年2月的Microsoft Agent Framework RC。每一篇新闻稿都声称是"正确的抽象"。

如果你试图逐个学习它们，你会筋疲力尽。API看起来不同。文档对"智能体"的定义不一致。一个框架称其共享内存为"黑板"，另一个称之为"消息池"，第三个称之为"StateGraph"。你开始怀疑这个领域只是在原地打转。

并非如此。在市场营销之下，这四个原语是稳定的。一次学会，用一段话理解每一个新框架。

## 概念

### 四个原语

1. **智能体（Agent）** — 一个系统提示词加上一个工具列表。无状态；每次运行都从其系统提示词和当前消息历史开始。
2. **交接（Handoff）** — 控制权从一个智能体到另一个智能体的结构化转移。从机制上讲，是一个返回新智能体的工具调用，或一个跟随条件的图边。
3. **共享状态（Shared state）** — 任何可以被多个智能体读取（有时写入）的数据结构。消息池、黑板、键值存储、向量记忆。
4. **编排器（Orchestrator）** — 决定谁下一个发言的人。选项：显式图（确定性的）、LLM发言者选择器（软性的）、最后一个发言者的交接调用（OpenAI Swarm）、或队列上的调度器（群架构）。

这就是整个设计空间。每个框架为每个轴选择默认值；其余的是表面语法。

### 每个2026框架如何映射

| 框架 | 智能体 | 交接 | 共享状态 | 编排器 |
|-----------|-------|---------|--------------|--------------|
| OpenAI Swarm / Agents SDK | `Agent(instructions, tools)` | 工具返回 Agent | 调用者的问题 | LLM的下一个交接调用 |
| AutoGen v0.4 / AG2 | `ConversableAgent` | GroupChat上的发言者选择器 | 消息池 | 选择器函数（LLM或轮询） |
| CrewAI | `Agent(role, goal, backstory)` | `Process.Sequential / Hierarchical` | Task输出链式传递 | 管理者LLM或静态顺序 |
| LangGraph | 节点函数 | 图边 + 条件 | `StateGraph` 归约器 | 图，确定性的 |
| Microsoft Agent Framework | 智能体 + 编排模式 | 模式特定 | 线程 / 上下文 | 模式特定 |
| Google ADK | 智能体 + A2A卡 | A2A任务 | A2A产物 | 主机决定 |

表面差异看起来很大。底层：相同的四个旋钮。

### 为什么这很重要

一旦你看到了原语，框架比较就变成了一个简短的检查清单：

- 编排器是信任LLM路由（Swarm）还是在代码中固定路由（LangGraph）？
- 共享状态是完整历史（GroupChat）还是投影视图（StateGraph归约器）？
- 智能体能修改彼此的提示词（CrewAI管理者）还是只能交接（Swarm）？

这三个问题回答了80%哪个框架适合给定问题。你不再寻找"最好的多智能体框架"，而是开始为你真正关心的轴进行设计。

### 无状态的洞见

除了共享状态之外，每个原语都是无状态的。智能体是（提示词、工具）的函数。交接是一个函数调用。编排器是一个调度器。**系统中唯一有状态的东西就是共享状态。** 这就是所有有趣bug的栖息地：记忆中毒（第15课）、消息排序、版本控制、写入争用。

隐藏共享状态的框架（Swarm）将问题推给了调用者。将共享状态集中化的框架（LangGraph检查点、AutoGen池）使其可检查，但将协调成本转移到了共享状态实现上。

### 单个原语的解剖

#### 智能体

```
Agent = (system_prompt, tools, model, optional_name)
```

没有记忆。没有状态。具有相同系统提示词和工具的两个智能体是可互换的。所有看起来像智能体状态的东西实际上都在共享状态或交接协议中。

#### 交接

```
Handoff = (from_agent, to_agent, reason, payload)
```

三种实现占主导地位：

- **函数返回** — 工具返回下一个智能体。这是 OpenAI Swarm 模式。智能体在其工具模式中携带路由信息。
- **图边** — LangGraph。边是声明式的。LLM产生一个值；条件选择下一个节点。
- **发言者选择** — AutoGen GroupChat。一个选择器函数（有时本身就是一个LLM调用）读取池并选择下一个发言者。

#### 共享状态

```
SharedState = { messages: [], artifacts: {}, context: {} }
```

至少，一个消息列表。通常更多：结构化产物（CrewAI Task输出）、类型化上下文（LangGraph归约器）、外部记忆（MCP、向量数据库）。

两种拓扑：**完整池**（每个智能体看到每条消息）和**投影视图**（智能体看到按角色限定的视图）。完整池简单但扩展性差。投影池可扩展但需要事先的schema设计。

#### 编排器

```
Orchestrator = ({state, last_speaker}) -> next_agent
```

四种风格：

- **静态** — 图在构建时固定（LangGraph确定性、CrewAI Sequential）。
- **LLM选择** — LLM读取池并选择下一个发言者（AutoGen、CrewAI Hierarchical）。
- **交接驱动** — 当前智能体通过调用交接工具来决定（Swarm）。
- **队列驱动** — 工作者从共享队列中拉取；没有显式的下一个发言者（群架构、Matrix）。

### 框架之间的变化

一旦原语固定，剩下的设计决策是：

- **记忆策略** — 临时 vs 持久化检查点（LangGraph checkpointer）。
- **安全边界** — 谁可以批准交接（人机协同）。
- **成本核算** — 每个智能体的 token 预算。
- **可观测性** — 跟踪交接、持久化状态以便回放。

都可以在原语之上实现。没有一个是新的原语。

## 动手构建

`code/main.py` 在大约150行标准库 Python 中实现了四个原语。没有真正的 LLM——每个智能体都是一个脚本化策略，以便焦点保持在协调结构上。

该文件导出：

- `Agent` — 一个包含名称、系统提示词、工具、策略函数的数据类。
- `Handoff` — 一个返回新智能体的函数。
- `SharedState` — 一个线程安全的消息池。
- `Orchestrator` — 三种变体：`StaticOrchestrator`、`HandoffOrchestrator`、`LLMSelectorOrchestrator`（模拟的）。

演示在相同的三智能体流水线（研究 → 编写 → 审查）上通过所有三种编排器类型运行，并在最后打印消息池。你可以看到输出仅在*谁选择下一个*上有所不同；智能体和共享状态在运行间是相同的。

运行：

```
python3 code/main.py
```

预期输出：三种编排器运行，每种模式一次。每个打印最终的消息池。交接驱动的运行如果研究员认为早期就完成了，则到达的智能体更少——这是LLM路由权衡的缩影。

## 使用它

`outputs/skill-primitive-mapper.md` 是一个技能，它读取任何多智能体代码库或框架文档，并返回四个原语的映射。在新的框架发布时运行它，可以在深入阅读文档之前得到一段话的理解。

## 投入生产

在采用新框架之前，为其编写原语映射。如果你做不到，说明文档不完整，或者该框架正在发明第五个原语（很少见——检查是否有你未见过的共享状态风格）。

将映射固定在你的架构文档中。当新团队成员加入时，先发送映射再发送API文档。当框架版本变化时，比较映射，而不是变更日志。

## 练习

1. 用不同的智能体策略运行 `code/main.py` 三次。观察编排器选择如何改变哪些智能体运行。
2. 实现第四种编排器类型：队列驱动的编排器，智能体轮询共享状态以获取工作。可能会发生什么死锁，你如何检测它？
3. 阅读 LangGraph 快速入门（https://docs.langchain.com/oss/python/langgraph/workflows-agents）并将其重写为四个原语。LangGraph 的哪些抽象一一对应，哪些是便利包装？
4. 阅读 OpenAI Swarm cookbook（https://developers.openai.com/cookbook/examples/orchestrating_agents）。识别 Swarm 使哪四个原语最符合人体工程学，哪个原语被推给了调用者。
5. 在此表中找到一个完全隐藏共享状态的框架。解释当智能体需要在交接之间协调而不重新读取历史时，什么会出问题。

## 关键术语

| 术语 | 人们所说的 | 实际含义 |
|------|-----------|---------|
| 智能体（Agent） | "带有工具的LLM" | 一个 `(system_prompt, tools, model)` 三元组。无状态。 |
| 交接（Handoff） | "控制权转移" | 一个命名下一个智能体和可选有效负载的结构化调用。三种实现：函数返回、图边、发言者选择。 |
| 共享状态（Shared state） | "记忆" / "上下文" | 多智能体系统中唯一有状态的部分。消息池或黑板。 |
| 编排器（Orchestrator） | "协调器" | 决定谁下一个运行的角色。静态图、LLM选择器、交接驱动或队列驱动。 |
| 原语（Primitive） | "抽象" | 每个框架参数化的四个轴之一。不是框架特性。 |
| 消息池（Message pool） | "共享聊天历史" | 完整历史的共享状态。易于推理，扩展性差。 |
| 投影状态（Projected state） | "限定视图" | 共享状态中按角色特定的视图。可扩展，需要schema设计。 |
| 发言者选择（Speaker selection） | "谁下一个发言" | 编排器模式，其中一个函数（通常是LLM）从组中选择下一个智能体。 |

## 扩展阅读

- [OpenAI cookbook: Orchestrating Agents — Routines and Handoffs](https://developers.openai.com/cookbook/examples/orchestrating_agents) — 交接驱动编排的最清晰阐述
- [AutoGen stable docs](https://microsoft.github.io/autogen/stable/) — GroupChat + 发言者选择是LLM选择编排的参考
- [LangGraph workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents) — 图边编排和基于归约器的共享状态
- [CrewAI introduction](https://docs.crewai.com/en/introduction) — 角色-目标-背景故事智能体，顺序/层次流程
- [AG2 (community AutoGen continuation)](https://github.com/ag2ai/ag2) — 微软将 v0.4 移至维护后活跃的 AutoGen v0.2 分支
