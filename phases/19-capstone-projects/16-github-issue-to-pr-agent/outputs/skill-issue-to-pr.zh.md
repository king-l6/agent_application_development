---
name: issue-to-pr
description: 构建一个异步 GitHub issue 到 PR 的智能体，在云沙箱中运行，重现构建，验证测试，并在严格的每仓库预算内打开可审查的 PR。
version: 1.0.0
phase: 19
lesson: 16
tags: [capstone, async-agent, github, fargate, daytona, swe-bench, budget, safety]
---

给定一个带有标记为 `@agent fix this` 的 issue 的 GitHub 仓库，交付一个自托管云智能体，将每个标记的 issue 转化为可审查的 PR，带有限定范围的凭证和有限的成本。

构建计划：

1. 带细粒度令牌的 GitHub App：issues 读写、PRs 写入、contents 读写、workflows 读取。禁止强制推送。main 上的分支保护防止直接写入。
2. Webhook 接收器（Lambda 或 Fly.io）过滤标签 / PR 评论事件并入队到 SQS。
3. 调度器强制执行每仓库每天的美元和 PR 数量上限；为每个允许的任务启动 ECS Fargate 任务。
4. 环境推断：从仓库内容检测语言 + 包管理器 + 运行时。如果不存在，动态合成 Dockerfile。
5. 每个任务的 Daytona 或 E2B 沙箱。将仓库克隆到新的 `git worktree` + 智能体分支。
6. 智能体循环（基于 Claude Opus 4.7 或 GPT-5.4-Codex 的 mini-swe-agent 或 SWE-agent v2）。工具：ripgrep、tree-sitter 仓库映射、read_file、edit_file、run_tests、git。上限：$20、30 轮次、30 分钟。
7. 验证：沙箱内完整 CI；通过 jacoco / coverage.py 的覆盖率差异；如果差异 < -2% 标记 `needs-review`；如果 CI 为红则停止。
8. 通过 GitHub API 打开 PR，带有理由、差异摘要、追踪 URL、成本、轮次。
9. 可观测性：每个 PR 的 Langfuse 追踪；日志擦除机密；每仓库预算仪表盘。
10. 在 30 个种子内部 issue 上评估；与 Cursor Background Agents 和 AWS Remote SWE Agents 在三个共享 issue 子集上比较。

评估评分标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 30 个 issue 的通过率 | 端到端成功（CI 绿灯 + 覆盖率 OK） |
| 20 | PR 质量 | 差异大小、覆盖率差异、风格一致性 |
| 20 | 每个解决 issue 的成本和延迟 | $/PR 和墙钟/PR |
| 20 | 安全性 | 限定范围令牌、每仓库预算、无强制推送、凭证卫生 |
| 15 | 操作员 UX | 理由注释、重试机制、@提及跟进 |

硬性拒绝：

- 任何可以强制推送的智能体。硬性排除。
- 跳过预算检查的调度器。失控循环是经典的失败模式。
- 没有在沙箱中通过完整 CI 就打开的 PR。
- 包含未脱敏令牌或 PII 的追踪归档。

拒绝规则：

- 拒绝在没有 main 分支保护的情况下安装。
- 拒绝在没有每仓库每日预算（美元和 PR 数量）的情况下运行。
- 拒绝自动重试失败运行；所有重试需要人工重新应用标签。

输出：一个包含 GitHub App、webhook 接收器、调度器 + 预算账本、Fargate 任务定义、沙箱生命周期管理器、mini-swe-agent 循环、30 个 issue 评估运行、与 Cursor Background Agents 和 AWS Remote SWE Agents 的并排比较，以及一份命名前三个构建推断失败以及减少每个失败的方法的文档。
