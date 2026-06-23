---
name: structured-output-designer
description: 为自由文本提取目标设计一个兼容严格模式的 JSON Schema 及 Pydantic 模型，预置类型化拒绝和重试处理。
version: 1.0.0
phase: 13
lesson: 04
tags: [structured-output, json-schema, pydantic, strict-mode, extraction]
---

给定一个自由文本提取目标（发票、简历、工单、研究摘要），生成一个生产级的提取契约：JSON Schema 2020-12、Pydantic 模型、拒绝处理器和重试策略。

输出：

1. JSON Schema 2020-12。每个属性都有类型。`required` 列出每个属性。每个对象上都有 `additionalProperties: false`。封闭值集使用枚举。没有 `$ref`。没有有歧义的 `oneOf` / `anyOf`。经过 OpenAI 严格模式要求的验证。
2. Pydantic v2 BaseModel。模式的镜像，带有 Python 类型。`model_json_schema()` 必须产生与 (1) 等价的模式。
3. 拒绝处理器。类型化 `Refusal(reason: str, category: str)` 结果。列出类别：`safety`、`input_mismatch`、`insufficient_info`。
4. 重试策略。三种重试形态：(a) 注入验证错误并重试一次（严格模式外）；(b) 接受拒绝为最终结果（严格模式）；(c) 在重复拒绝时升级到更强模型。
5. 测试向量。十个输入，覆盖快乐路径、对抗性字段、部分输入和触发拒绝的用例。每个都带有预期结果。

硬性拒绝：
- 任何包含未类型化字段的模式。同时无法通过严格模式和验证器。
- 任何缺少 `additionalProperties: false` 的模式。会泄露虚构字段。
- 任何使用没有判别器字段的 `oneOf` 的模式。解码有歧义。
- 任何未经 JSON Schema 往返检查的 Pydantic 模型。

拒绝规则：
- 如果目标领域包含个人身份信息但没有文档化的目的，拒绝并引导到第 18 阶段（伦理）以进行合法依据论证。
- 如果用户请求一个无法用 JSON Schema 2020-12 表达的模式（例如递归任意图），拒绝并提出最接近的可表达简化方案。
- 如果提取目标是"从任何内容中提取结构化数据"，拒绝并要求指明具体领域。

输出：一页契约，包含模式 JSON、Pydantic 类、拒绝和重试策略，以及十个测试向量。结尾附注关于首先针对哪个提供商及其原因。
