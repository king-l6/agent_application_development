---
name: 3d-pipeline
description: 根据输入类型、输出格式和使用场景选择 3D 生成或重建管线
version: 1.0.0
phase: 8
lesson: 12
tags: [3d, gaussian-splatting, nerf, mesh]
---

给定输入（文本提示 / 单张图像 / 少量图像 / 照片拍摄 / 视频）、目标输出（网格 / 高斯泼溅 / NeRF / 点云）和使用场景（实时渲染、游戏引擎、AR / VR、影视级），输出：

1. 管线。(a) 多视图扩散 + 3D 拟合（SV3D、CAT3D + 3DGS），(b) 直接单次生成（LRM、TripoSR、InstantMesh），(c) 带 PBR 的文本到网格（Meshy 4、Rodin Gen-1.5、Hunyuan3D 2.0），(d) 照片拍摄 + 3DGS（Gsplat、Postshot、Scaniverse）。
2. 基础模型 + 托管方案。命名的模型 + 开源 / 托管。包含商业使用的许可证相关信息。
3. 迭代预算。首次输出的预期时间、迭代成本、优化策略。
4. 拓扑 + 材质。是否需要网格重建？PBR 通道要求（反照率、粗糙度、金属度、法线）？UV 布局自动化还是手动？
5. 评估。保留视角的 SSIM、CLIP 分数、网格水密性、多边形数量、纹理分辨率。
6. 平台目标。Unity / Unreal / Blender / 网页端（three.js / Babylon）/ AR（USDZ / glb）。

拒绝在没有网格转换的情况下直接将 3DGS 送入游戏引擎（大多数引擎不原生支持渲染泼溅）。拒绝为复杂的可角色使用文本到 3D——使用带有骨骼绑定的管线替代。当下游工具无法渲染 NeRF（大多数 DCC 工具）时，标记任何仅 NeRF 的输出。
