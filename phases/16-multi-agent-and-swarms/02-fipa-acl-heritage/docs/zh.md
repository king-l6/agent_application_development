# FIPA-ACL 与言语行为的传承

> 在 MCP 之前，在 A2A 之前，有 FIPA-ACL。2000年，IEEE 智能物理代理基金会（Foundation for Intelligent Physical Agents）批准了一种智能体通信语言，包含二十个行事语（performatives）、两种内容语言和一套交互协议——合同网、订阅/通知、请求-何时。它从工业界消失了，因为本体（ontology）开销对于网络来说过于沉重，但多智能体系统的LLM复兴正在悄悄重新实现相同的理念——只不过用 JSON 契约替代了行事语，用自然语言替代了本体。这门课认真研读 FIPA-ACL，让你能够看清 2026 年的协议决策中哪些是重新发明、哪些是真正的创新，以及当前浪潮将在何处重新发现 2000 年代就已经解决的问题。

**类型：** 学习
**语言：** Python（标准库）
**前置条件：** 第16阶段 · 01（为什么需要多智能体）
**时间：** ~60分钟

## 问题

2026 年的智能体协议领域热闹非凡：MCP 用于工具、A2A 用于智能体、ACP 用于企业审计、ANP 用于去中心化信任、NLIP 用于自然语言内容，还有 CA-MCP 以及二十多个研究提案。每个规范都宣称自己是基础性的。

诚实的解读是，它们大多在重新发现一个非常具体的、二十年前的决策树。Austin（1962）和 Searle（1969）的言语行为理论告诉我们"话语就是行动"。KQML（1993）将其转化为一种在线协议。FIPA-ACL（2000年批准）产生了参考标准化：二十个行事语、内容语言 SL0/SL1、用于合同网和订阅-通知的交互协议。JADE 和 JACK 是 Java 参考平台。这项工作在 2010 年左右逐渐式微，因为本体开销过于沉重，而网络正在胜出。

当你审视 MCP 的 `tools/call`、A2A 的任务生命周期或 CA-MCP 的共享上下文存储时，你看到的是 FIPA 决策的一个更温和、JSON 原生的重制版。了解这份传承告诉你两件事：哪些新的"创新"实际上是重新发明，以及新规范将重新发现哪些旧的失败模式。

## 概念

### 言语行为，用一段话说明

Austin 注意到有些句子不是描述世界——而是改变世界。"我承诺。""我请求。""我宣布。"他称这些为行事性话语（performative utterances）。Searle 将其形式化为五个类别：断言类、指令类、承诺类、表达类、宣告类。KQML（Finin 等，1993）将其操作化用于软件智能体：一条消息是一个行事语（动作）加上内容（动作的对象）。FIPA-ACL 清理了 KQML 的空白，并围绕二十个行事语进行了标准化。

### 二十个 FIPA 行事语（部分列表）

| 行事语 | 意图 |
|---|---|
| `inform` | "我告诉你 P 是真的" |
| `request` | "我请求你做 X" |
| `query-if` | "P 是真的吗？" |
| `query-ref` | "X 的值是什么？" |
| `propose` | "我提议我们做 X" |
| `accept-proposal` | "我接受这个提案" |
| `reject-proposal` | "我拒绝这个提案" |
| `agree` | "我同意做 X" |
| `refuse` | "我拒绝做 X" |
| `confirm` | "我确认 P 是真的" |
| `disconfirm` | "我否认 P" |
| `not-understood` | "你的消息无法解析" |
| `cfp` | "关于 X 的提案征集" |
| `subscribe` | "当 X 变化时通知我" |
| `cancel` | "取消正在进行的 X" |
| `failure` | "我尝试了 X 但失败了" |

完整列表在 `fipa00037.pdf`（FIPA ACL 消息结构）中。重点不是记住它——重点是这些中的每一个都对应 LLM 协议最终会重新添加的一个原语。

### 经典的 FIPA-ACL 消息

```
(inform
  :sender       agent1@platform
  :receiver     agent2@platform
  :content      "((price IBM 83))"
  :language     SL0
  :ontology     finance
  :protocol     fipa-request
  :conversation-id   conv-42
  :reply-with   msg-17
)
```

七个字段承载协议信封；一个字段（`content`）承载有效载荷。其余字段正是你每次将重试、线程和本体附加到 JSON 协议时重新发明的东西。

### 两个遗留平台

**JADE**（Java Agent DEvelopment framework，1999–2020年代）是使用最广泛的符合 FIPA 的运行时。智能体扩展一个基类，交换 ACL 消息，在容器内运行，并使用"行为"进行协调。交互协议库提供了合同网、订阅-通知、请求-何时和建议-接受。

