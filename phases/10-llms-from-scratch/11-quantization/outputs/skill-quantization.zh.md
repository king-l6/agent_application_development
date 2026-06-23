---
name: skill-quantization
description: 基于硬件、质量和延迟约束为部署 LLM 选择正确的量化策略
version: 1.0.0
phase: 10
lesson: 11
tags: [quantization, inference, deployment, optimization, fp8, int4, int8, gptq, awq, gguf]
---

# 量化决策框架

在部署语言模型时，使用此框架来选择正确的数字格式、量化方法和质量验证策略。

## 输入要求

提供：
- **模型**（名称、参数数量、原始精度）
- **目标硬件**（GPU 型号/显存、CPU、Apple Silicon、边缘设备）
- **延迟目标**（tokens/秒、首个 token 时间）
- **质量底线**（最大可接受的困惑度增加、基准测试差异）
- **服务模式**（批大小、最大上下文长度、并发用户数）

## 快速选择

| 你的情况 | 格式 | 方法 | 预期质量损失 |
|---------|------|------|-------------|
| H100 GPU，最大吞吐量 | FP8 E4M3 | 原生 H100 转换 | < 0.1% |
| A100/A10，需要 2 倍吞吐量 | INT8 | LLM.int8() 或 SmoothQuant | < 0.5% |
| 单个 24GB GPU，70B 模型 | INT4 | AWQ 或 GPTQ | 1-3% |
| MacBook / Apple Silicon | INT4 GGUF | 通过 llama.cpp 的 Q4_K_M | 1-2% |
| 移动 / 边缘设备 | INT4 或 INT3 | QAT + 设备特定 | 2-5% |
| 最大压缩，可接受一定损失 | INT2 | QuIP# 或 AQLM | 5-15% |
| 训练（混合精度） | BF16 + FP32 累加 | 原生框架支持 | 0% |

## 按组件的精度选择

并非所有张量都应得到相同的处理。

| 组件 | 安全最小值 | 推荐 | 避免 |
|------|-----------|------|------|
| FFN 权重 | INT4 | INT4 (AWQ/GPTQ) | 没有 QAT 的 INT2 |
| 注意力权重 | INT4 | INT8 或 FP8 | INT2 |
| 嵌入层 | INT8 | FP16（保持原始） | INT4 |
| 输出头 | INT8 | FP16（保持原始） | INT4 |
| KV 缓存 | FP8 | FP8 或 INT8 | 长上下文下的 INT4 |
| 注意力 Logits | FP16 | FP16 或 BF16 | INT8 |
| 激活（推理） | INT8 | FP8 或 INT8 | INT4 |

## 方法比较

### GPTQ
- **何时：** GPU 推理，你想要一个 Hugging Face 兼容的模型
- **校准数据：** 128 个示例，每个 2048 tokens
- **时间：** 70B 在 A100 上 30-60 分钟
- **工具：** `auto-gptq`、`exllama`、`exllamav2`
- **优势：** 经过充分测试，Hugging Face 上有大量模型库
- **弱点：** 应用速度慢于 AWQ，在某些模型上质量略低于 AWQ

### AWQ
- **何时：** GPU 推理，你想要最佳的每比特质量
- **校准数据：** 128 个示例
- **时间：** 70B 在 A100 上 15-30 分钟
- **工具：** `autoawq`、`vLLM`（原生支持）
- **优势：** 最佳 INT4 质量，应用快，vLLM 集成
- **弱点：** 模型库小于 GPTQ

### GGUF
- **何时：** CPU 推理、Apple Silicon、llama.cpp 生态系统
- **变体：** Q2_K、Q3_K_S/M/L、Q4_K_S/M、Q5_K_S/M、Q6_K、Q8_0、F16
- **推荐默认：** Q4_K_M（最佳质量/大小平衡）
- **工具：** `llama.cpp`、`ollama`、`LM Studio`
- **优势：** 自包含文件、混合精度、庞大的生态系统
- **弱点：** 不是 GPU 最优（为 CPU/Metal 设计）

### SmoothQuant
- **何时：** GPU 上的 INT8，需要权重和激活都量化
- **关键思想：** 通过逐通道缩放将量化难度从激活迁移到权重
- **工具：** `smoothquant`、`TensorRT-LLM`
- **优势：** 实现 W8A8（权重和激活都在 INT8），2 倍加速
- **弱点：** 仅 INT8，不能扩展到 INT4

## 质量验证协议

量化后，在部署前进行验证：

1. **困惑度测试。** 在 WikiText-2 或你的领域语料上计算。Delta < 0.5 是优秀，0.5-1.0 是良好，> 2.0 是有问题。

2. **基准测试扫描。** 运行 MMLU（通用）、GSM8K（数学）、HumanEval（代码）。数学和代码对精度损失最敏感。

3. **输出比较。** 从原始模型和量化模型各生成 100 个回答。使用 LLM-as-judge 计算胜率。目标：量化模型在 > 90% 的提示上获胜或平局。

4. **延迟测量。** 在批大小为 1 和你的目标批大小下测量 tokens/秒。验证加速是否证明了质量成本的合理性。

5. **长上下文测试。** 如果服务长上下文（> 4K tokens），在你的最大上下文长度下进行测试。KV 缓存量化误差会随着序列长度累积。

## 内存预算计算器

```
权重内存 (GB) = 参数数量 (B) * 比特数 / 8 / 1.073741824
KV 缓存每 token (MB) = 2 * 层数 * d_model * 比特数 / 8 / 1048576
KV 缓存用于上下文 (GB) = kv_per_token * max_context_length / 1024
激活内存 (GB) ~ 1-4 GB（相对恒定，取决于批大小）
总计 = 权重内存 + KV 缓存 + 激活内存 + 开销 (10-20%)
```

Llama 3 70B 在 INT4、32K 上下文下的示例：
- 权重：70B * 4 / 8 / 1.07 = 32.6 GB
- KV 缓存 (FP16)：2 * 80 * 8192 * 16 / 8 / 1e9 * 32768 = ~40 GB
- KV 缓存 (FP8)：~20 GB
- 使用 FP8 KV 的总计：~55 GB（适合一个 80GB A100）

## 常见错误

| 错误 | 为什么失败 | 修复 |
|------|----------|------|
| 将嵌入层量化为 INT4 | 第一层将错误放大到整个模型 | 将嵌入保持在 FP16 或 INT8 |
| 为 INT4 使用逐张量缩放 | 一个异常值行破坏了所有行的精度 | 使用逐通道或逐组缩放 |
| 不校准 GPTQ/AWQ | 没有代表性数据的缩放因子是错误的 | 使用来自你领域的 128 个示例 |
| 所有层相同比特宽度 | 第一层/最后一层更敏感 | 混合精度：第一层/最后一层更高比特 |
| 在非常长的上下文下量化 KV 缓存 | 错误随序列长度二次方累积 | 对 KV 缓存使用 FP8，而不是 INT4 |
| 跳过质量验证 | 某些模型量化效果差（尤其是在边界上） | 始终运行困惑度 + 任务评测 |

## 部署配方

### 配方 1：vLLM 与 AWQ（GPU 服务器）
```
pip install vllm autoawq
vllm serve model-awq --quantization awq --dtype half --max-model-len 8192
```

### 配方 2：llama.cpp 与 GGUF（MacBook）
```
./llama-server -m model.Q4_K_M.gguf -c 4096 -ngl 99
```

### 配方 3：TensorRT-LLM 与 FP8（H100）
```
trtllm-build --model_dir model --output_dir engine --dtype float16 --use_fp8
```
