# KV Cache、Flash Attention 与推理优化

> 训练是并行的且受限于 FLOP。推理是串行的且受限于内存。不同的瓶颈，不同的技巧。

**类型：** 构建
**语言：** Python
**前置条件：** 阶段 7 · 02（自注意力）、阶段 7 · 05（完整 Transformer）、阶段 7 · 07（GPT）
**时间：** ~75 分钟

## 问题

一个朴素的单向自回归解码器生成 `N` 个 token 需要 `O(N²)` 的工作量：每一步它都要在完整前缀上重新计算注意力。对于一个 4K token 的响应，那就是 1600 万次注意力操作，其中大部分是冗余的。前缀 token 的每个隐藏状态一旦计算出来就是确定性的——你只需要用新 token 的查询（query）去检索已缓存的之前所有 token 的键（key）和值（value）。

除此之外，注意力本身也会移动大量数据。标准注意力会物化一个 N×N 的分数矩阵、一个 N×d 的 softmax 输出、以及一个 N×d 的最终输出——对 HBM 的读写次数过多。当 N≥2K 时，注意力在达到 FLOP 瓶颈之前就已经受限于内存了。经典的注意力内核比现代 GPU 的利用率低 4-10 倍。

两种优化方法均来自 Dao 等人，将前沿推理从"慢速"推进到了"快速"：

1. **KV cache。** 存储每个前缀 token 的 K 和 V 向量。每个新 token 的注意力只需一个查询与缓存的键进行匹配。推理从 `O(N²)` 降低到每步生成的 `O(N)`。
2. **Flash Attention。** 将注意力计算分块（tiling），使得完整的 N×N 矩阵永远不会触及 HBM。所有 softmax + 矩阵乘法都在 SRAM 中完成。在 A100 上获得 2-4 倍的时钟加速；在 H100 上使用 FP8 可获得 5-10 倍加速。

到 2026 年，这两种技术已经普及。每个生产推理栈（vLLM、TensorRT-LLM、SGLang、llama.cpp）都依赖它们。每个前沿模型都默认启用 Flash Attention。

## 概念

![KV cache 增长和 Flash Attention 分块](../assets/kv-cache-flash-attn.svg)

### KV cache 的数学计算

每个解码器层、每个 token、每个注意力头：

```
每层每 token 的字节数 = 2 * d_head * dtype_size
                          ^
                          K 和 V
```

对于一个 7B 模型，包含 32 层、32 个头、d_head=128、fp16：

```
每层每 token = 2 * 128 * 2 = 512 字节
每 token（32 层）= 16 KB
每 32K 上下文 = 512 MB
```

对于 Llama 3 70B（80 层、d_head=128、GQA 带 8 个 KV 头）：

```
每层每 token = 2 * 8 * 128 * 2 = 4096 字节（4 KB）
每 32K 上下文 = 10.4 GB
```

那 10 GB 正是为什么在 batch size 为 1 时，Llama 3 70B 在 128K 上下文中需要一台 40 GB A100 的大部分内存来存储 KV cache 的原因。

**GQA 是 KV cache 的胜利。** 拥有 64 个头的 MHA 需要 32 GB。MLA 的压缩效果更佳。

拖动维度，观察 cache 大小的变化。增加序列长度或 batch 大小，看看它多快就会超过单张 GPU 的容量：

```figure
kv-cache-sizer
```

### Flash Attention——分块技巧

标准注意力：

```
S = Q @ K^T          （HBM 读取，N×N，HBM 写入）
P = softmax(S)       （HBM 读取，HBM 写入）
O = P @ V            （HBM 读取，HBM 写入）
```

三次 HBM 往返。在 H100 上，HBM 带宽为 3 TB/s；SRAM 为 30 TB/s。与将所有数据保持在片上相比，每次 HBM 往返都会带来 10 倍的减速。

Flash Attention：

```
for each block of Q (tile size ~128 × 128):
    load Q_tile into SRAM
    for each block of K, V:
        load K_tile, V_tile into SRAM
        compute S_tile = Q_tile @ K_tile^T     (SRAM)
        running softmax aggregation             (SRAM)
        accumulate into O_tile                  (SRAM)
    write O_tile to HBM
```

每次分块只需一次 HBM 往返。总内存占用从 `O(N²)` 降至 `O(N)`。反向传播从前向传播中重新计算一些值，而不是存储它们——这是另一个内存上的胜利。

