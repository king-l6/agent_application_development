# Reflexion：语言强化学习

> 基于梯度的强化学习需要数千次试验和一个 GPU 集群来修复一个失败模式。Reflexion（Shinn et al.，NeurIPS 2023）用自然语言实现：每次失败的试验后，agent 写一段反思，将其存储在情景记忆中，并将下一次试验的条件建立在那个记忆之上。这是 Letta 的睡眠时间计算、Claude Code 的 CLAUDE.md 学习和 pro-workflow 的 learn-rule 背后的模式。

**类型：** 构建
**语言：** Python（标准库）
**前置知识：** 阶段 14 · 01（Agent 循环），阶段 14 · 02（ReWOO）
**时间：** ~60 分钟

## 学习目标

- 说出 Reflexion 的三个组件（Actor、Evaluator、Self-Reflector）以及情景记忆的作用。
- 用标准库实现一个 Reflexion 循环，包含二元评估器、反思缓冲区和全新的重试。
- 根据给定任务选择标量、启发式和自评估反馈源。
- 解释为什么语言强化能捕捉到基于梯度的强化学习需要数千次试验才能修复的错误。

## 问题

Agent 未能完成一个任务。在标准强化学习中，你要再运行数千次试验，计算梯度，更新权重。这代价高昂、速度缓慢，而且大多数生产 agent 不会为每次失败都准备训练预算。

Reflexion（Shinn et al.，arXiv:2303.11366）提出了一个不同的问题：如果 agent 只是思考一下为什么失败，然后将那个想法放在提示中再试一次呢？没有权重更新。没有梯度。只是在试验之间存储自然语言。

结果：在 ALFWorld 上击败了 ReAct 和其他未经微调的基线。在 HotpotQA 上相比 ReAct 有提升。在代码生成（HumanEval/MBPP）上创造了当时的最高水准。全部过程没有一个梯度步骤。

## 概念

### 三个组件

```
Actor         : 生成轨迹（ReAct 风格循环）
Evaluator     : 评分轨迹 —— 二元、启发式或自评估
Self-Reflector: 对失败编写自然语言反思
```

加上一个数据结构：

```
Episodic memory: 先前反思的列表，预置到下一次试验的提示中
```

一次试验运行 Actor。Evaluator 评分。如果分数低，Self-Reflector 产生一段反思（"我选错了工具，因为我误以为问题问的是 X，而实际上问的是 Y"）。反思进入情景记忆。下一次试验从头开始，但能看到反思。

### 三种评估器类型

1. **标量** —— 外部二元信号。ALFWorld 成功或失败。HumanEval 测试通过或不通过。最简单，信号最强。
2. **启发式** —— 预定义的失败特征。"如果 agent 连续两次产生相同的动作，标记为卡住。""如果轨迹超过 50 步，标记为低效。"
3. **自评估** —— LLM 对自己的轨迹评分。在没有真实答案时使用。信号较弱；与基于工具的验证搭配使用效果更好（第 05 课 —— CRITIC）。

2026 年的默认做法是混合使用：有标量时用标量，没有时用自评估，启发式作为安全护栏。

### 为什么这具有通用性

Reflexion 与其说是一个新算法，不如说是一个被命名的模式。几乎每个生产中的"自愈"agent 都运行某种变体：

- Letta 的睡眠时间计算（第 08 课）：一个独立的 agent 反思过去的对话并写入记忆块。
- Claude Code 的 `CLAUDE.md` / "保存记忆"模式：将反思作为学习捕获，预置到未来的会话中。
- pro-workflow 的 `/learn-rule` 命令：将修正捕获为显式规则。
- LangGraph 的反思节点：一个节点对输出评分并根据需要路由到改进。

所有这些都源于同一个洞见：自然语言是一种足够丰富的媒介，可以在运行之间携带"我从失败中学到了什么"。

### 何时有效，何时无效

Reflexion 在以下情况有效：

- 有明确的失败信号（测试失败、工具错误、错误答案）。
- 任务类别是可重现的（同一类型的问题可以再次提出）。
- 反思有足够的空间来改进轨迹（足够的行动预算）。

Reflexion 在以下情况无效：

