# 综合项目 09 — 代码迁移 Agent（仓库级语言/运行时升级）

> Amazon 的 MigrationBench（Java 8 到 17）和 Google 的 App Engine Py2 到 Py3 迁移工具设定了 2026 年的标准。Moderne 的 OpenRewrite 进行大规模的确定性 AST 重写。Grit 使用 codemod 风格的 DSL 针对相同问题。生产模式结合了二者：用于安全重写的确定性基座加上用于模糊情况的 Agent 层、用于每个分支构建的沙盒，以及在 PR 打开前变绿的测试框架。这个综合项目是迁移 50 个真实仓库并发布通过率和失败分类。

**类型：** 综合项目
**语言：** Python（Agent），Java / Python（目标），TypeScript（仪表盘）
**前置知识：** 阶段 5（NLP）、阶段 7（Transformer）、阶段 11（LLM 工程）、阶段 13（工具）、阶段 14（Agent）、阶段 15（自主系统）、阶段 17（基础设施）
**涉及阶段：** P5 · P7 · P11 · P13 · P14 · P15 · P17
**时间：** 30 小时

## 问题

大规模代码迁移是 2026 年编码 Agent 最清晰的生产应用之一。ground truth 显而易见（迁移后测试套件是否通过？），回报是真实的（Java-8 代码群迁移是一个人力规模级别的项目），并且基准是公开的（MigrationBench 50 仓库子集）。Moderne 的 OpenRewrite 处理确定性方面。Agent 层处理 OpenRewrite 配方无法处理的一切：模糊重写、构建系统漂移、长尾语法、传递依赖断裂。

你将构建一个 Agent，接收 Java 8 仓库（或 Python 2 仓库）并产生一个 CI 变绿的已迁移分支。你将测量通过率、测试覆盖保持率、每个仓库的成本，并构建一个失败分类体系。与仅确定性基线的并列对比告诉你 Agent 的实际价值在哪里。

## 概念

管道有两层。**确定性基座**（Java 的 OpenRewrite，Python 的 libcst）安全地运行大部分机械重写：导入、方法签名、空安全编辑、try-with-resources、弃用 API 替换。它快速且产生可审计的差异。**Agent 层**（OpenAI Agents SDK 或基于 Claude Opus 4.7 和 GPT-5.4-Codex 的 LangGraph）处理配方无法处理的情况：构建文件升级（Maven/Gradle/pyproject）、传递依赖冲突、测试不稳定、自定义注解。

每个仓库获得一个预装目标运行时的 Daytona 沙盒。Agent 迭代：运行构建、分类失败、应用修复、重新运行。硬限制：每个仓库 30 分钟、每个仓库 8 美元、20 个 Agent 轮次。如果所有测试通过且覆盖率下降不是负的，分支打开 PR。否则，仓库被归档到带有证据的失败类别下。

失败分类体系是交付物。在 50 个仓库中，什么出了问题？传递依赖？自定义注解？构建工具版本？与迁移无关的测试不稳定？每个类别获得计数和示例差异。未来的配方作者可以针对前三名。

## 架构

```
target repo
      |
      v
OpenRewrite / libcst deterministic recipes
   (safe, fast, auditable, ~70-80% of fixes)
      |
      v
Daytona sandbox per branch
      |
      v
agent loop (Claude Opus 4.7 / GPT-5.4-Codex):
   - run build -> capture failures
   - classify failures (build, test, lint)
   - apply fix (patch or retry recipe)
   - rerun
   - budget: 30 min, $8, 20 turns
      |
      v
test + coverage delta gate
      |
      v (passed)
open PR
      |
      v (failed)
file under failure class + attach repro
```

## 技术栈

- 确定性基座：OpenRewrite（Java）或 libcst（Python）
- Agent：OpenAI Agents SDK 或基于 Claude Opus 4.7 + GPT-5.4-Codex 的 LangGraph
- 沙盒：每个分支的 Daytona devcontainers，预装目标运行时（Java 17 / Python 3.12）
- 构建系统：Maven、Gradle、uv（Python）
- 基准：Amazon MigrationBench 50 仓库子集（Java 8 到 17）、Google App Engine Py2 到 Py3 仓库
- 测试框架：并行运行器，通过 Jacoco（Java）或 coverage.py（Python）进行覆盖率分析
- 可观测性：Langfuse + 每个仓库的追踪包，包含每个差异块
- 仪表盘：失败分类仪表盘，带有每类计数和示例差异

## 构建步骤

1. **配方运行。** 首先运行 OpenRewrite（Java）或 libcst（Python）配方。捕获 70-80% 的机械迁移。提交为"recipe"提交。

2. **构建尝试。** Daytona 沙盒：安装目标运行时，运行构建。如果通过，跳转到测试。如果失败，移交给 Agent。

