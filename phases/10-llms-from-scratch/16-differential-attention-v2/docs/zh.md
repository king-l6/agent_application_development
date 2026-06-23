# 差分注意力（V2）

> Softmax注意力在每个不匹配的token上分配少量概率。在100k个token上，这种噪声累积起来，淹没了信号。差分Transformer（Ye等，ICLR 2025）通过将注意力计算为两个softmax的差来修复这个问题，减去共享的噪声底噪。DIFF V2（微软，2026年1月）是面向生产栈的重写：与基线Transformer匹配解码延迟，无需自定义内核，兼容FlashAttention。本课程覆盖V1到V2的端到端，包含一个你可以在标准库Python中运行的差分操作玩具实现。

**类型：** 构建
**语言：** Python（标准库）
**前置知识：** 阶段7 · 02（自注意力），阶段7 · 15（注意力变体），阶段10 · 14（架构深度解析）
**时间：** ~60分钟

## 学习目标

- 精确说明为什么softmax注意力有一个噪声底噪，以及为什么它随上下文长度增长。
- 推导差分注意力公式，并解释为什么减法抵消共享的噪声分量而保留信号。
- 走一遍V1到V2的差异：什么变快了，什么变简单了，什么变稳定了，以及为什么每个变化对生产预训练都是必要的。
- 在纯Python中从头实现差分注意力，并在合成信号加噪声查询上经验验证噪声抵消属性。

## 问题

标准softmax注意力有一个数学属性，在大规模下会变成一个操作上的麻烦。对于一个查询`q`，注意力权重是`softmax(qK^T / sqrt(d))`。Softmax永远不能产生精确的零——每个不匹配的token都会获得一些正的质量。那个残差质量是噪声，它随上下文长度缩放。在128k token时，即使每个不匹配token只获得0.001%的概率，127,999个token合计贡献了大约12%的总和。模型必须学习绕过随上下文增长的噪声底噪。

经验上，这表现为注意力头干扰：长上下文RAG中的幻觉引用、100k token检索任务中的"迷失在中间"失败、以及超过32k的"大海捞针"基准上的细微精度退化。差分Transformer论文（arXiv:2410.05258，ICLR 2025）测量了这一差距：DIFF Transformer在相同大小基线上实现了更低的困惑度、更高的长上下文准确度和更少的幻觉。

DIFF V1有三个阻碍其进入前沿预训练流水线的问题。它的值缓存每个解码步骤必须加载两次，它需要破坏FlashAttention兼容性的自定义CUDA内核，以及它的每头RMSNorm在70B以上规模的长程训练中破坏了稳定性。DIFF V2（微软unilm博客，2026年1月20日）修复了所有三个问题。本课程讲解两个版本，构建差分算子，并在一个玩具查询上基准测试噪声抵消。

## 概念

### Softmax的噪声底噪

对于一个查询`q`和键`K = [k_1, ..., k_N]`，注意力权重为：

```
w_i = exp(q . k_i / sqrt(d)) / sum_j exp(q . k_j / sqrt(d))
```

没有`w_i`是零。如果`k_i`与`q`完全不相关，得分`q . k_i`不是0——它以方差`||q||^2 / d`在零附近波动。经过softmax归一化后，每个不相关的token仍然贡献`O(1/N)`的加权和。不相关token的总贡献是`O((N-1)/N) = O(1)`——不是一个小量。

模型想要的是类似硬top-k的东西：匹配token上高权重，其他所有地方接近零权重。Softmax太平滑了，无法直接做到这一点。

### 差分思想

将每个头的Q和K投影分成两部分：Q = (Q_1, Q_2) 和 K = (K_1, K_2)。计算两个注意力图：

```
A_1 = softmax(Q_1 K_1^T / sqrt(d))
A_2 = softmax(Q_2 K_2^T / sqrt(d))
```

输出：

```
DiffAttn = (A_1 - lambda * A_2) V
```

减法抵消了两个图共享的任何噪声分布。如果两个图在127k不相关token上都有大致均匀的权重（在随机初始化时它们会这样），这些被抵消。信号——在少数真正相关的token上的峰值权重——只有以相同幅度出现在两个图中时才会被抵消，而在模型训练后不会发生这种情况。

`lambda`是一个每头可学习的标量，参数化为`lambda = exp(lambda_q1 dot lambda_k1) - exp(lambda_q2 dot lambda_k2) + lambda_init`。它可以是负的。`lambda_init`默认为一个小的正数，如0.8。

### 为什么这类似于耳机降噪

想象两个记录同一个人声音的噪声麦克风。两者都拾取说话者加上相关的背景噪声。一个减去另一个，共享的噪声消失。声音幸存下来，因为两个信号的相位或幅度差异足以防止完全抵消。每头的`lambda`精确地学习这种平衡。

