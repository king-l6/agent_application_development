# 梯度检查点与激活重计算

> 反向传播保留每个中间激活。在 70B 参数和 128K 上下文下，每个 rank 有 3 TB 的激活。检查点用 FLOPs 换取内存：重计算而不是保存。问题在于丢弃哪些段，答案不是"全部丢弃"。

**类型：** 构建
**语言：** Python（使用 numpy，可选 torch）
**前置知识：** 阶段 10 · 第 04 课（预训练迷你 GPT），阶段 10 · 第 05 课（扩展与分布式）
**时间：** ~70 分钟

## 问题

训练 Transformer 为每一层存储在反向传播中被微分的每个操作的输入：注意力输入、Q/K/V 投影、softmax 输出、FFN 输入、归一化输出和残差流。对于隐藏大小 `d`、序列长度 `L`、批次 `B` 的一层，大约是每层 `12 * B * L * d` 个浮点数。

对于 `d=8192, L=8192, B=1`，在 BF16 下那是 800 MB/层。一个 64 层模型是 51 GB 的激活——这还是在乘以微批次大小、添加注意力 softmax 中间结果（每头 `L^2`）以及考虑张量并行部分副本之前。

两面账单：BF16 权重加上优化器状态可能适合 80GB，但激活会把你推过限制。梯度检查点（又称激活重计算）是标准的修复方法。丢弃大部分激活；在反向传播期间重做前向以取回它们。代价：额外的 FLOPs。收益：内存按照检查点段与总层数的比例下降。

天真地做，检查点大约每步增加 33% 的前向传递 FLOPs。做得好的话——根据 Korthikanti 等人的"智能选择"进行选择性检查点——你可以用不到 5% 的 FLOP 开销节省 5 倍内存。而且随着 FP8 矩阵乘法、FSDP 卸载和专家并行 MoE，这真的很重要：你既无法承受内存的代价，也无法承受浪费的计算。

## 概念

### 反向传播实际需要什么

`output = layer(input)`。反向传播需要 `grad_input` 和 `grad_params`。为计算它们，它需要：

- `input`（为线性层计算 `grad_params = input.T @ grad_output`）
- 一些激活导数中间结果（ReLU/GELU/softmax 的导数依赖于激活值）

前向传递在自动求导图中自动存储这些。每个 `tensor.retain_grad()` 和每个需要其输入的操作都保留一个引用。

### 天真的全检查点

将网络拆分为 `N` 个段。在前向传递期间，只存储每个段的**输入**。当反向传播需要中间结果时，重新运行该段的前向传递来物化它们，然后微分。

示例：32 层 Transformer 拆分为 32 个段，每个段 1 层。

- 内存：32 个层输入（小） vs 32 *（每层激活体积）（巨大）。
- 额外计算：每个段额外一次前向，即总计约 33% 更多前向 FLOPs（由于反向是前向的 2 倍，完整步骤变为 1 + 1 + 2 = 4 个单位而不是 1 + 2 = 3）。

这是原始的 Chen 等人 2016 年配方：每 `sqrt(L)` 层一个检查点，以平衡内存和计算。对于 L=64，那是 8 个检查点。

### 选择性检查点（Korthikanti 2022）

并非所有激活成本相同。注意力 softmax 输出是 `B*L*L*heads`，随序列长度**二次**增长。FFN 隐藏激活是 `B*L*4d`，线性增长。对于长序列，softmax 占主导。

选择性检查点保留存储成本低的激活（线性投影、残差），只重计算昂贵的激活（注意力）。你支付最少的 FLOPs 来重计算，但节省了 O(L^2) 的内存。

Megatron-Core 将其实现为"选择性"激活重计算。用于大多数 2024+ 前沿训练运行。

### 卸载

重计算的替代方案：在前向和反向之间将激活传输到 CPU RAM。需要 PCIe 带宽；当空闲带宽超过重新物化成本时有益。混合策略很常见：检查点一些层，卸载其他层。

FSDP2 将卸载作为一等选项提供。当 GPU 内存成为瓶颈但 CPU-GPU 传输有余量时，卸载表现出色。

### 重计算成本模型

天真地将每 `k` 层（共 `L` 层）作为检查点的每步 FLOPs：

```
flops_fwd_normal = L * f_layer
flops_bwd_normal = 2 * L * f_layer
flops_total_normal = 3 * L * f_layer

flops_fwd_ckpt = L * f_layer
flops_recompute = L * f_layer  # 段内每层额外一次前向
flops_bwd_ckpt = 2 * L * f_layer
flops_total_ckpt = 4 * L * f_layer
overhead = 4 / 3 - 1 = 0.33 = 33%
```

使用选择性检查点，你只重计算注意力内核，而不是整个层：

```
flops_recompute_selective = L * f_attention ~= L * f_layer * 0.15
overhead_selective = (3 + 0.15) / 3 - 1 = 0.05 = 5%
```

### 内存节省模型

每层激活体积：`A`。对于 `L` 层，总激活内存：`L * A`。

全检查点（段大小 1）：只存储 `L * input_volume`（标准 Transformer 约 `L * 1/10 A`）。节省约 `9 * L * A * 1/10`。