**JACK**（Agent Oriented Software，商业软件）强调在 FIPA 消息之上的 BDI（信念-愿望-意图）推理。更正式，但采用率更低。

两者都在网络栈吞噬了多智能体用例后衰落。MCP 和 A2A 是 2026 年的运行时"容器"。

### FIPA 为什么消失

- **本体开销。** FIPA 需要一个共享本体来解析 `content`。达成本体共识是一个持续数年的标准化过程。而网络只用了 HTTP + JSON。
- **没人用的形式语义。** SL（语义语言）提供了严格的真值条件，但大多数生产系统使用自由格式的内容，忽略了形式化。
- **工具锁定。** JADE 只支持 Java；JACK 是商业软件。多语言团队绕开了这两者。
- **互联网赢得了栈。** REST，然后 JSON-RPC，然后 gRPC 取代了 ACL 的传输层。

### LLM 复兴是轻量版 FIPA

比较 FIPA 的 `request` 和 MCP 的 `tools/call`：

```
(request                                {
  :sender  agent1                         "jsonrpc": "2.0",
  :receiver tool-server                   "method":  "tools/call",
  :content "(lookup stock IBM)"           "params":  {"name":"lookup_stock",
  :ontology finance                                   "arguments":{"symbol":"IBM"}},
  :conversation-id c42                    "id": 42
)                                        }
```

相同的信封，不同的语法。两者都携带：谁、给谁、意图、有效载荷、相关ID。两者都不是对对方的革命——它们是在相同设计上的不同权衡。

Liu 等人 2025 年的综述（"A Survey of Agent Interoperability Protocols: MCP, ACP, A2A, ANP", arXiv:2505.02279）明确指出了这一传承：MCP 对应工具使用的言语行为，A2A 对应智能体对等体的言语行为，ACP 对应审计追踪的言语行为，ANP 对应去中心化身份的扩展。新规范是具有 JSON 语法和更宽松语义的 ACL 后代。

### 权衡，直说

**FIPA 给了你而现代规范抛弃的：**

- 形式语义——你可以证明 `inform` 意味着发送者相信该内容。
- 行事语的经典目录——你不必重新争论"我们是否应该有一个 `cancel`？"。
- 数十年的交互协议模式——合同网、订阅-通知、建议-接受——具有已知的正确性属性。

**现代规范给了你而 FIPA 没有的：**

- 与所有现代工具兼容的 JSON 原生有效载荷。
- 无需手工编码本体即可被 LLM 解释的自然语言内容。
- 网络栈传输（HTTP、SSE、WebSocket）。
- 通过自描述文档进行能力发现（MCP `listTools`、A2A Agent Card）。

意图语义更宽松，便于实现。这就是确切的权衡。

### 值得移植的交互协议

FIPA 提供了大约 15 个交互协议。有三个值得带入 LLM 多智能体系统：

1. **合同网协议（CNP）。** 管理者发出 `cfp`（提案征集）；投标者用 `propose` 回应；管理者接受/拒绝。这是经典的任务市场模式（第16阶段 · 16 谈判）。
2. **订阅/通知。** 订阅者发送 `subscribe`；发布者在主题变化时发送 `inform`。这就是 2026 年的每个事件总线。
3. **请求-何时。** "当条件 Y 满足时做 X。"带前置条件的延迟动作。2026 年的对应是持久化工作流引擎中的延迟任务（第16阶段 · 22 生产级扩展）。

每一个都能干净地映射到现代消息队列、HTTP + 轮询或 SSE 流。

### 去掉本体后什么会出问题

没有共享本体，智能体从自然语言内容中推断含义。2026 年记录在案的故障模式是**语义漂移**：两个智能体对微妙不同的概念使用同一个词（"customer"），接收者的智能体按错误解释行动，没有模式验证器捕获它。FIPA 的本体要求会在解析时拒绝该消息。

不完全采用本体的缓解措施：

- `content` 上的 JSON Schema——在传输层拒绝结构错误。
- 类型化产物（A2A）——拒绝错误的模态。
- 信封中的显式行事语——即使内容是自然语言，意图也变得明确。

### 2026 年的规范，映射到言语行为传承

| 现代规范 | FIPA 对应 | 保留了什么 | 抛弃了什么 |
|---|---|---|---|
| MCP `tools/call` | `request` | 显式意图、相关ID | 形式语义、本体 |
| MCP `resources/read` | `query-ref` | 显式意图、相关ID | 形式语义 |
| A2A 任务生命周期 | 合同网 + 请求-何时 | 异步生命周期、状态转换 | 形式完备性保证 |
| A2A 流式事件 | 订阅/通知 | 异步推送 | 类型化谓词订阅 |
| CA-MCP 共享上下文 | 黑板（Hayes-Roth 1985） | 多写者共享内存 | 逻辑一致性模型 |
| NLIP | 自然语言内容 | LLM 原生 | 模式 |

