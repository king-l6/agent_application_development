---
name: skill-point-cloud-loader
description: 为 .ply / .pcd / .xyz 文件编写 PyTorch Dataset，包含正确的归一化、中心化和点采样
version: 1.0.0
phase: 4
lesson: 13
tags: [3d-vision, point-cloud, data-loading, pytorch]
---

# 点云加载器

将 3D 扫描文件的文件夹转换为可立即用于训练的 PyTorch `Dataset`。

## 何时使用

- 开始一个新的点云分类/分割项目。
- 在 `.ply`、`.pcd` 和 `.xyz` 格式之间切换。
- 调试一个无错误但收敛不佳的模型；通常数据加载器的归一化是错误的。

## 输入

- `data_root`：点云文件文件夹和可选的带有标签的 CSV。
- `file_format`：ply | pcd | xyz | npy。
- `num_points`：固定的采样大小，通常为 1024 或 2048。
- `augmentation`：none | rotate | jitter | mixup。

## 归一化策略

每个生产级点云流水线按顺序应用：

1. **居中** 点云：减去质心。
2. **缩放到单位球体**：除以到中心的最大距离。
3. **采样** `num_points` 个点。如果点云有更多点，使用**最远点采样（FPS）**以获得忠实形状表示，或随机采样以获得速度。如果更少，重复点。
4. **打乱** 点的顺序（顺序对模型来说本来就不应该重要，但打乱会打破偶然的顺序依赖）。

## 输出模板

```python
import numpy as np
import torch
from torch.utils.data import Dataset

try:
    import open3d as o3d
    HAS_O3D = True
except ImportError:
    HAS_O3D = False

def _read_ply(path):
    if HAS_O3D:
        pc = o3d.io.read_point_cloud(path)
        return np.asarray(pc.points, dtype=np.float32)
    # 备用：最小的 ascii-ply 读取器
    ...

def _fps(points, k):
    idx = np.zeros(k, dtype=np.int64)
    dist = np.full(len(points), np.inf)
    seed = np.random.randint(len(points))
    idx[0] = seed
    for i in range(1, k):
        dist = np.minimum(dist, ((points - points[idx[i-1]]) ** 2).sum(axis=1))
        idx[i] = int(np.argmax(dist))
    return idx

def normalise(points):
    centre = points.mean(axis=0)
    points = points - centre
    scale = np.max(np.linalg.norm(points, axis=1))
    return points / max(scale, 1e-8)

class PointCloudDataset(Dataset):
    def __init__(self, files, labels, num_points=1024, augment=False):
        self.files = files
        self.labels = labels
        self.num_points = num_points
        self.augment = augment

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        pts = _read_ply(self.files[i])
        pts = normalise(pts)
        if len(pts) >= self.num_points:
            idx = _fps(pts, self.num_points)
            pts = pts[idx]
        else:
            reps = int(np.ceil(self.num_points / len(pts)))
            pts = np.tile(pts, (reps, 1))[:self.num_points]
        # 打乱点顺序以打破任何偶然依赖（当平铺以确定性顺序重复点时尤其重要）。
        np.random.shuffle(pts)
        if self.augment:
            theta = np.random.uniform(0, 2 * np.pi)
            R = np.array([[np.cos(theta), 0, np.sin(theta)],
                          [0, 1, 0],
                          [-np.sin(theta), 0, np.cos(theta)]], dtype=np.float32)
            pts = pts @ R
            pts = pts + np.random.normal(0, 0.02, pts.shape).astype(np.float32)
        pts = np.ascontiguousarray(pts, dtype=np.float32)
        return torch.from_numpy(pts).transpose(0, 1), int(self.labels[i])
```

## 报告

```
[dataset]
  files:          <N>
  format:         <ply|pcd|xyz|npy>
  points_per_sample: <int>
  normalise:      centre + unit sphere
  sampling:       FPS | random
  augmentation:   <列表>
```

## 规则

- 始终在缩放之前居中；交换顺序会改变"单位球体"的含义。
- 对于形状任务，优先选择 FPS 而非随机采样；对于分割，随机采样没问题，反正每个点都重要。
- 评估期间永远不要做数据增强；只在训练期间做。
- 如果点云文件包含颜色或法线作为额外通道，扩展 Dataset 以返回 `(3 + C, num_points)` 张量，而不仅仅是 xyz。
