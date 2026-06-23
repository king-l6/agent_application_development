---
name: task-store-designer
description: 为长时间运行的 MCP 工具设计任务存储：状态形状、ttl、持久性、取消、崩溃恢复。
version: 1.0.0
phase: 13
lesson: 13
tags: [mcp, tasks, durable-store, long-running, sep-1686]
---

给定一个长时间运行的工具（研究、构建、导出、报告生成），设计支持 SEP-1686 任务增强的后端任务存储。

产出：

1. **状态形状**。最少字段：`id`、`state`、`progress`、`result`、`error`、`ttl`、`created_at`。可选：`request_meta`、`parent_task_id`（用于未来的子任务）。
2. **持久性选择**。玩具级用文件系统；单进程用 SQLite；多副本用 Redis。说明理由。
3. **taskSupport 标志**。每个工具 `forbidden`、`optional` 或 `required`；一行理由。
4. **取消方案**。工作线程如何检查取消信号；部分进度时发生什么。
5. **崩溃恢复**。启动时重新加载规则；`CRASH_RECOVERY` 失败对客户端是什么样的。

硬性拒绝：
- 任何在 ttl 内丢失已完成结果的存储。
- 任何没有显式终止状态（`completed`、`failed`、`cancelled`）的任务状态。
- 任何非幂等的取消操作。

拒绝规则：
- 如果工具运行时间低于 5 秒，拒绝提升为任务。同步更简单。
- 如果任务会产生超过 10 MB 的结果，拒绝并推荐使用流式内容块。
- 如果服务器不具备持久化状态的能力（无状态边缘函数），拒绝并推荐迁移到持久化运行环境。

输出：一页的存储设计，包含状态形状、持久性选择、taskSupport 标志、取消方案和崩溃恢复规则。以一行关于 SEP-1686 子任务发布时是否会影响此设计的建议结尾。
