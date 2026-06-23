# 推测解码——草稿、验证、重复

> 单向自回归解码是串行的。每个 token 等待前一个 token。推测解码打破了链条：一个廉价模型起草 N 个 token，昂贵模型在一次前向传播中验证所有 N 个。当草稿正确时，你为 N 次生成只支付了一次大模型的前向代价。

**类型：** 构建
**语言：** Python
**前置条件：** 阶段 7 · 07（GPT 因果 LM）、阶段 7 · 12（KV Cache 和 Flash Attention）
**时间：** ~60 分钟

## 问题

一个 70B LLM 在 H100 上采样一个 token 约需 30 ms。一个 3B 草稿模型约需 3 ms。如果我们让 3B 模型草稿 5 个前瞻 token，然后运行 70B 模型**一次**来验证所有 5 个，总的耗时是 `5×3 + 30 = 45 ms`，最多接受 5 个 token——而直线生成需要 `5×30 = 150 ms`。这就是推测解码的完整故事：用少量额外的 GPU 内存（草稿模型）换取 2-4 倍更低的解码延迟。

这个技巧必须保持分布不变。由 Leviathan 等人（2023）和 Chen 等人同时提出的推测采样，保证输出序列与大模型自己生成的序列**分布相同**。没有质量折衷。只是更快。

四类草稿-验证器对主导 2026 年的推理：

1. **普通推测（Leviathan 2023）。** 独立的草稿模型（例如 Llama 3 1B）+ 验证器（例如 Llama 3 70B）。
2. **Medusa（Cai 2024）。** 验证器上的多个解码头并行预测位置 `t+1..t+k`。没有独立的草稿模型。
3. **EAGLE 家族（Li 2024, 2025）。** 轻量级草稿，重用验证器的隐藏状态；接受率比普通推测更高；典型 3-4 倍。
4. **Lookahead decoding（Fu 2024）。** 雅可比迭代；完全不需要草稿模型。自我推测。小众但无依赖。

2026 年每个生产推理栈都默认启用推测解码。vLLM、TensorRT-LLM、SGLang 和 llama.cpp 都至少支持普通推测 + EAGLE-2。

## 概念

### 核心算法

给定一个验证器 `M_q` 和一个更便宜的草稿模型 `M_p`：

1. 设 `x_1..x_k` 为已解码的前缀。
2. **草稿**：使用 `M_p` 自回归地提出 `d_{k+1}, d_{k+2}, ..., d_{k+N}`，并带有草稿概率 `p_1..p_N`。
3. **并行验证**：在 `x_1..x_k, d_{k+1}, ..., d_{k+N}` 上运行 `M_q` 一次，得到位置 `k+1..k+N+1` 的验证器概率 `q_1..q_{N+1}`。
4. **从左到右接受/拒绝每个草稿 token**：对每个 `i`，以概率 `min(1, q_i(d_i) / p_i(d_i))` 接受。
5. 在位置 `j` 第一次拒绝时：从归一化的"残差"分布 `(q_j - p_j)_+` 中采样 `t_j`。`j` 之后的所有草稿被丢弃。
6. 在接受所有 `N` 个草稿时：从 `q_{N+1}` 采样一个额外 token（免费的奖励 token）。

残差分布技巧是数学上的关键洞察，它使输出分布与 `M_q` 从头采样的结果完全一致。

### 什么决定了加速

设 `α` = 每个草稿 token 的预期接受率。设 `c` = 草稿与验证器的成本比。每一步：

- 朴素生成每 token 调用 1 次大模型。
- 推测解码在 `α` 高时，每次大模型调用产生 `(1 - α^{N+1}) / (1 - α) ≈ 1/(1-α)` 个 token。

`α = 0.75` 且 `N = 5` 时的典型经验法则：减少 3 倍大模型调用。草稿成本是 5 倍便宜。总时钟时间下降约 2.5 倍。

**`α` 取决于：**

- 草稿模型与验证器的近似程度。同家族/同训练数据显著提升 `α`。
- 解码策略。贪心草稿对贪心验证器：高 `α`。温度采样：更难匹配；接受率下降。
- 任务类型。代码和结构化输出接受更多（可预测）；自由形式的创意写作接受较少。

### Medusa——无需草稿模型的草稿

Medusa 用验证器上的额外输出头取代草稿模型。在位置 `t`：

```
共享主干 → 隐藏状态 h_t
    ├── head_0: 预测 t+1 位置的 token（标准 LM 头）
    ├── head_1: 预测 t+2 位置的 token
    ├── head_2: 预测 t+3 位置的 token
    ├── head_3: 预测 t+4 位置的 token
```

每个头输出自己的 logits。推理时，你从每个头采样得到候选序列，然后使用树注意力方案一次前向验证，该方案同时考虑所有候选延续。

