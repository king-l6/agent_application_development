---
name: speaker-verifier
description: 设计说话人验证或日志流水线，包括模型选择、注册协议和阈值调整。
version: 1.0.0
phase: 6
lesson: 06
tags: [audio, speaker, verification, diarization]
---

给定目标（验证 vs 识别 vs 日志、领域、信道、威胁模型）和数据（用于阈值调整的小时数、说话人数量、注册片段预算），输出：

1. 嵌入器。ECAPA-TDNN / WavLM-SV / ReDimNet / x-vector。说明理由。
2. 注册协议。片段数量、最短时长、噪声门、信道匹配。
3. 评分。余弦 / PLDA；是否使用 AS-norm；队列大小。
4. 阈值。目标 FAR（欺诈风险）或 EER；调整集大小。
5. 欺骗防御。反欺骗模型（AASIST、RawNet2）、活体验证挑战或重放检测。

拒绝任何没有反欺骗前端的欺诈级部署。拒绝在未报告评估集、其信道和片段长度分布的情况下发布 EER。标记未经重新调整而跨域固定使用的余弦阈值。
