# GPT — 因果语言建模

> BERT 能看到两边。GPT 只能看到过去。三角掩码是现代 AI 中最具影响力的一行代码。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 7 · 02（自注意力），阶段 7 · 05（完整 Transformer），阶段 7 · 06（BERT）
**时间：** ~75 分钟

## 问题

语言模型回答一个问题：给定前 `t-1` 个 token，token `t` 的概率分布是什么？在这个信号上训练——下一个 token 预测——你就得到了一个可以逐个 token 生成任意文本的模型。

为了在完整序列上端到端并行训练，每个位置的预测必须只依赖于更早的位置。否则模型可以通过偷看答案来作弊。

因果掩码正是为此而生。它是一个上三角矩阵，填充 `-inf` 值，在 softmax 之前加到注意力分数上。经过 softmax 后，这些位置变为 0。每个位置只能关注自身和更早的位置。而且由于你只需对整个序列应用一次，一次前向传播就能得到 N 个并行的下一个 token 预测。

GPT-1（2018）、GPT-2（2019）、GPT-3（2020）、GPT-4（2023）、GPT-5（2024）、Claude、Llama、Qwen、Mistral、DeepSeek、Kimi——它们都是解码器专用的因果 Transformer，核心循环完全相同。只是更大、数据更好、RLHF 更优。

## 概念

![因果掩码创建三角注意力矩阵](../assets/causal-attention.svg)

### 掩码

给定长度为 `N` 的序列，构建一个 `N × N` 的矩阵：

```
M[i, j] = 0       if j <= i
M[i, j] = -inf    if j > i
```

将 `M` 加到 softmax 之前的原始注意力分数上。`exp(-inf) = 0`，因此被掩码的位置贡献的权重为零。注意力矩阵的每一行都是仅覆盖之前位置的概率分布。

实现代价：一次 `torch.tril()` 调用。计算时间：纳秒级。对该领域的影响：无与伦比。

### 并行训练，串行推理

训练：将整个 `(N, d_model)` 序列前向传播一次，计算 N 个交叉熵损失（每个位置一个），求和，反向传播。沿序列方向并行。这就是 GPT 训练能够扩展的原因——一次 GPU 前向传播处理批次中的 100 万个 token。

推理：你逐 token 生成。输入 `[t1, t2, t3]`，得到 `t4`。输入 `[t1, t2, t3, t4]`，得到 `t5`。输入 `[t1, t2, t3, t4, t5]`，得到 `t6`。KV 缓存（第 12 课）保存了 `t1…tn` 的隐藏状态，这样你就不必每一步都重新计算它们。但推理时的串行深度 = 输出长度。这就是自回归的代价，也是为什么解码是每个 LLM 的延迟瓶颈。

### 损失——移位一位

给定 token `[t1, t2, t3, t4]`：

- 输入：`[t1, t2, t3]`
- 目标：`[t2, t3, t4]`

对于每个位置 `i`，计算 `-log P(target_i | inputs[:i+1])`。求和。这就是整个序列的交叉熵。

你听说过的每个 Transformer 语言模型都在这个损失上训练。预训练、微调、SFT——相同的损失，不同的数据。

### 解码策略

训练之后，采样选择比人们想象的要重要得多。

| 方法 | 作用 | 何时使用 |
|--------|--------------|-------------|
| Greedy | 每步取 argmax | 确定性任务，代码补全 |
| Temperature | 将 logits 除以 T，采样 | 创造性任务，T 越高 = 多样性越高 |
| Top-k | 仅从前 k 个 token 中采样 | 消除低概率尾部 |
| Top-p（核采样） | 从累积概率 ≥ p 的最小集合中采样 | 2020+ 默认值；适应分布形状 |
| Min-p | 保留 `p > min_p * max_p` 的 token | 2024+；比 top-p 更好地拒绝长尾 |
| Speculative decoding | 草稿模型提议 N 个 token，大模型验证 | 相同质量下 2-3 倍延迟降低 |

在 2026 年，min-p + 温度 0.7 是开放权重模型的合理默认值。投机解码是任何生产级推理堆栈的基本要求。

### "GPT 配方"成功的原因

1. **解码器专用。** 没有编码器开销。每层只需一次注意力 + FFN 计算。
2. **缩放。** 124M → 1.5B → 175B → 万亿参数。Chinchilla 缩放定律（第 13 课）告诉你如何分配算力。
3. **上下文学习。** 在 6B-13B 左右出现。模型可以在不微调的情况下遵循少样本示例。
4. **RLHF。** 基于人类偏好的后训练将原始的预训练文本转化为聊天助手。
5. **Pre-norm + RoPE + SwiGLU。** 大规模下的稳定训练。

