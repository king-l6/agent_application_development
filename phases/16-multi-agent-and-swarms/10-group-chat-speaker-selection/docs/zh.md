# 群聊与说话者选择

> AutoGen GroupChat 和 AG2 GroupChat 在 N 个智能体之间共享一个对话；一个选择器函数（LLM、轮询或自定义）选择下一个发言者。这是涌现式多智能体对话的原型——智能体不知道自己在静态图中的角色，它们只是对共享池做出反应。AutoGen v0.2 的 GroupChat 语义在 AG2 分支中得到保留；AutoGen v0.4 将其重写为事件驱动的参与者模型。微软于 2026 年 2 月将 AutoGen 置于维护模式，并将其与 Semantic Kernel 合并为 Microsoft Agent Framework（2026 年 2 月 RC）。GroupChat 原语在 AG2 和 Microsoft Agent Framework 中都得以保留——学一次，到处用。

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置知识：** 第 16 阶段 · 04（基础模型）
**时间：** 约 60 分钟

## 问题

静态图（LangGraph）在工作流已知的情况下表现出色。但真实的对话不是静态的：有时程序员问评审者，有时问研究员，有时问写作者。硬编码每一种可能的交接方式会导致边的爆炸。你希望*智能体对共享池做出反应*，由某个函数决定谁接下来发言。

这正是 AutoGen GroupChat 所做的。

## 概念

### 结构

```
              ┌─── 共享池 ────┐
              │   m1  m2  m3 ... │
              └─────────┬────────┘
                        │ （每个人读取所有）
      ┌───────┬─────────┼─────────┬───────┐
      ▼       ▼         ▼         ▼       ▼
    智能体A  智能体B  智能体C  智能体D  选择器
                                           │
                                           ▼
                                  "下一个说话者 = C"
```

每个智能体看到每一条消息。每一轮调用一个选择器函数来选择下一个发言者。

### 三种选择器风格

**轮询（Round-robin）。** 固定循环。确定性。随 N 线性扩展，但忽略上下文——即使话题是法律审查，程序员也会获得发言机会。

**LLM 选择（LLM-selected）。** 调用一个 LLM 读取最近的池并返回最佳的下一个发言者。有上下文感知但慢：每一轮增加一次 LLM 调用。AutoGen 的默认方式。

**自定义（Custom）。** 一个 Python 函数，包含你想要的任何逻辑。典型做法：LLM 选择加后备规则（例如，"程序员之后永远给予验证者发言机会"）。

### ConversableAgent API

```
agent = ConversableAgent(
    name="coder",
    system_message="You write Python.",
    llm_config={...},
)
chat = GroupChat(agents=[coder, reviewer, tester], messages=[])
manager = GroupChatManager(groupchat=chat, llm_config={...})
```

`GroupChatManager` 持有选择器。当智能体完成一轮时，管理器调用选择器，选择器返回下一个智能体。循环继续直到终止条件。

### 终止

三种常见模式：

- **最大轮次。** 总轮数的硬上限。
- **"TERMINATE"令牌。** 智能体可以发出一个哨兵消息；管理器在出现该消息时停止。
- **目标达成检查。** 一个轻量级验证者每轮运行，并在完成后停止聊天。

### AutoGen 到 AG2 的分裂和 Microsoft Agent Framework 的合并

2025 年初，微软开始围绕事件驱动的参与者模型对 AutoGen（v0.4）进行重大重写。社区将 AutoGen v0.2 的 GroupChat 语义分支为 AG2，保留了早期采用者已经集成的 API。

2026 年 2 月，微软宣布 AutoGen 将进入维护模式，事件驱动的参与者模型将合并到 **Microsoft Agent Framework**（2026 年 2 月 RC，现已与 Semantic Kernel 合并）。GroupChat 概念在两条路径上都得以保留；实现细节有所不同。对于兼容 v0.2 的代码，AG2 是推荐的上游。

### GroupChat 适合的场景

- **涌现式对话。** 你不想预先连接每一种可能的下一发言者。
- **角色混合任务。** 程序员问研究员，研究员问档案管理员，档案管理员再问程序员。流程不是有向无环图。
- **探索性问题解决。** 想象"头脑风暴会议"，而不是"流水线"。

