# 综合项目 16 — GitHub Issue 到 PR 的自律智能体

> AWS Remote SWE Agents、Cursor Background Agents、OpenAI Codex 云和 Google Jules 都提供了相同的 2026 年产品形态：标记一个 issue，获得一个 PR。在云沙箱中运行智能体，验证测试通过，并发布一个带理由的、可供审查的 PR。难点在于自动重现仓库的构建环境、防止凭证泄露、强制执行每个仓库的预算，以及确保智能体不能强制推送。这个综合项目构建自托管版本，并在成本和通过率上与托管替代方案进行比较。

**类型：** 综合项目
**语言：** Python（智能体）、TypeScript（GitHub App）、YAML（Actions）
**前置知识：** 阶段 11（LLM 工程）、阶段 13（工具）、阶段 14（智能体）、阶段 15（自律）、阶段 17（基础设施）
**涉及阶段：** P11 · P13 · P14 · P15 · P17
**时间：** 30 小时

## 问题

异步云端编码智能体是一个与交互式编码智能体（综合项目 01）不同的产品类别。其用户体验是一个 GitHub 标签。你标记一个 issue `@agent fix this`，一个工作线程在云沙箱中启动，克隆仓库，运行测试，编辑文件，验证，并打开一个 PR，在正文中包含智能体的理由。没有交互循环，没有终端。AWS Remote SWE Agents、Cursor Background Agents、OpenAI Codex 云、Google Jules 和 Factory Droids 都汇聚到这个形态。

工程挑战是具体的：环境重现（智能体必须从零开始构建仓库，没有缓存的开发镜像）、不稳定测试（必须重新运行或隔离）、凭证作用域（一个具有最小细粒度权限的 GitHub App）、每个仓库每天的预算强制，以及禁止强制推送策略。这个综合项目衡量通过率、成本和安全性，与托管替代方案进行比较。

## 概念

触发机制是 GitHub webhook（issue 标签或 PR 评论）。一个调度器将工作入队到 ECS Fargate 或 Lambda。工作线程将仓库拉入 Daytona 或 E2B 沙箱，使用从仓库推断的通用 Dockerfile（语言、框架）。智能体对 Claude Opus 4.7 或 GPT-5.4-Codex 运行一个 mini-swe-agent 或 SWE-agent v2 循环。它迭代：读取代码、提出修复、应用补丁、运行测试。

验证是门控步骤。在打开 PR 之前，完整的 CI 必须在沙箱中通过。计算覆盖率差异；如果其低于某个阈值，PR 会打开但被标记为 `needs-review`。智能体将理由作为 PR 描述发布，并在 `@agent` 线程中供审查者 ping 以进行后续跟进。

安全性通过两个不同的 GitHub 表面来限定：App 提供一个短生命周期的安装令牌，具有 `workflows: read` 和狭窄的仓库内容/PR 作用域；分支保护（而非应用权限）强制"不允许直接写入 `main`"和"禁止强制推送"——该应用从未添加到绕过列表中。对 `.github/workflows` 的路径限定只读访问不是真正的 GitHub App 原语，因此智能体的文件编辑白名单必须在工作线程级别强制执行。每个仓库每天的预算上限在调度器处强制执行（例如，每个仓库每天最多 5 个 PR，每个 PR 最多 $20）。

## 架构

```
GitHub issue 标记为 `@agent fix` 或 PR 评论
            |
            v
    GitHub App webhook -> AWS Lambda 调度器
            |
            v
    ECS Fargate 任务 (或 GitHub Actions 自托管运行器)
       - 拉取仓库
       - 推断 Dockerfile (语言, 包管理器)
       - Daytona / E2B 沙箱，带目标运行时
       - clone -> git worktree -> 智能体分支
            |
            v
    mini-swe-agent / SWE-agent v2 循环
       Claude Opus 4.7 或 GPT-5.4-Codex
       工具: ripgrep, tree-sitter, read/edit, run_tests, git
            |
            v
    验证 CI 在沙箱中通过 + 覆盖率差异检查
            |
            v (已验证)
    git push + 通过 GitHub App 打开 PR
       PR 正文 = 理由 + 差异摘要 + 追踪 URL
       标签: needs-review
            |
            v
    操作员审查；可以通过 @ 提及智能体进行后续跟进
```

## 技术栈

- 触发：带细粒度令牌的 GitHub App；通过 Lambda 或 Fly.io 的 webhook 接收器
- 工作线程：ECS Fargate 任务（或 GitHub Actions 自托管运行器）
- 沙箱：每个任务的 Daytona devcontainer 或 E2B 沙箱
- 智能体循环：基于 Claude Opus 4.7 / GPT-5.4-Codex 的 mini-swe-agent 基线或 SWE-agent v2
- 检索：tree-sitter 仓库映射 + ripgrep
- 验证：沙箱内完整 CI + 覆盖率差异门控
- 可观测性：带每个 PR 追踪归档的 Langfuse，链接自 PR 正文
- 预算：每个仓库每日美元上限；每个仓库每天最大 PR 数

## 构建步骤

