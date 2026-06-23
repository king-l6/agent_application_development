---
name: sampling-tuner
description: 为给定的生成任务选择解码策略（greedy / temperature / top-k / top-p / min-p / 投机解码）。
version: 1.0.0
phase: 7
lesson: 7
tags: [gpt, sampling, decoding, inference]
---

给定一个生成任务（代码、创意写作、推理、对话、结构化输出）以及延迟/质量目标，输出：

1. **采样方法。** 以下之一：greedy、仅 temperature、top-k、top-p、min-p、beam-k、投机解码。附一句理由。
2. **参数值。** 温度、top-k、top-p、min-p、重复惩罚——具体数值与任务类型挂钩。（例如，代码使用 temperature 0.2 + top-p 1.0；聊天使用 min-p 0.1 + temperature 0.7。）
3. **停止条件。** `max_new_tokens`、停止 token 列表、基于模式的停止（例如闭合的 `</tool_call>`）。
4. **确定性开关。** 固定种子以保证可重现性；标识用例（评估、法律）是否需要。
5. **质量检查。** 针对任务目标的一行测试（编译/通过单元测试、事实性、格式有效性等）。

拒绝为结构化输出或代码补全推荐 temperature > 1.0——幻觉风险急剧上升。拒绝为开放式对话推荐纯 greedy——模型会陷入循环。拒绝在模型可能生成模板/工具时，不指定停止 token 列表就交付采样配置。
