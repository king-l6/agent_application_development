# 函数调用深入——OpenAI、Anthropic、Gemini

> 三大前沿提供商在 2024 年收敛到了相同的工具调用循环，然后又在其他方面分道扬镳。OpenAI 使用 `tools` 和 `tool_calls`。Anthropic 使用 `tool_use` 和 `tool_result` 块。Gemini 使用 `functionDeclarations` 和唯一 ID 关联。本课并排对比三者，以便在一个提供商上运行的代码在移植时不会出错。

**类型：** 构建
**语言：** Python（标准库、模式转换器）
**前置知识：** 第 13 阶段第 01 课（工具接口）
**时间：** 约 75 分钟

## 学习目标

- 说明 OpenAI、Anthropic 和 Gemini 函数调用载荷之间的三个形态差异（声明、调用、结果）。
- 将一个工具声明翻译成三种提供商格式，并预测严格模式约束在何处会有所不同。
- 在每个提供商中使用 `tool_choice` 来强制、禁止或自动选择工具调用。
- 了解每个提供商的硬性限制（工具数量、模式深度、参数长度）以及违反限制时各自的错误信号。

## 问题

函数调用请求的形态因提供商而异。以下是 2026 年生产栈中的三个具体例子：

**OpenAI Chat Completions / Responses API。** 你传入 `tools: [{type: "function", function: {name, description, parameters, strict}}]`。模型的响应包含 `choices[0].message.tool_calls: [{id, type: "function", function: {name, arguments}}]`，其中 `arguments` 是一个你必须自行解析的 JSON 字符串。严格模式（`strict: true`）通过受限解码强制模式合规。

**Anthropic Messages API。** 你传入 `tools: [{name, description, input_schema}]`。响应以 `content: [{type: "text"}, {type: "tool_use", id, name, input}]` 的形式返回。`input` 是已经解析好的对象（而非字符串）。你需要回复一条新的 `user` 消息，其中包含一个 `{type: "tool_result", tool_use_id, content}` 块。

**Google Gemini API。** 你传入 `tools: [{functionDeclarations: [{name, description, parameters}]}]`（嵌套在 `functionDeclarations` 下）。响应以 `candidates[0].content.parts: [{functionCall: {name, args, id}}]` 的形式到达，其中 `id` 在 Gemini 3 及以上版本中是唯一的，用于并行调用关联。你回复 `{functionResponse: {name, id, response}}`。

同样的循环。不同的字段名、不同的嵌套方式、不同的字符串 vs 对象约定、不同的关联机制。一个团队在 OpenAI 上编写天气 agent，需要花费两天时间移植到 Anthropic，再花一天时间移植到 Gemini，仅仅是为了处理底层通信。

本课构建一个转换器，将三种格式统一为一个规范的工具声明，并在边缘进行路由。第 13 阶段第 17 课将同样的模式泛化为一个 LLM 网关。

## 概念

### 共同结构

每个提供商都需要五样东西：

1. **工具列表。** 每个工具的名称、描述和输入模式。
2. **工具选择。** 强制使用特定工具、禁止工具或让模型决定。
3. **调用发出。** 指明工具和参数的结构化输出。
4. **调用 ID。** 将响应与正确的调用关联起来（对并行调用很重要）。
5. **结果注入。** 将结果与调用关联起来的一条消息或块。

### 形态差异，逐个字段

| 方面 | OpenAI | Anthropic | Gemini |
|--------|--------|-----------|--------|
| 声明封装 | `{type: "function", function: {...}}` | `{name, description, input_schema}` | `{functionDeclarations: [{...}]}` |
| 模式字段 | `parameters` | `input_schema` | `parameters` |
| 响应容器 | assistant 消息上的 `tool_calls[]` | `content[]` 类型为 `tool_use` | `parts[]` 类型为 `functionCall` |
| 参数类型 | 字符串化 JSON | 解析后的对象 | 解析后的对象 |
| ID 格式 | `call_...`（OpenAI 生成） | `toolu_...`（Anthropic） | UUID（Gemini 3+） |
| 结果块 | role `tool`，`tool_call_id` | `user` 消息中的 `tool_result`，`tool_use_id` | 带有匹配 `id` 的 `functionResponse` |
| 强制工具 | `tool_choice: {type: "function", function: {name}}` | `tool_choice: {type: "tool", name}` | `tool_config: {function_calling_config: {mode: "ANY"}}` |
| 禁止工具 | `tool_choice: "none"` | `tool_choice: {type: "none"}` | `mode: "NONE"` |
| 严格模式 | `strict: true` | 模式即契约（始终执行） | `responseSchema` 在请求级别 |

