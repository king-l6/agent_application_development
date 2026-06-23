---
name: skill-image-tensor-inspector
description: 检查任何图像形状的张量或数组，报告数据类型、布局、范围，以及它看起来是原始、归一化还是标准化的
version: 1.0.0
phase: 4
lesson: 1
tags: [computer-vision, debugging, preprocessing, tensors]
---

# 图像张量检查器

一个诊断技能，适用于视觉流水线中任何你持有一个图像形状的数组、需要确切知道它处于什么状态的点。

## 何时使用

- 预训练模型返回垃圾预测，你怀疑是预处理的问题。
- 在 OpenCV 和 torchvision 之间迁移流水线，通道顺序不清楚。
- 堆叠来自多个框架的层，批次轴不断出现在错误的位置。
- 调试训练循环，其中损失卡在 `log(num_classes)`。

## 输入

- `x`：任何 2 维、3 维或 4 维的类数组（NumPy、PyTorch、JAX）。
- 可选 `expected`：要检查的不变性字典，例如 `{"layout": "CHW", "range": "standardized"}`。

## 步骤

1. **解析后端** — 检测 `x` 是 NumPy、Torch 还是 JAX。转换为 NumPy 进行检查，不改变原始数据。

2. **分类秩**：
   - rank 2 -> 单通道图像 (H, W)。
   - rank 3 -> 如果最后一个轴是 1、3 或 4 且严格小于其他两个，则为 `HWC`；否则为 `CHW`。
   - rank 4 -> 如果轴 1 在 {1, 3, 4} 中 **且** 轴 2 或轴 3 大于 16，则优先选择 `NCHW`；否则优先选择 `NHWC`。纯轴 1 检查会错误分类像 `(3, 4, 224, 3)` 这样的小图像 NHWC 批次。
   - 始终将模糊情况（例如 `(1, 3, 3, 3)`）标记为 `ambiguous`，而不是猜测；要求调用者提供 `expected`。

3. **分类数据类型和范围**：
   - `uint8` 在 [0, 255] 中 -> `raw`。
   - `float*` 且 min >= 0 且 max <= 1.01 -> `normalized`。
   - `float*` 且 min < 0 且 |mean| < 0.5 且 0.5 <= std <= 1.5 -> `standardized`。
   - 其他情况 -> `unusual`，打印直方图。

4. **每个通道统计** — 报告每个通道的均值和标准差。如果数组看起来是标准化的，将其与 ImageNet 均值/标准差进行比较并呈现匹配置信度。

5. **报告** 使用这个确切的块：

```
[inspector]
  backend:   numpy | torch | jax
  rank:      2 | 3 | 4
  layout:    HW | HWC | CHW | NHWC | NCHW
  dtype:     <dtype>
  shape:     <shape>
  range:     raw | normalized | standardized | unusual
  min/max:   <min> / <max>
  per-channel mean: [ ... ]
  per-channel std:  [ ... ]
  likely source:    camera | PIL | OpenCV | torchvision | random init
  likely target:    display | training | inference
```

6. **根据 `likely target` 推荐下一步操作**：
   - 对于 `display`：转置为 HWC，裁剪，转换为 uint8。
   - 对于 `training`：用数据集统计量标准化，转置为 CHW，添加批次轴。
   - 对于 `inference`：匹配模型卡中的确切不变性。

## 规则

- 永远不要改变输入。仅打印诊断信息。
- 如果提供了 `expected`，用 `[expected X got Y]` 标记每个不匹配。
- 当布局或通道顺序模糊时，指出静默失败风险。
- 一次推荐一个操作，而不是一个选项列表。
