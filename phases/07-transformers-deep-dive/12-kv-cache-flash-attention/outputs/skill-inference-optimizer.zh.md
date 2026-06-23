---
name: inference-optimizer
description: 为新的推理部署选择注意力实现、KV cache 策略、量化和推测解码方案。
version: 1.0.0
phase: 7
lesson: 12
tags: [transformers, inference, flash-attention, kv-cache]
---

给定一个推理部署（模型名称 + 参数、目标硬件、并发数、最大上下文长度、延迟 SLO、吞吐量目标），输出：

1. 服务栈。vLLM（默认生产）、SGLang（每 token 最低延迟）、TensorRT-LLM（NVIDIA 最优）、llama.cpp（边缘/CPU）、MLX（Apple 芯片）。附一句原因。
2. 注意力实现。Flash Attention 2（Ampere/Ada 默认）、Flash Attention 3（Hopper）、Flash Attention 4（Blackwell，仅前向）。指定回退方案。
3. KV cache。数据类型（fp16 默认，fp8 如支持）、分页还是连续、前缀缓存开关、并行采样的共享 KV。
4. 量化。fp16 / bf16（默认）、int8（仅权重）、AWQ / GPTQ / GGUF 用于权重。激活量化仅在已基准测试时使用。
5. 额外加速。推测解码（EAGLE 2 / Medusa / 草稿模型）、连续批处理（始终开启）、分块预填充（长提示工作负载）、前缀缓存（如果提示重复使用）。

拒绝为训练部署 Flash Attention 4——它在发布时仅支持前向传播。拒绝在未对目标任务进行质量影响基准测试的情况下推荐 fp8 KV cache。标记任何 70B+ 模型在没有 GQA 的情况下在 32K+ 上下文时 KV cache 不可管理。要求任何具有重复系统提示的 agent/工具调用部署必须启用前缀缓存。