优点：不需要第二个模型。缺点：增加了可训练参数；需要监督微调阶段（约 1B token）；接受率略低于使用良好草稿模型的普通推测。

### EAGLE——通过重用隐藏状态获得更好的草稿

EAGLE-1/2/3（Li 等人，2024-2025）使草稿模型成为一个微型 Transformer（通常 1 层），它接收验证器最后一层的隐藏状态。因为草稿看到了验证器的特征表示，其预测与验证器的输出分布高度相关。接受率从约 0.6（普通推测）上升到 0.85 以上。

EAGLE-3（2025）添加了候选延续的树搜索。vLLM 和 SGLang 将 EAGLE-2/3 作为 Llama 3/4 和 Qwen 3 的默认推测路径。

### KV cache 的舞蹈

验证过程在一次前向传播中将 `N` 个草稿 token 输入验证器。这将验证器的 KV cache 延长了 `N` 个条目。如果某些草稿被拒绝，你必须将 cache 回滚到接受的前缀长度。

生产实现（vLLM 的 `--speculative-model`、TensorRT-LLM 的 LookaheadDecoder）使用临时 KV 缓冲区处理这个问题。先写入，接受时提交。概念上不难，但比较繁琐。

## 构建

参见 `code/main.py`。我们实现核心的推测采样算法（拒绝步骤 + 残差分布），使用：

- 一个"大模型"，它对手工编码的分布进行确定性 softmax（这样我们可以解析地验证接受数学）。
- 一个"草稿模型"，它是大模型的扰动版本。
- 一个接受/拒绝循环，产生与直接采样相同的边际分布。

### 步骤 1：拒绝步骤

```python
def accept_or_reject(q_prob, p_prob, draft_token, u):
    ratio = q_prob / p_prob if p_prob > 0 else float("inf")
    return u < min(1.0, ratio)
```

`u` 是一个均匀随机数。`q_prob` 是验证器对被草稿的 token 的概率。`p_prob` 是草稿模型的概率。Leviathan 定理证明，这个伯努利决策，随后在拒绝时从残差分布采样，精确地保持了验证器的分布。

### 步骤 2：残差分布

```python
def residual_dist(q, p):
    raw = [max(0.0, qi - pi) for qi, pi in zip(q, p)]
    s = sum(raw)
    return [r / s for r in raw]
```

逐元素地从 `q` 中减去 `p`，将负值钳位为零，重新归一化。在任何拒绝时从此分布采样。

### 步骤 3：一个推测步骤

```python
def spec_step(prefix, q_model, p_model, N, rng):
    drafts = []
    p_probs = []
    ctx = list(prefix)
    for _ in range(N):
        p_dist = p_model(ctx)
        d = sample(p_dist, rng)
        drafts.append(d)
        p_probs.append(p_dist[d])
        ctx.append(d)

    q_dists = [q_model(prefix + drafts[:i]) for i in range(N + 1)]

    for i, d in enumerate(drafts):
        u = rng.random()
        q_prob = q_dists[i][d]
        p_prob = p_probs[i]
        if u < min(1.0, q_prob / p_prob if p_prob > 0 else float("inf")):
            prefix = prefix + [d]
        else:
            res = residual_dist(q_dists[i], p_model(prefix))
            prefix = prefix + [sample(res, rng)]
            return prefix
    prefix = prefix + [sample(q_dists[N], rng)]
    return prefix
```

五个被接受→一个奖励→在一次验证器前向中产生六个 token。

### 步骤 4：测量接受率

在不同草稿质量水平下运行 10,000 个推测步骤。绘制接受率与草稿和验证器分布之间的 KL 散度的关系。你应该看到一个清晰的单调关系。

### 步骤 5：验证分布等价性

经验验证：由推测循环产生的 token 直方图应与直接从验证器采样产生的直方图匹配。这是 Leviathan 定理的实践验证。卡方检验确认在采样误差范围内。

## 使用

生产部署：

```bash
# vLLM with EAGLE
vllm serve meta-llama/Llama-3.1-70B-Instruct \
    --speculative-model /models/llama-3.1-eagle-70b \
    --speculative-draft-tensor-parallel-size 1 \
    --num-speculative-tokens 5

# vLLM with vanilla draft model
vllm serve meta-llama/Llama-3.1-70B-Instruct \
    --speculative-model meta-llama/Llama-3.2-1B-Instruct \
    --num-speculative-tokens 5
```

截至 2026 年中，TensorRT-LLM 拥有最快的 Medusa 路径。`faster-whisper` 为 Whisper-large 封装了带有小草稿模型的推测解码。

**选择草稿：**

