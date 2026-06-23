# 作为可执行约束的 Agent 指令

> 用散文写的指令是愿望。用约束写的指令是测试。工作台将每条规则转化为 Agent 可以在运行时检查、审查者可以在事后验证的东西。

**类型：** 构建
**语言：** Python（标准库）
**前置知识：** 阶段 14 · 32（最小工作台）
**时间：** ~50 分钟

## 学习目标

- 将路由散文与操作规则分开。
- 将启动规则、禁止操作、完成定义、不确定性处理和审批边界表达为机器可检查的约束。
- 实现一个规则检查器，对运行结果进行规则集评分。
- 使规则集对差异友好，以便审查可以看到什么发生了变化。

## 问题

一个典型的 `AGENTS.md` 读起来像入职文档。它告诉 Agent "要小心"和"彻底测试"和"如果不确定要询问"。三天后，Agent 发布了一个没有测试的变更，写入了一个被禁止的目录，而且从未询问，因为它从来不知道界限在哪里。

指令在操作时有力，在愿望时无力。解决方法是编写工作台可以解释、审查者可以评分的规则。

## 概念

规则属于 `docs/agent-rules.md`，远离简短的路由器文件。每条规则都有一个名称、一个类别和一个检查。

```mermaid
flowchart LR
  Router[AGENTS.md] --> Rules[docs/agent-rules.md]
  Rules --> Checker[rule_checker.py]
  Checker --> Report[rule_report.json]
  Report --> Reviewer[审查者]
```

### 覆盖大多数规则的五种类别

| 类别 | 规则回答的问题 | 示例 |
|----------|---------------------------|---------|
| 启动 | 工作开始前必须满足什么？ | "状态文件存在且是最新的" |
| 禁止 | 什么绝对不能发生？ | "不要编辑 `scripts/release.sh`" |
| 完成定义 | 什么证明任务已完成？ | "pytest 退出码为 0 且验收行通过" |
| 不确定性 | 当不确定时 Agent 做什么？ | "打开一个问题笔记而不是猜测" |
| 审批 | 什么需要人工审批？ | "任何新依赖、任何生产写入" |

一条不适合这五种类别的规则通常应该拆成两条规则。强制拆分。

### 规则是机器可读的

每条规则有一个 slug、一个类别、一行描述和一个 `check` 字段，该字段命名 `rule_checker.py` 中的一个函数。添加规则意味着添加检查；检查器随工作台一起增长。

### 规则对差异友好

规则在单个 markdown 文件中每条规则占一个标题。重命名在差异中可见。新规则放在其类别的顶部。过时的规则被删除，而不是注释掉，因为工作台是事实来源，而不是团队上个季度感受的聊天日志。

### 规则与框架护栏

框架护栏（OpenAI Agents SDK 护栏、LangGraph 中断）在运行时级别强制执行规则。本课中的规则集是人类可读、可审查的合同，这些护栏实现了该合同。两者都需要：运行时在一轮中捕获违规，规则集证明运行时在做正确的事情。

### 渐进披露：一张地图，不是百科全书

`AGENTS.md` 不断增长的原因在于每次事件都会添加一条规则，而没有事件会移除一条规则。一年后，文件有 2000 行，Agent 阅读第一个屏幕，注意力预算耗尽，只按照被告知的一小部分行事。巨大的指令文件失败的原因与四十页的入职文档相同：读者快速浏览一次，永远不会回到重要的那部分。

解决方法不是更短的文件。而是分层的文件。根路由器保持足够短，每个会话都可以阅读，只包含指针。深度存在于主题文件中，Agent 仅在任务触及它们时才加载。给 Agent 一张地图，而不是整本百科全书，让它走到它需要的页面。

```
AGENTS.md                  # 路由器，< 50 行：这个仓库是什么、去哪里找、5 条硬规则
docs/
  agent-rules.md           # 完整规则集（本课）
  architecture.md          # 当任务触及模块边界时加载
  testing.md               # 当任务编写或运行测试时加载
  deploy.md                # 仅为发布工作加载，受审批规则限制
feature_list.json          # 积压工作（阶段 14 · 36）
```

| 层级 | 位于 | 读取时机 | 大小预算 |
|------|----------|-----------|-------------|
| 路由器 | `AGENTS.md` | 每个会话，总是 | 约 50 行以内 |
| 规则 | `docs/agent-rules.md` | 每个会话，启动时 | 每类别一个屏幕 |
| 主题文档 | `docs/<topic>.md` | 仅当任务触及该主题时 | 根据需要深度 |

两个测试保持分层诚实。可到达性测试：Agent 应该从路由器最多两次跳转就能到达任何规则，因此路由器必须通过路径链接每个主题文档，而不是用散文描述它。新鲜度测试：路由器足够短，审查者在每个 PR 上都会重读它，这是唯一能阻止它悄悄增长回它所取代的百科全书的措施。一个不再解析的指针比缺失的规则更糟糕，因此路由器中的断链本身就是一个启动检查违规。

## 构建

`code/main.py` 提供：

