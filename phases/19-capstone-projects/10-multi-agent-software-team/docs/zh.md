# 综合项目 10 — 多 Agent 软件工程团队

> SWE-AF 的工厂架构、MetaGPT 的基于角色的提示、AutoGen 0.4 的类型化参与者图、Cognition 的 Devin 和 Factory 的 Droids 都汇聚到 2026 年的相同形态：架构师制定计划、N 个编码员在并行 worktree 中工作、评审者门控、测试者验证。并行 worktree 将挂钟时间转化为吞吐量。共享状态和交接协议成为失败表面。综合项目是构建这个团队，在 SWE-bench Pro 上进行评估，并报告哪些交接出问题以及频率。

**类型：** 综合项目
**语言：** Python / TypeScript（Agent），Shell（worktree 脚本）
**前置知识：** 阶段 11（LLM 工程）、阶段 13（工具）、阶段 14（Agent）、阶段 15（自主系统）、阶段 16（多 Agent）、阶段 17（基础设施）
**涉及阶段：** P11 · P13 · P14 · P15 · P16 · P17
**时间：** 40 小时

## 问题

单 Agent 编码框架在大型任务上遇到瓶颈。不是因为任何单个 Agent 弱，而是因为一个 20 万 token 的上下文无法同时容纳架构计划、四个并行的代码库切片、评审者评论和测试输出。多 Agent 工厂拆分问题：架构师拥有计划，编码员在并行 worktree 中拥有实现，评审者门控，测试者验证。SWE-AF 的"工厂"架构、MetaGPT 的角色、AutoGen 的类型化参与者图——三个框架都描述了相同的形态。

失败表面是交接。架构师计划了编码员无法实现的东西。编码员产生冲突的差异。评审者批准了有幻觉的修复。测试者与仍在写入的编码员竞争。你将构建其中一个团队，在 50 个 SWE-bench Pro 问题上运行它，跟踪每个交接，并发布事后分析。

## 概念

角色是类型化的 Agent。**架构师**（Claude Opus 4.7）阅读问题，编写计划，并将其分解为具有显式接口的子任务。**编码员**（Claude Sonnet 4.7，N 个并行实例，每个在自己的 `git worktree` + Daytona 沙盒中）独立实现子任务。**评审者**（GPT-5.4）读取合并后的差异，要么批准要么请求特定更改。**测试者**（Gemini 2.5 Pro）在隔离环境中运行测试套件，报告通过/失败及产物。

通信通过共享任务板进行（文件或 Redis 后端）。每个角色消费它被允许处理的任务。交接是 A2A 协议类型化的消息。协调关注点：合并冲突解决（协调者角色或自动三向合并）、共享状态同步（计划在编码员启动后冻结；重新规划是单独的事件）、以及评审者守门（评审者不能批准自己的更改或自己提出的更改）。

Token 放大是隐藏成本。每个角色边界增加摘要提示和交接上下文。一个 40 轮的单 Agent 运行变成四个角色间总共 160 轮。评分标准特别看重 token 效率与单 Agent 基线的对比，因为问题不是"多 Agent 是否工作"，而是"它每美元是否获胜"。

## 架构

```
GitHub issue URL
      |
      v
Architect (Opus 4.7)
   reads issue, produces plan with subtasks + interfaces
      |
      v
Task board (file / Redis)
      |
   +-- subtask 1 ---+-- subtask 2 ---+-- subtask 3 ---+-- subtask 4 ---+
   v                v                v                v                v
Coder A          Coder B          Coder C          Coder D          (4 parallel)
 (Sonnet)         (Sonnet)         (Sonnet)         (Sonnet)
 worktree A       worktree B       worktree C       worktree D
 Daytona          Daytona          Daytona          Daytona
      |                |                |                |
      +--------+-------+-------+--------+
               v
           merge coordinator  (three-way merge + conflict resolution)
               |
               v
           Reviewer (GPT-5.4)
               |
               v
           Tester  (Gemini 2.5 Pro)  -> passes? -> open PR
                                     -> fails?  -> route back to coder
```

## 技术栈

- 编排：LangGraph，带共享状态和每 Agent 子图
- 消息传递：A2A 协议（Google 2025）用于类型化的 Agent 间消息
- 模型：Opus 4.7（架构师）、Sonnet 4.7（编码员）、GPT-5.4（评审者）、Gemini 2.5 Pro（测试者）
- Worktree 隔离：每个编码员 `git worktree add` + Daytona 沙盒
- 合并协调者：自定义三向合并 + LLM 介导的冲突解决
- 评估：SWE-bench Pro（50 个问题）、SWE-AF 场景、HumanEval++ 用于单元测试
- 可观测性：Langfuse，带角色标记的 span、每 Agent token 记账
- 部署：K8s，每个角色作为单独的 Deployment + 基于积压的 HPA

## 构建步骤

1. **任务板。** 文件后端的 JSONL，带有类型化消息：`plan_request`、`subtask`、`diff_ready`、`review_needed`、`test_needed`、`approved`、`rejected`、`replan_needed`。Agent 订阅标签。

2. **架构师。** 读取 GitHub 问题，运行 Opus 4.7，使用要求显式子任务接口（接触的文件、公共函数、测试影响）的计划模板。发出一个带有子任务 DAG 的 `plan_request`。

