---
name: skill-frame-sampler-auditor
description: 审计视频流水线的帧采样器，检查差一错误、短片段处理和裁剪一致性
version: 1.0.0
phase: 4
lesson: 12
tags: [computer-vision, video, sampling, debugging]
---

# 帧采样器审计器

帧采样是视频流水线出问题的地方。这里的错误会传播到每个下游指标中。

## 何时使用

- 编写新的视频数据加载器。
- 复现论文中的数字但训练准确率低于报告值。
- 调试评估准确率跨运行不稳定的视频模型。

## 输入

- `sampler_code`：接收 (num_frames_total, T) 并返回 T 个索引的 Python 函数。
- `T`：目标片段长度。
- 可选测试用例：要测试的 `num_frames_total` 值（例如 `[3, T-1, T, T+1, 30, 300, 3000]`）。

## 检查项

### 1. 短片段处理
提供 `num_frames_total < T`。每个返回的索引必须在 `[0, num_frames_total - 1]` 内。标准的填充策略是重复最后一帧以填充剩余位置。

### 2. 边界索引
提供 `num_frames_total == T`。返回的索引应精确为 `[0, 1, ..., T-1]`。

### 3. 均匀分布
提供 `num_frames_total == 10 * T`。返回的索引应单调递增且大致等间距。

### 4. 密集窗口边界
对于密集采样，提供 `num_frames_total == 3 * T`。返回的索引应形成连续窗口，绝不越过片段末尾。

### 5. 确定性
使用相同的输入和（对于确定性采样器）相同的 RNG 两次调用采样器。索引应匹配。

### 6. 裁剪一致性
如果流水线还返回每帧的空间裁剪，使用相同种子为同一片段运行采样器两次，并确认每帧使用相同的裁剪框（相同 `(x, y, w, h)`）。一个片段内每帧不同的裁剪会破坏时间连贯性，是一个经典的静默错误。可接受的差异：增强*按片段*应用，在片段内保持一致。

## 报告

```
[sampler audit]
  name: <函数名>
  T:    <整数>

[short-clip handling]
  passed | failed (<详情>)

[boundary]
  passed | failed

[uniform spacing]
  passed | failed (<间隙标准差>)

[dense window]
  passed | failed (<详情>)

[determinism]
  passed | failed

[crop consistency]
  passed | failed (<逐帧裁剪变化：是/否>)

[verdict]
  ok | fix required
```

## 规则

- 如果短片段处理返回越界索引，永远不要将采样器标记为"ok"。
- 密集采样器绝不应返回跨越 `num_frames_total - 1` 的窗口。
- 如果采样器是随机的（密集），只在使用显式种子的 RNG 时测试确定性。
- 建议（但不静默修复）标准策略：用最后一帧填充、将窗口限制在末尾、四舍五入半开区间。
