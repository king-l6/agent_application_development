# 并行工具调用与流式工具使用

> 三次独立的天气查询串行执行需要三次往返。并行运行它们，总时间就会缩减到最慢单次调用的时间。每个前沿提供商现在都在单次轮次中发出多个工具调用。收益是真实的；底层通信机制是精妙的。本课讲解两个方面：并行扇出和流式参数重组，重点强调 ID 关联陷阱。

**类型：** 构建
**语言：** Python（标准库、线程池 + 流式框架）
**前置知识：** 第 13 阶段第 02 课（函数调用深入）
**时间：** 约 75 分钟

## 学习目标

- 解释为什么存在 `parallel_tool_calls: true` 以及何时禁用它。
- 在并行扇出期间将流式参数块关联到正确的工具调用 ID。
- 将部分 `arguments` 字符串重组为完整的 JSON 而不过早解析。
- 运行一个三城市天气基准测试，展示串行与并行的延迟差异。

## 问题

没有并行调用，回答"班加罗尔、东京和苏黎世的天气如何"的 agent 会这样做：

```
用户 -> LLM
LLM -> 调用 get_weather(Bengaluru)
宿主 -> 运行执行器，回复结果
LLM -> 调用 get_weather(Tokyo)
宿主 -> 运行执行器，回复结果
LLM -> 调用 get_weather(Zurich)
宿主 -> 运行执行器，回复结果
LLM -> 最终文本回答
```

三次 LLM 往返，每次还要承担执行器的延迟。大约是理想墙钟时间的 4 倍。

有了并行调用：

```
用户 -> LLM
LLM -> 调用 get_weather(Bengaluru); 调用 get_weather(Tokyo); 调用 get_weather(Zurich)
宿主 -> 并发运行所有三个执行器，回复三个结果
LLM -> 最终文本回答
```

一次 LLM 往返。执行器时间是三者中的最大值，而非总和。在 OpenAI、Anthropic 和 Gemini 上的生产基准测试显示，扇出工作负载的墙钟时间减少了 60% 到 70%。

代价是关联复杂性。当三个调用无序完成时，你的结果必须携带匹配的 `tool_call_id`，以便模型能够将它们对应起来。当结果流式传输时，你必须在执行前将部分参数片段组装成完整的 JSON。Gemini 3 添加唯一 ID 的部分原因就是为了解决两个对同一工具的并行调用无法区分这个真实世界的问题。

## 概念

### 启用并行

- **OpenAI。** `parallel_tool_calls: true` 默认开启。设为 `false` 强制串行。
- **Anthropic。** 通过 `disable_parallel_tool_use: false` 启用并行（Claude 3.5 及以上版本默认）。设为 `true` 表示串行。
- **Gemini。** 始终支持并行；`tool_config.function_calling_config.mode = "AUTO"` 让模型决定。

当工具存在顺序依赖关系（`create_file` 然后 `write_file`）、一个调用的输出是另一个调用的输入时、或者速率限制器无法处理扇出时，禁用并行。

### ID 关联

模型发出的每个调用都有一个 `id`。宿主返回的每个结果都必须包含相同的 `id`。没有这个，结果就是有歧义的。

- **OpenAI。** 每个 tool 角色消息上的 `tool_call_id`。
- **Anthropic。** 每个 `tool_result` 块上的 `tool_use_id`。
- **Gemini。** 每个 `functionResponse` 上的 `id`（Gemini 3 及以上版本；Gemini 2 按名称匹配，这在同名并行调用上会出问题）。

### 并发运行调用

宿主在其自己的线程、协程或远程工作者上运行每个调用的执行器。最简单的框架使用线程池；生产环境使用 asyncio 配合 `asyncio.gather` 或结构化并发。完成顺序不可预测——id 就是标识符。

一个常见错误：按调用列表顺序而非完成顺序回复结果。这通常能工作，因为模型只关心 `tool_call_id`，但如果一个结果被丢弃或重复，无序提交通常会让调试变得更困难。建议用显式 id 按完成顺序回复。

### 流式工具调用

当模型流式传输时，`arguments` 分片到达。三个并行调用的三个独立块流会在网络上交错传输。你需要每个 id 一个累加器。

各提供商的形态：

- **OpenAI。** 每个块是 `choices[0].delta.tool_calls[i].function.arguments`（部分字符串）。块携带 `index`（在调用列表中的位置）。你按索引累积，在 `id` 首次出现时读取它，并在 `finish_reason = "tool_calls"` 时解析 JSON。
- **Anthropic。** 流事件是 `message_start`，然后每个块一个 `content_block_start`，类型为 `tool_use`（包含 id、name、空的 input）。`content_block_delta` 事件携带 `input_json_delta` 块。`content_block_stop` 关闭每个块。
- **Gemini。** `streamFunctionCallArguments`（Gemini 3 及以上版本）发出带有 `functionCallId` 的块，因此调用可以干净地交错传输。在 Gemini 3 之前，流式一次返回一个完整的调用。

### 部分 JSON 与过早解析陷阱

在 `arguments` 完整之前，你不能解析它。像 `{"city": "Beng` 这样的部分 JSON 是无效的，会报错。正确的门控信号是提供商的调用结束信号：OpenAI 的 `finish_reason = "tool_calls"`、Anthropic 的 `content_block_stop` 或 Gemini 的流结束事件。只有在这时才尝试 `json.loads`。更稳健的方法使用增量 JSON 解析器，在结构完成时产生事件；OpenAI 的流式指南推荐用于显示实时"思考"指示器。括号计数作为完整性检查不可靠（引号字符串或转义内容中的括号会导致误报），只应作为非正式的调试启发式方法。

