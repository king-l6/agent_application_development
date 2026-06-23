# 多目标追踪与视频记忆

> 追踪就是检测加关联。检测每一帧。将当前帧的检测与上一帧的轨迹按 ID 匹配。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 4 第 06 课（YOLO 检测），阶段 4 第 08 课（Mask R-CNN），阶段 4 第 24 课（SAM 3）
**时间：** ~60 分钟

## 学习目标

- 区分基于检测的追踪和基于查询的追踪，并列举算法家族（SORT、DeepSORT、ByteTrack、BoT-SORT、SAM 2 记忆追踪器、SAM 3.1 Object Multiplex）
- 从零实现 IoU + 匈牙利匹配，用于经典的基于检测的追踪
- 解释 SAM 2 的记忆库及其在处理遮挡方面优于基于 IoU 关联的原因
- 理解三个追踪指标（MOTA、IDF1、HOTA），并能根据用例选择合适的指标

## 问题

检测器告诉你单帧中对象的位置。追踪器告诉你第 `t` 帧中的哪个检测与第 `t-1` 帧中的检测是同一个对象。没有追踪，你就无法统计跨越某条线的对象数量、追踪球在遮挡后的运动，或者知道"4 号车已在车道中停留 8 秒"。

追踪对每个面向视频的产品都至关重要：体育分析、安防监控、自动驾驶、医学视频分析、野生动物监测、商标计数。核心构建模块是共享的：逐帧检测器、运动模型（卡尔曼滤波器或更复杂的模型）、关联步骤（基于 IoU / 余弦 / 学习特征的匈牙利算法）以及轨迹生命周期（生成、更新、消亡）。

2026 年带来了两种新模式：**SAM 2 基于记忆的追踪**（用特征记忆替代运动模型关联）和 **SAM 3.1 Object Multiplex**（同一概念的多个实例共享记忆）。本课先介绍经典堆栈，再介绍基于记忆的方法。

## 概念

### 基于检测的追踪

```mermaid
flowchart LR
    F1["第 t 帧"] --> DET["检测器"] --> D1["第 t 帧的检测"]
    PREV["到第 t-1 帧的轨迹"] --> PREDICT["运动预测<br/>(卡尔曼)"]
    PREDICT --> PRED["第 t 帧的预测轨迹"]
    D1 --> ASSOC["匈牙利匹配<br/>(IoU / 余弦 / 运动)"]
    PRED --> ASSOC
    ASSOC --> UPDATE["更新匹配的轨迹"]
    ASSOC --> NEW["生成新轨迹"]
    ASSOC --> DEAD["未匹配轨迹过期；N 帧后删除"]
    UPDATE --> NEXT["第 t 帧的轨迹"]
    NEW --> NEXT
    DEAD --> NEXT

    style DET fill:#dbeafe,stroke:#2563eb
    style ASSOC fill:#fef3c7,stroke:#d97706
    style NEXT fill:#dcfce7,stroke:#16a34a
```

你在 2026 年会遇到的每个追踪器都是这个循环的变体。不同之处：

- **SORT**（2016）：卡尔曼滤波器 + IoU 匈牙利匹配。简单、快速，无外观模型。
- **DeepSORT**（2017）：SORT + 每个轨迹的 CNN 外观特征（ReID 嵌入）。能更好地处理交叉情况。
- **ByteTrack**（2021）：将低置信度检测作为第二阶段进行关联；无需外观特征，但在 MOT17 上表现最佳。
- **BoT-SORT**（2022）：Byte + 相机运动补偿 + ReID。
- **StrongSORT / OC-SORT**——ByteTrack 的后继者，运动和外观众更好。

### 卡尔曼滤波器一句话总结

卡尔曼滤波器维护每个轨迹的状态 `(x, y, w, h, dx, dy, dw, dh)` 及其协方差。在每一帧，使用恒定速度模型**预测**状态，然后用匹配的检测**更新**。当预测不确定性高时，更新更信任检测。这提供了平滑的轨迹，并能通过短时遮挡（1-5 帧）继续追踪。

