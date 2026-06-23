# 边缘推理 —— Apple Neural Engine、Qualcomm Hexagon、WebGPU/WebLLM、Jetson

> 边缘的核心约束是内存带宽，而不是算力。移动 DRAM 为 50-90 GB/s；数据中心 HBM3 达到 2-3 TB/s —— 差距达 30-50 倍。解码是内存受限的，因此这个差距具有决定性。2026 年的格局分为四个方向。Apple M4/A18 Neural Engine 峰值达到 38 TOPS，具有统一内存（无需 CPU↔NPU 拷贝）。Qualcomm Snapdragon X Elite / 8 Gen 4 Hexagon 达到 45 TOPS。WebGPU + WebLLM 在 M3 Max 上运行 Llama 3.1 8B（Q4）约为 41 tok/s（约本机的 70-80%）；17.6k GitHub 星标，兼容 OpenAI API，约 70-75% 的移动设备覆盖率。NVIDIA Jetson Orin Nano Super（8GB）可容纳 Llama 3.2 3B / Phi-3；AGX Orin 通过 vLLM 运行 gpt-oss-20b 约 40 tok/s；Jetson T4000（JetPack 7.1）是 AGX Orin 的 2 倍性能。TensorRT Edge-LLM 支持 EAGLE-3、NVFP4、分块预填充——在 2026 年 CES 上由 Bosch、ThunderSoft、MediaTek 展示。

**类型：** 学习
**语言：** Python（标准库，玩具带宽受限解码模拟器）
**前置知识：** 阶段 17 · 04（vLLM 服务内部机制），阶段 17 · 09（生产量化）
**时间：** 约 60 分钟

## 学习目标

- 解释为什么移动端 LLM 推理受内存带宽限制，算力是次要的。
- 列举四个边缘目标（Apple ANE、Qualcomm Hexagon、WebGPU/WebLLM、NVIDIA Jetson）并将每个匹配到用例。
- 说出 2026 年 WebGPU 的覆盖缺口（Firefox Android 追赶中）以及 Safari iOS 26 的落地情况。
- 根据目标选择合适的量化格式（ANE 用 Core ML INT4 + FP16，Hexagon 用 QNN INT8/INT4，浏览器用 WebGPU Q4，Jetson Thor 用 NVFP4）。

## 问题

一个客户想要一个设备端聊天机器人：语音优先、默认隐私、离线可用。在 MacBook Pro M3 Max 上，Llama 3.1 8B Q4 运行约 55 tok/s —— 没问题。在 iPhone 16 Pro 上，同一模型运行速度为 3 tok/s —— 不行。在搭载 Snapdragon 8 Gen 3 的中端 Android 上，7 tok/s。在浏览器中通过 Chrome Android v121+ 上的 WebGPU，取决于设备 4-8 tok/s。

吞吐量差异不是移植问题。这是带宽差距乘以量化格式再乘以 NPU 是否可从用户空间访问的结果。2026 年的边缘推理是四个不同的问题，有四种不同的解决方案。

## 概念

### 带宽是真正的天花板

解码每生成一个 token 都需要读取完整的权重集。一个 7B Q4 模型是 3.5 GB。以 50 GB/s 读取 3.5 GB 需要 70 ms —— 理论上限约为 14 tok/s。在 90 GB/s（高端移动 DRAM）下，上限提高到约 25 tok/s。低于这个数字，任何算力都无法帮助。

数据中心 HBM3 以 3 TB/s 的速度清除同样的 3.5 GB 只需 1.2 ms —— 上限为 830 tok/s。同一模型，同一权重。不同的内存子系统。

### Apple Neural Engine（M4 / A18）

- 最高 38 TOPS。统一内存（CPU 和 ANE 共享同一池）—— 无拷贝开销。
- 通过 Core ML + `.mlmodel` 编译模型访问，或通过 PyTorch 使用 Metal Performance Shaders（MPS）。
- Llama.cpp Metal 后端使用 MPS，而非直接使用 ANE；原生 ANE 需要 Core ML 转换。
- 2026 年 iOS 应用的最佳实践路径：Core ML 配合 INT4 权重 + FP16 激活值。

### Qualcomm Hexagon（Snapdragon X Elite / 8 Gen 4）

- 最高 45 TOPS。与 CPU 和 GPU 集成在同一 SoC 中，但内存域独立。
- QNN（Qualcomm Neural Network）SDK 和 AI Hub 提供从 PyTorch/ONNX 的转换。
- 聊天模板、Llama 3.2、Phi-3 都在 AI Hub 上作为一等公民提供。

### Intel / AMD NPU（Lunar Lake、Ryzen AI 300）

- 40-50 TOPS。软件落后于 Apple/Qualcomm；OpenVINO 正在改进但仍属小众。
- 最适合 Windows ARM Copilot 应用；在 AMD/Intel 桌面上原生支持本地优先场景。

### WebGPU + WebLLM

- 在浏览器中通过 WebGPU 计算着色器运行模型；无需安装。
- Llama 3.1 8B Q4 在 M3 Max 上约 41 tok/s —— 约本机通过相同后端的 70-80%。
- WebLLM 在 GitHub 上有 17.6k 星标；兼容 OpenAI 的 JS API；Apache 2.0 许可。
- 2026 年覆盖率：Chrome Android v121+、Safari iOS 26 GA、Firefox Android 仍在追赶。整体移动覆盖率约 70-75%。

### NVIDIA Jetson 家族

