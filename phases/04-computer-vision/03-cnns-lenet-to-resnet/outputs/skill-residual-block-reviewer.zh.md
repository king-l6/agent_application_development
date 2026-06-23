---
name: skill-residual-block-reviewer
description: 审查 PyTorch 残差块的跳跃连接正确性、BN 放置、激活顺序和形状对齐
version: 1.0.0
phase: 4
lesson: 3
tags: [computer-vision, resnet, code-review, pytorch]
---

# 残差块审查器

一个专注于审查任何声称实现残差块的 PyTorch `nn.Module` 的审查工具。捕获几乎每个有问题的 ResNet 重写中出现的四个错误。

## 何时使用

- 有人编写了自定义 BasicBlock 或 Bottleneck，损失为 NaN 或准确率卡住了。
- 你正在将一个块从一个框架移植到另一个框架，想要验证等效性。
- 你正在审查一个更改 ResNet 内部结构（预激活、squeeze-excite、抗混叠）的 PR。
- 一个模型在 CIFAR 尺寸输入上运行良好，但在 ImageNet 分辨率上崩溃，因为 shortcut 是错误的。

## 输入

- 一个 PyTorch 类定义，作为源代码或可导入路径。
- 可选 `variant`：`basic` | `bottleneck` | `preact` | `seblock`。

## 四个检查

### 1. Shortcut 形状对齐

对于任何 `stride != 1` 或 `in_channels != out_channels` 的块，shortcut 路径**必须**是一个形状匹配的模块——通常是 1x1 卷积加 BN。在这种情况下，裸 `nn.Identity()` 保证在前向时出现形状不匹配错误。

诊断：
```
[shortcut]
  detected:  nn.Identity | 1x1 Conv + BN | 1x1 Conv + BN + ReLU | other
  required:  如果 (stride != 1 or in_c != out_c) 用形状匹配的 Conv，否则用 Identity
  verdict:   ok | wrong | unnecessarily heavy
```

### 2. BN 相对于加法的放置

加法 `out + shortcut(x)` 必须在最终 ReLU **之前**发生（后激活，原始 ResNet），或者最终 ReLU 必须完全不存在（预激活 ResNet v2）。在主分支中应用 ReLU 然后添加原始 shortcut 的块会产生不对称的激活范围，损害训练。

诊断：
```
[activation order]
  pattern:  post-act (conv-BN-ReLU-conv-BN-add-ReLU) | pre-act (BN-ReLU-conv-BN-ReLU-conv-add) | other
  verdict:  ok | suspect
```

### 3. 卷积层上的偏置

紧接在 BatchNorm 之后的卷积应设置 `bias=False`。BN 的 beta 已经参数化了偏置，所以额外的卷积偏置浪费参数并可能减慢收敛。

诊断：
```
[bias]
  convs with BN and bias=True: <count>
  recommended fix: set bias=False on those layers
```

### 4. 原地操作 ReLU 和 autograd

将要与 shortcut 相加的张量上的 `nn.ReLU(inplace=True)` 会覆盖可能仍为残差加法所需的值。标记任何后面没有在加法之前产生新张量的层的 `inplace=True`。

诊断：
```
[in-place]
  risky inplace ops: <list>
  fix: inplace=False before the residual add
```

## 报告

```
[block-review]
  variant:       basic | bottleneck | preact | se | other
  shortcut:      ok | wrong | heavy
  activation:    ok | suspect
  bias-bn:       ok | <N> convs need bias=False
  in-place:      ok | <N> risky ops
  summary:       one sentence
```

## 规则

- 不要重写块。仅报告。
- 如果块是正确的，在所有地方说 `ok` 并停止。没有建议。
- 如果多个东西有问题，按上述顺序列出（shortcut 优先，因为它是导致崩溃的最常见原因）。
- 当用户已指定时，不要将有意的预激活或 squeeze-excite 变体标记为错误。
