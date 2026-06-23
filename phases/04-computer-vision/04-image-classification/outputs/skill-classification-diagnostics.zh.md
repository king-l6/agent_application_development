---
name: skill-classification-diagnostics
description: 给定混淆矩阵和类名，暴露每类失败并提出单个最有影响力的修复
version: 1.0.0
phase: 4
lesson: 4
tags: [computer-vision, classification, evaluation, debugging]
---

# 分类诊断

混淆矩阵的阅读透镜。聚合准确率告诉你一个分类器有效。混淆矩阵告诉你*它还不知道什么*。

## 何时使用

- 首次查看训练好的分类器的验证性能。
- 在训练运行之间决定下一步更改什么。
- 交付模型之前：验证没有关键类静默地失败。
- 调试生产回归，其中整体准确率下降了一个点，你需要知道为什么。

## 输入

- `cm`：C x C 混淆矩阵（行 = 真实，列 = 预测）。
- `labels`：C 个类名的列表，顺序相同。
- 可选 `class_priors`：每类训练频率（默认为 `cm` 的行和）。

## 步骤

1. **计算每类指标。** 将任何除以零视该类别的指标为未定义，并报告为 `n/a`；永远不要静默替换为 0。
   - precision_i = cm[i,i] / sum(cm[:, i])   （当类别从未被预测时未定义）
   - recall_i    = cm[i,i] / sum(cm[i, :])   （当类别没有真实样本时未定义）
   - f1_i        = 2 * p * r / (p + r)        （当任一组件未定义时未定义）

2. **按 F1 排序最多三个最差类别。** 如果混淆矩阵少于三个类别，排序存在的任意多个。排除所有指标都未定义的类别。

3. **找到每行中最大的非对角线单元格**——最常从此类别窃取的类别。报告为 `true -> predicted`。

4. **对每个最差类别的失败模式进行分类。** 使用这些定量阈值，使标签可重现：
   - `ambiguity`（模糊）——与另一个类别的双向混淆：同时满足 `cm[i,j] / sum(cm[i, :]) >= 0.15` 和 `cm[j,i] / sum(cm[j, :]) >= 0.15`。
   - `imbalance`（不平衡）——该类别的训练计数 < 其最大混淆者的 0.5 倍。
   - `label_noise`（标签噪声）——`|precision_i - recall_i| >= 0.2` 且类别不在不平衡/模糊路径上。
   - `systematic`（系统性）——没有单个混淆者超过该类错误的 0.2 份额；错误分布在三个或更多其他类别之间。

5. **推荐单个最有影响力的后续动作**：
   - `ambiguity` -> 收集或合成判别性示例，添加保留区分特征的针对性数据增强。
   - `imbalance` -> 对少数类进行过采样或应用类加权损失。
   - `label_noise` -> 审计该类别的分层样本；在任何其他更改之前修复错误标签。
   - `systematic` -> 增加该类别的数据或使用更高权重微调该类别的损失。

## 报告

```
[diagnostics]
  aggregate accuracy: X.XX
  macro F1:           X.XX

[top-3 worst classes]
  1. class <name>  F1 = X.XX  prec = X.XX  rec = X.XX
     top confusion: <name> -> <other>  (N cases)
     failure mode:  ambiguity | imbalance | label_noise | systematic
     action:        <一句话>

  2. ...
  3. ...

[recommendation]
  single biggest lever: <一句话，命名类别和修复>
```

## 规则

- 最多返回三个类别。更多会隐藏信号。
- 为每个最差类别命名主要的混淆者；永远不要总结为"与许多混淆"。
- 将每个建议基于混淆矩阵证据。没有指定类别的通用"添加更多数据"。
- 当精度和召回率相差超过 0.2 时，始终将标签噪声标记为候选——真实类别在训练后通常具有对齐的 P 和 R。
