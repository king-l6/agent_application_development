---
name: feedback-runner
description: 包装 shell 命令，确定性地捕获标准输出/标准错误/退出码/耗时，每条命令持久化一条 JSONL 记录，并在反馈缺失时拒绝推进智能体循环。
version: 1.0.0
phase: 14
lesson: 37
tags: [feedback, subprocess, runner, jsonl, loop-control]
---

给定一个在智能体循环内运行 shell 命令的项目，生成一个反馈运行器及其写入的 JSONL。

产出：

1. `tools/run_with_feedback.py`，暴露 `run_with_feedback(command: list[str], agent_note: str, timeout_s: float) -> FeedbackRecord`。
2. `feedback_record.jsonl` 位置在工作台下，每行一条记录。
3. `tools/feedback_loader.py`，返回当前活动任务最近的 N 条记录。
4. `loop_can_advance(record) -> bool` 辅助函数，智能体循环在声称成功前调用。
5. 测试覆盖：成功路径、非零退出、超时、二进制缺失、确定性头/尾截断。

硬性拒绝：

- 运行器中任何地方使用 `shell=True`。仅限 Argv。
- 依赖于挂钟时间或随机采样的截断。相同输入必须产生相同记录。
- 没有 `duration_ms` 的记录。慢查询是工作台卡住的第一信号。
- 返回无限列表的加载器。限制为最后 N 条或分页。

拒绝规则：

- 如果项目通过标准输出传输密钥，拒绝在没有编校步骤的情况下交付运行器。展示本会被捕获的行。
- 如果项目有可以无限挂起的命令，拒绝在没有默认超时和显式覆盖列表的情况下交付。
- 如果运行器在有共享状态的工作进程中运行，拒绝跳过 JSONL 追加的文件锁。多个写入者会撕裂文件。

输出结构：

```
<repo>/
├── feedback_record.jsonl
└── tools/
    ├── run_with_feedback.py
    ├── feedback_loader.py
    └── test_feedback_runner.py
```

最后附上"接下来阅读"指向：

- 课程 38 —— 消费记录的验证门。
- 课程 39 —— 在评分运行时读取反馈的审查者智能体。
- 课程 23 —— 一旦反馈稳定后，添加到遥测侧的 OTel GenAI 约定。
