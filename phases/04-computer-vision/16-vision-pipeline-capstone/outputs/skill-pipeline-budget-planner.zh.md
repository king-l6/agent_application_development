---
name: skill-pipeline-budget-planner
description: 根据目标延迟和吞吐量为每个管线阶段分配时间预算，并标记哪个阶段会首先超出预算
version: 1.0.0
phase: 4
lesson: 16
tags: [vision, pipeline, performance, deployment]
---

# 管线预算规划器

将延迟/吞吐量目标转化为逐阶段预算，使每个团队成员都知道他们正在优化的数值目标。

## 使用时机

- 在构建新的视觉服务之前，为每个阶段设定预期。
- 在首次基准测试之后，查看哪个阶段离其预算最远。
- 当 SLA 发生变化且需要重新协商预算时。

## 输入

- `p95_latency_target_ms`: 每请求预算。
- `target_qps`: 每副本吞吐量。
- `stages`: `{ name: str, current_ms: float }` 列表。

## 分配规则

如果未提供当前测量值，七个标准阶段的默认分配：

| 阶段 | 占比 |
|-------|------|
| 解码 + 预处理 | 15% |
| 检测器前向传播 | 55% |
| 检测后处理（NMS，限制） | 5% |
| 裁剪 + 调整大小用于分类器 | 5% |
| 分类器前向传播 | 15% |
| 模式验证 | <1% |
| 响应序列化 | 4% |

在 GPU 绑定的管线（云端）上，检测器占比通常升至 70%。在 CPU 上，预处理和分类器批处理消耗更多。

## 报告

```
[预算方案]
  p95 target:  <ms>
  throughput:  <qps per replica>

| stage               | target_ms | current_ms | headroom | gate |
|---------------------|-----------|------------|----------|------|
| decode+preprocess   | ...       | ...        | ...      | ok|X |
| detector            | ...       | ...        | ...      | ok|X |
| ...                 | ...       | ...        | ...      |      |

[bottleneck]
  stage:  <name>
  miss:   <超出预算 ms>
  lever:  <具体行动>

[levers]
  decode+preprocess:   Pillow-SIMD, libjpeg-turbo, 在 GPU 上通过 NVJPEG 解码
  detector:            更小的骨干网络, 更低输入分辨率, INT8, TensorRT
  postprocess:          GPU 端 NMS (torchvision.ops), 融合掩码
  crop+resize:         使用 grid_sample 的 GPU 裁剪, 批处理插值
  classifier:          更小的骨干网络, INT8, 预热缓存, 批处理
  schema:              在热路径中跳过验证, 仅在边界处验证
  response:            orjson, 流式 protobuf
```

## 规则

- 绝不要建议从生产路径中移除模式验证；提议将其移至边界处。
- 如果预处理超出预算，在更换模型之前始终先尝试 Pillow-SIMD 或 NVJPEG。
- 如果检测器超出幅度超过目标的 30%，直接更换模型而不是优化当前模型。
- 当 current_ms > 1.1 * target_ms 时将 gate 标记为 `X`；如果在预算的 10% 以内则标记 `ok`。
