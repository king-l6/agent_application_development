# Self-Refine 与 CRITIC：迭代输出改进

> Self-Refine（Madaan et al.，2023）用一个 LLM 扮演三个角色 —— 生成、反馈、改进 —— 构成一个循环。在 7 个任务上平均绝对提升 +20。CRITIC（Gou et al.，2023）通过将验证路由到外部工具来强化反馈步骤。2026 年，这个模式在每个框架中都以"评估器-优化器"（Anthropic）或护栏循环（OpenAI Agents SDK）的形式提供。

**类型：** 构建
**语言：** Python（标准库）
**前置知识：** 阶段 14 · 01（Agent 循环），阶段 14 · 03（Reflexion）
**时间：** ~60 分钟

## 学习目标

- 说出 Self-Refine 的三个提示（生成、反馈、改进）并解释为什么历史对改进提示很重要。
- 解释 CRITIC 的关键洞见：LLM 在没有外部基础的情况下自我验证是不可靠的。
- 用标准库实现一个带有历史和可选外部验证器的 Self-Refine 循环。
- 将此模式映射到 Anthropic 的"评估器-优化器"工作流和 OpenAI Agents SDK 的输出护栏。

## 问题

Agent 产生了一个几乎正确的答案。也许一行代码有语法错误。也许摘要太长。也许规划遗漏了一个边界情况。你想要的是：agent 批评自己的输出，然后修复它。

Self-Refine 表明这可以用单一模型实现，无需训练数据，无需强化学习。但有一个问题：LLM 在硬事实上的自我验证能力很差。CRITIC 指出了修复方法 —— 通过外部工具（搜索、代码解释器、计算器、测试运行器）路由验证步骤。

这两篇论文共同定义了 2026 年迭代改进的默认做法：生成、验证（尽可能外部化）、改进、验证通过时停止。

## 概念

### Self-Refine（Madaan et al.，NeurIPS 2023）

一个 LLM，三个角色：

```
generate(task)            -> output_0
feedback(task, output_0)  -> critique_0
refine(task, output_0, critique_0, history) -> output_1
feedback(task, output_1)  -> critique_1
refine(task, output_1, critique_1, history) -> output_2
...
stop when feedback says "no issues" or budget exhausted.
```

关键细节：`refine` 看到完整历史 —— 所有先前的输出和批评 —— 所以不会重复错误。论文对此进行了消融实验：去掉历史后质量急剧下降。

亮点：在 7 个任务（数学、代码、缩写、对话等）上平均绝对提升 +20，包括 GPT-4。无需训练，无需外部工具，单一模型。

### CRITIC（Gou et al.，arXiv:2305.11738，v4 2024 年 2 月）

Self-Refine 的弱点：反馈步骤是 LLM 对自己的评分。对于事实性声明，这是不可靠的（幻觉往往对产生它的模型来说看起来很有说服力）。CRITIC 将 `feedback(task, output)` 替换为 `verify(task, output, tools)`，其中 `tools` 包括：

- 用于事实性声明的搜索引擎。
- 用于代码正确性的代码解释器。
- 用于算术的计算器。
- 领域特定的验证器（单元测试、类型检查器、linter）。

验证器产生一个基于工具结果的结构化批评。改进器然后以这个批评为条件。

亮点：CRITIC 在事实性任务上优于 Self-Refine，因为批评是有基础的。在没有外部验证器的任务上（创意写作、格式化），CRITIC 退化为 Self-Refine。

### 停止条件

两种常见形式：

1. **验证器通过。** 外部测试返回成功。在有条件时优先选择（单元测试、类型检查器、护栏断言）。
2. **没有反馈发出。** 模型说"输出没问题。" 更便宜但不可靠；配合最大迭代上限使用。

2026 年默认做法：组合使用。"如果验证器通过，或者模型说没问题且迭代次数 >= 2，或者迭代次数 >= max_iterations，则停止。"

### 评估器-优化器（Anthropic，2024）

Anthropic 2024 年 12 月的博文将此命名为五种工作流模式之一。两个角色：

- 评估器：对输出评分并产生批评。
- 优化器：根据批评修改输出。

循环直到评估器通过。这是 Anthropic 框架下的 Self-Refine/CRITIC。Anthropic 增加的关键工程细节：评估器和优化器的提示应该显著不同，这样模型不会只是走过场。

### OpenAI Agents SDK 输出护栏

