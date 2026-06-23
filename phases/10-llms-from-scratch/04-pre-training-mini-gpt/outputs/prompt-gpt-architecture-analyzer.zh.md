---
name: prompt-gpt-architecture-analyzer
description: 分析任何GPT风格transformer模型中的架构选择
version: 1.0.0
phase: 10
lesson: 4
tags: [gpt, transformer, architecture, attention, kv-cache, scaling, pre-training]
---

# GPT架构分析器

在评估技术报告、模型卡或训练日志中的GPT风格模型时，使用此框架分解架构并识别设计权衡。

## 分析协议

### 1. 参数分配分解

计算每个组件的精确参数数量：

- **Token嵌入**：vocab_size x embed_dim
- **位置嵌入**：max_seq_len x embed_dim
- **每块注意力**：4 x embed_dim x embed_dim（Q、K、V、输出投影）
- **每块FFN**：2 x embed_dim x ff_dim + embed_dim + ff_dim（两个线性层 + 偏置）
- **每块LayerNorm**：4 x embed_dim（两个归一化，每个含缩放+偏置）
- **最终LayerNorm**：2 x embed_dim
- **输出头**：vocab_size x embed_dim（如果与token嵌入权重绑定则为0）

如果任何单个组件超过总参数的40%，请标记。嵌入矩阵在小模型中占主导。注意力和FFN在大模型中占主导。

### 2. 注意力设计分析

评估注意力配置：

- **头维度**：embed_dim / num_heads。标准为64（GPT-2）或128（Llama 3）。低于32限制每头表达能力。高于128收益很小地浪费计算。
- **每层头数**：更多头 = 更多样化的注意力模式，但KV缓存占用更多内存。
- **分组查询注意力（GQA）**：模型是否在多个Q头之间共享K/V头？Llama 3对32个Q头使用8个KV头的GQA。这使KV缓存减少4倍。
- **上下文长度**：最大位置嵌入。RoPE允许外推到训练长度之外。绝对位置嵌入则不行。

### 3. 内存预算

对于在模型最大上下文长度下的推理：

- **权重（FP16）**：total_params x 2字节
- **KV缓存（FP16）**：2 x num_layers x num_kv_heads x head_dim x max_seq_len x 2字节
- **激活值**：batch_size x seq_len x embed_dim x 2字节 x num_layers（近似）

如果KV缓存超过权重内存，请标记。这对长上下文模型（128K+）会发生，并表明模型在解码期间受内存限制。

### 4. 计算概况

- **每个token的预填充FLOPs**：约 2 x total_params（每个参数一个矩阵乘法，前向传播）
- **每个token的解码FLOPs**：与预填充相同但作用于单个token
- **预填充瓶颈**：计算受限（GPU TFLOPS）
- **解码瓶颈**：内存受限（GPU内存带宽）
- **算术强度**：每字节访问内存的FLOPs。低于100 = 内存受限。

### 5. 缩放决策

对照已知缩放定律评估：

- **Chinchilla最优**：对于给定计算预算C，最优模型大小N和token数D满足N ~ D（大致等比例缩放）。7B模型需要约140B token。
- **Llama 3过度训练**：Meta在15T token上训练了Llama 3 8B（100倍Chinchilla最优）。在更多数据上过度训练小模型产生更好的每token推理成本。
- **宽度 vs 深度**：对于相同参数数量，更深模型（更多层）通常比更宽模型（更大embed_dim）更具样本效率。

## 红旗信号

- **FFN比率不是4倍**：标准是ff_dim = 4 x embed_dim。Llama使用8/3 x embed_dim配合SwiGLU。偏离应有理由。
- **没有权重绑定**：除非vocab_size相对于embed_dim非常大，否则输出头应与token嵌入共享权重。
- **13B以上没有GQA**：13B以上的模型如果没有分组查询注意力，KV缓存会过大。
- **长上下文没有RoPE**：绝对位置嵌入不能外推到训练长度之外。目标32K+上下文的模型应使用旋转嵌入。
- **学习率对模型大小过高**：更大模型需要更低峰值学习率。GPT-2 Small使用6e-4。Llama 3 405B使用8e-5。

## 输出格式

1. **参数表**：逐组件的参数计数和百分比
2. **内存预算**：最大上下文长度下的权重、KV缓存和激活值内存
3. **计算概况**：A100/H100的预填充和解码吞吐量估算
4. **设计评估**：模型做对了什么以及什么不符合标准
5. **缩放评判**：模型是否针对其训练数据进行了适当的大小设计
