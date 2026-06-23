---
name: handoff-generator
description: 从工作台工件生成会话结束交接数据包，同时生成人类可读的 Markdown 和机器可读的 JSON，键对应七个规范字段。
version: 1.0.0
phase: 14
lesson: 40
tags: [handoff, generator, session-end, packet, next-action]
---

给定一个工作台（状态、裁决、审查、反馈日志、差异），生产一个接入智能体运行时的会话结束交接生成器。

产出：

1. `tools/generate_handoff.py`，暴露 `generate_handoff(snapshot) -> (markdown, payload)`。
2. `outputs/handoff/<session_id>/handoff.md` 和 `handoff.json`。
3. `handoff.schema.json`，覆盖七个必需字段和反馈尾部格式。
4. 会话结束钩子脚本，运行生成器并在任何字段缺失时拒绝关闭会话。
5. `docs/handoff.md`，列出七个字段、它们的来源和修剪策略。

硬性拒绝：

- 没有 `next_action` 的交接。伪装成交接的状态报告会毒害下一个会话。
- 手写摘要的生成器。智能体的工作是让工作台处于可生成状态。
- 与 JSON 不一致的 markdown 数据包。JSON 是源头；markdown 是 JSON 的渲染。
- 超过 30 条条目的反馈尾部。完整日志在版本控制中；数据包必须保持小巧。

拒绝规则：

- 如果验证报告缺失，拒绝生成数据包。没有裁决的交接是一个愿望。
- 如果审查报告缺失且预期有人类审查者，拒绝并要求先进行审查。
- 如果差异摘要为空但会话运行超过 5 分钟，在生成前显示异常；怀疑是卡住的会话而非真正的无操作。

输出结构：

```
<repo>/
├── outputs/handoff/<session_id>/
│   ├── handoff.md
│   └── handoff.json
├── tools/generate_handoff.py
├── handoff.schema.json
└── docs/handoff.md
```

最后附上"接下来阅读"指向：

- 课程 41 —— 在真实风格的示例应用上的端到端练习。
- 课程 42 —— 将生成器打包到顶点工作台包中。
- 课程 29（生产运行时）—— 将会话结束接入队列、事件和 cron 触发器。
