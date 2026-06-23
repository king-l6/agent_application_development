# 投机解码与 EAGLE

> 前沿 LLM 生成一个 token 需要对数十亿参数进行完整的前向传递。这个前向传递是严重过度配置的：大多数时候，一个更小的模型可以正确猜出接下来的 3-5 个 token，大模型只需要**验证**这个猜测。当猜测正确时，你以一次前向的成本得到了 5 个 token。投机解码（Leviathan 等人，2023）使这变得精确，而 EAGLE-3（2025）将接受率推到了每个验证约 4.5 个 token——在匹配输出分布的情况下实现 4-5 倍加速。

**类型：** 构建
**语言：** Python（使用 numpy）
**前置知识：** 阶段 10 · 第 12 课（推理优化），阶段 10 · 第 04 课（预训练迷你 GPT）
**时间：** ~75 分钟

## 问题

70B 类模型在 H100 上的解码吞吐量通常为 40-80 token/秒。每个 token 需要一次从 HBM 读取所有模型权重的完整前向传递。你不能在不改变其输出的情况下让模型变小。你不能在内存之外增加批大小。你被困住了——除非你能让模型每次前向传递输出多个 token。

自回归生成看起来本质上是串行的：`x_{t+1} = sample(p(· | x_{1:t}))`。但存在一个并发机会。如果你有一个廉价的预测器说"接下来的 4 个 token 很可能是 [a, b, c, d]"，你可以在大模型的**一次前向传递**中验证所有 5 个位置，并接受最长的匹配前缀。

Leviathan、Kalai、Matias（2023，"Fast Inference from Transformers via Speculative Decoding"）通过一个巧妙的接受/拒绝规则使其精确，该规则保留了目标模型的采样分布。相同的输出分布，2-4 倍更快。

## 概念

### 双模型设置

- **目标模型** `M_p`：大、慢、高质量的模型，你实际想要从中采样。分布：`p(x)`。
- **草稿模型** `M_q`：小、快、低质量的模型。分布：`q(x)`。小 5-30 倍。

每步：

1. 草稿模型自回归地提出 `K` 个 token：`x_1, x_2, ..., x_K ~ q`。
2. 目标模型对所有 `K+1` 个位置运行**一次**前向传递，并行产生每个提议 token 的 `p(x_k)`。
3. 通过下面修改的拒绝采样规则从左到右接受/拒绝每个 token。接受最长的匹配前缀。
4. 如果有任何 token 被拒绝，从校正后的分布中采样替代品并停止。否则从 `p(· | x_1...x_K)` 中采样一个奖励 token。

如果草稿与目标完美匹配，你每次目标前向得到 K+1 个 token。如果草稿在位置 1 出错，你只得到 1 个 token。

### 精确性规则

投机解码在分布上**被证明等价于从 p 采样**。拒绝规则：

```
对于每个草稿 token x_t:
    r ~ Uniform(0, 1)
    if r < p(x_t) / q(x_t):
        接受 x_t
    else:
        从残差分布采样: (p - q)+ / ||(p - q)+||_1
        停止
```

其中 `(p - q)+` 表示逐点差的正部分。当草稿和目标一致时（`p ≈ q`），接受率接近 1。当它们不一致时，残差分布被构造为使得整体样本仍然是精确的 `p`。

**贪心情况。** 对于 temperature=0 采样，只需检查 `argmax(p) == x_t`。如果是，接受；如果否，输出 `argmax(p)` 并停止。

### 预期加速

如果草稿模型 token 级别的接受率为 `α`，每次目标前向通过产生的预期 token 数为：

```
E[tokens] = (1 - α^{K+1}) / (1 - α)        # K = 草稿长度, α in [0, 1]
```

在 `α = 0.8, K = 4` 时：`(1 - 0.8^5)/(1 - 0.8) = 3.36` 个 token 每次前向。一次目标前向的代价大约为 `cost_q * K + cost_p`（K 步草稿加上一次目标验证）。如果 `cost_p >> cost_q * K`，吞吐量加速比为 `3.36× / 1 = 3.36×`。

唯一真正的参数是 `α`，它完全取决于草稿与目标的对齐程度。好的草稿就是一切。

### 训练草稿：蒸馏

随机的小模型只能做出糟糕的草稿。标准方法是从目标蒸馏：

1. 选择一个小型架构（70B 目标约 1B，7B 目标约 500M）。
2. 在大文本语料库上运行目标模型；存储其下一个 token 分布。
3. 使用 KL 散度针对目标的分布（而不是针对真实 token）训练草稿。

结果：编程上 `α` 通常为 0.6-0.8，自然语言聊天上为 0.7-0.85。生产中的加速比 2-3 倍。