每 `k` 层检查点：存储 `L/k * A` 加上活动段内 `k-1` 层的值。

在 `k = sqrt(L)` 时，内存和重计算成本都随 `sqrt(L)` 缩放——对于均匀成本层的最优权衡。

### 何时不检查点

- 流水线阶段中最内层的已经在进行中的层。它们无论如何都必须完成。
- 如果第一层和最后一层主导了阶段的计算（在 Transformer 中很少见）。
- 已经使用 FlashAttention 的注意力内核——Flash 已经快速重计算了 softmax，因此额外的层级检查点在其之上增加甚少。

### 实现模式

1. **函数包装器：** 将一个段包装在 `torch.utils.checkpoint.checkpoint(fn, input)` 中。PyTorch 只存储 `input`，在反向传播时重计算其他所有内容。

2. **装饰器基础：** 将层标记为可检查点；训练器在配置时决定哪些段被包装。

3. **手动显式重计算：** 自己编写反向传播，调用自定义的 `recompute_forward`，该函数使用存储的输入重复前向。

三者都给出相同的功能结果。包装器是标准用法。

### 与 TP / PP / FP8 的交互

- **张量并行：** 检查点输入必须在重计算时收集或重新分散；处理通信成本。
- **流水线并行：** 典型模式是检查点每个流水线阶段的前向，以便反向顺序的微批次可以复用激活内存。
- **FP8 重计算：** 重计算期间更新的 amax 历史必须与原始前向匹配，否则 FP8 比例会漂移。大多数框架会快照比例。

## 构建

### 步骤 1：带有段的玩具模型

```python
import numpy as np


def linear_forward(x, w, b):
    return x @ w + b


def relu(x):
    return np.maximum(x, 0)


def layer_forward(x, w1, b1, w2, b2):
    h = relu(linear_forward(x, w1, b1))
    return linear_forward(h, w2, b2)


def model_forward(x, params):
    activations = [x]
    h = x
    for w1, b1, w2, b2 in params:
        h = layer_forward(h, w1, b1, w2, b2)
        activations.append(h)
    return h, activations
```

### 步骤 2：需要所有激活的天真反向

```python
def model_backward(grad_output, activations, params):
    grads = [None] * len(params)
    g = grad_output
    for i in range(len(params) - 1, -1, -1):
        w1, b1, w2, b2 = params[i]
        x_in = activations[i]
        h_pre = linear_forward(x_in, w1, b1)
        h = relu(h_pre)
        gh = g @ w2.T
        gw2 = h.T @ g
        gb2 = g.sum(axis=0)
        g_pre = gh * (h_pre > 0)
        gx = g_pre @ w1.T
        gw1 = x_in.T @ g_pre
        gb1 = g_pre.sum(axis=0)
        grads[i] = (gw1, gb1, gw2, gb2)
        g = gx
    return g, grads
```

### 步骤 3：每 k 层检查点的内存

```python
def model_forward_checkpointed(x, params, k=4):
    saved_inputs = [x]
    h = x
    for i, (w1, b1, w2, b2) in enumerate(params):
        h = layer_forward(h, w1, b1, w2, b2)
        if (i + 1) % k == 0:
            saved_inputs.append(h)
    return h, saved_inputs


def model_backward_checkpointed(grad_output, saved_inputs, params, k=4):
    grads = [None] * len(params)
    g = grad_output
    segments = [(j * k, min((j + 1) * k, len(params))) for j in range(len(saved_inputs))]
    for seg_idx in range(len(saved_inputs) - 1, -1, -1):
        start, end = segments[seg_idx]
        if start >= end:
            continue
        x_in = saved_inputs[seg_idx]
        _, seg_acts = model_forward(x_in, params[start:end])
        g, seg_grads = model_backward(g, seg_acts, params[start:end])
        for j, gr in enumerate(seg_grads):
            grads[start + j] = gr
    return g, grads
```

### 步骤 4：成本模型

```python
def checkpoint_cost(n_layers, segment_size, flops_per_layer=1.0):
    fwd = n_layers * flops_per_layer
    recompute = n_layers * flops_per_layer
    bwd = 2 * n_layers * flops_per_layer
    return {
        "fwd": fwd,
        "recompute": recompute,
        "bwd": bwd,
        "total": fwd + recompute + bwd,
        "overhead_vs_no_ckpt": (fwd + recompute + bwd) / (fwd + bwd) - 1.0,
    }


def selective_checkpoint_cost(n_layers, attention_fraction=0.15,
                              flops_per_layer=1.0):
    fwd = n_layers * flops_per_layer
    recompute = n_layers * attention_fraction * flops_per_layer
    bwd = 2 * n_layers * flops_per_layer
    return {
        "fwd": fwd,
        "recompute": recompute,
        "bwd": bwd,
        "total": fwd + recompute + bwd,
        "overhead_vs_no_ckpt": (fwd + recompute + bwd) / (fwd + bwd) - 1.0,
    }
```

### 步骤 5：内存估计器

