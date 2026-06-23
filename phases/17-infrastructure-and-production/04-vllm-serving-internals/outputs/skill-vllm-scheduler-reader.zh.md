---
name: vllm-scheduler-reader
description: 通过读取调度器级旋钮并识别 PagedAttention、continuous batching 和 chunked prefill 中的哪个是瓶颈，诊断 vLLM 服务配置。
version: 1.0.0
phase: 17
lesson: 04
tags: [vllm, paged-attention, continuous-batching, chunked-prefill, serving, scheduler]
---

给定一个 vLLM 服务配置（模型、dtype、硬件、`--gpu-memory-utilization`、`--max-num-batched-tokens`、`--enable-chunked-prefill`、`--speculative-model` 或 `--speculative-config`、最大并发度以及观察到的指标集：TTFT 均值/P99、ITL 均值/P99、吞吐量 tok/s），产生一个调度器级诊断。

产出：

1. **配置解读。** 对于每个标志，指出它控制的调度器行为以及 2026 年默认值。标记任何设置为非默认值的标志并说明原因。
2. **瓶颈识别。** 将瓶颈分类为以下之一：PagedAttention 配置不足（KV 块匮乏）、continuous-batching 停滞（WAITING 队列增长）、chunked-prefill 大小不当（TTFT 尾部尖峰）、解码计算受限（ITL 下限）或 HBM 受限（无法容纳批次）。用报告的指标证明。
3. **旋钮建议。** 具体、有序的操作 — 翻转哪个标志、尝试哪个值、观察哪个指标。不要在不先耗尽调度器级调优的情况下建议"尝试更多 GPU"。
4. **兼容性检查。** 特别针对 vLLM v0.18.0：将 `--enable-chunked-prefill` + `--speculative-model` 组合标记为硬性不兼容。如果两者都需要，推荐 V1 中的 N-gram GPU 推测解码作为文档记录的唯一例外。
5. **下一步阅读。** 根据诊断结果指向 vLLM v0.18.0 发布说明、PagedAttention 论文或 Aleksa Gordic V1 调度器解析中的一个。

硬性拒绝：
- 没有四个核心指标（TTFT、ITL、吞吐量、并发度）就进行诊断。拒绝并要求提供指标集。
- 不检查推测解码配置就推荐 `--enable-chunked-prefill`。
- 将 `DCGM_FI_DEV_GPU_UTIL` 视为扩缩信号。vLLM 预分配 KV；占空比数字具有误导性。

拒绝规则：
- 如果 H100 上报告的吞吐量低于 100 tok/s，瓶颈可能不在 vLLM — 检查客户端侧的分词器、Python GIL 或请求级序列化。
- 如果 `--gpu-memory-utilization` 设置为低于 0.7，拒绝进一步调优 — 操作员选择将 HBM 留在桌面上，修复方法是在翻转调度器标志之前提高上限。
- 如果操作员要求草稿模型推测的推测解码 + chunked-prefill 方案，拒绝并指出 v0.18.0 的不兼容性。改为指向阶段 17 · 05 中的 EAGLE-3。

输出：一页调度器诊断，列出标志、瓶颈、有序建议、兼容性说明和下一步阅读指针。最后给出一个"下一步测量什么"段落，根据识别的瓶颈指出 P99 ITL、块分配率或 WAITING 队列深度中的一个。
