---
name: skill-end-to-end-safety-gate
description: 三检查点安全门，组合输入检测器、流式词元过滤器、输出分类器和规则引擎，带确定性聚合表和每请求追踪
version: 1.0.0
phase: 19
lesson: 87
tags: [safety, harness, composition]
---

# 端到端安全门

## 生命周期

1. pre-gen - 在提示上运行课程 83 检测器
   - 如果置信度 >= block_threshold：返回拒绝，发出追踪，停止
2. during-gen - 从模型流式接收，缓冲两个块，扫描已知有害续写
   - 如果匹配：终止迭代器，标记追踪，视为中等严重性
3. post-gen - 如果没有提前终止，在完成的输出上运行课程 85 分类器路由器和课程 86 规则引擎
4. aggregate - 取 pre、during、post.classifier、post.rules 中的最大严重性
5. apply - 映射到 block、redact、warn 或 allow

## 聚合表

| 信号状态 | 动作 |
|---|---|
| 任何高严重性 | block |
| 任何中等严重性 | redact |
| 任何低严重性 | warn |
| 无 | allow |

## 追踪结构

```text
RequestTrace
  request_id: str
  prompt: str
  pre_gen: { category, confidence, fired[] }
  during_gen: { terminated_early, matched_pattern, partial_chunks }
  post_gen: { classifier_action, classifier_severity, rules_max_severity, rules_violations[] } | null
  final_action: block | redact | warn | allow
  final_output: str
  latency_ms: float
```

## 工件

`outputs/gate_trace.json` 包含摘要和每个请求的一个追踪，包括 50 个分类法固定数据集和 10 个良性提示。