3. **Agent 循环。** 带有工具 `run_build`、`read_file`、`edit_file`、`run_test`、`git_diff` 的 LangGraph。Agent 对失败进行分类（依赖、语法、测试、构建工具）并应用有针对性的修复。重新运行。

4. **预算上限。** 每个仓库 30 分钟挂钟时间、8 美元成本、20 个 Agent 轮次。任何违反立即暂停并归档为"预算耗尽"，附带当前差异。

5. **测试 + 覆盖率门。** 构建变绿后，运行测试套件。将覆盖率与基础仓库进行比较。如果覆盖率下降超过 2%，归档为"覆盖率回归"。

6. **PR 打开。** 成功时，推送分支，打开 PR，包含差异和摘要说明哪些配方已应用以及哪些提交是 Agent 编写的。

7. **失败分类。** 对每个失败的仓库，用类别标记：`dep_upgrade_required`、`build_tool_drift`、`custom_annotation`、`test_flake`、`syntax_edge_case`、`budget_exhausted`。构建仪表盘。

8. **50 仓库运行。** 跨 MigrationBench 子集执行。报告每类通过率、每仓库成本、覆盖保持率，以及与仅确定性基线的对比。

## 使用方式

```
$ migrate legacy-java-service --target java17
[recipe]   27 rewrites applied (JUnit 4->5, HashMap initializer, try-with-resources)
[build]    FAIL: cannot find symbol sun.misc.BASE64Encoder
[agent]    turn 1 classify: removed_jdk_api
[agent]    turn 2 apply: sun.misc.BASE64Encoder -> java.util.Base64
[build]    OK
[tests]    412/412 passing; coverage 84.1% -> 84.3%
[pr]       opened #1841  cost=$3.20  turns=4
```

## 交付物

`outputs/skill-migration-agent.md` 是可交付的技能文件。给定一个仓库，它执行确定性配方然后 Agent 循环，以产生一个已迁移的绿色分支，或将仓库归档到分类类别下。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | MigrationBench 通过率 | 50 仓库子集 pass@1 |
| 20 | 测试覆盖保持率 | 与基线的平均覆盖率差异 |
| 20 | 每个迁移仓库的成本 | 通过运行的平均 $/repo |
| 20 | Agent / 确定性工具集成 | OpenRewrite 处理的修复比例 vs Agent 编写的修复比例 |
| 15 | 失败分析报告 | 分类完整性和示例 |
| **100** | | |

## 练习

1. 仅使用 OpenRewrite（无 Agent）运行迁移管道。将通过率与完整管道进行比较。识别 Agent 单独起作用的案例。

2. 实现"lint 干净"检查：迁移后，运行风格 lint（Java 的 spotless，Python 的 ruff）。如果出现新的 lint 错误，PR 失败。测量保持覆盖率但风格退化的比率。

3. 添加"最小差异"优化器：Agent 的分支通过测试后，用第二次运行修剪不必要的更改。报告差异大小缩减。

4. 扩展到第三种迁移：Node 18 到 Node 22。复用沙盒封装；将配方层替换为自定义 codemod。

5. 测量首次绿色构建时间（TTFGB）作为用户体验指标。目标：p50 低于 10 分钟。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 确定性基座 | "配方引擎" | OpenRewrite / libcst：带有安全保障的声明式 AST 重写 |
| Codemod | "代码修改程序" | 机械地改变源代码的重写规则 |
| 构建漂移 | "工具版本偏差" | Maven / Gradle / uv 主要版本之间的微妙行为变化 |
| 失败类别 | "分类桶" | 标签化的仓库未迁移原因：依赖、语法、测试、构建工具、预算 |
| 覆盖率差异 | "覆盖保持" | 从基础到迁移分支的测试覆盖率百分比变化 |
| Agent 轮次 | "工具调用轮" | Agent 循环中的一个计划 -> 执行 -> 观察周期 |
| 预算耗尽 | "达到上限" | 仓库消耗了其 30 分钟 / 8 美元 / 20 轮限制而未通过 |

## 延伸阅读

- [Amazon MigrationBench](https://aws.amazon.com/blogs/devops/amazon-introduces-two-benchmark-datasets-for-evaluating-ai-agents-ability-on-code-migration/) — 2026 年规范基准
- [Moderne.io OpenRewrite 平台](https://www.moderne.io) — 确定性基座参考
- [OpenRewrite 文档](https://docs.openrewrite.org) — 配方编写
- [Grit.io](https://www.grit.io) — 备选 codemod DSL
- [OpenAI 沙盒化迁移 cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent) — Agents SDK 参考
- [Google App Engine Py2 到 Py3 迁移工具](https://cloud.google.com/appengine) — 备选迁移基准
- [libcst](https://github.com/Instagram/LibCST) — Python 确定性基座
- [Daytona 沙盒](https://daytona.io) — 参考每分支沙盒
