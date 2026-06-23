# 技能库与终身学习（Voyager）

> Voyager（Wang 等人，TMLR 2024）将可执行代码视为技能。技能是命名的、可检索的、可组合的，并通过环境反馈进行改进。这是 Claude Agent SDK 技能、skillkit 以及 2026 年技能库模式的参考架构。

**类型：** 构建
**语言：** Python（标准库）
**前置知识：** 阶段 14 · 07（MemGPT），阶段 14 · 08（Letta 块）
**时间：** 约 75 分钟

## 学习目标

- 说出 Voyager 的三个组件——自动课程、技能库、迭代提示——及每个组件的作用。
- 解释为什么 Voyager 将动作空间设为代码，而非原始命令。
- 使用标准库实现一个技能库，包含注册、检索、组合和失败驱动的改进功能。
- 将 Voyager 的模式映射到 2026 年的 Claude Agent SDK 技能和 skillkit 生态系统。

## 问题

在每个会话中从头重建所有能力的 Agent 会在三个方面出错：

1. **浪费 token。** 每项任务都会重新引发相同的推理过程。
2. **丢失进度。** 在会话 A 中学会的修正不会转移到会话 B。
3. **长周期组合失败。** 复杂任务需要能力层次结构；一次性提示词无法表达它们。

Voyager 的答案是：将每个可复用的能力视为一个命名的代码块，存储在库中，通过相似性检索，可与其他技能组合，并通过执行反馈进行改进。

## 概念

### 三个组件

Voyager（arXiv:2305.16291）围绕以下三个部分构建 Agent：

1. **自动课程。** 一个好奇心驱动的提议者根据 Agent 当前的技能集和环境状态选择下一个任务。探索是自底向上的。
2. **技能库。** 每个技能都是可执行代码。任务成功时添加新技能。通过查询与描述之间的相似性检索技能。
3. **迭代提示机制。** 失败时，Agent 接收执行错误、环境反馈和自我验证输出，然后改进技能。

Minecraft 评估结果（Wang 等人，2024）：与基线相比，独特物品数量 3.3 倍，石制工具速度 8.5 倍，铁制工具速度 6.4 倍，地图遍历距离 2.3 倍。这些数字是 Minecraft 特定的，但模式是可迁移的。

### 动作空间 = 代码

大多数 Agent 发出原始命令。Voyager 发出 JavaScript 函数。一个技能是：

```
async function craftIronPickaxe(bot) {
  await mineIron(bot, 3);
  await mineStick(bot, 2);
  await placeCraftingTable(bot);
  await craft(bot, 'iron_pickaxe');
}
```

由子技能组合而成。以描述和嵌入向量为键进行存储。作为程序而非提示词被检索。

这就是 2026 年的 Claude Agent SDK 技能：一个命名的、可检索的代码块加上指令，Agent 按需加载。

### 技能检索

新任务"制作钻石镐"。Agent：

1. 对任务描述进行嵌入。
2. 查询技能库获取 top-k 相似技能。
3. 检索 `craftIronPickaxe`、`mineDiamond`、`placeCraftingTable` 等。
4. 从检索到的原语和新逻辑组合新技能。

这就是 MCP 资源（阶段 13）和 Agent SDK 技能实现的模式：在知识/代码表面上的检索，限定于当前任务范围。

### 迭代改进

Voyager 的反馈循环：

1. Agent 编写一个技能。
2. 技能在环境中运行。
3. 三个信号之一返回：`success`、`error`（含堆栈跟踪）、`self-verification failure`。
4. Agent 使用信号作为上下文重写技能。
5. 循环直到成功或达到最大轮次。

这是将 Self-Refine（第 05 课）应用于代码生成，并带有环境验证的版本。CRITIC（第 05 课）是使用外部工具作为验证器的相同模式。

### 课程与探索

Voyager 的课程模块根据 Agent 已经拥有什么以及还没有做过什么来提议任务，比如"在湖边建一个庇护所"。提议者使用环境状态和技能库存来选择一个略高于当前能力的任务——探索的最佳点。

