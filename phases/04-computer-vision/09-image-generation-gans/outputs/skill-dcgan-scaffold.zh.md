---
name: skill-dcgan-scaffold
description: 根据 z_dim、image_size 和 num_channels 编写完整的 DCGAN 脚手架，包括训练循环和样本保存器
version: 1.0.0
phase: 4
lesson: 9
tags: [computer-vision, gan, dcgan, scaffolding]
---

# DCGAN 脚手架

给定三个参数，生成一个可运行的 DCGAN 项目骨架，架构按目标图像分辨率正确调整大小。

## 何时使用

- 在小数据集上开始新的生成实验。
- 使用可工作的最小示例教授 DCGAN 基础。
- 原型设计条件 GAN（标签注入在同一个脚手架中完成）。

## 输入

- `image_size`：32、64、128 之一（必须是 2 的幂）。
- `num_channels`：1（灰度）或 3（RGB）。
- `z_dim`：通常是 64 或 128。
- `with_spectral_norm`：yes | no；默认 yes。

## 架构尺寸调整

G 中转置卷积块的数量和 D 中步长卷积块的数量取决于 `image_size`：

| image_size | G 块数 | D 块数 |
|------------|--------|--------|
| 32         | 4      | 4      |
| 64         | 5      | 5      |
| 128        | 6      | 6      |

每个额外块的 G 将空间维度加倍，D 将空间维度减半。特征数量从 32 开始，按 `feat_base * 2^block_index` 缩放。

## 输出文件

- `model.py` — 生成器 + 判别器类
- `train.py` — 训练循环、损失、优化器设置
- `sample.py` — 样本网格保存器
- `config.json` — 超参数
- `README.md` — 10 行快速入门

## 报告

```
[scaffold]
  image_size:       <整数>
  num_channels:     <整数>
  z_dim:            <整数>
  spectral_norm:    yes | no

[arch]
  G blocks:         <N>, channels: [列表]
  D blocks:         <N>, channels: [列表]
  G params (est):   <N>
  D params (est):   <N>

[training defaults]
  optimizer:   Adam(lr=2e-4, betas=(0.5, 0.999))
  batch_size:  64
  epochs:      50
  sample_every: 1 周期

[files written]
  - model.py
  - train.py
  - sample.py
  - config.json
  - README.md
```

## 规则

- 始终在 G 的输出上使用 `nn.Tanh()` 并在训练期间将数据缩放到 [-1, 1]。
- 始终在 D 中使用 `LeakyReLU(0.2)`。
- 当 `with_spectral_norm == yes` 时，用 `spectral_norm()` 包裹 D 中的每个卷积并从 D 中移除 BatchNorm。在 G 中保留 BatchNorm。
- 永远不要为 image_size > 128 生成脚手架 — DCGAN 在此之上变得不稳定；将用户引导到 StyleGAN 或扩散模型。
