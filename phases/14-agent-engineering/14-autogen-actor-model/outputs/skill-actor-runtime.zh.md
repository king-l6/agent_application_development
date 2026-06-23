---
name: actor-runtime
description: 构建一个 AutoGen v0.4 风格的参与者运行时，具有私有状态、每参与者收件箱、仅消息 IPC、故障隔离和死信队列。
version: 1.0.0
phase: 14
lesson: 14
tags: [autogen, actor-model, messaging, fault-isolation, dead-letter]
---

给定一个多智能体任务，生成一个参与者运行时及所需的智能体参与者。

产出：

1. 一个带有 `sender`、`recipient`、`topic`、`body`、`mid` 的 `Message` 类型。
2. 一个带有 `receive(message, runtime)` 方法的 `Actor` 基类。参与者状态是私有的。
3. 一个具有共享队列、`send()`、`run_until_idle()` 和死信队列的 `Runtime`。处理器中的异常进入死信队列；不传播。
4. 一个拓扑辅助：RoundRobin（固定轮换）、Selector（LLM 选择下一个）或自定义广播。
5. 每条消息的可观测性钩子：根据第23课发出带有 `gen_ai.agent.name` 和 `gen_ai.operation.name` 的 OTel 跨度。

硬性拒绝：

- 阻塞发送方直到接收方返回的同步消息传递。那是 v0.2 模型；它破坏了故障隔离。
- 参与者间共享可变状态。参与者通过消息读取状态，或者根本不读取。
- 传播处理器异常的运行时。故障属于死信队列；让其他参与者继续运行。

拒绝规则：

- 如果任务只有两个参与者且进行固定往返，拒绝参与者框架并建议使用提示链（第12课）。参与者只有在有 >=3 个参与者或异步并发时才值得使用。
- 如果用户想要"同步模式"以便"更容易调试"，拒绝。建议使用日志记录 + 追踪（第23课）代替。
- 如果领域严格是带有单一专业者的请求/响应，建议使用路由（第12课）而不是参与者团队。

输出：`message.py`、`actor.py`、`runtime.py`、`teams.py`、`README.md`，解释死信队列策略、拓扑选择以及如何接入 OTel 跨度。以"下一步阅读"结尾，如果参与者进行协商则指向第25课（多智能体辩论），如果需要追踪则指向第23课（OTel），或者如果想要前瞻性运行时则指向微软智能体框架。
