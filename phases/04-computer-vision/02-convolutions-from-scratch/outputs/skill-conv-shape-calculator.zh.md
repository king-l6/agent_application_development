---
name: skill-conv-shape-calculator
description: 逐层遍历 CNN 规范，报告每个块的输出形状、感受野和参数数量
version: 1.0.0
phase: 4
lesson: 2
tags: [computer-vision, cnn, architecture, debugging]
---

# 卷积形状计算器

一个用于规划或调试 CNN 的确定性辅助工具。给定输入形状和层规范列表，在不运行模型的情况下追踪形状、感受野和参数数量。

## 何时使用

- 设计一个新的 CNN，想要验证每个下采样落在整齐的尺寸上。
- 阅读论文并将架构表格转换为代码。
- 预训练骨干在分类器头部出现形状不匹配崩溃，需要知道哪个层改变了空间尺寸。
- 在训练之前比较两个骨干的参数效率。

## 输入

- `input_shape`: `(C, H, W)`。
- `layers`: 层字典的有序列表。每个支持：
  - `{type: "conv", c_out, k, s, p, groups=1, bias=true}`
  - `{type: "pool", mode: "max"|"avg", k, s, p=0}`
  - `{type: "adaptive_pool", out_h, out_w}`
  - `{type: "flatten"}`
  - `{type: "linear", out_features, bias=true}`

## 步骤

1. **初始化追踪** 使用 `(C, H, W)`、感受野 `1`、有效步长 `1`、累积参数 `0`。

2. **对于每层**，按此顺序更新：
   - 计算 `C_out`（卷积/线性），或通过池化携带 `C_in`。
   - 使用卷积和池化的 `(H + 2P - K) / S + 1`、自适应池化的 `out_h/out_w`、展平输出形状的 `(C * H * W, 1, 1)`（在 linear 之前），以及标量 `1x1`（用于 linear），计算空间输出。
   - 更新感受野和有效步长：
     - 卷积/池化：`RF_new = RF_old + (K - 1) * effective_stride`，`effective_stride *= S`。
     - 自适应池化：视为有效 `S = H_in / out_h`（向下取整）的池化。`RF_new = RF_old + (H_in - 1) * effective_stride_old`；`effective_stride *= S`。注意自适应池化的感受野等于完整的先前空间范围。
     - 展平/线性：感受野和有效步长不再有意义；冻结为展平前的值，并从后续行中省略。
   - 计算参数：
     - 卷积：`C_out * (C_in / groups) * K * K + (C_out if bias else 0)`。
     - 线性：`out_features * in_features + (out_features if bias else 0)`。
     - 池化和展平：0。

3. **检测问题** 并标记：
   - 非整数输出尺寸（步长/填充未对齐）。
   - 在堆叠结束前 `H_out <= 0`。
   - 感受野超过输入尺寸（此后可能浪费计算）。
   - 每层参数突然 10 倍跳跃，表明通道规划错误。

4. **报告** 为单个表格：

```
idx  layer                C_in  C_out  K  S  P  H_out  W_out  RF    params     cum_params
1    conv 3x3 s=1 p=1     3     32     3  1  1  224    224    3     896        896
2    conv 3x3 s=2 p=1     32    64     3  2  1  112    112    7     18,496     19,392
3    pool max 2x2         64    64     2  2  0  56     56     11    0          19,392
...
```

5. **摘要行**：最终 `(C, H, W)`、最终感受野、总参数、警告。

## 规则

- 始终返回整数空间尺寸。如果公式产生非整数，标记为错误，不要静默取整。
- 当 `groups > 1` 时，验证 `C_in % groups == 0` 和 `C_out % groups == 0`；否则报错。
- 对于深度可分离卷积（`groups == C_in`），在 `layer` 列中标注，使读者明白为什么参数少。
- 如果用户提供 BatchNorm 或激活层，忽略它们对形状的影响，但携带参数（每个 BatchNorm 的 `2 * C`）。
- 永远不要为缺失的字段猜测默认值。要求每个卷积和池化提供 `k`、`s`、`p`。
