---
name: skill-cmer-monitor
description: 为生产 VLM 端点添加跨模态错误率监控、仪表盘和告警
version: 1.0.0
phase: 4
lesson: 25
tags: [vlm, production, monitoring, hallucination]
---

# CMER 监控器

将跨模态对齐作为一级生产 KPI。

## 何时使用

- 部署任何产生基于图像文本的 VLM 端点。
- 调查关于幻觉响应的报告。
- 跟踪输入分布变化是否降低了模型的对齐质量。

## 输入

- `vlm_output`：生成的文本。
- `text_confidence`：softmax 后每个 Token 的平均概率，范围 `[0, 1]`。计算方式为 `exp(mean(log_probs))`。不要传递原始 logits；原始 logits 无界，而 `conf_threshold` 假定为概率值。
- `image_embedding`：图像的 CLIP 系列嵌入（DINOv3、SigLIP、CLIP）。
- `text_embedding`：生成文本的 CLIP 系列嵌入。
- 可选 `prompt_type`：用于分组的标签（vqa / ocr / captioning / agent）。

## 每次请求计算

```python
import torch

def cmer_flag(image_emb, text_emb, text_conf, sim_thr=0.25, conf_thr=0.8):
    if image_emb.shape != text_emb.shape:
        raise ValueError(f"嵌入形状不匹配: {image_emb.shape} vs {text_emb.shape}")
    image_emb = image_emb / (image_emb.norm() + 1e-8)
    text_emb = text_emb / (text_emb.norm() + 1e-8)
    sim = float((image_emb * text_emb).sum())
    flagged = (text_conf > conf_thr) and (sim < sim_thr)
    return {"sim": sim, "flagged": flagged}
```

嵌入是来自独立 CLIP 系列编码器的 1-D PyTorch 张量（`torch.float32`）。如果使用 NumPy 数组，将 `.norm()` 替换为 `np.linalg.norm(...)` 并相应转换输出。

将 `sim`、`text_conf`、`flagged`、`prompt_type`、`timestamp`、`model_version`、`request_id` 存储到你的监控管道中（Prometheus、DataDog、OpenTelemetry）。

## 聚合指标

```
CMER = (窗口内被标记的请求) / (窗口内总请求)
```

按端点、prompt_type、模型版本报告。

## 告警阈值

- 基线 CMER：在 7 天正常流量上建立。
- 警告：CMER >= 基线 1.5 倍，持续 1 小时。
- 严重：CMER >= 基线 2 倍，持续 30 分钟或任意窗口绝对 > 15%。

## 仪表盘面板

1. CMER 随时间变化（5 分钟桶，7 天窗口）。
2. 按 prompt_type 的 CMER（堆叠条形图）。
3. 每小时 `sim` 分布（直方图）。
4. 产生幻觉最多的输出（每天采样 20 个被标记响应供人工审核）。

## CMER 飙升时的应对措施

1. 采样被标记的请求。
2. 验证模型版本没有意外更改。
3. 检查输入分布（新文件格式？新图像源？压缩方式不同？）。
4. 将有问题的流量路由到人工审核，直到飙升缓解。
5. 如果飙升持续存在，微调或更换模型；不要抑制告警。

## 规则

- 绝不要使用 VLM 自身的嵌入计算 CMER；使用独立编码器（DINOv3、SigLIP 或 CLIP-L/14）。否则你测量的是模型的自我一致性，而非对齐度。
- 始终记录原始的 `sim` 值，而不仅仅是 `flagged` 位；分布变化在标记率变化之前就会显示在低四分位数中。
- 不要在没有 CMER 监控的情况下部署 VLM 端点；幻觉是主导性生产失败模式，没有这个指标就无法察觉。
- 对于敏感领域（医疗、法律、金融），将 `sim_threshold` 提高到 0.35 或更高；标记条件是 `sim < sim_threshold`，因此更高的阈值会捕获更多可能未对齐的输出——这是高风险用途的正确默认值。