### 你会实际遇到的上限

- **OpenAI。** 每次请求 128 个工具。模式深度 5。参数字符串 <= 8192 字节。严格模式要求无 `$ref`、无重叠的 `oneOf`/`anyOf`/`allOf`、每个属性都要在 `required` 中列出。
- **Anthropic。** 每次请求 64 个工具。模式深度实际上无限制，但实际限制为 10。没有严格模式标志；模式就是契约，模型倾向于遵守。
- **Gemini。** 每次请求 64 个函数。模式类型是 OpenAPI 3.0 子集（与 JSON Schema 2020-12 略有差异）。从 Gemini 3 开始并行调用具有唯一 ID。

### `tool_choice` 行为

所有提供商都支持三种模式，只是命名不同。

- **Auto。** 模型自行选择工具或文本。默认值。
- **Required / Any。** 模型必须调用至少一个工具。
- **None。** 模型不得调用工具。

加上每个提供商独有的模式：

- **OpenAI。** 按名称强制使用特定工具。
- **Anthropic。** 按名称强制使用特定工具；`disable_parallel_tool_use` 标志区分单次和多次调用。
- **Gemini。** `mode: "VALIDATED"` 将每个响应都通过模式验证器路由，无论模型意图如何。

### 并行调用

OpenAI 的 `parallel_tool_calls: true`（默认）在一条 assistant 消息中发出多个调用。你全部执行，然后用一条包含每个 `tool_call_id` 对应条目的批处理 tool 角色消息回复。Anthropic 历史上只做单次调用；`disable_parallel_tool_use: false`（自 Claude 3.5 起默认）启用多次调用。Gemini 2 允许并行调用但没有稳定的 ID；Gemini 3 添加了 UUID，因此无序响应可以干净地关联。

### 流式

三者都支持流式工具调用。网络格式不同：

- **OpenAI。** `tool_calls[i].function.arguments` 的 delta 块增量到达。你累积直到 `finish_reason: "tool_calls"`。
- **Anthropic。** Block-start / block-delta / block-stop 事件。`input_json_delta` 块携带部分参数。
- **Gemini。** `streamFunctionCallArguments`（Gemini 3 新增）发出带有 `functionCallId` 的块，因此多个并行调用可以交错传输。

第 13 阶段第 03 课深入研究并行 + 流式重组的细节。本课侧重于声明和单次调用形态。

### 错误与修复

参数无效的错误表现形式也不同。

- **OpenAI（非严格模式）。** 模型返回 `arguments: "{bad json}"`，你的 JSON 解析失败，你注入错误消息并重新调用。
- **OpenAI（严格模式）。** 验证在解码期间进行；无效 JSON 不可能出现，但可能出现 `refusal`。
- **Anthropic。** `input` 可能包含意外字段；模式仅供参考。需要服务端验证。
- **Gemini。** OpenAPI 3.0 的怪癖：对象字段上的 `enum` 会被静默忽略；需要自行验证。

### 转换器模式

你代码中的规范工具声明如下所示（你可以选择形态）：

```python
Tool(
    name="get_weather",
    description="当 ... 时使用",
    input_schema={"type": "object", "properties": {...}, "required": [...]},
    strict=True,
)
```

三个小函数将其转换为三种提供商的形状。`code/main.py` 中的框架正好做这件事，然后通过每个提供商的响应形状往返一次假的工具调用。不需要网络——本课讲授形态，而不是 HTTP。