1. **GitHub App。** 细粒度安装令牌：issues 读写、pull_requests 写入、contents 读写、workflows 读取。分支保护（唯一能实现此功能的表面）强制"不允许直接推送到 `main`"和"禁止强制推送"；该应用不在绕过列表中。工作线程强制"不允许写入 `.github/workflows`"，作为对提议差异的白名单检查，因为 GitHub App 权限没有路径作用域。

2. **Webhook 接收器。** Lambda 函数接受 issue 标签 / PR 评论 webhook。按标签 `@agent fix this` 过滤。入队到 SQS。

3. **调度器。** 从 SQS 弹出任务。强制执行每个仓库每天的预算。使用仓库 URL、issue 正文和新的 Daytona 沙箱启动 ECS Fargate 任务。

4. **环境推断。** 检测语言（Python、Node、Go、Rust）和包管理器（uv、pnpm、go mod、cargo）。如果不存在，动态生成 Dockerfile。

5. **智能体循环。** 基于 Claude Opus 4.7 的 mini-swe-agent 或 SWE-agent v2。工具：ripgrep、tree-sitter 仓库映射、read_file、edit_file、run_tests、git。硬限制：$20 成本、30 分钟墙钟时间、30 次智能体轮次。

6. **验证。** 循环结束后，在沙箱中运行完整测试套件。通过 jacoco / coverage.py 计算覆盖率差异。如果 CI 为红：停止，不打开 PR。如果覆盖率下降超过 2%：打开带 `needs-review` 标签的 PR。

7. **PR 发布。** 推送智能体分支。通过 GitHub API 打开 PR，包含：标题、理由、差异摘要、追踪 URL、成本、轮次。

8. **凭证卫生。** 工作线程使用短生命周期的 GitHub App 安装令牌运行。日志在归档之前擦除机密。

9. **评估。** 30 个不同难度的种子内部 issue。衡量通过率、PR 质量（差异大小、风格、覆盖率）、成本、延迟。与 Cursor Background Agents 和 AWS Remote SWE Agents 在同一 issue 上进行比较。

## 使用方式

```
# 在 github.com 上
  - 用户将 issue #842 标记为 `@agent fix this`
  - PR #1903 在 14 分钟后出现
  - 正文:
    > 修复了 widget.dedupe() 中由空比较器条目导致的 NPE。
    > 添加了回归测试 widget_test.go::TestDedupeNullComparator。
    > 覆盖率差异: +0.12%
    > 轮次: 7  成本: $1.80  追踪: langfuse:...
    > 标签: needs-review
```

## 交付产出

`outputs/skill-issue-to-pr.md` 是交付产出。一个 GitHub App + 异步云工作线程，将标记的 issue 转化为可审查的 PR，并具有有限的成本和限定范围的凭证。

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 30 个 issue 的通过率 | 端到端成功（CI 绿灯 + 覆盖率 OK） |
| 20 | PR 质量 | 差异大小、覆盖率差异、风格一致性 |
| 20 | 每个解决 issue 的成本和延迟 | 每个 PR 的美元和墙钟时间 |
| 20 | 安全性 | 限定范围令牌、每个仓库预算、无强制推送、凭证卫生 |
| 15 | 操作员 UX | 理由注释、重试机制、@提及跟进 |
| **100** | | |

## 练习

1. 添加"修复不稳定测试"模式：标签 `@agent stabilize-flake TestX` 在沙箱中运行测试 50 次，提出稳定它的最小更改。

2. 在三个共享 issue 上比较成本与 Cursor Background Agents。报告哪些工具在哪些场景下胜出。

3. 实现预算仪表盘：每个仓库每天的成本、每个用户的成本。对异常发出告警。

4. 构建"干运行"模式，打开一个草稿 PR 而不运行 CI，以便审查者可以低成本检查计划。

5. 添加保留策略：超过 7 天未合并的 PR 分支自动删除。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| GitHub App | "限定范围的机器人身份" | 具有细粒度权限 + 短生命周期安装令牌的应用 |
| 异步云智能体 | "后台智能体" | 在云沙箱中运行的非交互式工作线程，而非终端 |
| 环境推断 | "Dockerfile 合成" | 检测语言 + 包管理器，如果不存在则生成 Dockerfile |
| 验证 | "沙箱内 CI" | 在打开 PR 之前在工作线程内运行完整测试套件 |
| 覆盖率差异 | "覆盖率保持" | 从基线到智能体分支的测试覆盖率百分比变化 |
| 每个仓库预算 | "每日上限" | 在调度器处强制执行的美元和 PR 数量上限 |
| 理由 | "PR 正文解释" | 智能体关于更改内容和原因的摘要；PR 正文中必需 |

## 延伸阅读

- [AWS Remote SWE Agents](https://github.com/aws-samples/remote-swe-agents) — 规范的异步云智能体参考
- [SWE-agent](https://github.com/SWE-agent/SWE-agent) — CLI 参考
- [Cursor Background Agents](https://docs.cursor.com/background-agent) — 商业替代方案
- [OpenAI Codex (云)](https://openai.com/codex) — 托管竞品
- [Google Jules](https://jules.google) — Google 的托管版本
- [Factory Droids](https://www.factory.ai) — 替代商业参考
- [GitHub App 文档](https://docs.github.com/en/apps) — 限定范围的机器人身份
- [Daytona 云沙箱](https://daytona.io) — 参考沙箱
