# 交接与例程——无状态编排

> OpenAI 的 Swarm（2024 年 10 月）将多智能体编排简化为两个原语：**例程**（作为系统提示的指令 + 工具）和**交接**（一个返回另一个 Agent 的工具）。没有状态机，没有分支 DSL——LLM 通过调用正确的交接工具进行路由。OpenAI Agents SDK（2025 年 3 月）是其生产级继任者。Swarm 本身仍然是最清晰的概念参考——它的全部源代码只有几百行。这种模式之所以流行，是因为它的 API 表面大致就是"agent = prompt + tools; handoff = function returning agent"。限制：无状态，因此记忆是调用方的问题。

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置知识：** 第 16 阶段 · 04（基础模型）
**时间：** 约 60 分钟

## 问题

每个多智能体框架都希望你学习它的 DSL：LangGraph 的节点和边、CrewAI 的 Crew 和 Task、AutoGen 的 GroupChat 和 Manager。这些 DSL 是真正的抽象，但它们让事情看起来比实际需要的更重。

Swarm 朝相反的方向推进：使用模型已有的工具调用能力。交接变成了工具调用。协调者是当前持有对话的智能体。状态机隐含在智能体的系统提示中。

## 概念

### 两个原语

**例程（Routine）。** 定义智能体角色和可用工具的系统提示。可以将其视为一组有范围限制的指令："你是一个分诊智能体；如果用户询问退款，则交接给退款智能体。"

**交接（Handoff）。** 智能体可以调用的一个工具，它返回一个新的 Agent 对象。Swarm 运行时检测到 Agent 返回值，并在下一轮切换活动智能体。

这就是全部的抽象。

```
def transfer_to_refunds():
    return refund_agent  # Swarm 看到 Agent 返回 → 切换活动智能体

triage_agent = Agent(
    name="triage",
    instructions="将用户路由到正确的专家。",
    functions=[transfer_to_refunds, transfer_to_sales, transfer_to_support],
)
```

分诊智能体的系统提示使其根据用户消息选择正确的交接方式。LLM 的工具调用完成路由。

### 为什么它会流行

- **小的 API。** 只需学习两个概念。
- **使用模型已有的能力。** 工具调用在各个提供商中已经是生产级功能。
- **没有状态机负担。** 你不需要描述图；智能体的提示描述了它们交接给谁。

### 无状态的权衡

Swarm 在运行之间明确是无状态的。框架在运行期间保留消息历史，但不持久化任何内容。记忆、连续性、长时间运行的任务——都是调用方的问题。

在生产环境中（OpenAI Agents SDK，2025 年 3 月），这是主要变化之一：SDK 增加了内置的会话管理、安全防护和跟踪，同时保留了交接原语。

### Swarm/交接适合的场景

- **分诊模式。** 一线智能体将用户路由到专家。
- **基于技能的交接。** "如果任务需要代码，调用程序员；如果需要研究，调用研究员。"
- **短且有边界的对话。** 客户支持、FAQ 转工单、简单工作流。

### Swarm 不适用的场景

- **需要共享记忆的长时间会话。** 交接将对话状态重置为新智能体的提示加上历史记录。没有调用方管理的记忆，跨智能体就没有持久状态。
- **并行执行。** 交接是逐个进行的——活动智能体切换。并行性需要调用方编排多个 Swarm 运行。
- **审计和重放。** 无状态运行难以精确重放；LLM 的交接选择不是确定性的。

### OpenAI Agents SDK（2025 年 3 月）

生产级继任者增加了：

- **会话状态。** 跨运行的持久化线程。
- **安全防护。** 输入/输出验证钩子。
- **跟踪。** 每次工具调用和交接都记录日志。
- **交接过滤器。** 控制交接时传递的上下文。

交接原语得以保留；围绕它增加了生产环境的人体工程学。

### Swarm 与 GroupChat 的对比

两者都使用 LLM 驱动的路由，但它们在**谁选择下一个**上有所不同：

