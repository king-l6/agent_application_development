---
name: verification-gate
description: 生成一个确定性的验证门，将范围、规则和反馈工件合并为每个任务单一的 verification_report.json，以及拒绝在没有绿色裁决时合并的 CI 接线。
version: 1.0.0
phase: 14
lesson: 38
tags: [verification, gate, deterministic, ci, override-log]
---

给定项目的验收标准和现有的工作台工件，生成验证门和覆盖审计日志。

产出：

1. `tools/verify_agent.py`，暴露 `verify(task_id, artifacts) -> VerdictReport`。纯函数，确定性，无 LLM 调用。
2. `outputs/verification/<task_id>.json` 作为单一真相来源裁决。
3. `tools/override.py`，将签名覆盖条目追加到 `outputs/verification/overrides.jsonl`（必须包含原因、用户 ID、时间戳、发现代码）。
4. CI 工作流，在 `passed: false` 时失败并在内联显示报告。
5. `docs/verification.md`，列出每项检查及其严重级别、来源工件和覆盖策略。

硬性拒绝：

- 调用 LLM 的检查。门是确定性的管道；LLM 判断属于审查者。
- 智能体可以在没有签名条目的情况下使用的覆盖路径。覆盖仅限人类。
- 省略了所消费工件路径的验证报告。报告必须是可审计的。
- 工作流可以悄悄降级的阻塞级别发现。严重级别在写入时固定，而非读取时。

拒绝规则：

- 如果项目没有验收命令，拒绝在存在一个之前交付门。什么都不证明的门是做样子。
- 如果规则报告不存在，拒绝跳过规则检查；失败关闭。
- 如果反馈日志不存在，拒绝跳过验收检查；缺失日志本身就是一种阻塞。
- 如果覆盖条目不受版本控制，拒绝接入覆盖路径；不记录的覆盖破坏了门。

输出结构：

```
<repo>/
├── tools/
│   ├── verify_agent.py
│   └── override.py
├── outputs/verification/
│   ├── overrides.jsonl
│   └── <task_id>.json
├── docs/verification.md
└── .github/workflows/verify.yml
```

最后附上"接下来阅读"指向：

- 课程 39 —— 在绿色裁决后接手的审查者智能体。
- 课程 40 —— 将裁决包含在数据包中的交接生成器。
- 课程 41 —— 在真实风格的示例应用上运行门。