- agent 第一次尝试就成功了。
- 失败是外部的（网络断开、工具故障）—— 反思"网络断了"对未来运行没有帮助。
- 反思变成了迷信 —— 存储关于一次偶然的不稳定运行的说法。

2026 年的陷阱：记忆腐烂。反思不断累积；有些已过期或错误；随着情景缓冲区增长，重新运行变得更慢。缓解措施：定期压缩（第 06 课）、反思的 TTL、或一个独立的睡眠时间清理 agent（Letta）。

```figure
react-trace
```

## 构建

`code/main.py` 在一个玩具谜题上实现 Reflexion：生成一个三个元素的列表，使其总和等于目标值。Actor 发出候选列表；Evaluator 检查总和；Self-Reflector 写一行关于哪里出错了。反思进入情景记忆，供下一次试验使用。

组件：

- `Actor` —— 一个脚本化的策略，在看到反思时会改进。
- `Evaluator.binary()` —— 目标总和的通过/失败判断。
- `SelfReflector` —— 生成一行诊断失败原因。
- `EpisodicMemory` —— 具有 TTL 语义的有界列表。

运行：

```
python3 code/main.py
```

轨迹显示三次试验。试验 1 失败，存储一段反思，试验 2 看到反思并有所改进但仍然失败，试验 3 成功。与基线运行（无反思）进行比较 —— 它会一直卡在试验 1 的答案上。

## 使用

LangGraph 将反思作为一个节点模式提供。Claude Code 的 `/memory` 命令和 pro-workflow 的 `/learn-rule` 将情景缓冲区外部化为 markdown 文件。Letta 的睡眠时间计算在空闲时间运行 Self-Reflector，使主 agent 保持低延迟。OpenAI Agents SDK 没有直接提供 Reflexion；你需要用自定义 Guardrail（按分数拒绝轨迹）和在运行间持久化的 `Session` 记忆来构建它。

## 交付

`outputs/skill-reflexion-buffer.md` 创建并维护一个带有反射捕获、TTL 和去重功能的情景缓冲区。给定一个任务类别和一次失败，它发出一个实际上能帮助下一次试验的反思（而不是泛泛的"更仔细一些"）。

## 练习

1. 从二元评估器切换到返回距离度量的标量评估器（离目标有多远）。收敛速度会更快吗？
2. 为反思添加 10 次试验的 TTL。在那之后，较旧的反思是有害还是有益？
3. 实现启发式评估器：如果相同的动作重复出现，将试验标记为卡住。这会如何与 Self-Reflector 互动？
4. 用一个对抗性 Actor 运行 Reflexion，该 Actor 忽略反思。迫使 Actor 注意到它们的最低反思提示工程要求是什么？
5. 阅读 Reflexion 论文中关于 AlfWorld 的第 4 节。概念上重现 130% 的成功率提升：与普通 ReAct 的关键差异是什么？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| Reflexion | "自我纠正" | Shinn et al. 2023 —— Actor、Evaluator、Self-Reflector 加情景记忆 |
| 语言强化 | "无梯度学习" | 预置到下一次试验提示中的自然语言反思 |
| 情景记忆 | "每任务反思" | 一个任务类别的先前反思的有界缓冲区 |
| 标量评估器 | "二元成功信号" | 从真实答案中获得的通过/失败或数值分数 |
| 启发式评估器 | "基于模式的检测器" | 预定义的失败特征（如卡住循环、步骤过多） |
| 自评估器 | "LLM 对自身轨迹做评判" | 无真实答案时信号较弱的后备方案 —— 与基于工具的验证搭配使用 |
| 记忆腐烂 | "过时的反思" | 情景缓冲区充满过期条目；通过压缩/TTL 修复 |
| 睡眠时间反思 | "异步自我反思" | 在非热点路径上运行 Self-Reflector，使主 agent 保持快速 |

## 延伸阅读

- [Shinn et al., Reflexion: Language Agents with Verbal Reinforcement Learning (arXiv:2303.11366)](https://arxiv.org/abs/2303.11366) —— 经典论文
- [Letta, Sleep-time Compute](https://www.letta.com/blog/sleep-time-compute) —— 生产环境中的异步反思
- [Anthropic, Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— 将情景缓冲区作为上下文的一部分进行管理
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview) —— 反思节点模式