- GroupChat：一个选择器（函数或 LLM）从外部选择下一个发言者。
- Swarm：当前智能体通过调用交接工具选择其继任者。

Swarm 是"智能体决定下一步"；GroupChat 是"管理者决定下一步"。Swarm 的决策存在于活动智能体的工具调用中；GroupChat 的决策存在于 `GroupChatManager` 中。

## 构建它

`code/main.py` 从头实现了 Swarm：一个 Agent 数据类、一个交接机制（工具返回 Agent）以及一个检测智能体切换的运行循环。

演示：一个分诊智能体路由到退款、销售或支持专家。每个专家有其自己的工具。运行循环打印每次交接。

运行：

```
python3 code/main.py
```

## 使用它

`outputs/skill-handoff-designer.md` 为给定任务设计交接拓扑：存在哪些智能体、它们可以调用哪些交接、传递什么上下文。

## 交付清单

- **交接日志记录。** 每次交接写入一个跟踪事件，包含来源智能体、目标智能体、上下文快照。
- **上下文传递规则。** 决定交接时移动什么：完整历史（昂贵）、最近 N 条消息或摘要。
- **交接安全防护。** 交接给具有不同工具权限的专家必须经过身份验证——否则提示注入可能强制进行不必要的交接。
- **循环检测。** 两个智能体来回交接是常见失败；使用简单的最后 K 环检测。
- **后备智能体。** 如果交接目标不存在，回退到安全默认值。

## 练习

1. 运行 `code/main.py`，分诊到退款智能体。确认第二轮的活动智能体是退款智能体。
2. 添加一个循环检测规则：如果相同的两个智能体连续交接 3 次，强制退出。设计后备方案。
3. 阅读 OpenAI Agents SDK 关于交接过滤器的文档。实现一个"交接时摘要"版本：传出智能体在传入智能体接管之前将上下文压缩为要点摘要。
4. 比较 Swarm 交接与 GroupChatManager 选择器。哪种模式使提示注入更严重，为什么？
5. 阅读 Swarm 食谱（https://developers.openai.com/cookbook/examples/orchestrating_agents）。指出 Swarm 做出的一个明确设计决策是 OpenAI Agents SDK 改变或保留的。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------|---------|
| 例程 (Routine) | "智能体提示" | 系统提示 + 工具列表。定义角色和可用的交接。 |
| 交接 (Handoff) | "转移到另一个智能体" | 活动智能体可以调用的工具，返回一个新的 Agent。运行时切换活动智能体。 |
| 无状态 (Stateless) | "运行之间无记忆" | Swarm 不持久化任何内容；记忆是调用方的责任。 |
| 活动智能体 (Active agent) | "谁在发言" | 当前持有对话的智能体。交接会改变它。 |
| 上下文传递 (Context transfer) | "交接时传递什么" | 传入智能体看到的历史的策略：全部、最近 N 条或摘要。 |
| 交接循环 (Handoff loop) | "智能体乒乓" | 两个智能体不断来回交接的失败模式。 |
| OpenAI Agents SDK | "生产级 Swarm" | 2025 年 3 月继任者；在交接原语之上增加了会话、安全防护、跟踪。 |
| 交接过滤器 (Handoff filter) | "传递时的门控" | SDK 功能，用于在交接边界检查和修改上下文。 |

## 延伸阅读

- [OpenAI cookbook — Orchestrating Agents: Routines and Handoffs](https://developers.openai.com/cookbook/examples/orchestrating_agents) —— 参考阐述
- [OpenAI Swarm repo](https://github.com/openai/swarm) —— 原始实现，作为概念参考保留
- [OpenAI Agents SDK docs](https://openai.github.io/openai-agents-python/) —— 带会话和跟踪的生产级继任者
- [Anthropic handoff-in-Claude notes](https://docs.anthropic.com/en/docs/claude-code) —— Claude Code 子智能体如何通过 `Task` 使用类似交接的模式