| 策略 | 何时选择 | 加速 |
|----------|--------------|---------|
| 普通草稿（1B/3B Llama 家族） | 快速原型，无训练 | 1.8-2.3× |
| Medusa 头 | 你可以微调验证器 | 2-3× |
| EAGLE-2 / 3 | 生产环境，最大速度 | 3-4× |
| Lookahead | 无草稿、无训练、无额外参数 | 1.3-1.6× |

**何时不使用推测解码：**

- 单序列生成 1-5 个 token。开销占主导。
- 高度创意 / 高温采样（α 下降）。
- 内存受限的部署（草稿模型增加 VRAM）。

## 交付

参见 `outputs/skill-spec-decode-picker.md`。该技能为新的推理工作负载选择推测解码策略（普通 / Medusa / EAGLE / lookahead）和调优参数（N，草稿温度）。

## 练习

1. **简单。** 运行 `code/main.py`。确认在 50,000 个 token 上，推测 token 分布与验证器直接采样分布在卡方检验 p > 0.05 内匹配。
2. **中等。** 绘制加速比（每次大模型前向的 token 数）作为 `N` 的函数，针对 `α = 0.5, 0.7, 0.85`。确定每个 `α` 的最优 `N`。（提示：每次验证调用的期望 token 数 = `(1 - α^{N+1}) / (1 - α)`。）
3. **困难。** 实现一个微型 Medusa：取第 14 课的综合项目 GPT，添加 3 个额外的 LM 头，分别预测 t+2、t+3、t+4 位置。在 tinyshakespeare 上使用联合多头损失进行训练。与通过截断同一模型得到的普通草稿比较接受率。
4. **困难。** 实现回滚：从一个 10 token 前缀 KV cache 开始，喂入 5 个草稿 token，模拟在位置 3 被拒绝。验证你的 cache 读取在下次迭代中正确匹配"前缀 + 前 2 个被接受的草稿"。

## 关键术语

| 术语 | 人们说的意思 | 实际含义 |
|------|-----------------|-----------------------|
| 草稿模型 | "便宜的那个" | 提出候选 token 的较小模型；通常比验证器便宜 10-50 倍。 |
| 验证器 | "大的那个" | 我们要保持其分布的目标模型；每个推测步骤运行一次。 |
| 接受率（α） | "草稿正确的频率" | 验证器接受草稿的每 token 概率。典型值 0.7-0.9。 |
| 残差分布 | "被拒绝后的回退" | `(q - p)_+` 归一化；拒绝时从此采样保持了验证器的分布。 |
| 奖励 token | "免费的那个" | 当所有 N 个草稿都被接受时，从验证器下一步分布中再采样一个。 |
| Medusa | "无需草稿的推测" | 验证器上的多个 LM 头并行预测 t+1..t+k 位置。 |
| EAGLE | "隐藏状态草稿" | 微型 Transformer 草稿，以验证器最后一层的隐藏状态为条件。 |
| Lookahead decoding | "雅可比迭代" | 使用不动点迭代的自我推测；不需要草稿模型。 |
| 树注意力 | "一次验证多个候选" | 分支验证，同时考虑多个草稿延续。 |
| KV 回滚 | "撤销被拒绝的草稿" | 临时 KV 缓冲区；接受时提交，拒绝时丢弃。 |

## 扩展阅读

- [Leviathan, Kalman, Matias (2023). Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192) — 核心算法和等价定理。
- [Chen et al. (2023). Accelerating Large Language Model Decoding with Speculative Sampling](https://arxiv.org/abs/2302.01318) — 同时期的介绍；简洁的伯努利拒绝证明。
- [Cai et al. (2024). Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads](https://arxiv.org/abs/2401.10774) — Medusa 论文；树注意力验证。
- [Li et al. (2024). EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty](https://arxiv.org/abs/2401.15077) — EAGLE-1；隐藏状态条件草稿。
- [Li et al. (2024). EAGLE-2: Faster Inference of Language Models with Dynamic Draft Trees](https://arxiv.org/abs/2406.16858) — EAGLE-2；动态树深度。
- [Li et al. (2025). EAGLE-3: Scaling up Inference Acceleration of Large Language Models via Training-Time Test](https://arxiv.org/abs/2503.01840) — EAGLE-3。
- [Fu et al. (2024). Break the Sequential Dependency of LLM Inference Using Lookahead Decoding](https://arxiv.org/abs/2402.02057) — lookahead，无草稿方法。
- [vLLM 文档 — 推测解码](https://docs.vllm.ai/en/latest/features/spec_decode.html) — 权威的生产参考，包含所有四种策略的配置。
- [SafeAILab / EAGLE 参考实现](https://github.com/SafeAILab/EAGLE) — EAGLE-1/2/3 的参考代码。
