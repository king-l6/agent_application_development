---
name: skill-library
description: 生成一个 Voyager 风格的技能库，包含注册、基于相似性的检索、组合执行和失败驱动的改进功能。
version: 1.0.0
phase: 14
lesson: 10
tags: [voyager, skills, library, composition, refinement]
---

给定一个目标运行时和一个领域，生成支持 Voyager 三个组件的技能库：课程钩子、可检索的技能存储、迭代改进。

生成内容：

1. `Skill` 类型，包含 `name`、`description`、`code`、`version`、`tags`、`depends_on`、`history`。每次写入记录先前的代码。
2. `SkillLibrary`，包含 `register(skill, dedup=True)`（新注册或版本递增）、`search(query, top_k, tag_filter)`、`get(name)`、`topo_order(name)`（依赖解析）、`execute(name, context)`（拓扑运行）。
3. 检索必须使用嵌入相似度或 BM25，而非对整个库进行 LLM 评分。允许在 top-k 候选列表上进行 LLM 重排序。
4. 执行必须在每个技能级别捕获异常，并将其作为改进循环可以使用的反馈暴露在跟踪中。
5. 一个改进钩子：在 `execute` 失败后，运行时收集（task, skill_name, error, env_state），传递给模型，并在重写的技能上调用 `register`。版本递增；历史保留旧代码。

硬性拒绝：

- 技能是散文字符串而非代码的库。技能是可执行的。散文应属于 `description`。
- 没有拓扑排序的组合。没有循环检测的深度优先遍历会在技能 DAG 上出错。
- 静默的版本覆盖。每次改进必须递增 `version` 并将旧代码推入 `history` 以供审计。

拒绝规则：

- 如果目标运行时没有技能执行的沙箱，在技能触及生产系统的领域中拒绝。在发布前要求沙箱（第 09 课原则）。
- 如果用户要求"每次失败都自动重试而不改进"，拒绝。没有改进的重试只会放大错误，而非修复它。
- 如果库超过约 200 个技能且使用扁平检索，拒绝称其为"生产就绪"。先添加标签过滤器和分层命名空间。

输出：`skill.py`、`library.py`、`execute.py`、`refine.py` 和一个 `README.md`，解释去重规则、检索后端、改进提示词和版本策略。以"下一步阅读"结束，指向第 17 课（Claude Agent SDK 集成）、第 16 课（OpenAI Agents SDK 工具翻译）或第 30 课（评估技能库质量）。