### V1 vs V2：差异

V1保持参数数量与基线Transformer相同。为了每头得到两个查询，它减半了头维度。这牺牲了头部的表现力，并且——更痛苦的是——每头减半了值缓存。解码必须每步加载两次值缓存（每个softmax分支一次）。结果：尽管参数数量匹配，但解码比基线慢。

V2将查询头数量加倍，并保持KV头数量不变（从上投影借用参数）。头维度保持与基线相同。减法后，额外的维度被投影回基线Transformer的O_W投影的大小。三件事同时发生：

1. 解码速度匹配基线（KV缓存只加载一次）。
2. FlashAttention不变运行（无自定义内核）。
3. 解码时的算术强度增加（从HBM加载每字节做更多计算）。

V2还移除了V1用于稳定减法的每头RMSNorm。在70B类预训练规模下，那个RMSNorm会在后期训练中失稳。V2用一个更简单的初始化方案取代它，保持训练稳定而不需要额外的模块。

### 何时使用它

| 工作负载 | 收益 |
|---------|------|
| 长上下文RAG（64k+） | 更干净的注意力图，更少的幻觉引用 |
| 大海捞针基准 | 超过32k时显著准确度提升 |
| 多文档问答 | 更少的跨文档干扰 |
| 8k下的代码补全 | 边缘性，不值得架构变更 |
| 短聊天（< 4k） | 与基线基本无区别 |

其价值随上下文长度增长。在4k token时，噪声底噪足够小，标准注意力可以接受。在128k时，它正在损害你的表现。

### 与其他2026年旋钮的兼容性

| 特性 | 与DIFF V2兼容？ |
|------|----------------|
| GQA | 是（V2增加Q头，而非KV头） |
| MLA（DeepSeek） | 原则上可以，但没有已发表的论文结合它们 |
| MoE | 是（注意力独立于MLP块） |
| RoPE | 是（不变） |
| YaRN / 长上下文扩展 | 是（正是DIFF最有帮助的地方） |
| FlashAttention | 在V2中是（在V1中否） |
| 推测解码 | 是（注意力变化对推测解码循环不可见） |

```figure
differential-attention
```

## 构建它

`code/main.py`在纯Python中实现差分注意力。一个具有已知信号加噪声结构的玩具查询让你直接测量噪声抵消比。

### 步骤1：标准softmax注意力

标准库矩阵操作：列表的列表、手动matmul、带数值稳定性减去最大值的softmax。

```python
def softmax(row):
    m = max(row)
    exps = [math.exp(x - m) for x in row]
    s = sum(exps)
    return [e / s for e in exps]
```

### 步骤2：将Q、K分成两半

V1风格：减半头维度。V2风格：保持头维度并加倍头数量。玩具实现为教学清晰度使用V1——数学相同，仅簿记不同。

### 步骤3：两个softmax分支 + 减法

```python
A1 = [softmax([dot(q1, k) / scale for k in K1]) for q1 in Q1]
A2 = [softmax([dot(q2, k) / scale for k in K2]) for q2 in Q2]
diff_weights = [[a1 - lam * a2 for a1, a2 in zip(r1, r2)] for r1, r2 in zip(A1, A2)]
out = [[sum(w * v[j] for w, v in zip(row, V)) for j in range(d_v)] for row in diff_weights]
```

注意：输出权重可以是负数。这没问题——值缓存仍然处理有符号贡献。后续的V投影吸收符号。

### 步骤4：噪声抵消测量

构建一个长度为1024的合成序列。将信号token放在已知位置，其余用噪声填充。计算（a）标准softmax注意力在信号位置上的权重和（b）差分注意力权重。测量每个中的信号与噪声比。DIFF注意力可靠地产生更高的信噪比，取决于两个分支训练到差异的程度，因子为3倍到10倍。

### 步骤5：V1 vs V2参数核算

给定配置（hidden=4096, heads=32, d_head=128），打印：

- 基线Transformer：Q、K、V各大小`hidden * hidden`，MLP为4 * hidden。
- DIFF V1：Q、K各大小`hidden * hidden`，V大小`hidden * hidden`（不变），头维度内部减半。添加每头`lambda`参数（O(heads * d_head)）。
- DIFF V2：Q大小`2 * hidden * hidden`，K大小`hidden * hidden`，V大小`hidden * hidden`。额外维度在O_W之前投影回。添加相同的`lambda`参数。

玩具测量V2的额外参数成本（每个注意力块约`hidden * hidden`额外）并打印。

## 使用它