生产团队将这个转换器包装在 `AbstractToolset`（Pydantic AI）、`UniversalToolNode`（LangGraph）或 `BaseTool`（LlamaIndex）中。第 13 阶段第 17 课提供了一个网关，它在三者中的任意一个前面暴露 OpenAI 形态的 API。

## 使用

`code/main.py` 定义了一个规范的 `Tool` 数据类和三个转换器，它们分别输出 OpenAI、Anthropic 和 Gemini 的声明 JSON。然后，它将每个提供商的一个人工构造的响应解析为相同的规范调用对象，证明语义在底层是相同的。运行它并排比较三种声明。

关注点：

- 三个声明块仅在封装和字段名上有所不同。
- 三个响应块的区别在于调用所在的位置（顶层 `tool_calls`、`content[]` 块、`parts[]` 条目）。
- 一个 `canonical_call()` 函数从所有三种响应形状中提取 `{id, name, args}`。

## 交付

本课生成 `outputs/skill-provider-portability-audit.md`。给定一个针对某个提供商的函数调用集成，该技能会生成一个可移植性审计报告：它依赖于哪些提供商限制、哪些字段需要重命名、以及在移植到其他提供商时什么会出问题。

## 练习

1. 运行 `code/main.py` 并验证三个提供商的声明 JSON 都序列化了同一个底层 `Tool` 对象。修改规范工具以添加一个枚举参数，并确认只有 Gemini 转换器需要处理 OpenAPI 的怪癖。

2. 为每个提供商添加一个 `ListToolsResponse` 解析器，提取模型在 `list_tools` 或发现调用后返回的工具列表。OpenAI 本身没有这个功能；注意这种不对称性。

3. 实现 `tool_choice` 转换：将一个规范的 `ToolChoice(mode="force", tool_name="x")` 映射到所有三种提供商的形态。然后映射 `mode="any"` 和 `mode="none"`。对照本课的差异表进行检查。

4. 选择三个提供商中的一个，从头到尾阅读其函数调用指南。找出其模式规范中其他两者不支持的一个字段。候选答案：OpenAI 的 `strict`、Anthropic 的 `disable_parallel_tool_use`、Gemini 的 `function_calling_config.allowed_function_names`。

5. 编写一个测试向量：参数违反声明模式的一个工具调用。通过每个提供商的验证器（第 01 课的标准库验证器可作为代理）运行它，并记录哪些错误被触发。记录你在生产环境中会为严格性选择哪个提供商。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|----------------|------------------------|
| 函数调用 | "工具使用" | 提供商级别的结构化工具调用发出 API |
| 工具声明 | "工具规格" | 名称 + 描述 + JSON Schema 输入载荷 |
| `tool_choice` | "强制/禁止" | Auto / required / none / 特定名称模式 |
| 严格模式 | "模式执行" | OpenAI 标志，约束解码以匹配模式 |
| `tool_use` 块 | "Anthropic 的调用形态" | 包含 id、name、input 的内联内容块 |
| `functionCall` 部分 | "Gemini 的调用形态" | 包含 name、args 和 id 的 `parts[]` 条目 |
| 参数即字符串 | "字符串化 JSON" | OpenAI 将 args 作为 JSON 字符串而非对象返回 |
| 并行工具调用 | "一次轮次中的扇出" | 一条 assistant 消息中的多个工具调用 |
| 拒绝 | "模型拒绝" | 严格模式下代替调用的 refusal 块 |
| OpenAPI 3.0 子集 | "Gemini 模式怪癖" | Gemini 使用类似 JSON Schema 的方言，有细微差异 |

## 延伸阅读

- [OpenAI — 函数调用指南](https://platform.openai.com/docs/guides/function-calling) — 权威参考，包括严格模式和并行调用
- [Anthropic — 工具使用概述](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview) — `tool_use` 和 `tool_result` 块语义
- [Google — Gemini 函数调用](https://ai.google.dev/gemini-api/docs/function-calling) — 并行调用、唯一 ID 和 OpenAPI 子集
- [Vertex AI — 函数调用参考](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling) — Gemini 的企业级接口
- [OpenAI — 结构化输出](https://platform.openai.com/docs/guides/structured-outputs) — 严格模式模式执行的详细信息