### EAGLE：树草稿 + 特征复用

Li、Wei、Zhang、Zhang（2024，"EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty"）观察到标准投机解码中的两个低效：

1. 草稿执行 K 个串行步骤，每步全栈。但草稿可以复用目标最近一次验证的特征（隐藏状态）——目标已经计算了丰富的表示，而草稿正在从头重新推导。
2. 草稿输出线性链。如果草稿可以输出候选的**树**（每个节点多个猜测），目标的一次前向传递可以通过树注意力掩码并行验证多个候选路径，并选择最长的接受分支。

EAGLE-1 的变化：
- 草稿输入 = 位置 t 处目标的最终隐藏状态，而不是原始 token。
- 草稿架构 = 1 个 Transformer 解码器层（而不是单独的小模型）。
- 输出 = 每深度 K = 4-8 个候选的树，深度 4-6。

EAGLE-2（2024）添加了动态树拓扑：树在草稿不确定的地方变宽，在自信的地方保持窄。提高了 `α_effective` 而不增加验证成本。

EAGLE-3（Li 等人，2025，"EAGLE-3: Scaling up Inference Acceleration of Large Language Models via Training-Time Test"）去掉了固定的顶层特征依赖，并使用新的"测试时模拟"损失训练草稿——草稿在与目标测试时分布匹配的输出上训练，而不是教师强制的训练分布。接受率从 0.75（EAGLE-2）上升到 0.82（EAGLE-3），平均 token/验证从 3.0 上升到 4.5。

### 树注意力验证

当草稿输出一棵树时，目标模型使用**树注意力掩码**在一次前向传递中验证它——一个编码树拓扑而不是纯线的因果掩码。每个 token 只关注其在树中的祖先。验证仍然是一次前向、一次矩阵乘法；拓扑掩码只花费几个额外的 KV 条目。

```
        root
       /    \
      a      b
     / \    / \
    c  d   e   f
```

如果 `a, b` 是竞争的第一个 token 候选，`c, d, e, f` 是第二个 token 候选，所有六个位置在单次前向传递中被验证。输出是沿着任何接受路径的最长前缀。

### 何时胜出，何时不行

**胜出：**
- 聊天 / 补全，文本可预测（代码、常用英语、结构化输出）。`α` 很高。
- 解码期间 GPU 计算未被充分利用的设置（内存受限阶段）。树草稿使用可用的 FLOPs。

**失败 / 无收益：**
- 高度随机的输出（高温度创造性写作）。`α` 下降到接近 `1/|vocab|`。
- 具有非常高并发性的批量服务——批处理已经填满了 FLOPs，几乎没有空间进行树验证。
- 非常小的目标模型，其中草稿并不是小很多。

生产环境通常报告聊天的墙钟加速为 2-3 倍，代码生成为 3-5 倍，创造性写作为接近零。

```figure
speculative-decoding
```

## 构建

`code/main.py`：

- 一个参考 `speculative_decode(target, draft, prompt, K, temperature)`，实现了精确的拒绝规则并验证它保留了目标的分布（经验 KL < 0.01 与普通目标采样相比）。
- 一个 EAGLE 风格的树草稿器，构建深度为 K、具有 top-p 分支的树。
- 一个为验证器产生正确因果模式的树注意力掩码构建器。
- 一个接受率测试框架，两者都在一个小型 LM 上运行（从 GPT-2-medium 目标蒸馏一个 GPT-2-small）。

```python
def speculative_step(p_target, q_draft, K, temperature=1.0):
    """投机解码的一轮。返回接受的 token 列表。"""
    # 1. 草稿 K 个 token
    draft_tokens = []
    q_probs = []
    state = draft_state_init()
    for _ in range(K):
        probs = softmax(q_draft(state) / temperature)
        t = np.random.choice(len(probs), p=probs)
        draft_tokens.append(t)
        q_probs.append(probs[t])
        state = draft_step(state, t)

    # 2. 目标计算每个草稿位置 + 1 个额外位置的 p
    p_probs_all = target_forward_batched(p_target, draft_tokens, temperature)

    # 3. 从左到右接受/拒绝
    accepted = []
    for k, tok in enumerate(draft_tokens):
        r = np.random.uniform()
        if r < p_probs_all[k][tok] / q_probs[k]:
            accepted.append(tok)
        else:
            residual = np.maximum(p_probs_all[k] - q_probs[k], 0)
            residual /= residual.sum()
            accepted.append(np.random.choice(len(residual), p=residual))
            return accepted
    # 4. 所有 K 个被接受 → 从目标采样奖励 token
    accepted.append(np.random.choice(len(p_probs_all[-1]), p=p_probs_all[-1]))
    return accepted
```

