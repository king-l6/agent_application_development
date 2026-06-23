# 混合专家模型 (MoE)

> 一个密集的 70B Transformer 为每个 token 激活每个参数。一个 671B 的 MoE 每个 token 只激活 37B，并且在每个基准上都击败了它。稀疏性是这个十年最重要的扩展思想。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 7 · 05（完整 Transformer），阶段 7 · 07（GPT）
**时间：** ~45 分钟

## 问题

密集 Transformer 在推理时的 FLOPs 等于其参数数量（前向传播乘以 2）。扩展一个密集模型，每个 token 都要支付全部代价。到 2024 年，前沿模型遇到了计算墙：要变得有意义地更聪明，每个 token 就需要指数级更多的 FLOPs。

混合专家模型打破了这种联系。将每个 FFN 替换为 `E` 个独立专家 + 一个路由器，为每个 token 选择 `k` 个专家。总参数 = `E × FFN_size`。每个 token 的活跃参数 = `k × FFN_size`。2026 年的典型配置：`E=256`，`k=8`。存储随 `E` 扩展，计算随 `k` 扩展。

2026 年的前沿模型几乎全是 MoE：DeepSeek-V3（总 671B / 活跃 37B）、Mixtral 8×22B、Qwen2.5-MoE、Llama 4、Kimi K2、gpt-oss。在 Artificial Analysis 的独立排行榜上，排名前 10 的开源模型都是 MoE。

## 概念

![MoE 层：路由器为每个 token 选择 k 个专家中的 E 个](../assets/moe.svg)

### FFN 替换

密集 Transformer 模块：

```
h = x + attn(norm(x))
h = h + FFN(norm(h))
```

MoE 模块：

```
h = x + attn(norm(x))
scores = router(norm(h))              # (N_tokens, E)
top_k = argmax_k(scores)              # pick k of E per token
h = h + sum_{e in top_k}(
        gate(scores[e]) * Expert_e(norm(h))
    )
```

每个专家都是一个独立的 FFN（通常是 SwiGLU）。路由器是一个单一的线性层。每个 token 选择自己的 `k` 个专家，并获取它们输出的门控混合。

### 负载均衡问题

如果路由器将 90% 的 token 分配给专家 3，其他专家就会挨饿。历史上尝试过三种修复方法：

1. **辅助负载均衡损失**（Switch Transformer、Mixtral）。添加一个与专家使用率方差成比例的惩罚项。有效，但增加了一个超参数和第二个梯度信号。
2. **专家容量 + token 丢弃**（早期 Switch）。每个专家最多处理 `C × N/E` 个 token；溢出的 token 跳过该层。损害质量。
3. **无辅助损失的均衡**（DeepSeek-V3）。添加一个学习到的按专家偏置，它偏移路由器的 top-k 选择。偏置在训练损失之外更新。不对主目标施加惩罚。2024 年的重大突破。

DeepSeek-V3 的方法：在每个训练步骤后，对每个专家，检查其使用率是高于还是低于目标。将偏置调整 `±γ`。选择使用 `scores + bias`。用于门控的专家概率是原始的 `scores`，保持不变。将路由与表达解耦。

### 共享专家

DeepSeek-V2/V3 还将专家分为*共享*和*路由*两种。每个 token 经过所有共享专家。路由专家通过 top-k 选择。共享专家捕获通用知识；路由专家专门化。V3 使用 1 个共享专家加上 256 个路由专家中的 top-8。

### 细粒度专家

经典 MoE（GShard、Switch）：每个专家和完整 FFN 一样宽。`E` 很小（8-64），`k` 很小（1-2）。

现代细粒度 MoE（DeepSeek-V3、Qwen-MoE）：每个专家更窄（1/8 FFN 大小）。`E` 很大（256+），`k` 更大（8+）。总参数相同，但组合扩展得更快。每个 token 有 `C(256, 8) = 400 万亿` 种可能的"专家"。质量提高，延迟保持不变。

### 成本概况

每个 token，每层：

| 配置 | 每 token 活跃参数 | 总参数 |
|--------|-----------------------|--------------|
| Mixtral 8×22B | ~39B | 141B |
| Llama 3 70B（密集） | 70B | 70B |
| DeepSeek-V3 | 37B | 671B |
| Kimi K2 (MoE) | ~32B | 1T |

DeepSeek-V3 在几乎每个基准上都击败了 Llama 3 70B（密集），同时**每个 token 的活跃 FLOPs 更少**。更多参数 = 更多知识。更多活跃 FLOPs = 每个 token 更多计算。MoE 将它们解耦。

### 代价：内存

无论哪些专家被激活，所有专家都驻留在 GPU 上。一个 671B 的模型需要约 1.3 TB 的 VRAM 来存放 fp16 权重。前沿 MoE 的部署需要专家并行——将专家分布到多个 GPU，通过网络路由 token。延迟主要由 all-to-all 通信决定，而不是矩阵乘法。

## 构建它

见 `code/main.py`。一个紧凑的 MoE 层，纯标准库实现：

- `n_experts=8` 个 SwiGLU 风格的专家（每个一个线性层，用于说明）
- top-k=2 路由
- softmax 归一化的门控权重
- 通过按专家偏置实现的无辅助损失均衡