- Orin Nano Super（8GB）：可容纳 Llama 3.2 3B、Phi-3，tok/s 表现良好。
- AGX Orin：通过 vLLM 运行 gpt-oss-20b 约 40 tok/s。
- Thor / T4000（JetPack 7.1）：AGX Orin 的 2 倍性能，支持 EAGLE-3 和 NVFP4。
- TensorRT Edge-LLM（2026）支持 EAGLE-3 推测解码、NVFP4 权重、分块预填充——数据中心优化移植到边缘。

### 按目标选择的量化格式

| 目标 | 格式 | 备注 |
|------|------|------|
| Apple ANE | INT4 权重 + FP16 激活值 | Core ML 转换路径 |
| Qualcomm Hexagon | QNN INT8 / INT4 | AI Hub 转换器 |
| WebGPU / WebLLM | Q4 MLC（q4f16_1） | 使用 `mlc_llm convert_weight` + 编译的 `.wasm`；不支持 GGUF |
| Jetson Orin Nano | Q4 GGUF 或 TRT-LLM INT4 | 内存受限 |
| Jetson AGX / Thor | NVFP4 + FP8 KV | Edge-LLM 路径 |

### 边缘上的长上下文陷阱

Llama 3.1 的 128K 上下文是数据中心特性。在 8 GB RAM 的手机上，4 GB 模型 + 32K token 的 2 GB KV 缓存 + 操作系统开销 = 内存耗尽。边缘部署将上下文保持在 4K-8K，除非接受激进的 KV 量化（Q4 KV）。

### 语音是杀手级应用

语音智能体对延迟敏感（首 token < 500 ms）。本地推理完全消除了网络延迟。结合语音转文本（Whisper Turbo 变体可在边缘运行），边缘推理成为生产质量的语音循环。

### 你应该记住的数字

- Apple M4 / A18 ANE：38 TOPS。
- Qualcomm Hexagon SD X Elite：45 TOPS。
- WebLLM M3 Max：Llama 3.1 8B Q4 上约 41 tok/s。
- AGX Orin：gpt-oss-20b 上通过 vLLM 约 40 tok/s。
- 数据中心与边缘带宽差距：30-50 倍。
- WebGPU 移动覆盖率：约 70-75%（Firefox Android 滞后）。

## 使用它

`code/main.py` 从带宽受限的数学计算中推导出各边缘目标的理论解码吞吐量上限。与观测到的基准数据比较，并突出显示带宽（而非算力）是瓶颈的地方。

## 交付物

本节课生成 `outputs/skill-edge-target-picker.zh.md`。给定平台（iOS/Android/浏览器/Jetson）、模型和延迟/内存预算，选择量化格式和转换流程。

## 练习

1. 运行 `code/main.py`。对于 Snapdragon 8 Gen 3（约 77 GB/s 带宽）上的 Q4 7B 模型，计算解码上限。与观测的 6-8 tok/s 比较——运行时效率如何？
2. Android 上的 WebGPU 需要 Chrome v121+。为旧浏览器设计一个回退方案——通过相同的兼容 OpenAI API 的服务端方案。
3. 你的 iOS 应用需要 4K 上下文流式传输。哪种模型/格式组合能使你在 iPhone 16 上保持活跃内存低于 4 GB？
4. Jetson AGX Orin 以 40 tok/s 运行 gpt-oss-20b。Jetson Nano 只能容纳 3B。如果你的产品同时针对两者，如何统一推理技术栈？
5. 论证"WebLLM 在 2026 年是否已达到生产就绪"。引用覆盖率、性能以及 Firefox Android 的差距。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| ANE | "Apple 神经引擎" | M 系列和 A 系列中的设备端 NPU；统一内存 |
| Hexagon | "Qualcomm NPU" | Snapdragon NPU；使用 QNN SDK 访问 |
| WebGPU | "浏览器 GPU" | W3C 标准化的浏览器 GPU API；Chrome/Safari 2026 |
| WebLLM | "浏览器 LLM 运行时" | MLC-LLM 项目；Apache 2.0；兼容 OpenAI 的 JS |
| Jetson | "NVIDIA 边缘" | Orin Nano / AGX / Thor / T4000 系列 |
| TRT Edge-LLM | "边缘 TensorRT" | TensorRT-LLM 的 2026 年边缘移植；EAGLE-3 + NVFP4 |
| 统一内存 | "共享池" | CPU 和 NPU 看到同一 RAM；无拷贝开销 |
| 带宽受限 | "内存限制" | 解码受限于每秒读取权重的字节数 |
| Core ML | "Apple 转换" | Apple 框架，用于 ANE 原生模型 |
| QNN | "Qualcomm 技术栈" | Qualcomm 神经网络 SDK |

## 延伸阅读

- [设备端 LLM 2026 年现状](https://v-chandra.github.io/on-device-llms/) — 格局和基准测试。
- [NVIDIA Jetson 边缘 AI](https://developer.nvidia.com/blog/getting-started-with-edge-ai-on-nvidia-jetson-llms-vlms-and-foundation-models-for-robotics/) — Orin / AGX / Thor。
- [NVIDIA TensorRT Edge-LLM](https://developer.nvidia.com/blog/accelerating-llm-and-vlm-inference-for-automotive-and-robotics-with-nvidia-tensorrt-edge-llm/) — 2026 年边缘移植公告。
- [WebLLM (arXiv:2412.15803)](https://arxiv.org/html/2412.15803v2) — 设计和基准测试。
- [Apple Core ML](https://developer.apple.com/documentation/coreml) — ANE 原生转换。
- [Qualcomm AI Hub](https://aihub.qualcomm.com/) — 为 Hexagon 预转换的模型。
