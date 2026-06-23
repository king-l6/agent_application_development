# 自主编码agent全景（2026）

> SWE-bench Verified在不到三年内从4%上升到80.9%。相同的Claude Sonnet 4.5在SWE-agent v1上得分为43.2%，在Cline自主模式上得分为59.8%——模型周围的脚手架现在与模型本身同样重要。OpenHands（原名OpenDevin）是最活跃的MIT许可平台，其CodeAct循环直接在沙箱中执行Python动作，而非JSON工具调用。头条数字隐藏了一个方法论问题：500个SWE-bench Verified任务中有161个只需1-2行更改，而相同前沿模型在SWE-bench Pro（10行以上任务）上的得分为23-59%。

**类型：** 学习
**语言：** Python（标准库，CodeAct vs JSON工具调用比较）
**前置知识：** 第14阶段第07课（工具使用），第15阶段第01课（长时域agent）
**时间：** 约45分钟

## 问题

"哪个编码agent最好"是错误的问题。正确的问题是：在与我的工作匹配的任务分布上，使用我在生产中运行的脚手架，我获得什么样的端到端可靠性？

从2022年到2026年，该领域学到的是脚手架——检索层、规划器、沙箱、编辑-验证循环、反馈格式——承担着重要责任。Claude Sonnet 4.5在SWE-agent v1上得分为43.2%；相同的模型在Cline自主脚手架内得分为59.8%。16.6个绝对百分点的差异，相同的权重。基础模型是一个组件；循环才是产品。

伴随的问题是基准饱和隐藏了回归。SWE-bench Verified接近饱和，而简单任务尾部（500个任务中有161个需要≤2行更改）拉高了头部分数。真实世界的质量更适合在SWE-bench Pro（10行以上更改）等分布上测量，相同的领先者仍停留在23-59%。

## 概念

### SWE-bench，一段话

SWE-bench（Jimenez等人）获取带有ground-truth补丁的真实GitHub问题，要求agent生成一个使测试套件通过的补丁。SWE-bench Verified（OpenAI，2024）是一个人工策展的500任务子集，移除了模糊和有缺陷的任务。SWE-bench Pro是更困难的后继者——需要10行以上更改的任务，当前前沿agent得分为23-59%。

### 2022年到2026年的曲线实际展示的内容

- **2022年**：研究模型在原始SWE-bench上约4%。
- **2024年**：GPT-4 + Devin风格脚手架约14%；SWE-agent约12%。
- **2025年**：Aider和SWE-agent内部的Claude 3.5/3.7 Sonnet推进到40-55%范围。
- **2026年**：Claude Sonnet 4.5和前沿竞争者在SWE-bench Verified上达到70-80%以上。Epoch AI的排行榜实时追踪。

这条斜率来自三个复合来源：更好的基础模型、更好的脚手架（CodeAct、反思、验证器循环）和更好的基准（Verified消除了噪声）。

### CodeAct vs JSON工具调用

OpenHands（All-Hands-AI，arXiv:2407.16741，原名OpenDevin）采取了一个特定的架构赌注：模型不发出由主机解码并执行的JSON工具调用，而是发出Python代码，由Jupyter风格的内核在沙箱中执行。agent可以在一个动作内循环文件、链式调用工具并捕获自身异常。

权衡：

- **JSON工具调用**：每个动作是一个轮次；易于审计；组合性有限；默认安全，因为每次调用都经过显式验证器。
- **CodeAct**：一个动作可以是一个完整程序；组合性强；需要强化的沙箱（OpenHands使用Docker隔离）；失败模式包括沙箱运行时允许的任何内容。

两种架构都在生产中运行。CodeAct在开放平台（OpenHands、smolagents）中占主导地位。JSON工具调用在托管服务（Anthropic Managed Agents、OpenAI Assistants）中仍占主导地位，提供商控制执行器。

### 2026年全景中的脚手架

| 脚手架 | 许可 | 执行模型 | 显著特性 |
|---|---|---|---|
| OpenHands (OpenDevin) | MIT | Docker中的CodeAct | 最活跃的开放平台；事件流可重放 |
| SWE-agent | MIT | Agent-Computer Interface (ACI) | 首个端到端SWE-bench脚手架 |
| Aider | Apache-2 | 本地仓库中的diff编辑 | 最小化脚手架，强大的回归稳定性 |
| Cline | Apache-2 | 带工具策略的VS Code agent | Sonnet 4.5上得分最高的开放脚手架 |
| Devin (Cognition) | 专有 | 托管VM + 规划器 | 首个"AI软件工程师"产品类别 |
| Claude Code | 专有 | 权限模式 + 例程 | 第10课详细介绍agent循环 |