### 步骤 1：路由器

```python
def route(hidden, W_router, top_k, bias):
    scores = [sum(h * w for h, w in zip(hidden, W_router[e])) for e in range(len(W_router))]
    biased = [s + b for s, b in zip(scores, bias)]
    top_idx = sorted(range(len(biased)), key=lambda i: -biased[i])[:top_k]
    # softmax over ORIGINAL scores of the chosen experts
    chosen = [scores[i] for i in top_idx]
    m = max(chosen)
    exps = [math.exp(c - m) for c in chosen]
    s = sum(exps)
    gates = [e / s for e in exps]
    return top_idx, gates
```

偏置影响选择，而不是门控权重。这就是 DeepSeek-V3 的技巧——偏置在不影响模型预测的情况下纠正负载不均衡。

### 步骤 2：将 100 个 token 通过路由器

跟踪每个专家被触发的频率。没有偏置时，使用率是偏斜的。通过偏置更新循环（过用专家 `-γ`，欠用专家 `+γ`），使用率在数次迭代后收敛到均匀分布。

### 步骤 3：参数数量比较

打印 MoE 配置的"密集等价"参数数量。DeepSeek-V3 形状：256 个路由 + 1 个共享，8 个活跃，d_model=7168。总参数数量令人瞠目。活跃数量是密集 Llama 3 70B 的七分之一。

## 使用它

HuggingFace 加载：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
model = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x22B-v0.1")
```

2026 年生产推理：vLLM 原生支持 MoE 路由。SGLang 拥有最快的专家并行路径。两者都自动处理 top-k 选择和专家并行。

**何时选择 MoE：**
- 你希望在较低推理成本下获得前沿质量。
- 你拥有 VRAM / 专家并行基础设施。
- 你的工作负载是 token 密集型（聊天、代码），而不是上下文密集型（长文档）。

**何时不选择 MoE：**
- 边缘部署——你为任何活跃 FLOP 支付全部存储成本。
- 延迟关键的单用户服务——专家路由增加额外开销。
- 小模型（<7B）——MoE 的质量优势只在一定计算阈值（约 6B 活跃参数）以上才显现。

## 交付它

见 `outputs/skill-moe-configurator.md`。该技能根据参数预算、训练 token 数和部署目标，为新的 MoE 选择 E、k 和共享专家布局。

## 练习

1. **简单。** 运行 `code/main.py`。观察无辅助损失的偏置更新如何在 50 次迭代中使专家使用率均匀化。
2. **中等。** 将学习到的路由器替换为基于哈希的路由器（确定性，无学习）。比较质量和均衡性。为什么学习到的路由器更好？
3. **困难。** 实现 GRPO 风格的"推理匹配路由"（DeepSeek-V3.2 技巧）：记录推理期间哪些专家被触发，在梯度计算期间强制使用相同的路由。在玩具策略梯度设置上测量其效果。

## 关键术语

| 术语 | 大家的说法 | 实际含义 |
|------|-----------------|-----------------------|
| 专家 | "众多 FFN 中的一个" | 独立的前馈网络；专用于 FFN 计算的一个稀疏切片的参数。 |
| 路由器 | "门控" | 一个微小的线性层，为每个 token 对每个专家评分；top-k 选择。 |
| Top-k 路由 | "每 token k 个活跃专家" | 每个 token 的 FFN 计算精确地通过 k 个专家，按门控加权。 |
| 辅助损失 | "负载均衡惩罚" | 惩罚偏斜专家使用率的额外损失项。 |
| 无辅助损失 | "DeepSeek-V3 的技巧" | 通过路由器选择上的按专家偏置进行均衡；无额外梯度。 |
| 共享专家 | "始终开启" | 每个 token 都经过的额外专家；捕获通用知识。 |
| 专家并行 | "按专家分片" | 将不同的专家分配到不同的 GPU；通过网络路由 token。 |
| 稀疏性 | "活跃参数 < 总参数" | 比率 `k × expert_size / (E × expert_size)`；DeepSeek-V3 为 37/671 ≈ 5.5%。 |

## 延伸阅读

- [Shazeer et al. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer](https://arxiv.org/abs/1701.06538) — 这个想法。
- [Fedus, Zoph, Shazeer (2022). Switch Transformer: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity](https://arxiv.org/abs/2101.03961) — Switch，经典 MoE。
- [Jiang et al. (2024). Mixtral of Experts](https://arxiv.org/abs/2401.04088) — Mixtral 8×7B。
- [DeepSeek-AI (2024). DeepSeek-V3 Technical Report](https://arxiv.org/abs/2412.19437) — MLA + 无辅助损失 MoE + MTP。
- [Wang et al. (2024). Auxiliary-Loss-Free Load Balancing Strategy for Mixture-of-Experts](https://arxiv.org/abs/2408.15664) — 基于偏置的均衡论文。
- [Dai et al. (2024). DeepSeekMoE: Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models](https://arxiv.org/abs/2401.06066) — 本课路由器使用的细粒度 + 共享专家分割。
- [Kim et al. (2022). DeepSpeed-MoE: Advancing Mixture-of-Experts Inference and Training](https://arxiv.org/abs/2201.05596) — 原始的共享专家论文。
