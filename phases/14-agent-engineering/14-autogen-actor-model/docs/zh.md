# AutoGen v0.4：参与者模型与智能体框架

> AutoGen v0.4（微软研究院，2025年1月）围绕参与者模型重新设计了智能体编排。异步消息交换、事件驱动智能体、故障隔离、原生并发。该框架目前处于维护模式，而微软智能体框架（2025年10月公测）将成为继任者。

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置条件：** 第14阶段·01（智能体循环），第14阶段·12（工作流模式）
**时长：** ~75分钟

## 学习目标

- 描述参与者模型：智能体即参与者，消息是唯一的进程间通信方式，每个参与者故障隔离。
- 列出 AutoGen v0.4 的三个 API 层——Core、AgentChat、Extensions——以及各自的用途。
- 解释为什么解耦消息投递和处理带来故障隔离和原生并发。
- 用 Python 标准库实现一个参与者运行时，并将一个双智能体代码审查流程移植到其上运行。

## 问题

大多数智能体框架是同步的：一个智能体生产，一个智能体消费，在调用栈中。故障会崩溃整个栈。并发是附加的。分布式需要重写。

AutoGen v0.4 的答案：参与者模型。每个智能体是一个带有私有收件箱的参与者。消息是唯一的交互方式。运行时解耦投递和处理。故障隔离在单一参与者内。并发是原生的。分布式只是不同的传输方式。

## 概念

### 参与者

一个参与者具有：

- 私有状态（外部无法直接触及）。
- 收件箱（消息队列）。
- 处理器：`receive(message) -> effects`，其中 effects 可以是"回复"、"发送给其他参与者"、"生成新参与者"、"更新状态"、"停止自身"。

两个参与者不能共享内存。它们只能发送消息。

### AutoGen v0.4 的三个 API 层

1. **Core。** 底层参与者框架。`AgentRuntime`、`Agent`、`Message`、`Topic`。异步消息交换，事件驱动。
2. **AgentChat。** 任务驱动的高级 API（替代 v0.2 的 ConversableAgent）。`AssistantAgent`、`UserProxyAgent`、`RoundRobinGroupChat`、`SelectorGroupChat`。
3. **Extensions。** 集成——OpenAI、Anthropic、Azure、工具、记忆。

### 为什么解耦很重要

在 v0.2 模型中，调用 `agent_a.chat(agent_b)` 会同步阻塞 agent_a 直到 agent_b 返回。在 v0.4 中，`send(agent_b, msg)` 将消息放入 agent_b 的收件箱并返回。运行时稍后投递。三个结果：

- **故障隔离。** Agent B 崩溃不会导致 Agent A 崩溃——运行时在 B 的处理器中捕获故障并决定如何处理（记录、重试、死信）。
- **原生并发。** 同时多消息在传输中；参与者并发处理各自的收件箱。
- **分布式就绪。** 收件箱 + 传输无论在进程内还是另一台主机上都是相同的抽象。

### 拓扑

- **RoundRobinGroupChat。** 智能体按固定轮换顺序轮流发言。
- **SelectorGroupChat。** 一个选择器智能体基于对话上下文选择下一个发言者。
- **Magentic-One。** 用于网页浏览、代码执行、文件处理的参考多智能体团队。基于 AgentChat 构建。

### 可观测性

内置 OpenTelemetry 支持。每条消息发出一个跨度；工具调用根据2026年 OTel GenAI 语义约定（第23课）携带 `gen_ai.*` 属性。

### 状态：维护模式

2026年初：AutoGen v0.7.x 对研究和原型设计是稳定的。微软已将活跃开发转移到微软智能体框架（2025年10月1日公测；1.0 GA 目标为2026年第一季度末）。AutoGen 模式向前移植干净——参与者模型是持久的设计理念。

## 构建

`code/main.py` 实现了一个标准库参与者运行时：

- `Message` — 带有 `sender`、`recipient`、`topic`、`body` 的类型化载荷。
- `Actor` — 带有 `receive(message, runtime)` 的抽象基类。
- `Runtime` — 具有共享队列、投递、故障隔离的事件循环。
- 双参与者演示：`ReviewerAgent` 审查代码，`ChecklistAgent` 运行检查清单；它们交换消息直至达成共识。

运行：

```
python3 code/main.py
```

跟踪显示消息投递、一个参与者中模拟的故障不会导致另一个参与者崩溃，以及收敛到共享结论。

## 使用

- **AutoGen v0.4/v0.7**（维护模式）— 对研究、原型设计、多智能体模式稳定。
- **微软智能体框架**（公测）— 前进路径；在更新的 API 中采用相同的参与者模型理念。
- **LangGraph 群集拓扑**（第13课）— 通过共享工具交接的类似模式。
- **自定义参与者运行时**— 当您需要特定传输（NATS、RabbitMQ、gRPC）时。

## 交付

`outputs/skill-actor-runtime.md` 生成一个最小参与者运行时以及针对给定多智能体任务的团队模板（RoundRobin 或 Selector）。

## 练习

1. 添加死信队列：当处理器抛出异常时，将失败的消息暂存供人工检查。在你的玩具示例中死信队列被命中的频率如何？
2. 实现 `SelectorGroupChat`：选择器参与者基于对话状态选择处理下一条消息的参与者。
3. 添加分布式传输：将进程内队列替换为基于 JSON-over-HTTP 的服务器，使参与者可以在独立进程中运行。
4. 为每条消息接入 OTel 跨度（或空操作替代）。根据第23课发出 `gen_ai.agent.name`、`gen_ai.operation.name`。
5. 阅读 AutoGen v0.4 的架构文章。将你的玩具示例移植到真实的 `autogen_core` API。在生产中你跳过了哪些重要内容？

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| 参与者（Actor） | "智能体" | 私有状态 + 收件箱 + 处理器；无共享内存 |
| 消息（Message） | "事件" | 类型化载荷；参与者交互的唯一方式 |
| 收件箱（Inbox） | "邮箱" | 每个参与者的待处理消息队列 |
| 运行时（Runtime） | "智能体主机" | 路由消息并隔离故障的事件循环 |
| 主题（Topic） | "频道" | 参与者之间的命名发布-订阅路由 |
| 故障隔离（Fault isolation） | "让它崩溃" | 一个参与者失败不会导致其他参与者崩溃 |
| RoundRobinGroupChat | "固定轮换团队" | 智能体按顺序轮流发言 |
| SelectorGroupChat | "上下文路由团队" | 选择器选择下一个发言者 |
| Magentic-One | "参考团队" | 用于网页 + 代码 + 文件的多智能体小组 |

## 延伸阅读

- [AutoGen v0.4，微软研究院](https://www.microsoft.com/en-us/research/articles/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/) — 重新设计文章
- [LangGraph 概述](https://docs.langchain.com/oss/python/langgraph/overview) — 图形式替代方案
- [OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — AutoGen 默认发出的跨度