### 无序完成

```
call_A: 快速 API，首先返回
call_B: 慢速 API，其次返回
call_C: 中等 API，第三返回
```

宿主的回复仍然必须引用 id：

```
[{role: "tool", tool_call_id: "call_A", content: ...},
 {role: "tool", tool_call_id: "call_B", content: ...},
 {role: "tool", tool_call_id: "call_C", content: ...}]
```

回复中的顺序对于 OpenAI 或 Anthropic 的正确性并不重要。只要 id 匹配，Gemini 接受任何顺序。

### 基准测试：串行 vs 并行

`code/main.py` 中的框架模拟了三个延迟分别为 400、600 和 800 毫秒的执行器。串行运行总耗时 1800 毫秒。并行运行耗时 max(400, 600, 800) = 800 毫秒。差异是恒定的而非比例的，因此节省随工具数量增加而增长。

现实世界的注意事项：并行调用会给下游 API 带来压力。一个 10 路扇出到一个受速率限制的服务会失败。第 13 阶段第 17 课介绍了网关级的背压；重试语义计划在未来的阶段中涵盖。

### 流式扇出墙钟时间

如果模型本身是流式的，你可以在一个调用的参数完整后立即开始执行，而不是等待所有调用完成。这是 OpenAI 记录的一种优化，但不是所有 SDK 都暴露它。本课的框架就是这样做的：一旦模拟流产生了一个完整的参数对象，宿主就会启动该调用。

## 使用

`code/main.py` 有两部分。第一部分使用 `concurrent.futures.ThreadPoolExecutor` 串行和并行地运行三个模拟的天气调用，并打印墙钟时间。第二部分重放一个假的流式响应——三个并行调用的 `arguments` 块在一条流上交错——并使用 `StreamAccumulator` 按 id 重组它们。不需要 LLM，不需要网络，只需要重组逻辑。

关注点：

- 串行定时器达到 1.8 秒。并行定时器在相同的模拟延迟上达到 0.8 秒。
- 累加器通过按 id 缓冲并在每个调用的 JSON 完整时才解析，来处理无序到达的块。
- 执行器在某个 id 的参数完成时立即启动，而不是在所有流结束后。

## 交付

本课生成 `outputs/skill-parallel-call-safety-check.md`。给定一个工具注册表，该技能审计哪些工具可以安全并行化、哪些有顺序依赖关系、以及哪些会压垮下游速率限制——返回一个带有每个工具 `parallel_safe` 标志的修订注册表。

## 练习

1. 运行 `code/main.py` 并改变模拟的延迟。确认并行与串行的比率大约是 `max/sum`（由于线程调度、序列化和框架开销，实际运行会与理想值略有偏差）。在什么样的延迟分布下并行不再重要？

2. 扩展累加器以处理"调用在流中途中被取消"的情况，通过丢弃其缓冲区并发出一个 `cancelled` 事件来实现。哪个提供商明确记录了这种情况？查看 Anthropic 的 `content_block_stop` 语义和 OpenAI 的 `finish_reason: "length"` 行为。

3. 用 `asyncio.gather` 替换线程池。对两者进行基准测试。由于上下文切换成本更低，你应该会在 async 上看到小幅优势，但前提是执行器做的是真正的 I/O 操作。

4. 选择两个不应该并行化的工具（例如 `create_file` 然后 `write_file`）。向注册表添加一个 `ordering_dependency` 图，并在该图上门控并行扇出。这是依赖感知调度的最小机制，未来的 agent 工程阶段将对其进行形式化。

5. 阅读 OpenAI 的并行函数调用部分和 Anthropic 的 `disable_parallel_tool_use` 文档。找出 Anthropic 建议禁用并行性的一个现实世界工具类型。（提示：对同一资源的后果性变更。）

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|----------------|------------------------|
| 并行工具调用 | "一次轮次中的扇出" | 模型在一条 assistant 消息中发出多个工具调用 |
| `parallel_tool_calls` | "OpenAI 的标志" | 启用或禁用多次调用发出 |
| `disable_parallel_tool_use` | "Anthropic 的反向标志" | 选择退出标志；默认启用并行 |
| 工具调用 ID | "关联句柄" | 每个调用的标识符，结果消息必须回显 |
| 累加器 | "流缓冲区" | 每个 ID 的部分 `arguments` 块的字符串缓冲区 |
| 无序完成 | "最快优先" | 并行调用以不可预测的顺序完成；ID 是粘合剂 |
| 依赖图 | "排序约束" | 输出是其他工具输入的工具；不可并行化 |
| 过早解析陷阱 | "JSON.parse 崩溃" | 尝试解析不完整的 `arguments` 字符串 |
| `streamFunctionCallArguments` | "Gemini 3 功能" | 每个调用带有唯一 ID 的流式参数块 |
| 完成顺序回复 | "不要等待全部" | 在结果到达时按 id 键回复 |

## 延伸阅读

- [OpenAI — 并行函数调用](https://platform.openai.com/docs/guides/function-calling#parallel-function-calling) — 默认行为与选择退出标志
- [Anthropic — 工具使用：实现工具使用](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implementing-tool-use) — `disable_parallel_tool_use` 与结果批处理
- [Google — Gemini 函数调用并行部分](https://ai.google.dev/gemini-api/docs/function-calling) — Gemini 3 的 ID 关联并行调用
- [OpenAI — 带工具的流式响应](https://platform.openai.com/docs/api-reference/responses-streaming) — OpenAI 流的分块参数重组
- [Anthropic — 流式消息](https://docs.anthropic.com/en/api/messages-streaming) — 带有 `input_json_delta` 的 `content_block_delta`
