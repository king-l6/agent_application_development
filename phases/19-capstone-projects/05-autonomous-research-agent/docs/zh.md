# 综合项目 05 — 自主研究 Agent（AI-Scientist 类）

> Sakana 的 AI-Scientist-v2 发表了完整的论文。Agent Laboratory 运行了实验。Allen AI 分享了追踪数据。2026 年的形态是对实验的计划-执行-验证树搜索、预算成本控制、沙盒化代码执行、视觉反馈的 LaTeX 编写器以及自动化的 NeurIPS 风格评审集成。这个综合项目是构建一个，在每篇论文 30 美元预算内端到端运行，并通过 Sakana 记录的沙盒逃逸红队测试。

**类型：** 综合项目
**语言：** Python（Agent + 沙盒），LaTeX（输出）
**前置知识：** 阶段 2（ML）、阶段 3（深度学习）、阶段 7（Transformer）、阶段 10（从零实现 LLM）、阶段 14（Agent）、阶段 15（自主系统）、阶段 16（多 Agent）、阶段 18（安全）
**涉及阶段：** P0 · P2 · P3 · P7 · P10 · P14 · P15 · P16 · P18
**时间：** 40 小时

## 问题

自主研究 Agent 在 2026 年跨过了一个门槛。Sakana AI 的 AI-Scientist-v2 发表在 Nature 上，生成的论文通过了研讨会同行评审。ShinkaEvolve（ICLR 2026）将这条线延伸到进化假设。AMD 的 Agent Laboratory 发布了可复现的追踪。这些 Agent 不是魔法——它们是在候选实验树上的计划-执行-验证循环，具有成本上限、种限定的沙盒和自动评审。技艺在于循环、预算和安全故事。

你通过在一个狭窄领域针对一个种子想法实现这个循环来学习（例如，在 1 亿参数 Transformer 上的注意力稀疏性消融研究）。价值不在于第一次运行发现新东西，而在于基础设施：树搜索、实验沙盒、编写器-评审器循环、红队报告。Sakana 团队记录了沙盒逃逸失败；你的 Agent 必须通过相同的红队测试。

## 概念

Agent 是一个最佳优先树搜索。节点是实验规范：（假设、配置、代码、预期结果）。扩展步骤提出带有小改动的子节点（切换优化器、改变批次大小、消融一个组件）。每个子节点在一个带有硬资源上限的新沙盒中运行。结果反馈到评分函数，按（新颖性 × 质量 × 剩余预算）对节点进行排序。树增长直到预算耗尽，然后最佳分支被写成论文。

编写器是多模态的。它生成 LaTeX 草稿，编译它，渲染图形，并将渲染后的 PDF 送入 Claude Opus 4.7 的视觉模式，以对布局、图形可读性和声明-证据对齐进行评审。由五个 LLM 评判组成的评审集成发出 NeurIPS 风格评分（新颖性、严谨性、清晰度、可复现性、影响力）；如果平均分低于阈值，论文带着评审意见返回编写器。

安全是关键负载。每个实验在 E2B 或 Daytona 沙盒中运行，无网络出口、有界挂钟时间和固定资源限制。Agent 的代码生成步骤经过策略层，阻止逃逸沙盒的系统调用。红队报告复现 Sakana 记录的受攻击面（fork 炸弹、文件系统逃逸、LLM 编写的网络调用）。

## 架构

```
seed idea + domain
      |
      v
  literature search (Semantic Scholar + OpenAlex + FAISS cache)
      |
      v
  LangGraph plan-execute-verify tree
      |
      v
  +--- expand node ----+      per-node sandbox
  |                    |      (E2B / Daytona)
  v                    v      resource caps
  child_1           child_k   no network egress
  |                    |      deterministic seeds
  v                    v
  run experiment       run experiment
  |                    |
  v                    v
  score nodes by (novelty, quality, budget)
      |
      v
  best branch -> LaTeX writer
      |
      v
  compile + vision critique (Opus 4.7 vision)
      |
      v
  reviewer ensemble (5 LLM judges, NeurIPS rubric)
      |
      v
  paper.pdf + review.md + trace.json
```

## 技术栈

- 编排：LangGraph，带检查点和人工审批门
- 树搜索：实验节点上的自定义最佳优先搜索（Sakana v2 的 AB-MCTS 风格）
- 沙盒：每个实验 E2B，Docker-in-Docker 后备；通过 cgroups 进行资源上限
- 文献：Semantic Scholar Graph API + OpenAlex + 本地 FAISS 摘要缓存
- 编写器：LaTeX 模板 + Claude Opus 4.7（视觉模式）用于图形评审和布局
- 评审器：5 个评判的集成（Opus 4.7、GPT-5.4、Gemini 3 Pro、DeepSeek R1、Qwen3-Max），加权聚合
- 实验框架：PyTorch 2.5 用于物理实验，W&B 用于日志记录
- 可观测性：Langfuse 用于 Agent 追踪，每篇论文 30 美元硬预算

## 构建步骤

1. **种子和领域范围界定。** 取一个种子想法（例如，"研究 10 亿参数以下 Transformer 注意力图中的稀疏性模式"）。定义搜索空间：模型、数据集、计算预算。

2. **文献检索。** 查询 Semantic Scholar + OpenAlex，获取 50 篇最相关的高引用论文；在本地缓存摘要；生成 1 页领域概览。

3. **树搭建。** 用种子假设初始化根节点。实现 `expand(node) -> children`，带有小编辑建议（每个子节点一个配置变更）。实现 `score(node)` 为加权的新颖性 × 质量 × 预算项。

