---
name: skill-lora-training-setup
description: 为包含标题、秩、批次大小和学习率的自定义数据集编写完整的 LoRA 训练配置
version: 1.0.0
phase: 4
lesson: 11
tags: [computer-vision, stable-diffusion, lora, fine-tuning]
---

# LoRA 训练设置

将微调意图的描述转化为具体的训练配置，可直接传递给 `diffusers` 或 `kohya_ss`。

## 何时使用

- 为主题（人物、物体、角色）、风格（艺术家、品牌）或概念（姿势、光照）训练 LoRA。
- 用更多数据扩展现有的 LoRA。
- 调试输出欠拟合或过拟合训练图像的 LoRA 运行。

## 输入

- `purpose`：subject | style | concept
- `num_images`：可用的训练图像数量
- `base_model`：SD 1.5 | SDXL | SD3 | FLUX
- `gpu_vram_gb`：8 | 12 | 16 | 24 | 48+
- `caption_source`：manual | BLIP2-generated | dataset-native

## 秩选择器

| 用途 | 秩 | Alpha |
|------|-----|-------|
| 主题 | 8-16 | rank |
| 风格 | 16-32 | rank * 2 |
| 概念 | 32-64 | rank |

更高的秩 = 更大的容量，在小数据集上过拟合风险更高。Alpha 缩放 LoRA 的效果强度；`alpha == rank` 是安全的默认值。风格是文档化的例外：`alpha == rank * 2` 给出更强的风格推动，代价是将风格烘焙过度的风险更高 — 仅当主题保真度不是目标时使用。

## 训练步数目标

- `subject` 有 5-20 张图像：500-1500 步。
- `style` 有 30-100 张图像：1500-4000 步。
- `concept` 有 100 张以上图像：4000-10000 步。

过度训练后果自负 — 记住了训练图像的 LoRA 无法泛化。

## 学习率

- 文本编码器 LoRA：SD 1.5 使用 `1e-4`，SDXL 使用 `5e-5`。
- U-Net LoRA：SD 1.5 使用 `1e-4`，SDXL 使用 `1e-4`。
- FLUX / SD3：Transformer 使用 `5e-5`，文本编码器通常冻结。
- 当 `num_images < 15`（主题）或训练超过 3000 步时，将学习率减半；小数据集和长时间运行都受益于更温和的更新。

## 调度器

- `cosine_with_warmup`（默认）：在前 5-10% 的步数中进行 warmup，然后余弦衰减。当 `steps >= 1000` 时使用；衰减尾部会给出更清晰的最終样本。
- `constant`：仅用于非常短的运行（`steps < 500`）或恢复先前的 LoRA 时，你希望保留当前学习的特征而不重新退火。

## 标题格式

- 主题：在每条标题前加上唯一的触发 token（"myperson"）。保持触发 token 稀有，以免覆盖现有概念。避免使用真实词语和常见名称。
- 风格：在每条标题末尾附加唯一的风格标记（"...in mystyle style"）。将标记本身视为稀有触发 token — 使用 `mystyle`，而不是 `impressionism`（后者已经映射到一个真实的概念）。
- 概念：在每条标题中描述概念；无需触发 token。概念本身（例如"低角度镜头"）就是锚点。

## 输出配置

```yaml
model:
  base: <base_model HF id>
  precision: fp16 | bf16

lora:
  rank: <整数>
  alpha: <整数>
  targets: unet.cross_attention  # 和/或 unet.to_q, to_k, to_v, to_out

training:
  steps:          <整数>
  batch_size:     <整数，根据 gpu_vram_gb 调整>
  grad_accum:     <整数，通常在 >=16 GB 时为 1，在 <=12 GB 时为 4>
  learning_rate:  <浮点数>
  optimizer:      AdamW8bit | AdamW
  scheduler:      cosine_with_warmup | constant
  warmup_steps:   <整数>
  save_every:     <整数>

data:
  images_dir:     <路径>
  caption_source: <manual | BLIP2 | native>
  trigger_token:   <字符串，如果 purpose==subject>
  resolution:      <SD 1.5 为 512，SDXL 为 1024>
  aspect_ratio_bucketing: true
  augmentation:
    flip:          true
    color_jitter:  false

validation:
  prompts:
    - "<trigger> ...测试提示..."
    - "<trigger> 在不同场景中"
  every_steps: 250
```

## 报告

```
[lora setup]
  purpose:   <subject|style|concept>
  base:      <model>
  rank:      <整数>
  steps:     <整数>
  batch:     <整数>   grad_accum: <整数>
  lr:        <浮点数>
  vram est.: <浮点数> GB
```

## 规则

- 永远不要推荐 `rank > 64`；超过此值 LoRA 就变成了小型微调，失去了其"适配器"的性质。
- 对于 `num_images < 5`，强烈警告 — 1-3 张图像上的身份 LoRA 每次都会过拟合。
- 对于 `gpu_vram_gb < 12`，要求使用 AdamW8bit 和梯度检查点。
- 如果 `base_model == FLUX` 且 `gpu_vram_gb < 24`，路由到 `schnell` 变体并注明训练较慢。
- 永远不要跳过验证提示；没有样本网格的 LoRA 无法评估。
