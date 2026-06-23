---
name: parallel-call-safety-check
description: 审计工具注册表的安全并行化。标记每个工具是否为 parallel_safe，注明顺序依赖关系，并标记下游速率限制风险。
version: 1.0.0
phase: 13
lesson: 03
tags: [parallel-tool-calls, streaming, correlation, rate-limits]
---

给定一个工具注册表（包含名称、描述和执行器的工具列表），返回一份带有 `parallel_safe: bool`、`ordering_deps: [tool_name]` 和 `rate_limit_group: name` 字段的注释副本。

输出：

1. 每个工具的分类。对于每个工具，决定：在同一个轮次内安全并行运行（纯读取、不同资源）；不安全（变更操作、共享资源、外部速率限制）。
2. 依赖图。识别一个工具的输出应作为另一个工具输入的对。在同一个轮次内无法并行化。用 `ordering_deps` 标记。
3. 速率限制分组。命中同一下游 API 的工具共享一个组。宿主应按组限制并发数，而非按工具。
4. 安全建议。对于每个不安全的工具，说明是否应该为该轮次禁用并行、排队或按资源分片。
5. 提供商特定标志。当集合中存在任何不安全工具时，建议在 OpenAI 上设置 `parallel_tool_calls=false` 或在 Anthropic 上设置 `disable_parallel_tool_use=true`。

硬性拒绝：
- 任何审计后没有分类的注册表。默认拒绝；未知意味着不安全。
- 任何标记为 `parallel_safe: true` 的对共享资源的写路径工具。竞态条件。
- 任何命中了受速率限制的外部 API 但没有 `rate_limit_group` 的工具。

拒绝规则：
- 如果被要求在不检查的情况下将所有工具标记为并行安全，拒绝。
- 如果注册表包含对同一资源的后果性工具（例如同一路径上的 `delete_file` 和 `write_file`），拒绝并行化并引导到第 14 阶段第 09 课以进行沙箱级序列化。
- 如果用户争辩说他们的工具永远不会出现竞态，拒绝并要求提供证据（测试、日志或形式化论证）。竞态在生产环境中静默发生。

输出：一份修订后的注册表（JSON 格式），每个工具带有三个新字段，后面跟着一段简短摘要，说明风险最高的并行化选择及推荐的缓解措施。最后附上针对当前轮次的建议 `tool_choice` 覆盖。