**数值技巧。** 运行中 softmax 在分块之间维护 `(max, sum)`，使得最终归一化是精确的。这不是近似——Flash Attention 计算出的输出与标准注意力是比特位一致的（除了 fp16 的非结合性）。

**版本演进：**

| 版本 | 年份 | 关键变化 | 在参考硬件上的加速 |
|---------|------|-----------|-------------------------------|
| Flash 1 | 2022 | 分块 SRAM 内核 | A100 上 2 倍 |
| Flash 2 | 2023 | 更好的并行性、因果优先排序 | A100 上 3 倍 |
| Flash 3 | 2024 | Hopper 异步、FP8 | H100 上 1.5-2 倍（~740 TFLOPs FP16）|
| Flash 4 | 2026 | Blackwell 5 级流水线、软件 exp2 | 推理优先（初始阶段仅前向）|

Flash 4 在发布时仅支持前向传播。训练仍然使用 Flash 3。GQA 和变长序列支持待定（2026 年中）。

### 推测解码——另一个延迟方面的胜利

廉价模型提出 N 个 token。大模型并行验证所有 N 个 token。如果验证接受了 k 个 token，你只需要为 k 次生成支付 1 次大模型前向传播的代价。典型的 k 值在代码和散文上为 3-5。

2026 年的默认方案：
- **EAGLE 2 / Medusa。** 集成式草稿头，共享验证器的隐藏状态。2-3 倍加速，质量无损。
- **使用草稿模型的推测解码。** 在消费级硬件上获得 2-4 倍加速。
- **Lookahead decoding。** 雅可比迭代；无需草稿模型。小众但免费。

### 连续批处理

经典的批处理推理：等待最慢的序列完成，然后开始新一批。当短响应提前完成时会浪费 GPU。

连续批处理（首次在 Orca 中推出，现已在 vLLM、TensorRT-LLM、SGLang 中实现）：一旦旧请求完成，立即将新请求交换到批次中。对于典型的聊天工作负载，吞吐量提升 5-10 倍。

### PagedAttention——KV cache 作为虚拟内存

vLLM 的标志性特性。KV cache 以 16 token 的块进行分配；页表将逻辑位置映射到物理块。它允许在并行采样（束搜索、并行采样）之间共享 KV、为提示缓存热交换前缀，以及整理内存碎片。相比朴素连续分配，吞吐量提升 4 倍。

```figure
flash-attention-memory
```

## 构建

参见 `code/main.py`。我们将实现：

1. 一个朴素的 `O(N²)` 增量解码器。
2. 一个 `O(N)` 带 KV cache 的解码器。
3. 一个分块 softmax，模拟 Flash Attention 的运行中最大值算法。

### 步骤 1：KV cache

```python
class KVCache:
    def __init__(self, n_layers, n_heads, d_head):
        self.K = [[[] for _ in range(n_heads)] for _ in range(n_layers)]
        self.V = [[[] for _ in range(n_heads)] for _ in range(n_layers)]

    def append(self, layer, head, k, v):
        self.K[layer][head].append(k)
        self.V[layer][head].append(v)

    def read(self, layer, head):
        return self.K[layer][head], self.V[layer][head]
```

简单：在每个层、每个头的列表中不断增长每个 token 的 K、V 向量。

### 步骤 2：分块 softmax

```python
def tiled_softmax_dot(q, K, V, tile=4):
    """Flash-attention-style softmax(qK^T)V with running max/sum."""
    m = float("-inf")
    s = 0.0
    out = [0.0] * len(V[0])
    for start in range(0, len(K), tile):
        k_block = K[start:start + tile]
        v_block = V[start:start + tile]
        scores = [sum(qi * ki for qi, ki in zip(q, k)) for k in k_block]
        new_m = max(m, *scores)
        exp_old = math.exp(m - new_m) if m != float("-inf") else 0.0
        exp_new = [math.exp(sc - new_m) for sc in scores]
        s = s * exp_old + sum(exp_new)
        for j in range(len(out)):
            out[j] = out[j] * exp_old + sum(e * v[j] for e, v in zip(exp_new, v_block))
        m = new_m
    return [o / s for o in out]
```

一次性计算 `softmax(qK) V` 得到比特位一致的输出，但在任何时候，工作集都只是一个 `tile × d_head` 的块，而不是完整的 `N × d_head`。

