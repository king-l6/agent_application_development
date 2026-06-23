# 综合项目 01 — 终端原生编码 Agent

> 到 2026 年，编码 Agent 的形态已经确定。TUI 框架、有状态计划、沙盒化工具表面、以及计划-执行-观察-恢复的循环。Claude Code、Cursor 3 和 OpenCode 从 50 英尺外看都是一样的。这个综合项目要求你端到端地构建一个——从 CLI 输入到 Pull Request 输出——并在 SWE-bench Pro 上与 mini-swe-agent 和 Live-SWE-agent 进行对比评估。你将学到，难点不在于模型调用，而在于工具循环、沙盒以及 50 轮运行的成本上限。

**类型：** 综合项目
**语言：** TypeScript / Bun（框架），Python（评估脚本）
**前置知识：** 阶段 11（LLM 工程）、阶段 13（工具与协议）、阶段 14（Agent）、阶段 15（自主系统）、阶段 17（基础设施）
**涉及阶段：** P0 · P5 · P7 · P10 · P11 · P13 · P14 · P15 · P17 · P18
**时间：** 35 小时

## 问题

编码 Agent 在 2026 年成为主导的 AI 应用类别。Claude Code（Anthropic）、带有 Composer 2 和 Agent Tabs 的 Cursor 3（Cursor）、Amp（Sourcegraph）、OpenCode（11.2 万星）、Factory Droids 和 Google Jules 都发布了相同架构的变体：一个终端框架、一个有权限的工具表面、一个沙盒，以及一个围绕前沿模型构建的计划-执行-观察循环。前沿很窄——Live-SWE-agent 使用 Opus 4.5 在 SWE-bench Verified 上达到了 79.2%——但工程技艺很广。大多数失败模式不是模型错误，而是工具循环不稳定、上下文中毒、失控的 token 成本以及破坏性的文件系统操作。

你无法从外部推理这些 Agent。你必须构建一个，观察循环在第 47 轮当 ripgrep 返回 8MB 匹配结果时崩溃，然后重建截断层。这就是这个综合项目的意义所在。

## 概念

框架有四个层面。**计划（Plan）** 维护一个 TodoWrite 风格的状态对象，模型每轮都会重写它。**执行（Act）** 分发工具调用（读取、编辑、运行、搜索、git）。**观察（Observe）** 捕获标准输出/标准错误/退出码，进行截断，并将摘要反馈回去。**恢复（Recover）** 处理工具错误，而不会撑爆上下文窗口或无限循环。2026 的形态增加了一件事：**钩子（Hooks）**。`PreToolUse`、`PostToolUse`、`SessionStart`、`SessionEnd`、`UserPromptSubmit`、`Notification`、`Stop` 和 `PreCompact`——可配置的扩展点，操作员可以在其中注入策略、遥测和安全护栏。

沙盒是 E2B 或 Daytona。每个任务在一个带有读写挂载的 git worktree 的新 devcontainer 中运行。框架从不接触宿主文件系统。worktree 在成功或失败时被拆除。成本控制通过三层实施：每轮 token 上限、每会话美元预算以及硬性的轮次限制（通常为 50）。可观测层是带有 GenAI 语义约定的 OpenTelemetry span，发送到自托管的 Langfuse。

## 架构

```
  user CLI  ->  harness (Bun + Ink TUI)
                  |
                  v
           plan / act / observe loop  <--->  Claude Sonnet 4.7 / GPT-5.4-Codex / Gemini 3 Pro
                  |                          (via OpenRouter, model-agnostic)
                  v
           tool dispatcher (MCP StreamableHTTP client)
                  |
     +------------+------------+----------+
     v            v            v          v
  read/edit    ripgrep     tree-sitter   git/run
     |            |            |          |
     +------------+------------+----------+
                  |
                  v
           E2B / Daytona sandbox  (worktree isolated)
                  |
                  v
           hooks: Pre/Post, Session, Prompt, Compact
                  |
                  v
           OpenTelemetry -> Langfuse (spans, tokens, $)
                  |
                  v
           PR via GitHub app
```

## 技术栈

- 框架运行时：Bun 1.2 + Ink 5（终端内 React）
- 模型访问：OpenRouter 统一 API，支持 Claude Sonnet 4.7、GPT-5.4-Codex、Gemini 3 Pro、Opus 4.5（用于最难的任务）
- 工具传输：模型上下文协议 StreamableHTTP（MCP 2026 修订版）
- 沙盒：E2B 沙盒（JS SDK）或 Daytona devcontainers
- 代码搜索：ripgrep 子进程，17 种语言的 tree-sitter 解析器（预编译）
- 隔离：每个任务 `git worktree add`，成功/失败时清理
- 评估框架：SWE-bench Pro（已验证子集）+ Terminal-Bench 2.0 + 你自己的 30 任务保留集
- 可观测性：OpenTelemetry SDK，带有 `gen_ai.*` 语义约定 → 自托管 Langfuse
- PR 发布：带有细粒度 token 的 GitHub App，范围限制在目标仓库

## 构建步骤

1. **TUI 和命令循环。** 使用 Ink 搭建 Bun 项目。接受 `agent run <repo> "<task>"`。打印分屏视图：计划面板（顶部）、工具调用流（中间）、token 预算（底部）。添加 Ctrl-C 取消功能，在退出前触发 `SessionEnd` 钩子。

2. **计划状态。** 定义类型化的 TodoWrite 模式（待处理/进行中/已完成项目，附带备注）。模型每轮通过工具调用重写完整状态——不要让它增量变更。将计划持久化到 `.agent/state.json`，以便崩溃后可以恢复。