- `agent-rules.md` 解析器，将规则加载到数据类中。
- `rule_checker.py` 风格检查器函数，每个 `check` 引用一个。
- 一个演示 Agent 运行，违反两条规则，以及捕获它们的检查通行。

运行：

```
python3 code/main.py
```

输出：解析后的规则集、运行追踪、每条规则的通过/失败，以及保存在脚本旁边的 `rule_report.json`。

## 生产环境中的模式

三个模式将一个持续一个季度的规则集与一周内就衰败的规则集区分开来。

**创建时标记严重级别。** 每条规则携带 `severity`：`block`、`warn` 或 `info`。检查器报告所有三个；运行时仅在 `block` 上拒绝。大多数团队早期高估严重级别，然后在截止日期压力下悄悄降低；创建时标记强制预先校准。与验证门（阶段 14 · 38）配对，该门将对 `block` 规则的任何覆盖签署到 `overrides.jsonl` 审计日志中。

**规则过期作为强制函数。** 每条规则携带一个 `expires_at` 日期（默认为创建后 90 天）。检查器在一条未过期的规则连续 60 天没有违规时发出警告；下一季度审查要么证明保留它、降低到 `info`、要么删除它。Cloudflare 的生产 AI 代码审查数据（2026 年 4 月，30 天内跨 5,169 个仓库的 131,246 次审查运行）显示，具有明确过期的规则集保持在每个仓库 30 条规则以下；没有过期的规则集增长到 80 条以上，且大多数从未触发。

**Markdown 作为源，JSON 作为缓存。** `agent-rules.md` 是创作文件；`agent-rules.lock.json` 是检查器在热路径中读取的缓存。锁由预提交钩子重新生成。Markdown 差异是可审查的；JSON 解析远离每轮迭代。与 `package.json` / `package-lock.json` 和 `Cargo.toml` / `Cargo.lock` 形状相同。

## 使用

在生产中：

- **Claude Code, Codex, Cursor** 在会话开始时读取规则，并在拒绝操作时引用它们。检查器在 CI 中重新运行以捕获静默漂移。
- **OpenAI Agents SDK 护栏** 将相同的检查注册为输入和输出护栏。Markdown 是文档面；SDK 是运行时面。
- **LangGraph 中断** 当进行中的节点违反规则时触发。中断处理程序读取规则，询问人类，然后恢复。

规则集在所有三种环境中是可移植的，因为它只是 markdown 加上函数名。

## 交付

`outputs/skill-rule-set-builder.md` 采访项目所有者，将现有散文指令分类到五种类别中，并发布版本化的 `agent-rules.md` 加上检查器桩代码。

## 练习

1. 如果你的产品确实需要，添加第六种类别。证明它为什么不能归入五种类别之一。
2. 扩展检查器，使规则可以携带严重级别（`block`、`warn`、`info`），报告相应汇总。
3. 将检查器接入 CI：如果最新 Agent 运行中块严重级别的规则失败，则构建失败。
4. 为每条规则添加一个"过期"字段。90 天没有检查失败后，规则进入审查。
5. 找一个真实的 `AGENTS.md`，将其重写为五类别规则。其中多少行是可操作的？多少行是愿望性的？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------------|------------------------|
| 操作规则 | "真正的指令" | 工作台可以在运行时检查的规则 |
| 愿望规则 | "要小心" | 没有检查的规则；要么删除要么升级 |
| 完成定义 | "验收" | 一个客观的、文件支持的证明任务完成 |
| 块严重级别 | "硬规则" | 违规停止运行；没有操作员无法静默 |
| 规则过期 | "过时规则清理" | 在 N 天内没有失败的规则进入退休审查 |

## 延伸阅读

- [OpenAI Agents SDK guardrails](https://platform.openai.com/docs/guides/agents-sdk/guardrails)
- [LangGraph interrupts](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/breakpoints/)
- [Anthropic, Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Rick Hightower, Agent RuleZ: A Deterministic Policy Engine](https://medium.com/@richardhightower/agent-rulez-a-deterministic-policy-engine-for-ai-coding-agents-9489e0561edf) — 生产中的 block/warn/info 严重级别
- [Cloudflare, Orchestrating AI Code Review at Scale](https://blog.cloudflare.com/ai-code-review/) — 13.1 万次审查运行，规则构成经验
- [microservices.io, GenAI development platform — part 1: guardrails](https://microservices.io/post/architecture/2026/03/09/genai-development-platform-part-1-development-guardrails.html) — 规则与 CI 之间的纵深防御
- [Type-Checked Compliance: Deterministic Guardrails (arXiv 2604.01483)](https://arxiv.org/pdf/2604.01483) — Lean 4 作为规则即检查的上限
- [logi-cmd/agent-guardrails](https://github.com/logi-cmd/agent-guardrails) — 合并门实现：范围、突变测试、违规预算
- 阶段 14 · 32 — 该规则集放入的最小工作台
- 阶段 14 · 38 — 消费规则报告的验证门
- 阶段 14 · 39 — 对规则合规性评分的审查 Agent
