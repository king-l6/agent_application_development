# CrewAI：基于角色的团队与流程

> CrewAI 是2026年基于角色的多智能体框架。四个基本要素：Agent、Task、Crew、Process。两种顶层形态：Crews（自主、基于角色的协作）和 Flows（事件驱动、确定性）。文档直言不讳："对于任何生产就绪的应用程序，请从 Flow 开始。"

**类型：** 学习 + 构建
**语言：** Python（标准库）
**前置条件：** 第14阶段·12（工作流模式），第14阶段·14（参与者模型）
**时长：** ~75分钟

## 学习目标

- 列举 CrewAI 的四个基本要素（Agent、Task、Crew、Process）及其各自职责。
- 区分 Sequential、Hierarchical 和计划中的 Consensus 流程；为每种工作负载选择合适的流程。
- 区分 Crews（自主基于角色）和 Flows（事件驱动确定性），并解释文档的生产推荐。
- 使用 `@tool` 装饰器和 `BaseTool` 子类接入工具；推理结构化输出与自由文本的取舍。
- 列举 CrewAI 的四种记忆类型及各自的适用场景。
- 实现一个标准库三智能体团队（研究员、写手、编辑）以生成简报。
- 识别 CrewAI 的三种失败模式：提示膨胀、管理者 LLM 税、脆弱的交接。

## 问题

采用多智能体框架的团队都会遇到同样的瓶颈。"自主协作"在演示中听起来很棒。然后客户提交了一个缺陷，你需要确定性回放。或者财务部门询问一个 LLM 路由的团队每次运行的成本。或者值班人员需要知道凌晨3点哪个智能体卡住了。

自由形式的 LLM 路由团队无法清晰地回答这些问题。纯 DAG 可以回答所有问题，但失去了头脑风暴智能体所需的探索形态。

CrewAI 的划分诚实地反映了这个权衡。Crews 用于协作的、基于角色的、探索性的工作。Flows 用于事件驱动的、代码拥有的、可审计的生产工作。同一框架，两种形态，按场景选择。

## 概念

### 四个基本要素

CrewAI 的表面很小。记住这些，其余都是配置。

- **Agent。** `role + goal + backstory + tools + (optional) llm`。背景故事是承重的。它塑造语气、判断力、以及智能体何时停止。工具是智能体可以调用的函数（更多见下文）。
- **Task。** `description + expected_output + agent + (optional) context + (optional) output_pydantic`。一个可重用的工作单元。`expected_output` 是契约。`context` 列出其输出被传入的上游任务。`output_pydantic` 强制结构化形状。
- **Crew。** 容器。拥有 `agents` 列表、`tasks` 列表、`process`，以及可选的 `memory` + `verbose` + `manager_llm` 设置。
- **Process。** 执行策略。Sequential、Hierarchical、Consensus（计划中）。决定运行形态。

智能体不直接相互看见。任务引用智能体。Crew 序列化任务。Process 决定谁选择下一个任务。这就是整个思维模型。