### 步骤 3：在 100 个 token 生成上比较朴素解码与缓存解码

统计注意力操作次数。朴素方法：`O(N²)` = 5050。缓存方法：`O(N)` = 100。代码会打印两者。

## 使用

```python
# HuggingFace transformers 自动在仅解码器的 generate() 中启用 KV cache。
from transformers import AutoModelForCausalLM
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B",
    attn_implementation="flash_attention_2",  # 如果是 Hopper 架构则使用 FA3
    torch_dtype="bfloat16",
)
# generate() 自动使用 KV cache
```

vLLM 生产部署：

```bash
pip install vllm
vllm serve meta-llama/Llama-3.1-70B-Instruct \
    --tensor-parallel-size 4 \
    --max-model-len 32768 \
    --enable-prefix-caching \
    --kv-cache-dtype fp8
```

跨请求的前缀缓存是 2026 年的重大胜利——相同的系统提示、few-shot 示例或长上下文文档可以在多次调用之间重复使用 KV。对于具有重复工具提示的 agent 工作负载，前缀缓存通常能带来 5 倍的吞吐量提升。

## 交付

参见 `outputs/skill-inference-optimizer.md`。该技能为新的推理部署选择注意力实现、KV cache 策略、量化方法和推测解码方案。

## 练习

1. **简单。** 运行 `code/main.py`。确认朴素解码器和缓存解码器产生相同的输出；注意操作次数的差异。
2. **中等。** 实现前缀缓存：给定一个提示 P 和多个补全，对 P 进行一次前向传播以填充 KV cache，然后按补全分支进行。测量与为每个补全重新编码 P 相比的加速比。
3. **困难。** 实现一个玩具版 PagedAttention：KV cache 以固定的 16 token 块分配，并带有一个空闲列表。当一个序列完成时，将其块返回到池中。模拟 1000 个长度各异的聊天补全。比较与连续分配相比的内存碎片情况。

## 关键术语

| 术语 | 人们说的意思 | 实际含义 |
|------|-----------------|-----------------------|
| KV cache | "让解码变快的技巧" | 存储每个前缀 token 的 K 和 V；新的查询使用它们而不是重新计算。 |
| HBM | "GPU 主内存" | 高带宽内存；H100 上 80 GB，B200 上 192 GB。带宽约 3 TB/s。 |
| SRAM | "片上内存" | 每个 SM 的快速内存，H100 上约 256 KB 每 SM。带宽约 30 TB/s。 |
| Flash Attention | "分块注意力内核" | 无需在 HBM 中物化 N×N 矩阵即可计算注意力。 |
| 连续批处理 | "无等待批处理" | 将完成的序列换出、新序列换入，无需排空整个批次。 |
| PagedAttention | "vLLM 的标志性特性" | KV cache 以固定块分配，使用页表；消除碎片。 |
| 前缀缓存 | "复用长提示" | 跨请求缓存共享前缀的 KV；对 agent 来说大幅降低成本。 |
| 推测解码 | "草稿 + 验证" | 廉价草稿模型提出 token；大模型一次验证 k 个。 |

## 扩展阅读

- [Dao et al. (2022). FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135) — Flash 1。
- [Dao (2023). FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning](https://arxiv.org/abs/2307.08691) — Flash 2。
- [Shah et al. (2024). FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision](https://arxiv.org/abs/2407.08608) — Flash 3。
- [FlashAttention-4 发布说明 (Dao-AILab, 2026)](https://github.com/Dao-AILab/flash-attention) — Blackwell 5 级流水线和软件 exp2 技巧；阅读仓库 README 了解本课提到的仅前向发布的注意事项。
- [Kwon et al. (2023). Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — vLLM 论文。
- [Leviathan et al. (2023). Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192) — 推测解码。
- [Li et al. (2024). EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty](https://arxiv.org/abs/2401.15077) — EAGLE-1/2 论文，关于本课引用的集成草稿方法。
- [Cai et al. (2024). Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads](https://arxiv.org/abs/2401.10774) — 与 EAGLE 一起引用的 Medusa 方法。
- [vLLM 文档 — PagedAttention](https://docs.vllm.ai/en/latest/design/kernel/paged_attention.html) — 关于 16 token 块和页表设计的权威深入解读。
