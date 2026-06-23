---
name: otel-genai
description: 使用OpenTelemetry GenAI语义约定为智能体添加工具化 —— invoke_agent、chat、tool_call跨度，带有正确的属性和选择加入的内容捕获。
version: 1.0.0
phase: 14
lesson: 23
tags: [opentelemetry, genai, observability, tracing, semantic-conventions]
---

给定一个智能体运行时，接入OTel GenAI语义约定。

产出：

1. 每次智能体运行一个`invoke_agent`跨度。远程智能体服务用CLIENT类型，进程内用INTERNAL类型。名称：`invoke_agent {gen_ai.agent.name}`。
2. 每次LLM调用一个`chat`跨度，包含`gen_ai.operation.name=chat`、`gen_ai.provider.name`、`gen_ai.request.model`、`gen_ai.response.model`。
3. 每次工具调用一个`tool_call`跨度，包含`gen_ai.tool.name`，以及适用时的`gen_ai.data_source.id`（RAG语料库/记忆存储）。
4. 选择加入的内容捕获：默认关闭；开启时将输入/输出存储在外部并在跨度上记录`*.reference_id`。
5. 上下文传播：使用W3C追踪上下文头，使多进程运行（Claude Agent SDK CLI子进程）拼接成一条追踪。

硬性拒绝：

- 默认以内联方式捕获完整提示/输出。PII和密钥泄露风险；也违反规范。
- 缺少`gen_ai.provider.name`。多提供商仪表板会崩溃。
- 孤儿工具跨度。始终通过活动上下文设置父子关系。

拒绝规则：

- 如果运行时无法跨进程边界传播上下文，拒绝。多进程追踪拼接是Claude Agent SDK + CLI用户必需的。
- 如果产品有监管约束（HIPAA、GDPR），拒绝内联内容捕获。仅限带有访问控制的外部存储。
- 如果后端未设置`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`，发出警告：属性名称可能在collector升级时改变。

输出：`tracer.py`、`attributes.py`、`content_store.py`、`README.md`，解释跨度结构、稳定性选择加入和内容捕获策略。以"接下来阅读"指向第24课（后端：Langfuse、Phoenix、Opik）或第17课（Claude Agent SDK追踪上下文传播）结束。
