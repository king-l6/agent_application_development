---
name: state-graph
description: 构建一个 LangGraph 风格的状态机，具有类型化状态、条件边、逐节点检查点和持久化恢复功能。
version: 1.0.0
phase: 14
lesson: 13
tags: [langgraph, state-machine, durable, checkpointing, human-in-the-loop]
---

给定目标运行时、状态形状、一组节点函数和一个检查点后端，生成一个有状态智能体图。

产出：

1. 一个类型化的 `State`（字典或 Pydantic）。记录每个字段。节点读取状态；它们返回更新。
2. 一个带有 `add_node`、`add_edge`、`add_conditional_edges`、`set_entry` 及 `START`/`END` 哨兵的 `StateGraph`。
3. 一个带有 `save(session_id, node, state)` 和 `load_latest(session_id)` 方法的 `Checkpointer` 接口。默认为 SQLite；支持 Postgres/Redis/自定义。
4. 一个 `Runner`，遍历图，在每个节点后序列化状态，捕获用于人工介入的 `PausedAtNode` 异常，并支持带可选 `state_override` 的 `resume_from`。
5. 三个拓扑辅助：监督者（中央路由）、群集（共享工具交接）、层次化（子图）。

硬性拒绝：

- 非确定性节点未显式捕获随机种子或时钟时间。恢复假设给定输入状态，节点输出是可重现的。
- 仅保存"摘要"状态的检查点。序列化完整状态，否则恢复将失败。
- 每条边都是条件边的图。优先使用带偶有分支的线性链。

拒绝规则：

- 如果用户要求无持久化的状态图，拒绝。核心价值在于持久化恢复；如果不需要恢复，请使用第12课的工作流模式。
- 如果用户要求"仅在成功时检查点"，拒绝。失败也需要状态——那是调试的起点。
- 如果图有超过约30个节点，拒绝平面布局并要求使用嵌套子图。平面30节点图无法审查。

输出：`state.py`、`graph.py`、`checkpointer.py`、`runner.py`、`README.md`，解释状态模式、检查点选择和恢复语义。以"下一步阅读"结尾，指向第14课（参与者模型替代方案）、第16课（交接/护栏层）或第23课（图步上的 OTel 跨度）。