### 不适用的场景

- **严格确定性。** LLM 选择器可能不一致。相同的提示，不同的运行，不同的下一发言者。
- **谄媚级联。** 智能体顺从发言最自信的人。需要明确地反提示。
- **上下文膨胀。** 每个智能体读取每条消息；10 轮后上下文变得巨大。使用投影（第 15 课）来限定视野。
- **热门发言者。** 一个智能体主导对话，因为选择器偏爱其专长。引入发言者平衡作为选择器的一个特性。

### 群聊与监督者

相同的原语，不同的默认值：

- 监督者：一个智能体规划，其他执行。选择器是"问规划者要做什么。"
- 群聊：所有智能体是对等的；选择器是一个在共享池上运行的函数。

两者都使用第 04 课的四个原语。群聊默认使用 LLM 选择的编排和全池共享状态。

## 构建它

`code/main.py` 使用标准库从头实现了一个 GroupChat。三个智能体（程序员、评审者、管理者），轮询和 LLM 选择两种变体，以及在 `TERMINATE` 令牌上的终止。

演示打印对话记录以及两种变体的选择器决策轨迹。

运行：

```
python3 code/main.py
```

## 使用它

`outputs/skill-groupchat-selector.md` 为给定任务配置一个 GroupChat 选择器——轮询 vs LLM 选择 vs 自定义，以及要使用的选择器输入（最近消息、智能体专长、发言次数）。

## 交付清单

- **最大轮次上限。** 始终设置。典型任务 10-20 轮。
- **发言者平衡指标。** 跟踪每个智能体的轮次；当不均衡超过阈值时发出警报。
- **终止令牌。** `TERMINATE` 或一个专门的验证者智能体。
- **投影或限定范围的内存。** 大约 10 条消息后，考虑只给每个智能体一个有范围的视图以防止上下文膨胀。
- **选择器日志记录。** 对于 LLM 选择的变体，记录选择器的输入和选择。否则无法调试。

## 练习

1. 运行 `code/main.py`。比较轮询和 LLM 选择下的对话。每种方式下哪个智能体占主导？
2. 在选择器中添加一个"每个智能体最多发言次数"规则。它如何影响对话记录？
3. 实现一个目标达成终止：评审者返回"已批准"时停止。在达到轮次上限之前它触发多少次？
4. 阅读 AutoGen 稳定版文档中关于 GroupChat 的内容（https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/group-chat.html）。找出 `GroupChatManager` 使用的默认选择器。
5. 阅读 AG2 仓库（https://github.com/ag2ai/ag2）并比较其 v0.2 GroupChat 与 v0.4 事件驱动版本。v0.4 增加了哪些具体属性（吞吐量、容错性、可组合性）？

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------|---------|
| GroupChat | "一个聊天室里的智能体" | 共享消息池 + 选择器函数。AutoGen / AG2 原语。 |
| 说话者选择 (Speaker selection) | "谁接下来发言" | 选择下一个智能体的函数。轮询、LLM 选择或自定义。 |
| GroupChatManager | "会议主持人" | AutoGen 组件，拥有选择器并在轮次中循环。 |
| ConversableAgent | "基础智能体" | AutoGen 基类；可以发送和接收消息的智能体。 |
| 终止令牌 (Termination token) | "停止词" | 结束聊天的哨兵字符串（通常是 `TERMINATE`）。 |
| 热门发言者 (Hot speaker) | "一个智能体主导" | 选择器不断选择同一个智能体的失败模式。 |
| 上下文膨胀 (Context bloat) | "池无界增长" | 每个智能体读取所有先前的消息；上下文随轮次增长。 |
| 投影 (Projection) | "限定范围的视图" | 防止上下文膨胀的、针对角色的共享池视图。 |

## 延伸阅读

- [AutoGen group chat docs](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/group-chat.html) —— 参考实现
- [AG2 repo](https://github.com/ag2ai/ag2) —— 社区 AutoGen v0.2 延续
- [Microsoft Agent Framework docs](https://microsoft.github.io/agent-framework/) —— 合并后的继任者，2026 年 2 月 RC
- [AutoGen v0.4 release notes](https://microsoft.github.io/autogen/stable/) —— 事件驱动参与者模型重写细节
