---
name: skill-depth-to-pointcloud
description: 从深度图构建点云，正确处理内参并导出为 .ply 格式
version: 1.0.0
phase: 4
lesson: 26
tags: [depth, point-cloud, 3d, intrinsics]
---

# 深度图转点云

将深度图加上彩色图像转换为带纹理的点云，可导出用于可视化或进一步的 3D 工作。

## 何时使用

- 将深度预测可视化为实际的 3D 场景。
- 从单张图像自举稀疏 3D 重建。
- 在 SfM 失败时为 3DGS 训练生成输入。
- 将预测深度与 LiDAR 真实值进行比较。

## 输入

- `depth`: `(H, W)` numpy 深度数组，单位与你希望输出的单位相同（推荐米）。
- `rgb`: `(H, W, 3)` numpy 颜色数组（uint8 或 float32 [0, 1]）。
- `intrinsics`: `(fx, fy, cx, cy)`，像素单位。
- 可选 `depth_scale`: 将预测深度单位转换为米的乘数。

## 流程

1. **验证**——深度在你计划包含的所有位置必须为正且有限。屏蔽无效像素。
2. **提升**——每个像素：`X = (u - cx) * d / fx`，`Y = (v - cy) * d / fy`，`Z = d`。
3. **与 RGB 配对**——每个 3D 点从匹配像素获取 `(r, g, b)` 三元组。
4. **导出**——PLY（可移植）、`.xyz`（轻量级）、`.pcd`（Open3D 原生）、`.las`/`.laz`（地理空间）。

## 实现模板

```python
import numpy as np

def depth_to_point_cloud(depth, intrinsics, depth_scale=1.0, min_depth=0.1, max_depth=100.0):
    H, W = depth.shape
    fx, fy, cx, cy = intrinsics
    v, u = np.meshgrid(np.arange(H), np.arange(W), indexing="ij")
    z = depth.astype(np.float32) * depth_scale
    valid = (z > min_depth) & (z < max_depth) & np.isfinite(z)
    x = (u - cx) * z / fx
    y = (v - cy) * z / fy
    points = np.stack([x, y, z], axis=-1)
    return points, valid


def write_ply(path, points, colors=None, valid_mask=None):
    p = points.reshape(-1, 3)
    if valid_mask is not None:
        p = p[valid_mask.flatten()]
    lines = [
        "ply",
        "format ascii 1.0",
        f"element vertex {p.shape[0]}",
        "property float x", "property float y", "property float z",
    ]
    if colors is not None:
        c = colors.reshape(-1, 3).astype(np.uint8)
        if valid_mask is not None:
            c = c[valid_mask.flatten()]
        lines += ["property uchar red", "property uchar green", "property uchar blue"]
    lines.append("end_header")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
        if colors is not None:
            for pt, col in zip(p, c):
                f.write(f"{pt[0]:.4f} {pt[1]:.4f} {pt[2]:.4f} {col[0]} {col[1]} {col[2]}\n")
        else:
            for pt in p:
                f.write(f"{pt[0]:.4f} {pt[1]:.4f} {pt[2]:.4f}\n")
```

## 报告

```
[export]
  input depth shape:  (H, W)
  valid points:       <N> / <H*W>
  output format:      ply | xyz | pcd | las
  coordinate system:  camera (+X 向右, +Y 向下, +Z 向前)
  scale:              metres | millimetres | normalised
```

## 规则

- 始终屏蔽无效深度（零、NaN、inf、饱和值）；包含它们会产生一堆位于原点的垃圾点。
- 对于来自相对深度模型的预测，不要以度量单位导出；在输出文件名前添加 `relative_` 前缀以标示约定。
- 保持相机坐标约定一致（OpenCV：+X 向右，+Y 向下，+Z 向前）。如果下游工具期望 OpenGL（+Y 向上），则交换符号。
- 对于密集场景（> 100 万个点），提供子采样参数；大于 500 MB 的 PLY 文件在所有地方加载都不方便。
- 绝不要静默剪裁深度以产生"合理"的输出；用带告警的阈值显式剪裁，以便用户知道丢弃了什么。
