---
name: skill-content-classifier-integration
description: 三个输出侧分类器（有害性、PII、指令泄露），位于单一严重性路由器之后，具有 block、redact、warn、log 动作
version: 1.0.0
phase: 19
lesson: 85
tags: [safety, classifier, output-filter]
---

# 内容分类器集成

三个分类器，一个路由器，四个动作。

## 判决结构

```text
ClassifierVerdict
  name: str
  severity: none | low | medium | high
  score: float in [0, 1]
  findings: list[str]
```

## 动作表

| 严重性 | 动作 | 效果 |
|---|---|---|
| high | block | 输出被策略拒绝替换 |
| medium | redact | 按顺序应用每分类器编辑器 |
| low | warn | 输出发送，附带软通知 |
| none | log | 输出原样发送，判决记录 |

## 每分类器行为

- toxicity - 带空白边界的骚扰词和小左窗口否定检查；编辑为 `[redacted-language]`
- pii - 电子邮件、电话、SSN、Luhn 验证的卡、IPv4；SSN 和卡升级严重性；将每种形状编辑为标签
- instruction-leakage - 与已知系统提示的三元组余弦；严重性随重叠度变化；编辑第一条系统提示行

## 工件

`outputs/classifier_report.json` 携带每个案例的动作动词、严重性、编辑后输出和完整判决列表。
