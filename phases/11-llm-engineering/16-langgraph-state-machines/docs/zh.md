# LangGraph —— 代理的状态机

> 手写的 ReAct 循环是一个 `while True`。用 LangGraph 编写的 ReAct 循环是一个你可以检查点、中断、分支和时光回溯的图。代理本身没有改变。围绕它的框架变了。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 11 · 09（函数调用），阶段 11 · 14（模型上下文协议）
**时间：** ~75 分钟

## 问题

你发布了一个函数调用代理。它在三轮对话中正常工作，然后出了问题：模型尝试了一个返回 500 错误的工具，用户中途改变了主意，或者代理决定退款订单而没有人工签字。`while True:` 循环没有钩子。你无法暂停它，无法回退它，也无法分支到"如果模型选了另一个工具会怎样"。一旦你将这个代理交付到演示之外，它就成了一个要么工作要么不工作的黑盒。

下一步一旦你看到就显而易见了。代理本质上已经是一个状态机——系统提示加上消息历史加上待处理的工具调用加上下一个动作。将状态机显式化：节点代表"模型思考"、"工具运行"、"人工批准"，边代表它们之间的条件转换。一旦图表显式化，框架就能免费获得四样东西：检查点（在步骤之间保存状态）、中断（暂停等待人工）、流式（流式传输 token 和中间事件）和时光回溯（回退到之前的状态并尝试不同的分支）。

LangGraph 就是提供这种抽象的库。它不是 LangChain 意义上的代理框架（"这是一个 AgentExecutor，祝你好运"）。它是一个带有头等状态、头等持久化和头等中断的图运行时。代理循环是你绘制的，而不是你手写的。

## 概念

![LangGraph StateGraph：节点、边和检查点器](../assets/langgraph-stategraph.svg)

一个 `StateGraph` 有三样东西。

1. **状态（State）。** 一个类型化的字典（TypedDict 或 Pydantic 模型），流经整个图。每个节点接收完整状态并返回部分更新，LangGraph 使用每个字段的*归约器（reducer）* 来合并这些更新——对于应该累积的列表使用 `operator.add`，默认是覆盖。
2. **节点（Nodes）。** Python 函数 `state -> partial_state`。每个都是一个离散步骤："调用模型"、"运行工具"、"总结"。
3. **边（Edges）。** 节点之间的转换。静态边通向一个地方。条件边接受一个路由函数 `state -> next_node_name`，以便图可以根据模型输出进行分支。

你编译这个图。编译绑定了拓扑结构，附加一个检查点器（可选但对生产环境至关重要），并返回一个可运行对象。你用初始状态和一个 `thread_id` 来调用它。执行的每一步都会持久化一个以 `(thread_id, checkpoint_id)` 为键的检查点。

### 四大超能力

**检查点（Checkpointing）。** 每次节点转换都将新状态写入存储（测试用内存，生产用 Postgres/Redis/SQLite）。用相同的 `thread_id` 再次调用图即可恢复。图从中断处继续执行。

**中断（Interrupts）。** 用 `interrupt_before=["human_review"]` 标记一个节点，执行会在该节点运行前停止。状态被持久化。你的 API 向用户响应"等待批准"。稍后使用 `Command(resume=...)` 对同一 `thread_id` 的请求恢复执行。

**流式（Streaming）。** `graph.stream(state, mode="updates")` 实时产生状态增量。`mode="messages"` 流式传输模型节点内的 LLM token。`mode="values"` 产生完整快照。你选择在你的 UI 中展示哪些内容。

**时光回溯（Time-travel）。** `graph.get_state_history(thread_id)` 返回完整的检查点日志。将任何先前的 `checkpoint_id` 传递给 `graph.invoke`，你就能从那个点分叉。对于调试（"如果模型当时选择了工具 B 会怎样？"）和重放生产轨迹的回归测试非常有用。

### 归约器是关键

每个状态字段都有一个归约器。大多数默认值没问题——新值覆盖旧值。但消息列表需要 `operator.add`，以便新消息追加而不是替换。并行边通过归约器合并它们的更新。如果两个节点都更新了 `messages` 而你忘记了 `Annotated[list, add_messages]`，第二个会静默地获胜，你会丢失半轮对话。归约器是这个库中唯一微妙的地方；把它搞对了，其他一切就都组合起来了。

### 四个节点的 ReAct 图

一个生产级 ReAct 代理是四个节点和两条边：

