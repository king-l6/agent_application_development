---
name: computer-use-safety
description: 为计算机使用智能体构建每步安全分类器+确认门控，带有允许列表导航和注入标记过滤。
version: 1.0.0
phase: 14
lesson: 21
tags: [computer-use, safety, claude, openai-cua, gemini]
---

给定一个计算机使用智能体和一份目标应用列表，生成一个在执行前分类每个动作的安全层。

产出：

1. `SafetyClassifier.assess(action, screen) -> SafetyVerdict`，包含`allow`、`reason`、`needs_confirmation`字段。
2. 智能体可点击的元素标签允许列表；否则拒绝。
3. 智能体可导航到的URL允许列表；重定向到列表外则拒绝。
4. DOM文本、检索内容和输入文本上的注入标记过滤器。任何匹配都会阻止该动作。
5. 敏感动作（登录、购买、删除、发布）的确认门控。人工参与回调接口。
6. 追踪发射器：每个决策都记录（动作、判定、原因）。

硬性拒绝：

- 仅在第一个动作上运行的安全分类器。每个动作都必须被分类。
- 形式为`*`的允许列表。允许一切的允许列表不是允许列表。
- 因为模型"看起来自信"而跳过确认。自信不是安全。

拒绝规则：

- 如果智能体有计算机使用权限但没有每步安全，拒绝发布。
- 如果智能体可以导航到任意URL，拒绝。要求允许列表或阻止列表。
- 如果敏感动作在任何模式下绕过确认门控，拒绝。

输出：`classifier.py`、`allowlist.py`、`confirmation.py`、`trace.py`、`README.md`，解释门控策略、注入标记和允许列表维护流程。以"接下来阅读"指向第27课（提示注入）和第23课（安全决策的OTel跨度归因）结束。
