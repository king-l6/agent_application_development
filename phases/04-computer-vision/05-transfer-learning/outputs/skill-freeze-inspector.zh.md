---
name: skill-freeze-inspector
description: 报告哪些参数可训练、哪些 BatchNorm 层处于评估模式，以及优化器是否实际消耗可训练参数
version: 1.0.0
phase: 4
lesson: 5
tags: [computer-vision, transfer-learning, debugging, pytorch]
---

# 冻结检查器

迁移学习 bug 隐藏在三个地方：应该冻结但未冻结的参数、应该可训练但不可训练的参数、以及在冻结状态更改之前构建的优化器。这个技能一次性暴露所有三个。

## 何时使用

- 在设置参数子集的 `requires_grad` 之后立即使用。
- 在微调运行的第一个训练步骤之前。
- 在调用 `freeze_bn_stats` 或任何翻转 BN 模式的辅助函数之后。
- 当验证准确率卡在随机水平且你怀疑实际上没有任何东西在训练时。

## 输入

- `model`: 一个 PyTorch `nn.Module`。
- `optimizer`: 将要用于训练的优化器。
- 可选 `expected_frozen_prefixes`: 应该冻结的参数名前缀列表（例如 `["conv1", "bn1", "layer1"]`）。

## 步骤

1. **遍历参数。** 对于每个 `(name, param)`：
   - 记录 `requires_grad`
   - 记录 `shape` 和 `numel`

2. **遍历模块。** 对于每个模块：
   - 如果是 BatchNorm，记录它是否处于评估模式以及其仿射参数是否可训练。

3. **检查优化器。** 对于每个参数组：
   - 将其 `params` 展平为 `id(p)` 的集合。
   - 与 `requires_grad == True` 的参数的所有 `id(p)` 集合进行比较。

4. **检测四种失败模式：**
   - `leaked_train`（泄漏训练）：参数有 `requires_grad=True` 但未出现在优化器中（梯度被计算但从未应用）。
   - `ghost_train`（幽灵训练）：参数出现在优化器中但 `requires_grad=False`（优化器状态被浪费；如果你后来重新启用 requires_grad，也可能导致 bug）。
   - `bn_mismatch`（BN 不匹配）：要么 (a) BN 层处于训练模式（积累运行统计量）而它的仿射参数（`weight`、`bias`）被冻结，要么 (b) BN 层处于评估模式（统计量冻结）而它的仿射参数可训练。两种状态都不一致，几乎总是 bug。
   - `expected_vs_actual`（预期与实际）：`expected_frozen_prefixes` 中列出的任何前缀仍然有可训练的参数。

## 报告

```
[freeze-inspector]
  model trainable params: <N>
  model frozen params:    <N>
  batchnorm layers in eval mode: <count>
  batchnorm layers in train mode: <count>

[optimizer coverage]
  trainable params fed to optimizer: <M> of <N>
  leaked_train: <name 列表> (可训练但不在优化器中)
  ghost_train:  <name 列表> (在优化器中但已冻结)

[bn audit]
  mismatched layers: <name 列表>

[expectations]
  expected_frozen_prefixes: <...>
  violating params:         <列表>

[verdict]
  ok | <最严重问题的一行摘要>
```

## 规则

- 仅报告参数名；永远不打印权重本身。
- 按参数名的字母顺序排序每个列表。
- 如果优化器覆盖率为 100% 且没有不匹配，返回 `ok` 并停止。
- 对于 `leaked_train`，始终推荐在冻结状态更改后重建优化器。
- 对于 `ghost_train`，推荐移除参数组或如果意图是训练它，则设置 `requires_grad=True`。