从上到下阅读此表，规律是：保留结构原语，去掉形式化，让 LLM 来覆盖模糊性。

## 动手构建

`code/main.py` 实现了一个纯标准库的 FIPA-ACL 转换器。它对经典 ACL 信封进行编码和解码，并展示了每个 MCP/A2A 消息形状如何归结为相同的七个字段。演示：

- 将五条 MCP 风格和 A2A 风格的消息编码为 FIPA-ACL。
- 将 FIPA-ACL 解码回现代等价形式。
- 运行一个玩具合同网协商，一个管理者和三个投标者使用 `cfp`、`propose`、`accept-proposal`、`reject-proposal`。

运行：

```
python3 code/main.py
```

输出是一个并排跟踪，显示每条现代消息的 2026 JSON 形式和 FIPA-ACL 形式，然后是一个合同网投标的往返转换。相同的协议原语在往返中保持不变；只有语法不同。

## 使用它

`outputs/skill-fipa-mapper.md` 是一个技能，它读取任何智能体协议规范并生成 FIPA-ACL 映射。在采用新协议之前使用它来回答："这真的是新的，还是带 JSON 语法的 `inform`？"

## 投入生产

不要带回 FIPA-ACL。带回它的检查清单：

- 每条消息的意图原语（行事语）是什么？
- 是否有用于请求-响应和取消的相关ID？
- 是否有显式的内容语言（JSON-RPC、纯文本、结构化类型化产物）？
- 交互协议是一等公民，还是你在从头重新实现合同网？
- 当两个智能体对内容含义有分歧时（语义漂移）会发生什么？

在你将任何新协议投入生产之前，记录这五个问题。

## 练习

1. 运行 `code/main.py`。观察往返编码。识别哪个 FIPA 行事语对应 `tools/call`、`resources/read` 和 A2A 任务创建。
2. 扩展合同网演示，添加一个 `cancel` 行事语，让管理者在投标过程中撤回任务。`cancel` 解决了什么单独重试无法解决的故障情况？
3. 阅读 FIPA ACL 消息结构（http://www.fipa.org/specs/fipa00037/）第 4.1–4.3 节。选择一个本课未涵盖的行事语，并描述其现代 JSON-RPC 对应物。
4. 阅读 Liu 等人，arXiv:2505.02279。对于 MCP、A2A、ACP、ANP 中的每一个，列出它们保留和抛弃的 FIPA 行事语家族。
5. 为你自己系统中 `request` 行事语的 `content` 字段设计一个最小的 JSON-Schema。这个 schema 给了你纯自然语言没有的什么，以及它付出了什么代价？

## 关键术语

| 术语 | 人们所说的 | 实际含义 |
|------|-----------|---------|
| 言语行为（Speech act） | "做了某事的话语" | Austin/Searle：话语即行动。ACL 的理论父体。 |
| FIPA | "那个旧的 XML 东西" | IEEE 智能物理代理基金会。2000年标准化了 ACL。 |
| ACL | "智能体通信语言" | FIPA 的信封格式：行事语 + 内容 + 元数据。 |
| 行事语（Performative） | "动词" | 消息的意图类别：`inform`、`request`、`propose`、`cfp` 等。 |
| KQML | "FIPA 的前身" | 知识查询和操纵语言（1993年）。更简单，更狭窄。 |
| 本体（Ontology） | "共享词汇表" | 对内容语言所讨论概念的形式化定义。 |
| SL0 / SL1 | "FIPA 内容语言" | 语义语言 0 级和 1 级——形式化内容语言家族。 |
| 合同网（Contract Net） | "任务市场" | 管理者发出 cfp；投标者提议；管理者接受。经典的交互协议。 |
| 交互协议（Interaction protocol） | "消息模式" | 一系列具有已知正确性属性的行事语：请求-何时、订阅-通知等。 |

## 扩展阅读

- [Liu et al. — A Survey of Agent Interoperability Protocols: MCP, ACP, A2A, ANP](https://arxiv.org/html/2505.02279v1) — 将现代规范连接到 FIPA 传承的经典 2025 年综述
- [FIPA ACL Message Structure Specification (fipa00037)](http://www.fipa.org/specs/fipa00037/) — 2000 年批准的信封格式
- [FIPA Communicative Act Library Specification (fipa00037)](http://www.fipa.org/specs/fipa00037/) — 完整的行事语目录
- [MCP specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — `request`/`query-ref` 的现代工具使用等价物
- [A2A specification](https://a2a-protocol.org/latest/specification/) — 合同网和订阅-通知的现代智能体对等体等价物