4. **沙盒封装。** 每个实验运行 `docker run --network=none --memory=8g --cpus=2 --pids-limit=256 --read-only`（或等效的 E2B 策略）。种子写入沙盒；输出以只读方式挂载出来。

5. **计划-执行-验证循环。** `plan` 提出子节点。`execute` 运行沙盒，捕获日志和指标。`verify` 对指标运行单元检查（损失是否下降？消融是否隔离了效果？）。失败的节点在树上存储失败原因。

6. **编写器。** 预算耗尽后，选择最佳分支。使用 matplotlib 渲染图形。通过 Claude Opus 4.7 生成 LaTeX 草稿，将分支追踪放在上下文中。编译。将编译后的 PDF 送回 Opus 4.7 视觉模式进行评审。迭代。

7. **评审集成。** 五个评判对草稿进行评分（新颖性、严谨性、清晰度、可复现性、影响力），使用 NeurIPS 风格评分标准。如果均值 < 4.0/5，返回编写器并附上评审意见。3 次重写后硬停止。

8. **红队。** 构建或集成一组针对沙盒的对抗性任务：fork 炸弹、网络外泄尝试、文件系统逃逸、LLM 编写的 shell 元字符。确认所有都被阻止。写出发现。

9. **可复现性。** 每篇论文附带其树搜索追踪 JSON、种子、W&B 运行链接、沙盒配置以及端到端复现它的 README。

## 使用方式

```
$ ai-scientist run --seed "attention sparsity in sub-1B transformers" --budget 30
[lit]    50 papers, digest in 12s
[tree]   expanded 8 nodes, budget 12/30
[exec]   node #3 sparsity=top-8, loss=2.83 (best so far)
[exec]   node #6 sparsity=top-4, loss=3.12 (worse)
[exec]   ...
[tree]   chose branch rooted at node #3 (novelty 0.62, quality 0.81)
[write]  LaTeX draft v1 complete
[vision] critique: figure 2 legend too small, claim-evidence ok
[write]  draft v2 after 3 edits
[review] mean 4.2/5 (novelty 3.9, rigor 4.3, clarity 4.1, repro 4.5, impact 4.2)
[done]   paper.pdf + review.md + trace.json     $28.40 spent
```

## 交付物

`outputs/skill-ai-scientist.md` 是可交付的技能文件。给定一个种子想法 + 一个领域 + 30 美元预算，它运行完整的管道并输出一份可评审的论文和一个可复现性包。

| 权重 | 标准 | 如何衡量 |
|:-:|---|---|
| 25 | 论文质量 | 与已发表研讨会论文对比的盲审评分 |
| 20 | 实验严谨性 | 基线、种子、消融；每个声明由结果表中的单元格支持 |
| 20 | 成本和计算纪律 | 每篇论文 30 美元上限强制执行，Langfuse 追踪 |
| 20 | 安全性 | 沙盒红队通过；网络策略和终止开关已验证 |
| 15 | 可复现性 | 一行命令使用相同种子复现论文 |
| **100** | | |

## 练习

1. 在同一领域对三个不同的种子想法运行管道。比较树搜索的哪些部分重叠。识别重复浪费的计算。

2. 在估计成本超过 5 美元的节点上，在实验执行前添加一个人工审核门。测量总成本下降多少。

3. 将评审集成替换为单个评审者。在已知低质量的论文保留集上测量误接受率。

4. 引入网络外泄红队测试：Agent 编写尝试 `curl` 外部地址的代码。确认 `--network=none` 策略阻止了它。记录尝试日志。

5. 将你的树搜索与平面随机基线（相同预算，无扩展策略）进行比较。报告新颖性 × 质量的增益。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 树搜索 | "AB-MCTS 风格扩展" | 实验节点上的最佳优先探索，使用新颖性×质量×预算评分 |
| 沙盒 | "实验隔离" | 无网络、有界 CPU/内存、固定种子、只读输入的容器 |
| 视觉评审 | "渲染后读取" | 编译论文为 PDF，将 PDF 送回 VLM 进行布局和声明-证据对齐评审 |
| 评审集成 | "自动化同行评审" | 多个 LLM 评判使用 NeurIPS 评分标准对论文评分；加权聚合控制管道门 |
| 新颖性评分 | "这新吗？" | 惩罚与 50 篇论文文献缓存接近度的方法 |
| 成本上限 | "$ 预算" | 每篇论文总支出的硬上限；Langfuse 计数器 + 运行前估计 |
| 红队 | "沙盒逃逸审计" | 如果策略有误则能逃逸沙盒的对抗性任务 |

## 延伸阅读

- [Sakana AI-Scientist-v2 仓库](https://github.com/SakanaAI/AI-Scientist-v2) — 参考生产级研究 Agent
- [Sakana AI-Scientist-v1 论文（arXiv:2408.06292）](https://arxiv.org/abs/2408.06292) — 原始方法论
- [ShinkaEvolve（Sakana ICLR 2026）](https://sakana.ai) — 进化扩展
- [Agent Laboratory（AMD）](https://github.com/SamuelSchmidgall/AgentLaboratory) — 多角色研究实验室框架
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/) — 参考编排层
- [Semantic Scholar Graph API](https://api.semanticscholar.org/) — 文献搜索
- [E2B 沙盒](https://e2b.dev) — 参考实验隔离
- [NeurIPS 评审指南](https://neurips.cc/Conferences/2026/Reviewer-Guidelines) — 评审集成编码的评分标准