3. **工具表面。** 定义六个工具：`read_file`、`edit_file`（带差异预览）、`ripgrep`、`tree_sitter_symbols`、`run_shell`（带超时）、`git`（status/diff/commit/push）。通过 MCP StreamableHTTP 暴露，使框架与传输无关。每个工具返回截断的输出（每次调用上限 4k token）。

4. **沙盒封装。** 每个任务生成一个 E2B 沙盒。`git worktree add -b agent/$TASK_ID` 一个新分支。所有工具调用在沙盒内部执行。宿主文件系统不可访问。

5. **钩子。** 实现全部八个 2026 钩子类型。接入至少四个用户编写的钩子：(a) `PreToolUse` 破坏性命令防护，阻止 worktree 外部的 `rm -rf`，(b) `PostToolUse` token 记账，(c) `SessionStart` 预算初始化，(d) `Stop` 写入最终的追踪包。

6. **评估循环。** 克隆 SWE-bench Pro Python 的 30 个问题的子集。对每个问题运行你的框架。与 mini-swe-agent（最小基线）在 pass@1、每任务轮次和每任务美元成本上进行对比。将结果写入 `eval/results.jsonl`。

7. **成本控制。** 硬性截断：50 轮、200k 上下文、每任务 5 美元。`PreCompact` 钩子在达到 150k 标记时将较旧的轮次总结为先前状态块，为新的观察释放空间而不丢失计划。

8. **PR 发布。** 成功时，最后一步是 `git push` + 一个 GitHub API 调用，打开一个包含计划和差异摘要的 PR。

## 使用方式

```
$ agent run ./my-repo "Fix the race condition in worker.rs"
[plan]  1 locate worker.rs and enumerate mutex uses
        2 identify shared state under contention
        3 propose fix, verify tests
[tool]  ripgrep mutex.*lock -t rust           (44 matches, truncated)
[tool]  read_file src/worker.rs 120..180
[tool]  edit_file src/worker.rs (+8 -3)
[tool]  run_shell cargo test worker::          (passed)
[plan]  1 done · 2 done · 3 done
[done]  PR opened: #482   turns=9   tokens=38k   cost=$0.41
```

## 交付物

可交付的技能文件位于 `outputs/skill-terminal-coding-agent.md`。给定仓库路径和任务描述，它在沙盒中运行完整的计划-执行-观察循环，并返回 PR URL 和追踪包。这个综合项目的评分标准：

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | SWE-bench Pro pass@1 与基线对比 | 你的框架与 mini-swe-agent 在 30 个匹配的 Python 任务上对比 |
| 20 | 架构清晰度 | 计划/执行/观察分离、钩子表面、工具模式——对照 Live-SWE-agent 布局审查 |
| 20 | 安全性 | 沙盒逃逸测试、权限提示、破坏性命令防护通过红队测试 |
| 20 | 可观测性 | 追踪完整性（100% 工具调用有 span）、每轮 token 记账 |
| 15 | 开发者体验 | 冷启动 < 2s、崩溃恢复可继续计划、Ctrl-C 中途干净取消 |
| **100** | | |

## 练习

1. 将底层模型从 Claude Sonnet 4.7 切换到在 vLLM 上服务的 Qwen3-Coder-30B。对比 pass@1 和每任务美元成本。报告开源模型在哪些方面表现不佳。

2. 添加一个 `reviewer` 子 Agent，在 PR 发布前读取差异，可以请求修改循环。测量虚假正面审查是否会将 SWE-bench 通过率降到单 Agent 基线以下（提示：通常是）。

3. 压力测试沙盒：编写一个尝试 `curl` 外部 URL 的任务，以及一个在 worktree 外写入文件的任务。确认两者都被 PreToolUse 钩子阻止。记录尝试日志。

4. 使用较小模型（Haiku 4.5）实现 `PreCompact` 摘要。测量在 3 倍压缩下丢失了多少计划保真度。

5. 将 MCP StreamableHTTP 传输切换为 stdio。基准测试冷启动和每次调用的延迟。为纯本地使用选择一个优胜者。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 框架（Harness） | "Agent 循环" | 围绕模型的代码，分发工具、维护计划状态、执行预算 |
| 钩子（Hook） | "Agent 事件监听器" | 用户在八个生命周期事件之一上编写的脚本，由框架执行 |
| Worktree | "Git 沙盒" | 在独立路径上的链接 git 检出；可丢弃而不影响主克隆 |
| TodoWrite | "计划状态" | 待处理/进行中/已完成项目的类型化列表，模型每轮重写 |
| StreamableHTTP | "MCP 传输" | 2026 MCP 修订版：长连接 HTTP，双向流式传输；取代 SSE |
| Token 上限 | "上下文预算" | 每轮或每会话的输入+输出 token 上限；触发压缩或终止 |
| pass@1 | "单次尝试通过率" | 首次运行即解决的 SWE-bench 任务比例，无需重试或偷看测试集 |

## 延伸阅读

- [Claude Code 文档](https://docs.anthropic.com/en/docs/claude-code) — Anthropic 的参考框架
- [Cursor 3 更新日志](https://cursor.com/changelog) — Agent Tabs 和 Composer 2 产品说明
- [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — SWE-bench 框架对比的最小基线
- [Live-SWE-agent](https://github.com/OpenAutoCoder/live-swe-agent) — 使用 Opus 4.5 达到 79.2% SWE-bench Verified
- [OpenCode](https://opencode.ai) — 开源框架，11.2 万星
- [SWE-bench Pro 排行榜](https://www.swebench.com) — 这个综合项目对标评估
- [模型上下文协议 2026 路线图](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) — StreamableHTTP、能力元数据
- [OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — 工具调用和 token 使用量的 span 模式