截至2026年4月，DIFF V2尚未在每个生产推理服务器中提供，但集成正在vLLM和SGLang中进行。同时，该模式出现在：

- 微软内部的长上下文生产模型中。
- 几个针对256k+上下文的开源模型训练运行的研究复现。
- 在交替层上组合DIFF注意力与滑动窗口注意力的混合架构。

2026年何时使用它：

- 从头训练一个以64k+有效上下文为目标的新模型。从一开始就添加差分注意力；以后再训练代价高昂。
- 微调一个长上下文模型，其中"迷失在中间"失败主导了你的评估。在Q投影上的LoRA可以近似DIFF结构。

何时不使用：

- 你正在服务一个预训练的密集模型，具有稳定的长上下文性能。在现有权重上，重新训练成本很少能收回。
- 你的上下文总是在16k以下。噪声底噪可以忽略不计。

## 产出

本课程产出`outputs/skill-diff-attention-integrator.md`。给定一个模型架构、目标上下文长度、幻觉画像和训练预算，它生成一个将差分注意力添加到新的预训练运行或LoRA微调中的集成计划。

## 练习

1. 运行`code/main.py`。验证报告的差分注意力信噪比高于合成查询上的标准softmax注意力。变化噪声幅度，并展示标准注意力变得不可用的交叉点。

2. 为一个7B类模型（hidden=4096, heads=32, d_head=128, 32层）计算从基线到DIFF V1和从基线到DIFF V2的参数数量差异。展示哪些组件增加了参数，哪些保持不变。

3. 阅读DIFF V1论文的第3节（arXiv:2410.05258）和DIFF V2 Hugging Face博客的第2节。用两句话解释为什么V1的每头RMSNorm是必要的，以及为什么V2可以在不引起训练发散的情况下移除它。

4. 实现一个消融实验：计算`lambda = 0`（纯第一个softmax）和`lambda = 1`（完全减法）下的差分注意力。在合成查询上，测量信噪比如何随扫描变化。识别最大化信噪比的`lambda`。

5. 将玩具扩展到GQA + DIFF V2。选择8个KV头和32个Q头。展示KV缓存大小与具有相同（8, 32）配置的基线GQA模型匹配。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 差分注意力 | "两个softmax相减" | 将Q、K分成两半，计算两个softmax图，从第一个中减去第二个（由lambda缩放），然后乘以V |
| 噪声底噪 | "softmax的非零尾部" | Softmax放在每个不相关token上的O(1/N)权重，跨长上下文合计为O(1) |
| lambda | "减法规模" | 每头可学习的标量，参数化为`exp(lq1.lk1) - exp(lq2.lk2) + lambda_init`；可以是负的 |
| DIFF V1 | "ICLR 2025版本" | 原始差分Transformer；减半头维度以保持参数数量，需要自定义内核，解码更慢 |
| DIFF V2 | "2026年1月修复" | Q头数量加倍，KV头不变；匹配基线解码速度，与FlashAttention兼容 |
| 每头RMSNorm | "V1稳定器" | V1在差异后应用的额外归一化；V2移除了它以防止后期训练不稳定 |
| 信噪比 | "多少注意力被浪费" | 真实信号位置上的权重与不相关位置上平均权重的比率 |
| 迷失在中间 | "长上下文故障模式" | 检索准确度在长上下文中间文档降低的经验现象——DIFF注意力减少此现象 |
| 算术强度 | "每加载字节的FLOPs" | V2通过每次KV加载加倍查询数量在解码时提高的比率；对内存密集型解码很重要 |

## 延伸阅读

- [Ye等 -- Differential Transformer (arXiv:2410.05258, ICLR 2025)](https://arxiv.org/abs/2410.05258) -- 原始论文，包含噪声抵消理论和长上下文消融实验
- [Microsoft unilm -- Differential Transformer V2 (Hugging Face博客, 2026年1月)](https://huggingface.co/blog/microsoft/diff-attn-v2) -- 生产栈重写，匹配基线解码，兼容FlashAttention
- [Understanding Differential Transformer Unchains Pretrained Self-Attentions (arXiv:2505.16333)](https://arxiv.org/abs/2505.16333) -- 关于减法为何恢复预训练注意力结构的理论分析
- [Shared DIFF Transformer (arXiv:2501.17900)](https://arxiv.org/html/2501.17900) -- 参数共享变体
- [Vaswani等 -- Attention Is All You Need (arXiv:1706.03762)](https://arxiv.org/abs/1706.03762) -- DIFF从中减去的基线Transformer
- [Liu等 -- Lost in the Middle (arXiv:2307.03172)](https://arxiv.org/abs/2307.03172) -- DIFF注意力针对的长上下文基准