每个经典追踪器在运动预测步骤中都使用卡尔曼滤波器。

### 匈牙利算法

给定一个 `M x N` 的成本矩阵（轨迹 x 检测），找到使总成本最小的一对一匹配。成本通常是 `1 - IoU(轨迹框, 检测框)` 或外观特征的负余弦相似度。运行时为 O((M+N)^3)；对于 M、N 最多约 1000 的情况，通过 `scipy.optimize.linear_sum_assignment` 在 Python 中足够快。

### ByteTrack 的关键思路

标准追踪器会丢弃低置信度检测（< 0.5）。ByteTrack 将它们保留作为**第二阶段候选**：在将轨迹与高置信度检测匹配后，未匹配的轨迹尝试以稍宽松的 IoU 阈值匹配低置信度检测。恢复短时遮挡和密集区域的 ID 切换。

### SAM 2 基于记忆的追踪

SAM 2 通过维护一个**记忆库**（包含逐实例的时空特征）来处理视频。给定一帧上的提示（点击、框、文本），它将实例编码到记忆中。在后续帧上，记忆与新帧的特征进行交叉注意力，解码器为新帧中的同一实例生成掩码。

没有卡尔曼滤波器，没有匈牙利匹配。关联隐含在记忆-注意力操作中。

优点：
- 对大遮挡鲁棒（记忆可跨多帧携带实例身份）。
- 与 SAM 3 的文本提示结合时可实现开放词汇。
- 无需单独的运动模型。

缺点：
- 对多对象追踪比 ByteTrack 慢。
- 记忆库增长；限制了上下文窗口。

### SAM 3.1 Object Multiplex

之前的 SAM 2 / SAM 3 追踪为每个实例维护一个独立的记忆库。对于 50 个对象，需要 50 个记忆库。Object Multiplex（2026 年 3 月）将它们压缩为一个共享记忆，使用**逐实例查询 Token**。成本随实例数量呈亚线性增长。

Multiplex 是 2026 年人群追踪的新默认选择：音乐会人群、仓库工人、交通路口。

### 需要了解的三个指标

- **MOTA（多目标追踪准确率）**——1 - (FN + FP + ID 切换) / GT。按错误类型加权；一个综合了检测和关联失败的单指标。
- **IDF1（ID F1）**——ID 精确率和召回率的调和均值。特别关注每个真实轨迹在时间上保持其 ID 的程度。对于对 ID 切换敏感的任务，比 MOTA 更好。
- **HOTA（高阶追踪准确率）**——分解为检测准确率（DetA）和关联准确率（AssA）。自 2020 年以来的社区标准；最全面。

对于安防监控（谁是谁）：报告 IDF1。对于体育分析（传球计数）：HOTA。对于一般学术比较：HOTA。

## 构建

### 步骤 1：基于 IoU 的成本矩阵

```python
import numpy as np


def bbox_iou(a, b):
    """
    a, b: (N, 4) 的 [x1, y1, x2, y2] 数组。
    返回 (N_a, N_b) IoU 矩阵。
    """
    ax1, ay1, ax2, ay2 = a[:, 0], a[:, 1], a[:, 2], a[:, 3]
    bx1, by1, bx2, by2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    inter_x1 = np.maximum(ax1[:, None], bx1[None, :])
    inter_y1 = np.maximum(ay1[:, None], by1[None, :])
    inter_x2 = np.minimum(ax2[:, None], bx2[None, :])
    inter_y2 = np.minimum(ay2[:, None], by2[None, :])
    inter = np.clip(inter_x2 - inter_x1, 0, None) * np.clip(inter_y2 - inter_y1, 0, None)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a[:, None] + area_b[None, :] - inter
    return inter / np.clip(union, 1e-8, None)
```

### 步骤 2：最小 SORT 风格追踪器

为简洁起见，省略了固定的恒定速度卡尔曼滤波器——我们在这里使用简单的 IoU 关联；在生产中卡尔曼预测是必不可少的。`sort` Python 包提供了完整版本。

