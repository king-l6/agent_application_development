---
name: skill-noise-schedule-designer
description: 根据 T 和目标损坏程度生成线性、余弦或 sigmoid beta 调度，以及 SNR 图
version: 1.0.0
phase: 4
lesson: 10
tags: [computer-vision, diffusion, noise-schedule, training]
---

# 噪声调度设计器

Beta 调度控制每个扩散步骤保留多少信号。糟糕的调度会限制训练效率和下游每个决策的样本质量。

## 何时使用

- 开始新的扩散训练运行并选择 T 和 beta。
- 调试产生模糊样本的扩散模型（调度过于激进）或未能学习结构的扩散模型（调度过于温和）。
- 比较不同论文中报告的不同调度设计。

## 输入

- `T`：时间步数，通常 100-1000。
- `type`：linear | cosine | sigmoid。
- `target_alpha_bar_final`：在 t=T 时要保留的信号比例，默认为 0.001（99.9% 被破坏）。
- 可选 `image_resolution` — 较大的图像受益于破坏更慢的调度（余弦或偏移调度）。

## 调度公式

### 线性
```
beta_t = beta_start + (beta_end - beta_start) * (t - 1) / (T - 1)
```
默认值：beta_start=1e-4, beta_end=0.02（DDPM 论文）。

### 余弦（Nichol & Dhariwal, 2021）
```
alpha_bar_t = cos^2((t/T + s) / (1 + s) * pi/2)
beta_t = 1 - alpha_bar_t / alpha_bar_{t-1}
```
s = 0.008。更长时间保留信号；在低步数时更好。

### Sigmoid
```
alpha_bar_t = 1 / (1 + exp(k * (t/T - 0.5)))
```
k = 6 到 12。良好的中间地带；一些 SDXL 变体使用。

## 步骤

1. 根据公式计算 betas。
2. 预计算 `alphas`、`alphas_cumprod`、`sqrt_alphas_cumprod`、`sqrt_one_minus_alphas_cumprod`。
3. 计算 SNR_t = alpha_bar_t / (1 - alpha_bar_t)；生成 SNR 随时间变化的摘要。
4. 验证 `alphas_cumprod[T-1]` 在 `target_alpha_bar_final` 的 10% 以内；否则调整 beta_end（线性）、s（余弦）或 k（sigmoid）并重试。
5. 报告三个检查点：
   - `t=T*0.25` — 早期破坏
   - `t=T*0.5` — 中途
   - `t=T*0.75` — 接近最终

## 报告

```
[schedule]
  type:   <名称>
  T:      <整数>
  beta_start: <浮点数>   beta_end: <浮点数>

[signal retention]
  t=0.25T:  alpha_bar=<X>  SNR=<X>
  t=0.5T:   alpha_bar=<X>  SNR=<X>
  t=0.75T:  alpha_bar=<X>  SNR=<X>
  t=T:      alpha_bar=<X>  SNR=<X>

[warnings]
  - <如果 alpha_bar 在 0.75T 之前坍缩>
  - <如果 beta_end 在 log-SNR 中产生 NaN>
```

## 规则

- 永远不要发送任何 `alpha_bar_t <= 0` 的调度；将低于 1e-5 的值截断并发出警告。
- 余弦是低步数采样（< 30 步）的默认推荐。
- 线性是 `quality_target == research` 的默认选择 — DDPM 基线使用线性调度报告。
- 当 `image_resolution > 256` 时，推荐偏移调度（Chen, 2023）以在高分辨率下保留更多信号。