1. `agent` — 用当前消息历史调用 LLM。返回助理消息（可能包含 tool_calls）。
2. `tools` — 执行最后一条助理消息中的任何 tool_calls，将工具结果作为工具消息追加。
3. 从 `agent` 出发的条件边：如果最后一条消息有 tool_calls，则路由到 `tools`，否则路由到 `END`。
4. 从 `tools` 返回 `agent` 的静态边。

仅此而已。你获得了完整的 ReAct 循环（思考 -> 行动 -> 观察 -> 思考 -> ...），带有检查点、中断和流式，大约 40 行代码。

### StateGraph vs Send（扇出）

`Send(node_name, state)` 让一个节点分派并行子图。示例：代理决定同时查询三个检索器。每个 `Send` 启动目标节点的一个并行执行；它们的输出通过状态归约器合并。这就是 LangGraph 无需线程原语实现编排者-工作者模式的方式。

### 子图

一个编译后的图可以是另一个图中的一个节点。外部图看到一个单一节点；内部图有自己的状态和自己的检查点。这就是团队构建监督者-工作者代理的方式：监督者图将用户意图路由到每个领域的工作者子图。

## 构建它

### 步骤 1：状态和节点

```python
from typing import Annotated, TypedDict
from langchain_core.messages import AnyMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def agent_node(state: State) -> dict:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def should_continue(state: State) -> str:
    last = state["messages"][-1]
    return "tools" if getattr(last, "tool_calls", None) else END

tool_node = ToolNode(tools=[search_web, read_file])

graph = StateGraph(State)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")

app = graph.compile(checkpointer=MemorySaver())
```

`add_messages` 是使消息列表累积而不是覆盖的归约器。忘记它是 LangGraph 最常见的错误。

### 步骤 2：带线程运行

```python
config = {"configurable": {"thread_id": "user-42"}}
for event in app.stream(
    {"messages": [HumanMessage("查找 Anthropic 总部地址")]},
    config,
    stream_mode="updates",
):
    print(event)
```

每次更新都是一个字典 `{node_name: state_delta}`。你的前端可以将这些流式传输到 UI，以便用户看到"代理正在思考… 正在调用 search_web… 获取结果… 正在回答。"

### 步骤 3：添加人工参与的中断

标记一个节点，使执行在其运行前暂停。

```python
app = graph.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["tools"],  # 在每次工具调用前暂停
)

state = app.invoke({"messages": [HumanMessage("删除生产数据库")]}, config)
# state["__interrupt__"] 已设置。检查提议的工具调用。
# 如果批准：
from langgraph.types import Command
app.invoke(Command(resume=True), config)
# 如果拒绝：写入一条拒绝消息并恢复
app.update_state(config, {"messages": [AIMessage("已被人工审查员阻止。")]})
```

状态、检查点和线程在中断期间都持久存在。除了执行期间，没有任何东西在内存中。

### 步骤 4：用于调试的时光回溯

```python
history = list(app.get_state_history(config))
for snapshot in history:
    print(snapshot.values["messages"][-1].content[:80], snapshot.config)

# 从先前的检查点分叉
target = history[3].config  # 回溯三步
for event in app.stream(None, target, stream_mode="values"):
    pass  # 从那个点向前重放
```

传递 `None` 作为输入会从给定的检查点重放；传递一个值会在恢复之前将其作为更新追加到该检查点的状态。这就是你在不重新运行整个对话的情况下复现一次糟糕代理运行的方法。

### 步骤 5：将检查点器切换为生产级

```python
from langgraph.checkpoint.postgres import PostgresSaver

with PostgresSaver.from_conn_string("postgresql://...") as checkpointer:
    checkpointer.setup()
    app = graph.compile(checkpointer=checkpointer)
```

SQLite、Redis 和 Postgres 均已内置。`MemorySaver` 用于测试。任何需要在重启后持久化的东西都需要一个真正的存储。

## 技能

> 你将代理构建为图，而不是 `while True` 循环。

在接触 LangGraph 之前，花 60 秒设计：

