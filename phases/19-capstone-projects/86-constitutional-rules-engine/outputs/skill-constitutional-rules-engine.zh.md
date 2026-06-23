---
name: skill-constitutional-rules-engine
description: 用于输出约束的声明式 YAML 规则引擎，具有严重性、解释、修复器操作和结构化差异
version: 1.0.0
phase: 19
lesson: 86
tags: [safety, rules, constitutional]
---

# 宪法规则引擎

宪法是一个 YAML 文件。每条规则有 `name`、`severity`（low | medium | high）、`applies_when`（谓词）、`must`（谓词）、`explanation` 和可选的 `fix`。

## 谓词

原子：

- `contains_regex` / `not_contains_regex`
- `starts_with_regex` / `ends_with_regex`
- `max_words` / `min_words`

组合：

- `all_of: [...predicates]`
- `any_of: [...predicates]`
- `not_: predicate`

## 修复操作

- `append_if_missing: <suffix>`
- `prepend_if_missing: <prefix>`
- `replace_regex: { pattern: <regex>, replacement: <text> }`

## 引擎输出

`Engine.evaluate(text) -> EngineReport` 为每条规则返回一个 `RuleResult`，其 `status` 为 `pass`、`violation`、`not_applicable`。`report.violations()` 过滤到违规，`report.max_severity()` 返回最严重的严重性。

## 工件

`outputs/rules_report.json` 携带每个案例的草稿、修订版和结构化差异。
