---
name: skill-3dgs-export-router
description: 根据下游查看器或引擎选择正确的 3DGS 导出格式（.ply / .splat / glTF KHR_gaussian_splatting / USD）
version: 1.0.0
phase: 4
lesson: 22
tags: [3d-gaussian-splatting, export, glTF, OpenUSD, pipeline]
---

# 3DGS 导出路由器

将下游目标映射到正确的 3DGS 文件格式。节省数小时的"它加载不了"调试时间。

## 使用时机

- 训练 3DGS 场景后，与内容管线共享之前。
- 在研究级（.ply）和生产级（glTF / USD）格式之间选择。
- 管线交接：拍摄团队 -> 3DGS 工程师 -> 游戏设计师 / VFX 艺术家 / Web 开发者。

## 输入

- `target_engine`: unreal | unity | omniverse | blender | vision_pro | three_js | babylon_js | cesium | playcanvas | supersplat
- `priority`: portability | file_size | quality_preservation
- `include_sh_degree`: 0 | 1 | 2 | 3

## 格式决策

| 目标 | 推荐格式 | 原因 |
|--------|---------|------|
| Unreal Engine（虚拟制作） | Volinga 插件或 glTF KHR_gaussian_splatting | 原生 Unreal SDK 路径 |
| Unity（XR / 游戏） | 通过 Aras-P Unity-GaussianSplatting 插件的 .ply | 社区标准的 Unity 管线 |
| NVIDIA Omniverse、Pixar 工具 | OpenUSD 26.03（UsdVolParticleField3DGaussianSplat） | 原生 USD 基元类型 |
| Apple Vision Pro | OpenUSD 26.03 | visionOS 2.x 原生 |
| Blender | .ply + KIRI Engine 插件 | 社区插件读取原始泼溅体 |
| Three.js Web 查看器 | glTF KHR_gaussian_splatting 或 .splat | 浏览器标准，与 `GaussianSplats3D` 配合使用 |
| Babylon.js V9+ | glTF KHR_gaussian_splatting | V9 添加了原生支持 |
| Cesium（CesiumJS 1.139+、Cesium for Unreal 2.23+） | glTF KHR_gaussian_splatting | 已提供显式支持 |
| PlayCanvas | .splat | PlayCanvas 原生量化格式 |
| SuperSplat（编辑器） | .ply 或 .splat | 导入 + 导出 |

## 量化权衡

- `.ply` 全精度：文件最大，无损，任何查看器。
- `.splat`：小 4-8 倍，SH3 系数略有质量损失，PlayCanvas 生态系统标准。
- glTF KHR：可通过 EXT_meshopt_compression 配置；最小且兼容性最高。
- USD：通过 USDZ 打包压缩；Apple 管线最小。

## 输出报告

```
[导出方案]
  target:         <引擎>
  format:         <名称>
  sh degree:      <0|1|2|3>
  compression:    <none|meshopt|quantisation|usdz>
  expected size:  <MB>
  兼容于: <查看器列表>

[管线]
  1. source: <.ply from training>
  2. optional: SuperSplat cleanup pass
  3. convert: <工具 + CLI 或 API 调用>
  4. package: <.gltf / .glb / .usd / .usdz / .splat / .ply>
  5. validate: <查看器合理性检查>
```

## 规则

- 绝不静默剥离 SH3 系数——它会明显改变镜面反射。
- 如果 `priority == file_size`，推荐 `.splat` 或带 meshopt 的 glTF；警告质量损失。
- 对于 Apple 平台，2026 年优于 glTF 选择 USD / USDZ；USDZ 在 visionOS 上拥有一流支持。
- 如果目标查看器的 3DGS 支持是预标准化的（2026 年 2 月之前），推荐 `.ply` 和查看器的自定义加载器；Khronos 标准的 glTF 尚未被识别。
- 在交接前始终在至少一个查看器中验证导出的文件；量化期间会发生静默损坏。