### 为什么脚手架占主导地位

编码运行是一个长时域轨迹（第1课）。可靠性在步骤间复合积累。脚手架在三个地方带来收益：

1. **检索**：找到要读取的正确文件是静默瓶颈。SWE-agent的ACI、OpenHands的文件索引和Aider的仓库映射都针对此问题。
2. **验证器循环**：运行测试、读取堆栈跟踪和重新尝试在SWE-bench上带来10个百分点的增量。
3. **失败遏制**：出错时回滚的沙箱防止复合损害。同一个模型有和没有验证器循环看起来像两个不同的产品。

### 基准饱和与真实分布

OpenHands作者和Epoch AI都指出SWE-bench Verified有简单尾部：500个任务中有161个只需1-2行更改。高分数部分由此尾部驱动。SWE-bench Pro限制为10行以上更改，即使前沿系统也返回23-59%的分数。你的生产分布几乎肯定更接近Pro而非Verified。

选择agent的含义：运行你自己bug backlog中类似Pro的子集。重要的分数是在代表你所交付任务的分布上的分数。

## 使用

`code/main.py` 在固定的迷你任务分布上比较两个玩具agent脚手架：

1. 一个**JSON工具调用**脚手架，每个轮次执行一个动作。
2. 一个**CodeAct**脚手架，每个动作可以发出小段Python代码。

两者都使用存根"模型"（确定性规则），以便比较将脚手架与模型质量隔离。输出显示CodeAct脚手架以更少的轮次解决更多任务，代价是每个动作的爆炸半径更大。

## 交付

`outputs/skill-scaffold-audit.md` 帮助你在采用前审计提议的编码agent脚手架：检索质量、验证器存在性、沙箱隔离以及基准到分布的契合度。

## 练习

1. 运行 `code/main.py`。每个脚手架在相同任务集上需要多少轮次？每个动作的爆炸半径是多少？

2. 阅读OpenHands论文（arXiv:2407.16741）。论文论证CodeAct在复杂任务上胜过JSON工具调用。找出论文承认的一个失败模式，并用一句话说明该模式何时会在生产中占主导地位。

3. 从你的bug backlog中选择一个需要跨两个文件进行10行以上更改的任务。评估前沿模型在（a）JSON工具调用和（b）CodeAct下的端到端成功概率。解释差距原因。

4. SWE-bench Verified有161个单文件、1-2行任务。构建一个排除它们的分数。排行榜会如何洗牌？

5. 阅读"Introducing SWE-bench Verified"（OpenAI）。解释用于移除模糊任务的具体方法论，并指出策展会遗漏的一个类别。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|---|---|---|
| SWE-bench | "编码基准" | 带有ground-truth补丁和测试套件的真实GitHub问题 |
| SWE-bench Verified | "清理后的子集" | 500个人工策展任务，存在简单尾部 |
| SWE-bench Pro | "更难的子集" | 10行以上更改；前沿得分23-59% |
| CodeAct | "代码即动作" | Agent发出Python；Jupyter风格内核在沙箱中执行 |
| JSON工具调用 | "函数调用" | 每个动作是一个在执行前验证的结构化JSON载荷 |
| 脚手架 | "agent框架" | 基础模型周围的检索+规划器+执行器+验证器循环 |
| ACI（Agent-Computer Interface） | "SWE-agent的格式" | 为LLM人机工效设计而非人类shell设计的命令集 |
| 验证器循环 | "测试并重试" | 运行测试、读取输出、修改补丁；最大的非模型可靠性增益 |

## 延伸阅读

- [Jimenez等人 — SWE-bench](https://www.swebench.com/) — 原始基准和方法论。
- [OpenAI — Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) — 策展子集的构建方式。
- [Wang等人 — OpenHands：AI软件开发者的开放平台](https://arxiv.org/abs/2407.16741) — CodeAct架构和事件流设计。
- [Epoch AI — SWE-bench排行榜](https://epoch.ai/benchmarks) — 实时追踪分数。
- [Anthropic — 测量agent自主性](https://www.anthropic.com/research/measuring-agent-autonomy) — 长时域编码agent可靠性框架。