核心架构自 GPT-2 以来变化不大。所有有趣的事情都发生在数据、规模和后训练方面。

```figure
causal-mask
```

## 构建它

### 步骤 1：因果掩码

见 `code/main.py`。一行代码：

```python
def causal_mask(n):
    return [[0.0 if j <= i else float("-inf") for j in range(n)] for i in range(n)]
```

在 softmax 之前将其加到注意力分数上。这就是完整的机制。

### 步骤 2：一个 2 层的 GPT 风格模型

堆叠两个解码器模块（带掩码的自注意力 + FFN，无交叉注意力）。添加 token 嵌入、位置编码和解嵌入（与 token 嵌入矩阵共享权重——自 GPT-2 以来的标准技巧）。

### 步骤 3：端到端的下一个 token 预测

在一个 20 个 token 的玩具词汇表上，在每个位置生成 logits。计算与移位一位目标之间的交叉熵损失。不求梯度——这是一个前向传播的完整性检查。

### 步骤 4：采样

实现 greedy、temperature、top-k、top-p、min-p。每种方法在一个固定提示上运行并比较输出。一个采样函数只需 10 行代码。

## 使用它

PyTorch，2026 年的惯用写法：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-3B-Instruct")
tok = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-3B-Instruct")

prompt = "Attention is all you need because"
inputs = tok(prompt, return_tensors="pt")
out = model.generate(
    **inputs,
    max_new_tokens=64,
    temperature=0.7,
    top_p=0.9,
    do_sample=True,
)
print(tok.decode(out[0]))
```

在底层，`generate()` 运行前向传播，获取最后位置的 logits，采样下一个 token，追加它，然后重复。每个生产级 LLM 推理堆栈（vLLM、TensorRT-LLM、llama.cpp、Ollama、MLX）都实现了相同的循环并进行了大量优化——批量预填充、连续批处理、KV 缓存分页、投机解码。

**GPT vs BERT，各用一句话总结：** GPT 预测 `P(x_t | x_{<t})`。BERT 预测 `P(x_masked | x_unmasked)`。损失函数决定了模型能否生成。

## 交付它

见 `outputs/skill-sampling-tuner.md`。该技能为新的生成任务选择采样参数，并在需要确定性解码时发出提示。

## 练习

1. **简单。** 运行 `code/main.py`，验证 softmax 后的因果注意力矩阵是下三角的。抽查：第 3 行应该只在第 0-3 列有权重。
2. **中等。** 实现宽度为 4 的束搜索。比较束搜索-4 与 greedy 在 10 个短提示上的困惑度。束搜索总是更好的吗？（提示：通常对翻译有效，但对开放式聊天不一定。）
3. **困难。** 实现投机解码：使用一个微小的 2 层模型作为草稿，6 层模型作为验证器。测量在 100 次长度为 64 的补全上的加速比。确认输出与验证器的 greedy 输出一致。

## 关键术语

| 术语 | 大家的说法 | 实际含义 |
|------|-----------------|-----------------------|
| 因果掩码 | "三角" | 上三角 `-inf` 矩阵，加到注意力分数上，使得位置 `i` 只能看到位置 `≤ i`。 |
| 下一个 token 预测 | "损失" | 在每个位置上，模型分布与真实下一个 token 之间的交叉熵。 |
| 自回归 | "逐次生成" | 将输出作为输入反馈；仅在训练时并行，生成时不并行。 |
| Logits | "softmax 前的分数" | LM 头的原始输出，softmax 之前；采样在这些值上进行。 |
| 温度 | "创造力旋钮" | 将 logits 除以 T；T→0 = greedy，T→∞ = 均匀分布。 |
| Top-p | "核采样" | 截断分布至求和 ≥ p 的最小集合；从剩余部分采样。 |
| Min-p | "比 top-p 更好" | 保留 `p ≥ min_p × max_p` 的 token；根据分布锐度自适应截断。 |
| 投机解码 | "草稿 + 验证" | 廉价模型提议 N 个 token；大模型并行验证。 |
| 教师强制 | "训练技巧" | 在训练期间，输入真实的先前 token 而非模型的预测。每个 seq2seq LM 的标准做法。 |

## 延伸阅读

- [Radford et al. (2018). Improving Language Understanding by Generative Pre-Training](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) — GPT-1。
- [Radford et al. (2019). Language Models are Unsupervised Multitask Learners](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) — GPT-2。
- [Brown et al. (2020). Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165) — GPT-3 和上下文学习。
- [Leviathan, Kalman, Matias (2023). Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192) — 投机解码论文。
- [HuggingFace `modeling_llama.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/llama/modeling_llama.py) — 因果 LM 的权威参考代码。