```python
from scipy.optimize import linear_sum_assignment


class Track:
    def __init__(self, tid, bbox, frame):
        self.id = tid
        self.bbox = bbox
        self.last_frame = frame
        self.hits = 1

    def update(self, bbox, frame):
        self.bbox = bbox
        self.last_frame = frame
        self.hits += 1


class SimpleTracker:
    def __init__(self, iou_threshold=0.3, max_age=5):
        self.tracks = []
        self.next_id = 1
        self.iou_threshold = iou_threshold
        self.max_age = max_age

    def step(self, detections, frame):
        if not self.tracks:
            for d in detections:
                self.tracks.append(Track(self.next_id, d, frame))
                self.next_id += 1
            return [(t.id, t.bbox) for t in self.tracks]

        track_boxes = np.array([t.bbox for t in self.tracks])
        det_boxes = np.array(detections) if len(detections) else np.empty((0, 4))

        iou = bbox_iou(track_boxes, det_boxes) if len(det_boxes) else np.zeros((len(track_boxes), 0))
        cost = 1 - iou
        cost[iou < self.iou_threshold] = 1e6

        matched_track = set()
        matched_det = set()
        if cost.size > 0:
            row, col = linear_sum_assignment(cost)
            for r, c in zip(row, col):
                if cost[r, c] < 1.0:
                    self.tracks[r].update(det_boxes[c], frame)
                    matched_track.add(r); matched_det.add(c)

        for i, d in enumerate(det_boxes):
            if i not in matched_det:
                self.tracks.append(Track(self.next_id, d, frame))
                self.next_id += 1

        self.tracks = [t for t in self.tracks if frame - t.last_frame <= self.max_age]
        return [(t.id, t.bbox) for t in self.tracks]
```

60 行代码。接收逐帧检测，返回逐帧轨迹 ID。真实系统会添加卡尔曼预测、ByteTrack 的第二阶段重匹配和外观特征。

### 步骤 3：合成轨迹测试

```python
def synthetic_frames(num_frames=20, num_objects=3, H=240, W=320, seed=0):
    rng = np.random.default_rng(seed)
    starts = rng.uniform(20, 200, size=(num_objects, 2))
    velocities = rng.uniform(-5, 5, size=(num_objects, 2))
    frames = []
    for f in range(num_frames):
        dets = []
        for i in range(num_objects):
            cx, cy = starts[i] + f * velocities[i]
            dets.append([cx - 10, cy - 10, cx + 10, cy + 10])
        frames.append(dets)
    return frames


tracker = SimpleTracker()
for f, dets in enumerate(synthetic_frames()):
    tracks = tracker.step(dets, f)
```

三个沿直线移动的物体应在所有 20 帧中保持其 ID。

### 步骤 4：ID 切换指标

```python
def count_id_switches(tracks_per_frame, gt_per_frame):
    """
    tracks_per_frame:  每帧的列表，每个元素是 (track_id, bbox) 列表
    gt_per_frame:      每帧的列表，每个元素是 (gt_id, bbox) 列表
    返回 ID 切换次数。
    """
    prev_assignment = {}
    switches = 0
    for tracks, gts in zip(tracks_per_frame, gt_per_frame):
        if not tracks or not gts:
            continue
        t_boxes = np.array([b for _, b in tracks])
        g_boxes = np.array([b for _, b in gts])
        iou = bbox_iou(g_boxes, t_boxes)
        for g_idx, (gt_id, _) in enumerate(gts):
            j = iou[g_idx].argmax()
            if iou[g_idx, j] > 0.5:
                t_id = tracks[j][0]
                if gt_id in prev_assignment and prev_assignment[gt_id] != t_id:
                    switches += 1
                prev_assignment[gt_id] = t_id
    return switches
```

这是一个简化的 IDF1 相关指标：统计真实对象更改其分配的预测轨迹 ID 的次数。真正的 MOTA / IDF1 / HOTA 工具在 `py-motmetrics` 和 `TrackEval` 中。

