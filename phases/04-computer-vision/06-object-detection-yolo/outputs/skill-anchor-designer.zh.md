---
name: skill-anchor-designer
description: 给定真实框数据集，在 (w, h) 上运行 k-means 并返回每个 FPN 级别的锚点集加上覆盖统计信息
version: 1.0.0
phase: 4
lesson: 6
tags: [computer-vision, detection, anchors, kmeans]
---

# 锚点设计器

锚点是基于锚点的检测器中最具数据集特异性的超参数。默认的 COCO 锚点在细胞培养图像、卫星瓦片或小物体监控上表现不佳。这个技能推导出实际匹配目标数据的锚点。

## 何时使用

- 在新数据集上进行第一次训练运行之前。
- 当在非常小或非常大的物体上的召回率在原本健康的模型上很弱时。
- 在框尺寸分布可能发生变化的主要数据集扩展之后。

## 输入

- `boxes`：形状为 (N, 4) 的 numpy 数组，格式为 `(cx, cy, w, h)` 或 `(x1, y1, x2, y2)`；建议至少 1000 个正框。
- `num_anchors_per_level`：通常为 3。
- `num_fpn_levels`：通常为 3（P3、P4、P5）或 4。
- `input_size`：训练分辨率的 HxW。
- 可选 `strides`：每层步长；省略时，取 `[8, 16, 32, 64]` 的前 `num_fpn_levels` 个条目。如果检测器的 FPN 有不同的步长，显式传入更长或更短的数组。

## 步骤

1. **归一化框** 为 `(w, h)` 对，以 `input_size` 的像素为单位。删除任何 w 或 h < 2 像素的框。

2. **运行 k-means** 在 `(w, h)` 对上，`k = num_anchors_per_level * num_fpn_levels`。使用 `1 - IoU(box, cluster)` 作为距离函数，而不是欧几里得距离——欧几里得距离在 `(w, h)` 上会将细高的框和方框混在一起。所有框平等贡献（无权重）；如果你有一个类别不平衡的数据集并希望提高大框的召回率，在输入数组中重复稀有类别的框，而不是传入权重向量。

3. **按面积升序对聚类排序。** 分成 `num_fpn_levels` 组，每组 `num_anchors_per_level`。最小的面积分配给最高分辨率级别（最小步长）。

4. **计算每层覆盖统计信息：**
   - 每个真实框到该层最佳锚点的 `median IoU`。
   - `recall@IoU=0.5` — 最佳锚点 IoU >= 0.5 的框的百分比。
   - `area coverage` — 面积落在该层 `[anchor_min_area / 4, anchor_max_area * 4]` 内的框的百分比。

5. **报告每层锚点** 并标记 `recall@IoU=0.5 < 0.9` 的层；该层的锚点与数据匹配不佳，应重新调整或增加每层锚点数量。

## 报告格式

```
[anchor-designer]
  total boxes:         <N>
  clusters:            <k>
  distance metric:     1 - IoU

[level P3  stride=8]
  anchors (w, h):      [(A, B), (C, D), (E, F)]
  median IoU:          <X>
  recall@IoU=0.5:      <X>
  coverage:            <X>
  flag:                ok | retune

[level P4  stride=16]
  ...

[summary]
  overall recall@IoU=0.5: <X>
  smallest anchor:        <w x h>
  largest anchor:         <w x h>
  recommendation:         <如果有任何层标记则给一句话>
```

## 规则

- 始终使用基于 IoU 的距离；欧几里得 k-means 产生视觉上合理但经验上更差的锚点。
- 按面积排序聚类，然后按升序分配给各层。
- 当 `num_anchors_per_level = 1` 时，完全跳过 k-means：将框按面积分位数分成 `num_fpn_levels` 个箱（例如 3 层用三分位数），并将每层锚点设置为每箱的中位数 (w, h)。这比在小数据集上运行 `k = num_fpn_levels` 的 k-means 更鲁棒。
- 永远不要输出负的锚点尺寸；裁剪为 1。
- 如果数据集少于 200 个框，警告用户锚点搜索不可靠，并推荐使用默认 COCO 锚点加更多训练数据。
