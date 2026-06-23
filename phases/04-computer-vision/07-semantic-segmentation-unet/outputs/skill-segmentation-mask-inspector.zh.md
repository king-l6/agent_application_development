---
name: skill-segmentation-mask-inspector
description: 报告类别分布、预测掩膜统计信息，以及最可能预测不足或边界模糊的类别
version: 1.0.0
phase: 4
lesson: 7
tags: [computer-vision, segmentation, debugging, evaluation]
---

# 分割掩膜检测器

用于诊断"损失下降了"和"掩膜看起来实际正确"之间的差距。

## 何时使用

- 训练刚刚结束，mIoU 看起来不错但视觉检查表明并非如此时。
- 部署之前：检查预测与真实值的类别平衡情况。
- 当大目标的每类 IoU 很高但小目标的很低时。
- 调试在 IoU 中不显示的边界伪影，因为它们像素数很少。

## 输入

- `preds`：(N, H, W) 预测类别 ID 的张量。
- `targets`：(N, H, W) 真实类别 ID 的张量。
- `num_classes`：整数。
- 可选 `class_names`：C 个字符串的列表。

## 步骤

1. **类别像素直方图。** 计算 `preds` 和 `targets` 中每个类别像素的百分比。标记任何 `|预测% - 真实%| / max(真实%, 1e-6) > 0.30`（相对偏差超过 30%）的类别。对于真实值中缺失的类别（`真实% == 0`），直接标记任何预测占比超过 `0.3` 的类别。

2. **每类 IoU** 和**每类边界 F1**。边界 F1 通过将每个掩膜膨胀 3 个像素、求交集并评分来计算。IoU > 0.7 但边界 F1 < 0.5 的类别存在边缘模糊问题。

3. **小目标召回率。** 将每个真实连通分量按大小分桶（微小 < 100 px，小 < 1000 px，中 < 10000 px，大 >= 10000 px）。报告每个类别每个桶的召回率。小目标召回率低于 0.3 而大目标召回率高于 0.9 表明存在分辨率/感受野问题。

4. **混淆对。** 对于每个类别，找出它最常与之混淆的类别（在其真实掩膜内最常见的错误预测类别）。报告前 3 对。

5. **饱和度检查（需要 `probs` 或 `logits`，不仅仅是 `preds`）。** 如果调用者传递了原始逐像素概率分布 `probs: (N, C, H, W)`，计算每个类别中 `probs.max(dim=1) > 0.99` 的像素比例。高饱和度（超过某个类别 90% 的像素）表明过度自信 — 建议使用标签平滑或校准。当只有 argmax 后的 `preds` 可用时，跳过此步骤并在报告中注明。

## 报告格式

```
[mask-inspector]
  classes: C

[class distribution]
  name       gt %    pred %   delta
  ...

[metrics]
  class       IoU     bF1    recall_tiny  recall_small  recall_medium  recall_large
  ...

[confusion pairs]
  class A confused with class B: <N> pixels (most common)
  class B confused with class A: <N> pixels
  ...

[verdict]
  most impactful issue: <一句话>
```

## 规则

- 按真实像素占比降序排列类别行，使最频繁的类别排在前面。
- 将 IoU < 0.4 或边界 F1 < 0.3 的类别标记为 `critical`。
- 当小目标召回率是主要失败原因时，推荐：更高分辨率的训练、最后一个编码器阶段的更小步长、或特征金字塔解码器。
- 当边界 F1 是主要失败原因时，推荐：边界感知损失（Lovasz 或 BoundaryLoss）、带水平翻转的 TTA、以及无步长解码器。
- 永远不要只输出类别索引作为唯一标识符；如果提供了 `class_names`，在每一行中使用它。