> **已验证于** CrewAI 0.86（2026年5月）。较新版本可能重命名或合并流程类型；在依赖特定形态前请查看 [CrewAI Processes 文档](https://docs.crewai.com/concepts/processes)。

### Sequential vs Hierarchical vs Consensus

- **Sequential。** 任务按声明顺序运行。任务 N 的输出作为 `context` 提供给任务 N+1。成本最低。最可预测。当顺序固定时使用。
- **Hierarchical。** 一个管理者 Agent（独立 LLM 调用）在专业者之间路由。CrewAI 从你的 `manager_llm` 配置或默认值生成管理者。管理者每轮选择下一个任务，可以拒绝或重新路由。当你有四个或更多专业者且顺序确实取决于先前的输出时使用。
- **Consensus。** 计划中，当前未在公共 API 中实现。文档保留该名称用于未来的基于投票的流程。目前不要依赖它。

Hierarchical 在每次专业者调用之上增加了一轮 LLM 调用（管理者）。在一个五步运行中，令牌成本可能翻三倍。仅当你需要路由时才为此买单。

### Crews vs Flows

这是2026年文档首先提出的框架。

- **Crew。** LLM 驱动的自主性。框架在运行时选择形态。适用于：研究、头脑风暴、初稿，以及任何路径本身就是答案一部分的场景。难以回放。难以测试。原型制作成本低。
- **Flow。** 你拥有的事件驱动图。`@start` 标记入口。`@listen(topic)` 标记一个步骤，当其他步骤发出该主题时触发。每一步是纯 Python（可以在内部调用 Crew）。适用于：生产。可观测。可测试。确定性。

2026年文档的生产推荐：从 Flow 开始。当自主性值得其成本时，将 Crews 作为 `Crew.kickoff()` 从 Flow 步骤内部调用。Flow 提供审计轨迹，Crew 提供探索。组合使用，而非二选一。

### 工具集成

为 Agent 提供工具的三种方式。选择最简单的方式。

1. **`@tool` 装饰器。** 纯函数成为工具。函数签名是模式；文档字符串是 LLM 看到的描述。最适合一次性辅助工具。

   ```python
   from crewai.tools import tool

   @tool("Search the web")
   def search(query: str) -> str:
       """返回查询的顶部结果。"""
       return run_search(query)
   ```

2. **`BaseTool` 子类。** 基于类的工具，具有显式参数模式、异步支持、重试。当工具具有状态（客户端、缓存）或需要结构化参数时使用。

   ```python
   from crewai.tools import BaseTool
   from pydantic import BaseModel

   class SearchArgs(BaseModel):
       query: str
       limit: int = 10

   class SearchTool(BaseTool):
       name = "web_search"
       description = "搜索网页并返回顶部结果。"
       args_schema = SearchArgs

       def _run(self, query: str, limit: int = 10) -> str:
           return self.client.search(query, limit=limit)
   ```

3. **内置工具包。** CrewAI 提供第一方适配器：`SerperDevTool`、`FileReadTool`、`DirectoryReadTool`、`CodeInterpreterTool`、`RagTool`、`WebsiteSearchTool`。一次导入即可接入。

结构化输出使用 Pydantic。在 Task 上传递 `output_pydantic=MyModel`。CrewAI 根据模型验证 LLM 响应，要么强制转换要么重试。将此与紧凑的 `expected_output` 字符串配对。自由文本输出适用于草稿；结构化输出是下游 Flow 可以消费的内容。

### 记忆钩子

CrewAI 内置了四种记忆类型。它们可以组合：一个 Crew 可以同时启用全部四种。

> **已验证于** CrewAI 0.86（2026年5月）。最近版本通过一个统一的 `Memory` 系统路由所有内容，该系统封装了这四个存储。以下概念模型仍然成立，但公共类表面可能在新版本中缩减为单个 `Memory` 入口点；请查看 [CrewAI memory 文档](https://docs.crewai.com/concepts/memory) 获取当前 API。

- **短期记忆。** 单次运行内的对话缓冲区。运行结束时清除。
- **长期记忆。** 跨运行持久化。存储在向量数据库（默认为 Chroma，可替换）中。通过与当前任务的相似性检索。
- **实体记忆。** 每实体事实。"客户 X 使用的是企业版。"以实体为键，而非相似性。跨运行存活。
- **上下文记忆。** 组装时检索。在智能体需要时拉取相关记忆，而非预加载。

在 Crew 上通过 `memory=True` 或按类型配置启用。由你配置的嵌入提供商支持（默认为 OpenAI，可替换为本地）。记忆是 CrewAI 对较薄框架保持优势的领域之一；纯 LangGraph 需要你自己接入这些。

### CrewAI 适用场景

- 三到六个具有命名角色和协作工作流的智能体。起草、审查、规划、头脑风暴。
- LLM 对下一步的判断本身就是价值之一的路由（Hierarchical）。
- 团队更乐意阅读 `role + goal + backstory` 而非图定义的任何场景。

### CrewAI 不适用场景

- 具有严格顺序的确定性 DAG。使用 LangGraph（第13课）。图形状是正确的抽象；CrewAI 的角色框架是摩擦。
- 亚秒级延迟预算。Hierarchical 增加了往返。即使 Sequential 也会序列化包含背景故事和先前输出的提示词。
- 单智能体循环。跳过框架；智能体循环（第1课）加工具注册表更简洁。

第17课（智能体框架权衡）以矩阵形式列出。简而言之：CrewAI 位于"基于角色协作"的角落。

### 依赖关系

独立于 LangChain。Python 3.10 到 3.13。使用 `uv`。星标数：见 [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)（截至2026年5月）。AWS Bedrock 集成有文档记录；供应商报告在 QA 工作负载上与 LangGraph 相比有显著加速，但方法论（数据集、硬件、评估指标）未公开，因此仅将框架供应商数字视为方向性参考。

### 这种模式的失败点

- **背景故事导致的提示膨胀。** 每个智能体2000字的背景故事和一个五智能体团队在第一次工具调用前就烧尽了上下文预算。保持背景故事在200字以内。在智能体间复用短语；不要重复五次相同的风格说明。
- **管理者 LLM 令牌税。** Hierarchical 流程在每次专业者调用前添加一个管理者 LLM 调用。在一个五任务团队中，这是六次 LLM 调用而不是五次，并且管理者调用携带完整的任务列表加上先前的输出。除非路由依赖于输出，否则切换到 Sequential。
- **脆弱的交接。** 任务 N 的 `expected_output` 是"一个大纲"。任务 N+1 将其作为 `context` 读取并尝试解析三个部分。LLM 产生了四个。下游智能体即兴发挥。在任务 N 上使用 `output_pydantic` 修复，使任务 N+1 读取类型化对象而非自由文本。
- **Crew 即生产。** 没有 Flow 包装器就将自由形式的 Crew 部署到生产。输出变异性高；无法回放；值班人员无法区分差运行和好运行。用 Flow 包装。

## 构建

`code/main.py` 使用标准库实现了两种形态以及一个三智能体团队。

形态：

- `Agent`、`Task` 数据类，匹配 CrewAI 的表面。
- `SequentialCrew.kickoff(inputs)` 按声明顺序运行任务，将输出作为 `context` 传递。
- `HierarchicalCrew.kickoff(topic)` 添加一个管理者 Agent，每轮选择下一个专业者，在"完成"时停止。
- 带有 `@start` 和 `@listen(topic)` 装饰器的 `Flow`、一个小型事件循环和一个跟踪。
- 镜像 CrewAI `@tool` 形态的 `tool(name)` 装饰器。
- 带有 `short_term`、`long_term`、`entity` 存储的 `Memory`；模拟相似性使用 numpy。
- 模拟 LLM 响应是根据角色加输入前缀键控的硬编码字符串。无网络。确定性。

具体演示：研究员、写手、编辑团队生成关于"2026年代理工程"的简报。研究员拉取（模拟的）来源。写手起草。编辑精炼。同一团队通过 Flow 运行以展示确定性形态。

运行：

```bash
python3 code/main.py
```

跟踪涵盖：顺序团队通过 `context` 传递输出，层次团队具有管理者选择（研究员、写手、编辑，然后"完成"），使用显式主题（`researched`、`drafted`、`edited`）运行相同三步的流程，通过 `@tool` 路由的工具调用，以及跨两次 kickoff 存活的长期记忆。

Crew 跟踪是流动的；管理者原则上可以重新排序。Flow 跟踪是固定的。这种选择就是本课的核心。

## 使用

- **CrewAI Flow** 用于生产。即使 Flow 只是一个调用 `Crew.kickoff()` 的步骤。Flow 提供审计边界。
- **CrewAI Crew（Sequential）** 用于顺序明确的协作工作，特别是初稿和审查循环。
- **CrewAI Crew（Hierarchical）** 当路由依赖于输出且你有四个或更多专业者时。
- **LangGraph**（第13课）用于显式状态机、持久化恢复、严格排序。
- **AutoGen v0.4**（第14课）用于参与者模型并发和故障隔离。
- **OpenAI Agents SDK**（第16课）用于以 OpenAI 为先的产品，具有交接和护栏。
- **Claude Agent SDK**（第17课）用于以 Claude 为先的产品，具有子智能体和会话存储。

## 交付

`outputs/skill-crew-or-flow.md` 为任务选择 Crew 或 Flow，并搭建最小实现。硬性拒绝：没有背景故事的 Crew、没有显式主题的 Flow、专业者少于三人的 Hierarchical。

## 陷阱

- **背景故事作为点缀。** 它塑造输出。每个智能体测试三个变体；差异是真实的。选择一个，固定下来。
- **跳过 `expected_output`。** 没有每个任务的契约，下游任务会捡起 LLM 产生的任何内容。Crew 运行了；审计失败了。
- **记忆始终开启。** 长期记忆每次运行都写入。向量数据库增长。检索变得嘈杂。将写入范围限定在事实持久化的任务上。
- **管理者提示漂移。** Hierarchical 的管理者提示是隐式的。如果路由变得奇怪，在 verbose 模式下转储并阅读。
- **Crew 中的工具副作用。** Crew 可能比预期更多次调用工具。POST、DELETE、支付属于 Flow 步骤，绝不属于 Crew 工具。

## 练习

1. 将 Sequential crew 转换为 Flow。统计变异性下降的接触点。注意可读性下降的地方。
2. 向团队添加实体记忆：关于客户的事实跨 kickoff 持久化。验证检索拉取正确的实体。
3. 实现 Hierarchical 流程，其中管理者在写手的输出至少有三个段落之前拒绝路由给编辑。跟踪重试。
4. 为（模拟的）网页搜索接入 `BaseTool` 子类。比较跟踪形状与 `@tool` 装饰器版本。
5. 向编辑任务添加 `output_pydantic=Brief`，其中 `Brief` 具有 `title`、`summary`、`sections`。让写手任务一次产生格式错误的 JSON；验证 CrewAI 在跟踪中的重试行为。
6. 阅读 CrewAI 的文档介绍。将玩具示例移植到真实的 `crewai` API。标准库版本跳过了哪些保证？
7. 为一次真实运行接入 AgentOps 或 Langfuse（第24课）。标准库版本中你错过了哪些跟踪？

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| Agent | "角色" | 角色 + 目标 + 背景故事 + 工具 |
| Task | "工作单元" | 描述 + 预期输出 + 负责人 + 可选结构化输出 |
| Crew | "智能体团队" | Agent + Task + Process 的容器 |
| Process | "执行策略" | Sequential / Hierarchical / Consensus（计划中） |
| Flow | "确定性工作流" | 事件驱动、代码拥有、可测试 |
| 背景故事（Backstory） | "角色提示" | 智能体的语气和判断力塑造器 |
| `@tool` | "函数工具" | 将函数转变为智能体可调用的工具的装饰器 |
| `BaseTool` | "类工具" | 基于类的工具，具有参数模式、重试、异步支持 |
| 实体记忆（Entity memory） | "每实体事实" | 限定于客户/账户/问题的记忆 |
| 长期记忆（Long-term memory） | "跨运行记忆" | 基于向量的记忆，跨 kickoff 存活 |
| 上下文记忆（Contextual memory） | "即时检索" | 在智能体需要时拉取的记忆 |
| 管理者 LLM（Manager LLM） | "路由智能体" | Hierarchical 流程中选择下一个任务的额外 LLM |
| `expected_output` | "任务契约" | 告知智能体（和审计）返回什么形状的字符串 |

## 延伸阅读

- [CrewAI 文档介绍](https://docs.crewai.com/en/introduction)：概念和推荐的生产路径
- [CrewAI Flows 指南](https://docs.crewai.com/en/concepts/flows)：事件驱动形态，`@start`，`@listen`
- [CrewAI 工具参考](https://docs.crewai.com/en/concepts/tools)：`@tool`、`BaseTool`、内置工具包
- [CrewAI 记忆](https://docs.crewai.com/en/concepts/memory)：短期、长期、实体、上下文记忆
- [Anthropic，构建有效的智能体](https://www.anthropic.com/research/building-effective-agents)：多智能体何时有帮助，何时无帮助
- [LangGraph 概述](https://docs.langchain.com/oss/python/langgraph/overview)：状态机替代方案
