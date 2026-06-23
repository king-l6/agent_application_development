---
name: terminal-coding-agent
description: 构建并评估一个终端原生编码 Agent，在 SWE-bench Pro 上进行评估，具有成本上限、沙盒化工具和完整的 2026 钩子系统。
version: 1.0.0
phase: 19
lesson: 01
tags: [capstone, coding-agent, claude-code, swe-bench, mcp, hooks, sandbox]
---

给定一个目标仓库和一个自然语言任务，构建一个框架，进行计划、在沙盒中执行并打开 Pull Request。在 30 个任务的 SWE-bench Pro 子集上达到或超过 mini-swe-agent 基线，同时保持在每任务 5 美元的预算内。

构建计划：

1. 搭建一个 Bun + Ink TUI 框架，包含计划面板、工具调用流和实时 token/美元预算显示。
2. 通过模型上下文协议 StreamableHTTP 定义六个工具（read_file、edit_file、ripgrep、tree_sitter_symbols、run_shell、git）。每次调用最多返回 4k token。
3. 每个工具调用在 E2B 或 Daytona 沙盒内的新 `git worktree add` 分支上执行。绝不接触宿主文件系统。
4. 接入全部八个 2026 钩子事件：SessionStart、SessionEnd、PreToolUse、PostToolUse、UserPromptSubmit、Notification、Stop、PreCompact。至少提供四个用户编写的钩子（破坏性命令防护、token 记账、OTel span 发射器、追踪包写入器）。
5. 执行三层预算：50 轮、200k token、5 美元。PreCompact 在 150k 触发，总结较旧的轮次。
6. 向自托管的 Langfuse 发出带有 GenAI 语义约定的 OpenTelemetry span。
7. 成功后，推送分支并使用计划和追踪包作为正文打开 PR。
8. 在 SWE-bench Pro Python 的 30 个问题子集上评估，与 mini-swe-agent 对比，记录每个任务的 pass@1、轮次、token 和美元成本。

评估标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | SWE-bench Pro pass@1 | 匹配的 30 任务子集 vs mini-swe-agent 基线 |
| 20 | 架构清晰度 | 计划/执行/观察分离、钩子表面、工具模式可读性 |
| 20 | 安全性 | 沙盒逃逸红队测试 + 破坏性命令防护审计 |
| 20 | 可观测性 | 100% 工具调用有 span，每轮 token 记账 |
| 15 | 开发者体验 | 冷启动 2s 内、崩溃恢复、Ctrl-C 取消语义 |

硬性拒绝：

- 在宿主文件系统上（而不是沙盒内）执行 git 命令的框架。
- 任何可以在 worktree 外写入或 curl 外部 URL 而没有明确允许列表钩子的 Agent。
- 没有在相同 30 个问题上运行匹配基线就报告的评估数字。
- 依赖 `git reset --hard` 在重试之间清洗的"通过率"声明；SWE-bench Pro 是 pass@1。

拒绝规则：

- 在任何配置下拒绝直接推送到 main。仅限 PR 分支。
- 拒绝禁用破坏性命令防护。这是评分标准的硬性要求。
- 拒绝在没有预算上限的情况下运行。无限运行会污染评估对比。

输出：一个包含框架、固定的 30 任务 SWE-bench Pro 评估框架（带匹配的 mini-swe-agent 基线运行）、至少 5 次完整运行的 OpenTelemetry 追踪存档、以及一份报告的仓库。报告说明你的框架解决了哪些基线无法解决的任务，反之亦然。最后总结你观察到的三大失败模式以及修复每个模式所需的钩子变更。