OpenAI Agents SDK 将此模式作为"输出护栏"提供。护栏是一个验证器，在 agent 的最终输出上运行。如果护栏触发（抛出 `OutputGuardrailTripwireTriggered`），输出被拒绝，agent 可以重试。护栏可以调用工具（CRITIC 风格）或作为纯函数（Self-Refine 风格）。

### 2026 年的陷阱

- **走过场循环。** 同一模型用相似的提示风格既做生成又做批评，会收敛于"看起来没问题"。使用结构不同的提示，或者用一个更小更便宜的模型做批评。
- **过度改进。** 每次改进都增加延迟和令牌消耗。预算 1–3 次改进；之后，升级到人工审查。
- **在琐碎任务上使用 CRITIC。** 如果没有外部验证器，CRITIC 退化到 Self-Refine；不要为存根验证器支付延迟代价。

## 构建

`code/main.py` 在一个玩具任务上实现 Self-Refine 和 CRITIC：根据一个主题生成一个简短的项目符号列表。验证器检查格式（3 个项目符号，每个不超过 60 个字符）。CRITIC 添加了一个外部"事实验证器"，对已知的幻觉进行惩罚。

组件：

- `generate` —— 脚本化的生产者。
- `feedback` —— LLM 风格的自我批评。
- `verify_external` —— CRITIC 风格的基于外部工具的验证器。
- `refine` —— 根据历史重写输出。
- 停止条件 —— 验证器通过或最多 4 次迭代。

运行：

```
python3 code/main.py
```

比较 Self-Refine 和 CRITIC 的运行。CRITIC 捕获了 Self-Refine 遗漏的一个事实错误，因为外部验证器具有自我批评所没有的坚实基础。

## 使用

Anthropic 的评估器-优化器是此模式的 Claude 友好语言版本。OpenAI Agents SDK 的输出护栏是 CRITIC 形态的（护栏可以调用工具）。LangGraph 提供了一个类似 Self-Refine 的反思节点。Google 的 Gemini 2.5 Computer Use 增加了每步安全评估器，这是 CRITIC 的一个变体：每个动作在执行前都经过验证。

## 交付

`outputs/skill-refine-loop.md` 根据任务形态、验证器可用性和迭代预算配置一个评估器-优化器循环。输出生成器、评估器/验证器和优化器的提示，以及停止策略。

## 练习

1. 用 max_iterations=1 运行玩具。CRITIC 还有帮助吗？
2. 将外部验证器替换为有噪声的验证器（随机 30% 假阳性）。循环会做什么？这就是 2026 年大多数护栏栈的现实情况。
3. 实现"生成器和批评器使用不同模型"的变体：大模型生成，小模型批评。它能超过同模型方案吗？
4. 阅读 CRITIC 第 3 节（arXiv:2305.11738 v4）。说出三种验证工具类别并为每种举一个例子。
5. 将 OpenAI Agents SDK 的 `output_guardrails` 映射到 CRITIC 的验证器角色。SDK 做对了什么，做错了什么？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| Self-Refine | "自我修复的 LLM" | 在一个模型中生成 -> 反馈 -> 改进循环，带历史记录 |
| CRITIC | "基于工具的验证" | 用外部验证器（搜索、代码、计算、测试）替换反馈 |
| 评估器-优化器 | "Anthropic 工作流模式" | 两个角色 —— 评估器评分，优化器修改 —— 循环直到收敛 |
| 输出护栏 | "事后检查" | OpenAI Agents SDK 验证器，在 agent 产生输出后运行 |
| 验证步骤 | "批评阶段" | 关键决策：基于外部工具还是自我评分 |
| 改进历史 | "模型已经尝试过的" | 预置到改进提示中的先前输出 + 批评；去掉则质量崩溃 |
| 走过场循环 | "自我认同失败" | 相同提示的批评返回"看起来不错"；用结构不同的提示修复 |
| 停止条件 | "收敛测试" | 验证器通过 或 无反馈且达到迭代上限；永远不要单条件 |

## 延伸阅读

- [Madaan et al., Self-Refine (arXiv:2303.17651)](https://arxiv.org/abs/2303.17651) —— 经典论文
- [Gou et al., CRITIC (arXiv:2305.11738)](https://arxiv.org/abs/2305.11738) —— 基于工具的验证
- [Anthropic, Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) —— 评估器-优化器工作流模式
- [OpenAI Agents SDK docs](https://openai.github.io/openai-agents-python/) —— 作为 CRITIC 形态验证器的输出护栏
