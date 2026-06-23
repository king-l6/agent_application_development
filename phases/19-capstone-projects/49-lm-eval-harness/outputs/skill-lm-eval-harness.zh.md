---
name: lm-eval-harness
description: 最小化语言模型评估框架，包含 JSONL 任务规范、五个指标、可替换适配器和排行榜 JSON 输出。
version: 1.0.0
phase: 19
lesson: 49
tags: [评估, 指标, 排行榜, 框架]
---

## 何时使用

比较两个模型、两个检查点或两个提示模板在固定任务集上的表现。任何需要上线且需要随时间监控的内容。

## 任务规范

每个示例一行 JSONL：

```json
{"id": "ex-001", "prompt": "...", "targets": ["..."], "metric": "exact_match", "extras": {}}
```

文件中的所有示例共享同一个指标。文件名是任务名。

## 指标

| 指标 | 签名 | 用途 |
|--------|-----------|---------|
| exact_match | 小写规范化 + 空白折叠 + 相等判断 | 算术、事实性答案 |
| substring_contains | 目标必须出现在规范化后的预测中 | 带锚定词的自由生成 |
| multiple_choice | 首字母匹配 | A/B/C/D 风格的问题 |
| rouge_l | 在分词文本上的 LCS F1 | 摘要、释义 |
| code_exec | 在 io_pairs 上运行预测的 `f` 函数，统计匹配数 | 代码生成 |

所有指标返回 [0.0, 1.0] 范围内的浮点数。任务分数是均值。

## 适配器

```python
class Adapter(Protocol):
    name: str
    def generate(self, prompts: list[str]) -> list[str]: ...
```

适配器是唯一的模型特定代码。

## 排行榜 JSON

Schema 字符串、时间戳、每个任务的分数和延迟、总体均值。比较运行时包含每个示例的记录，使预测级别的回归可见。

## 失败模式

- 指标返回值超出 [0, 1]：总体分数变得不可解释。
- 一个任务文件中混合了多种指标：断言触发；保持每个文件一个指标。
- code_exec 没有受限命名空间：任意代码执行。
- 没有 schema 字符串：格式演变破坏下游仪表盘。
