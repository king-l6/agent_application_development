---
name: skill-vit-patch-and-pos-embed-inspector
description: 验证 ViT 的块嵌入和位置嵌入形状是否匹配模型期望的序列长度
version: 1.0.0
phase: 4
lesson: 14
tags: [vision-transformer, debugging, pytorch]
---

# ViT 块和位置嵌入检查器

最常见的 ViT 移植 bug：加载在 224x224 上预训练的检查点到配置为 384x384 的模型（或反之）。位置嵌入的序列长度错误，模型静默产生垃圾。

## 何时使用

- 以非默认分辨率微调预训练 ViT。
- 审计为什么 ViT-B/16 和 ViT-B/32 之间的权重移植失败；检查器会标记块大小不匹配，使调用者知道应该切换架构而不是强制移植。
- 调试一个无错误加载但训练不佳的 ViT。

## 输入

- `model`：一个实例化的 ViT `nn.Module`。
- `expected_image_size`：模型在生产中将看到的 H x W。
- `patch_size`：期望的块大小。

## 步骤

1. 在模型内找到块嵌入卷积。报告其 `kernel_size`、`stride`、`in_channels`、`out_channels`。
2. 计算期望的块数量。对于方形图像：`(image_size / patch_size)^2`。对于矩形：`(H / patch_size) * (W / patch_size)`。要求 `H % patch_size == 0` 和 `W % patch_size == 0`；否则标记并拒绝。
3. 找到学习到的位置嵌入。报告其形状 `(1, N, dim)`。
4. 比较 `N` 与 `num_patches + 1`（带 CLS）或 `num_patches`（不带 CLS）。不匹配意味着检查点是在不同的分辨率或块大小下预训练的。
5. 检查块卷积的 `out_channels` 是否等于位置嵌入的 `dim`。
6. 如果模型应该为新的分辨率插值位置嵌入，验证插值工具存在（大多数 `timm` ViT 通过 `resize_pos_embed` 自动执行此操作）。

## 报告

```
[vit-inspector]
  image_size:         HxW
  patch_size:         <int>
  num_patches (computed): <int>
  patch_conv:         k=<int>  s=<int>  in=<int>  out=<int>
  pos_embed shape:    (1, N, dim)
  has CLS token:      yes | no
  pos_embed N:        <int>    expected: <int>
  verdict:            ok | mismatch

[if mismatch]
  action:  重新初始化 pos_embed 以适应新的序列长度
  tool:    timm.models.vision_transformer.resize_pos_embed
```

## 规则

- 永远不要在未警告的情况下静默插值；暴露操作，以便用户知道预训练的位置结构可能已改变。
- 如果 patch_size 不匹配，拒绝推荐插值——切换到正确的架构。
- 不要尝试在原地修复模型；报告并建议。