```python
def activation_memory_mb(n_layers, hidden=8192, seq=8192,
                         batch=1, bytes_per_value=2):
    per_layer = 12 * batch * seq * hidden * bytes_per_value
    return n_layers * per_layer / 1e6


def memory_after_checkpoint(n_layers, segment_size, hidden=8192,
                            seq=8192, batch=1, bytes_per_value=2):
    n_seg = max(1, n_layers // segment_size)
    saved = (n_seg + segment_size) * 1 * batch * seq * hidden * bytes_per_value
    return saved / 1e6
```

### 步骤 6：最优段大小

```python
def optimal_segment(n_layers):
    return int(round(np.sqrt(n_layers)))
```

### 步骤 7：选择性检查点决策

```python
def should_recompute(layer_type, activation_bytes, recompute_flops_ratio):
    if layer_type == "attention" and activation_bytes > 100 * 1e6:
        return True
    if layer_type == "ffn" and activation_bytes > 500 * 1e6:
        return recompute_flops_ratio < 0.1
    return False
```

## 使用

- **torch.utils.checkpoint**：`from torch.utils.checkpoint import checkpoint` — PyTorch 中的规范包装器。包装一个函数；只存储输入，在反向传播时重计算。
- **Megatron-Core 激活重计算**：支持 `selective`、`full` 和 `block` 模式。2024+ 前沿训练中的标准。
- **FSDP2 卸载**：`module.to_empty(device="cpu")` 配合 FSDP2 中的 `offload_policy`，将激活分片到 CPU 而不是重计算。
- **DeepSpeed ZeRO-Offload**：优化器状态和激活的 CPU 卸载，补充检查点。

## 交付

本节课生成 `outputs/prompt-activation-recompute-policy.md`——一个提示，接收你的模型配置（层数、隐藏大小、序列长度、批次）和可用 GPU 内存，并输出每层重计算策略（无 / 选择性 / 全 / 卸载）。

## 练习

1. 验证正确性。运行 `model_forward` + `model_backward`（全激活）与 `model_forward_checkpointed` + `model_backward_checkpointed`（分段）比较。参数梯度必须精确匹配到机器精度。

2. 扫描段大小 `k` 从 1 到 `L`。绘制 FLOP 开销和内存图。找到曲线拐点。

3. 实现选择性检查点：存储注意力模块的输入但不存储其中间结果。对于一个 32 层模型，在 seq=8192 下测量 FLOP 开销与全层检查点的比较。

4. 添加卸载。将段输入保存到模拟的"CPU 缓冲区"（一个单独的列表）。将"PCIe 带宽"测量为字节/时间，并找到卸载和重计算之间的盈亏平衡点。

5. 在有和没有 `torch.utils.checkpoint` 的情况下对一个真实 PyTorch Transformer 进行基准测试。测量内存（通过 `torch.cuda.max_memory_allocated`）和步时间。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------------|----------------------|
| 梯度检查点 | "通过重做前向节省内存" | 只存储段输入；在反向传播期间重计算中间结果以获取梯度支持张量 |
| 激活重计算 | "与检查点相同" | 相同技术的 HPC 风格名称 |
| 段大小 (k) | "每个检查点多少层" | 其中间结果被丢弃并一起重新物化的层数 |
| 选择性检查点 | "Korthikanti 的技巧" | 只重计算存储成本高的激活（注意力 softmax）；保留成本低的激活 |
| 全检查点 | "天真的版本" | 在每个段中重计算每一层的中间结果 |
| 块检查点 | "粗粒度" | 检查点整个 Transformer 块；最大的粒度 |
| FLOP 开销 | "计算税" | 每步额外 FLOPs = (重计算 FLOPs) / (前向 + 反向 FLOPs)；33% 天真，5% 选择性 |
| 激活卸载 | "传输到 CPU" | 在前向->反向期间将激活移动到 CPU RAM；重计算的替代方案 |
| sqrt-L 规则 | "经典最优值" | 对于均匀成本层，最优检查点间隔为 sqrt(L) 层 |
| 注意力-softmax 体积 | "O(L^2) 问题" | L^2 * 头数 * 批次浮点数；在长上下文下主导激活内存 |

## 延伸阅读

- [Chen 等人, 2016 — "Training Deep Nets with Sublinear Memory Cost"](https://arxiv.org/abs/1604.06174) — 形式化梯度检查点的原始论文
- [Korthikanti 等人, 2022 — "Reducing Activation Recomputation in Large Transformer Models"](https://arxiv.org/abs/2205.05198) — 选择性激活重计算和形式成本分析
- [Pudipeddi 等人, 2020 — "Training Large Neural Networks with Constant Memory using a New Execution Algorithm"](https://arxiv.org/abs/2002.05645) — 通过反向模式重新物化的替代常驻内存方法
- [Ren 等人, 2021 — "ZeRO-Offload: Democratizing Billion-Scale Model Training"](https://arxiv.org/abs/2101.06840) — 大规模激活卸载
- [PyTorch torch.utils.checkpoint 文档](https://pytorch.org/docs/stable/checkpoint.html) — 标准 API
- [Megatron-Core 激活重计算文档](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/features/memory_optimizations.html) — 选择性、全和块模式
