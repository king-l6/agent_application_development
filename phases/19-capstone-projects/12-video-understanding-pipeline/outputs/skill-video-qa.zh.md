---
name: video-qa
description: 构建一个带场景分割、多向量索引、时间定位和时间戳引用的视频理解流水线。
version: 1.0.0
phase: 19
lesson: 12
tags: [capstone, video, multimodal, gemini, qwen-vl, molmo, transnet, qdrant]
---

给定 100 小时视频，构建一个摄取流水线和一个问答系统，用 (start, end) 时间戳加帧预览回答自然语言问题。

构建计划：

1. 摄取视频（YouTube URL 或 MP4）；必要时降至 720p。
2. 使用 TransNetV2 或 PySceneDetect 进行场景分割；输出 `[{scene_id, start_ms, end_ms, keyframe_path}]`。
3. 使用 Whisper-v3-turbo（faster-whisper）的 ASR，产生单词级时间戳；按场景切片。
4. 使用 Gemini 2.5 Pro 或 Qwen3-VL-Max 或 Molmo 2 的 VLM 描述；输出描述 + 帧嵌入。
5. Qdrant 多向量索引，每场景三个命名向量（caption_emb、frame_emb、transcript_emb）和载荷 {video_id, scene_id, start_ms, end_ms, keyframe_url}。
6. 查询：三个并行稠密查询；互惠排名融合合并；top-k=5 场景。
7. 时间定位（TimeLens 适配器或 VideoITG）细化顶部场景内的 (start, end)。
8. VLM 合成（Gemini 2.5 Pro），使用查询 + top-3 场景剪辑 + 转录；要求 `(video_id, start_ms, end_ms)` 引用。
9. 在 ActivityNet-QA、NeXT-GQA 和 100 个查询的手工标记自定义集上评估。报告总体准确率和按问题类别（描述性、计数、动作类型）分解。

评估评分标准：

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 时间定位 IoU | 在保留定位集上的 IoU |
| 20 | 问答准确率 | NeXT-GQA 和 100 个查询自定义集 |
| 20 | 摄取吞吐量 | 每美元索引的视频小时数 |
| 20 | UI 和引用 UX | 时间戳链接、缩略图条、跳转到帧 |
| 15 | 幻觉率 | 计数和动作类型准确率单独报告 |

硬性拒绝：

- 每个场景池化单个向量的流水线。多向量是展示类别区分所必需的。
- 没有 (start, end) 引用的答案。
- 报告单一总体准确率而没有计数/动作子集分解。
- 不直接接收场景帧的 VLM 合成（纯文本输入失去视觉定位）。

拒绝规则：

- 拒绝为许可来源不明确的视频提供服务；要求每个 video_id 有许可标签。
- 拒绝在高于测量吞吐量的摄取率下声称"实时"响应。
- 拒绝将计数/动作幻觉数字隐藏在总体准确率数字内。

输出：一个包含场景分割 + ASR + 描述流水线、多向量 Qdrant 集合、时间定位适配器、带时间戳深度链接的 Next.js 15 查看器、三个基准评估结果（ActivityNet-QA、NeXT-GQA、自定义）的仓库，以及一份记录你观察到的三个计数或动作类型失败类别以及每个类别通过检索或合成更改而减少的文档。
