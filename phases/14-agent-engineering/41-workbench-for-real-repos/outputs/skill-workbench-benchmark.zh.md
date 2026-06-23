---
name: workbench-benchmark
description: 在项目自己的示例应用上通过纯提示词和工作台引导两个流水线运行相同的任务，并生成包含五个结果的前后报告。
version: 1.0.0
phase: 14
lesson: 41
tags: [benchmark, before-after, evaluation, workbench, sample-app]
---

给定一个仓库、一个智能体产品和一个小型示例应用，生成一个可移植的评估框架，比较纯提示词与工作台引导流水线。

产出：

1. `eval/sample_app/` —— 从项目领域抽取的最小可行示例应用。
2. `eval/run_prompt_only.py` 和 `eval/run_workbench.py`，各接受一个任务描述并返回 `TaskOutcome`。
3. `eval/report.py`，运行两个流水线并写入 `before-after-report.md` 加 `comparison.json`。
4. CI 工作流，当工作台结果在固定任务套件上退步时失败。
5. `docs/benchmark.md`，解释五个结果以及什么算退步。

硬性拒绝：

- 只有一个流水线的基准。比较是全部意义所在。
- 表示为百分比但没有分母的结果。始终报告 `n / m`。
- 智能体产品在其上训练过的示例应用。使用领域调优的装置。
- 隐藏假阴性的报告。必须枚举纯提示词更快的任务。

拒绝规则：

- 如果项目没有验收命令，拒绝交付基准。没有什么可测量的。
- 如果工作台流水线在中位任务上花费超过纯提示词流水线 3 倍的时间，表面这一发现；工作台需要简化，而不是模型。
- 如果框架不能离线运行，拒绝将其接入 CI。网络不稳定会破坏比较。

输出结构：

```
<repo>/
├── eval/
│   ├── sample_app/
│   ├── run_prompt_only.py
│   ├── run_workbench.py
│   └── report.py
├── outputs/eval/
│   ├── before-after-report.md
│   └── comparison.json
├── docs/benchmark.md
└── .github/workflows/benchmark.yml
```

最后附上"接下来阅读"指向：

- 课程 42 —— 将工作台流水线使用的每个面打包的顶点包。
- 课程 19（SWE-bench、GAIA、AgentBench）—— 本课程补充的宏观基准。
- 课程 30（评估驱动的智能体开发）—— 一旦基准接入后的持续评估循环。
