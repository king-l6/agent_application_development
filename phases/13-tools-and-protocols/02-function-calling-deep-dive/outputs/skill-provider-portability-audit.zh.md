---
name: provider-portability-audit
description: 审计针对一个提供商的函数调用集成，查明移植到其他两个提供商时会出现什么问题。
version: 1.0.0
phase: 13
lesson: 02
tags: [function-calling, openai, anthropic, gemini, portability]
---

给定一个针对某个提供商（OpenAI、Anthropic 或 Gemini）的函数调用集成，生成一个可移植性审计报告，列出相同的逻辑部署到其他两个提供商时需要处理的每一个字段重命名、行为差异和硬性限制冲突。

输出：

1. 声明差异。对于集成中的每个工具，展示在其他两个提供商上所需的封装/字段重命名/模式转换。标记目标提供商不支持的 JSON Schema 构造（Gemini：OpenAPI 3.0 子集；OpenAI 严格模式：不支持 `$ref`、不支持有歧义的 `oneOf`）。
2. 响应差异。记录工具调用在每个提供商的响应形态中的位置（`tool_calls[]` vs `content[]` 块 vs `parts[]` 条目），以及谁负责解析 `arguments`（OpenAI 是字符串，Anthropic 和 Gemini 是对象）。
3. `tool_choice` 差异。将集成当前的选项设置（auto / forbid / force / required）映射到目标提供商的形态；标记缺失的模式。
4. 限制冲突。报告工具数量（128 / 64 / 64）、模式深度（5 / 10 / 实际上无限制）和每个参数的长度上限。对任何超出目标提供商限制的集成提升至 block 严重程度。
5. 严格模式映射。说明严格模式语义在目标上是否保留。OpenAI 的 `strict: true` 在 Anthropic 上没有完全等价的选项；Gemini 的 `responseSchema` 近似但位于请求级别。

硬性拒绝：
- 任何假设 `arguments` 在非 OpenAI 目标上是字符串的集成。会静默产生错误结果。
- 任何在移植到 Anthropic 或 Gemini 时工具数量超过 64 且没有路由器的集成。
- 任何在模式中使用 `$ref` 而目标是 OpenAI 严格模式的集成。

拒绝规则：
- 如果被要求移植依赖于没有对等项的提供商特有功能（例如 OpenAI Responses API 的有状态轮次、Anthropic 的计算机使用块）的集成，拒绝并说明哪些功能在目标上没有对等项。
- 如果被要求选择赢家，拒绝。选择取决于宿主的严格模式需求、成本画像和并行调用要求。

输出：一页审计报告，包含每个工具的差异表、限制表以及每个目标提供商的最终"移植裁定"（ship / needs-router / blocked-by-feature）。结尾用一句话指出最具价值的迁移变更。