## 使用

- **vLLM** 和 **SGLang** 提供一流的投机解码支持。标志：`--speculative_model`、`--num_speculative_tokens`。通过 `--spec_decoding_algorithm eagle` 标志支持 EAGLE-2/3。
- **NVIDIA TensorRT-LLM** 原生支持 Medusa 和 EAGLE 树。
- **参考草稿模型**：`Qwen/Qwen3-0.6B-spec`（为 Qwen3-32B 草稿）、`meta-llama/Llama-3.2-1B-Instruct-spec`（为 70B 草稿）。
- **Medusa 头**（Cai 等人，2024，"Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads"）：不是草稿模型，而是在目标本身上添加 K 个并行预测头。部署更简单，接受率略低于 EAGLE。

## 交付

本节课生成 `outputs/skill-speculative-tuning.md`——一个分析目标模型工作负载并选择草稿模型、K（草稿长度）、树宽度、温度以及何时回退到普通解码的技能。

## 练习

1. 实现精确的拒绝规则并经验性验证。通过 `speculative_decode` 和普通目标采样运行 10K 样本；计算两个输出分布之间的 TV 距离。应该 < 0.01。

2. 计算加速公式。给定固定的 `α` 和 `K`，绘制每次目标前向的预期 token。找到 α ∈ {0.5, 0.7, 0.9} 的最优 K。

3. 训练一个微小的草稿。以 124M GPT-2 为目标，在 100M token 上使用 KL 损失蒸馏一个 30M GPT-2 草稿。在保留文本上测量 `α`。预期：0.6-0.7。

4. 实现 EAGLE 风格的树草稿。草稿输出每个深度 top-3 分支，而不是链。构建树注意力掩码。验证目标接受最长的正确分支。

5. 测量失败模式。在 temperature=1.5（高随机性）下运行投机解码。展示 `α` 崩溃，由于草稿开销，算法比普通解码更慢。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|------------------------|
| 目标模型 | "大模型" | 你实际想要采样的慢、高质量模型（p 分布） |
| 草稿模型 | "投机器" | 小、快速的预测器（q 分布）；小 5-30 倍 |
| K / 草稿长度 | "前瞻" | 每次验证通过推测的 token 数 |
| α / 接受率 | "命中率" | 草稿提议被接受的每个 token 概率 |
| 精确拒绝规则 | "接受测试" | 保留目标分布的 r < p/q 比较 |
| 残差分布 | "校正后的 p-q" | (p - q)+ / ||(p - q)+||_1，拒绝时采样的分布 |
| 树草稿 | "分支推测" | 草稿输出候选树，通过树结构注意力掩码在一次传递中验证 |
| 树注意力掩码 | "拓扑掩码" | 编码树拓扑的因果掩码，使每个节点只关注其祖先 |
| Medusa 头 | "并行头" | 目标本身上的 K 个额外预测头；没有单独的草稿模型 |
| EAGLE 特征复用 | "隐藏状态草稿" | 草稿输入是目标的最后隐藏状态，而不是原始 token，缩小草稿 |
| 测试时模拟损失 | "EAGLE-3 训练" | 在与目标测试时分布匹配的输出上训练草稿，而不是教师强制 |

## 延伸阅读

- [Leviathan, Kalai, Matias, 2023 — "Fast Inference from Transformers via Speculative Decoding"](https://arxiv.org/abs/2211.17192) — 精确拒绝规则和理论加速分析
- [Chen, Borgeaud, Irving 等人, 2023 — "Accelerating Large Language Model Decoding with Speculative Sampling"](https://arxiv.org/abs/2302.01318) — DeepMind 同期投机采样论文
- [Cai, Li, Geng, Wang, Wang, Zhu, Dao, 2024 — "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads"](https://arxiv.org/abs/2401.10774) — 草稿模型的并行头替代方案
- [Li, Wei, Zhang, Zhang, 2024 — "EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty"](https://arxiv.org/abs/2401.15077) — 特征复用和树草稿
- [Li 等人, 2024 — "EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees"](https://arxiv.org/abs/2406.16858) — 动态树拓扑
- [Li 等人, 2025 — "EAGLE-3: Scaling up Inference Acceleration of Large Language Models via Training-Time Test"](https://arxiv.org/abs/2503.01840) — 训练时测试时匹配
- [Fu, Haotian, Peng 等人, 2024 — "Break the Sequential Dependency of LLM Inference Using Lookahead Decoding"](https://arxiv.org/abs/2402.02057) — Jacobi/前瞻解码，无需投机器的替代方案