对于生产 Agent，这转化为一个"缺少什么"的运算符：给定当前的技能库和一个领域，哪些技能还没有覆盖？团队通常手动实现这一功能作为课程审查。

### 这种模式的陷阱

- **技能库腐烂。** 同一技能以略微不同的描述添加了 10 次。在写入时添加去重；检索只返回一个。
- **组合技能漂移。** 父技能依赖于一个已被改进的子技能。对技能进行版本控制；固定到 v1 的父技能不会神奇地获得 v3。
- **检索质量。** 技能描述上的向量检索随着库增长到几百个以上时会退化。用标签过滤器和硬约束（"仅限于 `category=tooling` 的技能"）作为补充。

## 动手构建

`code/main.py` 实现了一个标准库技能库：

- `Skill` — name、description、code（字符串形式）、version、tags、dependencies。
- `SkillLibrary` — register（注册）、search（搜索，使用 token 重叠）、compose（组合，基于依赖关系的拓扑排序）和 refine（改进，更新时版本号增加）。
- 一个脚本化 Agent，注册三个原始技能，组合第四个，遇到失败并进行改进。

运行方式：

```
python3 code/main.py
```

跟踪输出显示库写入、检索、组合、一次失败的执行和一次 v2 改进——Voyager 的完整循环。

## 使用场景

- **Claude Agent SDK 技能**（Anthropic）——2026 年的参考实现：每个技能有描述、代码和指令；在 Agent 会话期间按需加载。
- **skillkit**（npm: skillkit）——跨 Agent 技能管理，支持 32 种以上 AI 编码 Agent。
- **自定义技能库**——领域特定的（数据 Agent 的 SQL 技能、基础设施 Agent 的 Terraform 技能）。Voyager 模式可以向下扩展。
- **OpenAI Agents SDK `tools`**——在低端场景中；每个工具是一个轻量级技能。

## 交付产物

`outputs/skill-skill-library.zh.md` 生成一个 Voyager 风格的技能库，包含注册、检索、版本控制和改进功能，适用于任何目标运行时。

## 练习

1. 为 `compose()` 添加一个依赖循环检测器。当技能 A 依赖 B，B 又依赖 A 时会发生什么？抛出错误还是给出警告？
2. 实现每个技能的版本固定。当父技能组合子技能 `crafting@1` 时，对 `crafting@2` 的改进不能静默地升级父技能。
3. 用 sentence-transformers 嵌入（或 BM25 标准库实现）替换 token 重叠检索。在 50 个技能的小型玩具库上测量 retrieval@5。
4. 添加一个"课程"Agent：给定当前库和领域描述，提出 5 个缺失的技能。每周运行一次。
5. 阅读 Anthropic 的 Claude Agent SDK 技能文档。将玩具库移植到 SDK 的技能模式。可发现性方面有哪些变化？

## 关键术语

| 术语 | 人们说的意思 | 实际含义 |
|------|----------------|------------------------|
| 技能 | "可复用能力" | 命名的代码块 + 描述，可通过相似性检索 |
| 技能库 | "Agent 的操作记忆" | 技能的持久化存储，可搜索和组合 |
| 课程 | "任务提议者" | 由当前能力差距驱动的自底向上目标生成器 |
| 组合 | "技能 DAG" | 技能调用技能；执行时按拓扑排序 |
| 迭代改进 | "自我修正循环" | 环境反馈 + 错误 + 自我验证反馈到下一版本 |
| 动作空间即代码 | "编程式动作" | 发出函数而非原始命令，以实现时间上扩展的行为 |
| 写入时去重 | "技能折叠" | 接近重复的描述折叠为一个规范技能 |

## 扩展阅读

- [Wang 等人，Voyager（arXiv:2305.16291）](https://arxiv.org/abs/2305.16291) — 技能库原论文
- [Claude Agent SDK 概述](https://platform.claude.com/docs/en/agent-sdk/overview) — 技能作为 2026 年的产品化形式
- [Anthropic，使用 Claude Agent SDK 构建 Agent](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) — 技能和子 Agent 的实践
- [Madaan 等人，Self-Refine（arXiv:2303.17651）](https://arxiv.org/abs/2303.17651) — Voyager 底层的改进循环