## 使用

2026 年的生产追踪器：

- `ultralytics`——YOLOv8 + ByteTrack / BoT-SORT 内置集成。`results = model.track(source, tracker="bytetrack.yaml")`。默认选择。
- `supervision`（Roboflow）——ByteTrack 封装加标注工具。
- SAM 2 / SAM 3.1——通过 `processor.track()` 进行基于记忆的追踪。
- 自定义堆栈：检测器（YOLOv8 / RT-DETR）+ `sort-tracker` / `OC-SORT` / `StrongSORT`。

选择指南：

- 行人/车辆/箱子，30+ fps：**ByteTrack with ultralytics**。
- 同一类别的多个实例在人群中：**SAM 3.1 Object Multiplex**。
- 明显外观的严重遮挡：**DeepSORT / StrongSORT**（ReID 特征）。
- 体育/复杂交互：**BoT-SORT** 或学习型追踪器（MOTRv3）。

## 交付

本课产出：

- `outputs/prompt-tracker-picker.md` —— 根据场景类型、遮挡模式和延迟预算选择 SORT / ByteTrack / BoT-SORT / SAM 2 / SAM 3.1。
- `outputs/skill-mot-evaluator.md` —— 编写完整的 MOTA / IDF1 / HOTA 评估框架，用于对比真实轨迹。

## 练习

1. **(简单)** 使用 3、10 和 30 个对象运行上述合成追踪器。在每种情况下报告 ID 切换次数。找出简单的纯 IoU 关联开始失效的情况。
2. **(中等)** 在关联之前添加恒定速度卡尔曼预测步骤。展示短时（2-3 帧）遮挡不再引起 ID 切换。
3. **(困难)** 将 SAM 2 的基于记忆的追踪器（通过 `transformers`）作为替代追踪后端集成。在 30 秒的人群剪辑上同时运行 SimpleTracker 和 SAM 2，比较 ID 切换次数，手动标注 5 个显著人物的真实 ID。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| 基于检测的追踪 | "检测后关联" | 逐帧检测器 + 基于 IoU / 外观的匈牙利匹配 |
| 卡尔曼滤波器 | "运动预测" | 线性动力学 + 协方差，用于平滑轨迹预测和遮挡处理 |
| 匈牙利算法 | "最优分配" | 解决最小成本二分匹配问题；`scipy.optimize.linear_sum_assignment` |
| ByteTrack | "低置信度二次传递" | 将未匹配的轨迹重新匹配到低置信度检测，以恢复短时遮挡 |
| DeepSORT | "SORT + 外观" | 添加 ReID 特征用于跨帧匹配；更适合 ID 保持 |
| 记忆库 | "SAM 2 技巧" | 跨帧存储的逐实例时空特征；交叉注意力替代显式关联 |
| Object Multiplex | "SAM 3.1 共享记忆" | 带逐实例查询的单一共享记忆，用于快速多对象追踪 |
| HOTA | "现代追踪指标" | 分解为检测和关联准确率；社区标准 |

## 延伸阅读

- [SORT (Bewley et al., 2016)](https://arxiv.org/abs/1602.00763) —— 最小化的基于检测的追踪论文
- [DeepSORT (Wojke et al., 2017)](https://arxiv.org/abs/1703.07402) —— 添加外观特征
- [ByteTrack (Zhang et al., 2022)](https://arxiv.org/abs/2110.06864) —— 低置信度二次传递
- [BoT-SORT (Aharon et al., 2022)](https://arxiv.org/abs/2206.14651) —— 相机运动补偿
- [HOTA (Luiten et al., 2020)](https://arxiv.org/abs/2009.07736) —— 分解式追踪指标
- [SAM 2 video segmentation (Meta, 2024)](https://ai.meta.com/sam2/) —— 基于记忆的追踪器
- [SAM 3.1 Object Multiplex (Meta, March 2026)](https://ai.meta.com/blog/segment-anything-model-3/)