1. **命名节点。** 每个离散决策或副作用动作都是一个节点。"代理思考"、"工具运行"、"审查员批准"、"响应流式传输"。如果你无法列出它们，任务还不是代理形状。
2. **声明状态。** 最简的 TypedDict，每个列表字段都有一个归约器。不要把所有东西都塞进 `messages`；将任务特定字段（工作中的 `plan`、`budget` 计数器、`retrieved_docs` 列表）提升到顶层。
3. **绘制边。** 除非下一步依赖于模型输出，否则使用静态边。每个条件边需要一个带有命名分支的路由函数。
4. **预先选择检查点器。** 测试用 `MemorySaver`，其他情况用 Postgres/Redis/SQLite。不要在无检查点器的情况下交付——没有检查点器意味着没有恢复、没有中断、没有时光回溯。
5. **在工具运行前决定中断，而不是之后。** 批准放在进入副作用节点的边上，以便你可以在造成伤害前取消；验证放在模型输出的边上，以便你可以廉价地拒绝错误调用。
6. **默认流式。** UI 用 `mode="updates"`，模型节点内的 token 级流式用 `mode="messages"`，评估期间完整快照用 `mode="values"`。

拒绝交付没有检查点器的 LangGraph 代理。拒绝交付在副作用*之后*中断的代理。拒绝交付没有 `add_messages` 作为其归约器的 `messages` 字段。

## 练习

1. **简单。** 用计算器工具和网络搜索工具实现上面的四节点 ReAct 图。验证对于两轮对话，`list(app.get_state_history(config))` 返回至少四个检查点。
2. **中等。** 添加一个在 `agent` 之前运行的 `planner` 节点，将一个结构化的 `plan: list[str]` 写入状态。让 `agent` 标记计划步骤为已完成。如果 `plan` 在检查点恢复后丢失（错误的归约器），则测试失败。
3. **困难。** 构建一个监督者图，使用 `Send` 在三个子图（`researcher`、`writer`、`reviewer`）之间路由。每个子图有自己的状态和检查点器。在外部图上添加 `interrupt_before=["writer"]`，以便人工可以批准研究简报。确认从先前检查点的时光回溯只重新运行分叉的分支。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| StateGraph | "LangGraph 的图" | 编译前添加节点和边的构建器对象。 |
| 归约器（Reducer） | "字段如何合并" | 当节点返回该字段的更新时应用的函数 `(old, new) -> merged`；默认是覆盖，`add_messages` 是追加。 |
| 线程（Thread） | "对话 ID" | 一个 `thread_id` 字符串，限定一个会话的所有检查点。 |
| 检查点（Checkpoint） | "暂停的状态" | 节点转换后图完整状态的持久化快照，以 `(thread_id, checkpoint_id)` 为键。 |
| 中断（Interrupt） | "等待人工" | `interrupt_before` / `interrupt_after` 在节点边界停止执行；用 `Command(resume=...)` 恢复。 |
| 时光回溯（Time-travel） | "从先前的步骤分叉" | `graph.invoke(None, config_with_old_checkpoint_id)` 从那个检查点向前重放。 |
| Send | "并行子图分发" | 节点可以返回的构造函数，用于启动对目标节点的 N 次并行执行。 |
| 子图（Subgraph） | "作为节点的编译图" | 在另一个图中用作节点的已编译 StateGraph；保留自己的状态范围。 |

## 延伸阅读

- [LangGraph 文档](https://langchain-ai.github.io/langgraph/) — StateGraph、归约器、检查点器和中断的权威参考。
- [LangGraph 概念：状态、归约器、检查点器](https://langchain-ai.github.io/langgraph/concepts/low_level/) — 本课程使用的思维模型，直接来自源头。
- [LangGraph 持久化和检查点](https://langchain-ai.github.io/langgraph/concepts/persistence/) — Postgres/SQLite/Redis 存储、检查点命名空间和线程 ID 的详细信息。
- [LangGraph 人工参与](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/) — `interrupt_before`、`interrupt_after`、`Command(resume=...)` 和编辑状态模式。
- [Yao 等人，"ReAct: Synergizing Reasoning and Acting in Language Models" (ICLR 2023)](https://arxiv.org/abs/2210.03629) — 每个 LangGraph 代理实现的模式；阅读它以了解推理轨迹的原理。
- [Anthropic — 构建高效代理（2024 年 12 月）](https://www.anthropic.com/research/building-effective-agents) — 首选的图形状（链、路由器、编排者-工作者、评估器-优化器）及其适用时机。
- 阶段 11 · 09（函数调用）— 每个 LangGraph 代理节点重用的工具调用原语。
- 阶段 11 · 14（模型上下文协议）— 通过 MCP 适配器插入 LangGraph `ToolNode` 的外部工具发现。
- 阶段 11 · 17（代理框架权衡）— 何时选择 LangGraph 而非 CrewAI、AutoGen 或 Agno。