3. **编码员。** N 个并行工作进程，每个从板子上认领一个子任务。每个生成一个新的 `git worktree add` 分支加 Daytona 沙盒。实现子任务。发出带有补丁 + 测试差异的 `diff_ready`。

4. **合并协调者。** 在所有编码员完成后，将 N 个分支三向合并到暂存分支。仅当存在文件级重叠时，才进行 LLM 介导的冲突解决。

5. **评审者。** GPT-5.4 读取合并后的差异。不能批准自己编写的差异。发出 `approved`（无操作）或 `review_feedback`，带有路由到相关编码员的特定更改请求。

6. **测试者。** Gemini 2.5 Pro 在干净沙盒中运行测试套件。捕获产物。发出 `test_passed` 或 `test_failed`，带堆栈跟踪。失败的测试循环回拥有该失败子任务的编码员。

7. **交接记账。** 每个跨越角色边界的消息在 Langfuse 中获得一个 span，包含载荷大小和使用的模型。计算每子任务的 token 放大（coder_tokens + reviewer_tokens + tester_tokens + architect_share / coder_tokens）。

8. **评估。** 在 50 个 SWE-bench Pro 问题上运行。比较 pass@1 和每个解决问题的美元成本与单 Agent 基线（一个 Sonnet 4.7 在单个 worktree 中）。

9. **事后分析。** 对每个失败的问题，识别出错的交接（计划太模糊、合并冲突、评审者误批准、测试者不稳定）。生成交接失败直方图。

## 使用方式

```
$ team run --issue https://github.com/acme/widget/issues/842
[architect] plan: 4 subtasks (parser, cache, api, migration)
[board]     dispatched to 4 coders in parallel worktrees
[coder-A]   subtask parser  -> 42 lines, tests pass locally
[coder-B]   subtask cache   -> 88 lines, tests pass locally
[coder-C]   subtask api     -> 31 lines, tests pass locally
[coder-D]   subtask migration -> 19 lines, tests pass locally
[merge]     3-way merge: 0 conflicts
[reviewer]  comments on cache (thread pool sizing); routed to coder-B
[coder-B]   revision: 92 lines; submits
[reviewer]  approved
[tester]    all 412 tests pass
[pr]        opened #3382   4 coders, 1 revision, $4.90, 18m
```

## 交付物

`outputs/skill-multi-agent-team.md` 是可交付的技能文件。给定问题 URL 和并行度，团队生成一个可合并的 PR，附带每角色 token 记账。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | SWE-bench Pro pass@1 | 匹配的 50 问题子集，pass@1 |
| 20 | 并行加速 | 与单 Agent 基线的挂钟时间对比 |
| 15 | 评审质量 | 注入 bug 探测中的误批准率 |
| 25 | Token 效率 | 每个解决问题的总 token 数 vs 单 Agent |
| 15 | 协调工程 | 合并冲突解决、交接失败直方图 |
| **100** | | |

## 练习

1. 在差异的中途注入一个明显错误（主代码体前多余的 `return None`）。测量评审者的误批准率。调整评审者提示直到误批准率低于 5%。

2. 减少为两个编码员（架构师 + 编码员 + 评审者 + 测试者，编码员顺序运行两个子任务）。比较挂钟时间和通过率。

3. 将合并协调者替换为单写入者约束（子任务接触不相交的文件集）。测量架构师上的规划负担。

4. 将评审者从 GPT-5.4 替换为 Claude Opus 4.7。测量误批准率和 token 成本差异。

5. 添加第五个角色：文档编写者（Haiku 4.5）。评审后，它生成变更日志条目。测量文档质量是否证明额外的 token 花费是合理的。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 并行 worktree | "隔离分支" | `git worktree add` 为每个编码员生成一个新的工作树 |
| 任务板 | "共享消息总线" | 文件或 Redis 存储的类型化消息，Agent 订阅 |
| 交接 | "角色边界" | 任何从一个角色的上下文跨越到另一个角色的消息 |
| Token 放大 | "多 Agent 开销" | 跨角色的总 token 数 / 相同任务的单 Agent token 数 |
| A2A 协议 | "Agent 到 Agent" | Google 2025 年的类型化 Agent 间消息规范 |
| 合并协调者 | "集成器" | 运行三向合并并介导冲突的组件 |
| 误批准 | "评审者幻觉" | 评审者批准了带已知错误的差异 |

## 延伸阅读

- [SWE-AF 工厂架构](https://github.com/Agent-Field/SWE-AF) — 参考 2026 多 Agent 工厂
- [MetaGPT](https://github.com/FoundationAgents/MetaGPT) — 基于角色的多 Agent 框架
- [AutoGen v0.4](https://github.com/microsoft/autogen) — Microsoft 的类型化角色框架
- [Cognition AI（Devin）](https://cognition.ai) — 参考产品
- [Factory Droids](https://www.factory.ai) — 备选参考产品
- [Google A2A 协议](https://developers.google.com/agent-to-agent) — Agent 间消息传递规范
- [git worktree 文档](https://git-scm.com/docs/git-worktree) — 隔离基座
- [SWE-bench Pro](https://www.swebench.com) — 评估目标
