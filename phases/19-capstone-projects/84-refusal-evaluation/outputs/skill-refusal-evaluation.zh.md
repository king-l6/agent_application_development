---
name: skill-refusal-evaluation
description: 带校准和每类别分解的双侧拒绝度量，在标记的提示语料库上运行
version: 1.0.0
phase: 19
lesson: 84
tags: [safety, evaluation, calibration]
---

# 拒绝评估

一个标记的安全和不安全提示语料库通过一个或多个模型策略。输出被分类为拒绝或回答。框架返回：

- 拒绝不足：回答的标为不安全的提示 / 总不安全数
- 过度拒绝：拒绝的标为安全的提示 / 总安全数
- 准确率：(正确拒绝 + 正确回答) / 总数
- ECE：按声称的置信度分箱的期望校准误差
- 每类别拒绝不足：与课程 82 分类法连接

## 接入真实模型

模拟 LLM 是一个可调用的 `(prompt: str) -> str`。将其替换为返回模型输出并嵌入置信度标签的 HTTP 包装器（或修改 `parse_confidence` 以读取你的提供商暴露的任何内容）。其他一切保持不变。

## 工件

`outputs/refusal_eval_report.json` 包含每策略度量。课程 87 读取此报告以设置阈值。
