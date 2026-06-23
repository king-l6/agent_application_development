# 从零构建 Transformer——综合项目

> 十三堂课。一个模型。没有捷径。

**类型：** 构建
**语言：** Python
**前置条件：** 阶段 7 · 01 到 13。不要跳过。
**时间：** ~120 分钟

## 问题

你已经读了每一篇论文。你已经实现了注意力、多头拆分、位置编码、编码器和解码器模块、BERT 和 GPT 的损失函数、MoE、KV cache。现在让它们在一个真实任务上协同工作。

综合项目：端到端训练一个小型仅解码器 Transformer，完成字符级语言建模任务。它读取莎士比亚。它生成新的莎士比亚。它足够小，可以在笔记本上 10 分钟内完成训练。它具有足够的正确性，换成更大的数据集和更长的训练就能得到一个真正的语言模型。

这就是本课程的 "nanoGPT"。它并不原创——Karpathy 2023 年的 nanoGPT 教程是每个学生至少写一次的参考实现。我们借鉴其形式，并根据我们所学的内容重新构建。

## 概念

![从零构建 Transformer 模块图](../assets/capstone.svg)

架构注释：

```
输入 tokens (B, N)
   │
   ▼
token 嵌入 + 位置嵌入  ◀── 第 04 课（RoPE 可选）
   │
   ▼
┌──── 模块 × L ────────────────────┐
│  RMSNorm                          │  ◀── 第 05 课
│  多头注意力（因果）                │  ◀── 第 03 + 07 课（因果掩码）
│  残差连接                          │
│  RMSNorm                          │
│  SwiGLU FFN                       │  ◀── 第 05 课
│  残差连接                          │
└────────────────────────────────── ┘
   │
   ▼
最终 RMSNorm
   │
   ▼
lm_head（与 token 嵌入绑定）
   │
   ▼
logits (B, N, V)
   │
   ▼
偏移一位交叉熵                       ◀── 第 07 课
```

### 我们提供的内容

- `GPTConfig` — 一个地方配置所有超参数。
- `MultiHeadAttention` — 因果、批处理、可选的 Flash 风格路径（PyTorch 的 `scaled_dot_product_attention`）。
- `SwiGLUFFN` — 现代 FFN。
- `Block` — 预归一化、残差包裹的注意力 + FFN。
- `GPT` — 嵌入、堆叠模块、LM 头、generate()。
- 带有 AdamW、余弦学习率、梯度裁剪的训练循环。
- 基于字符的 Shakespeare 文本 tokenizer。

### 我们不提供的内容

- **RoPE** — 在第 04 课中概念上实现。这里我们为了简单使用学习的位置嵌入。练习要求你换成 RoPE。
- **KV cache** — 生成期间，每一步都重新计算完整前缀上的注意力。较慢但更简单。练习要求你添加 KV cache。
- **Flash Attention** — PyTorch 2.0+ 在输入匹配时会自动调度；我们使用 `F.scaled_dot_product_attention`。
- **MoE** — 每个模块一个 FFN。你在第 11 课已经接触过 MoE。

### 目标指标

在 Mac M2 笔记本上，一个 4 层、4 头、d_model=128 的 GPT 在 `tinyshakespeare.txt` 上训练 2000 步：

- 训练损失从约 4.2（随机）收敛到约 1.5，耗时约 6 分钟。
- 采样输出看起来像莎士比亚风格：古语词汇、换行、像"ROMEO:"这样的人名出现。
- 验证损失（保留的最后 10% 文本）紧跟训练损失；在此大小/预算下没有过拟合。

## 构建

本课使用 PyTorch。安装 `torch`（CPU 版本即可）。参见 `code/main.py`。脚本处理：

- 如果缺少则下载 `tinyshakespeare.txt`（或读取本地副本）。
- 字节级字符 tokenizer。
- 90/10 的训练/验证分割。
- 在支持的硬件上使用 bf16 自动混合精度的训练循环。
- 训练完成后采样。

### 步骤 1：数据

```python
text = open("tinyshakespeare.txt").read()
chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for c, i in stoi.items()}
encode = lambda s: [stoi[c] for c in s]
decode = lambda xs: "".join(itos[x] for x in xs)
```

65 个唯一字符。极小的词汇表。适合 4 字节的 vocab_size。没有 BPE，没有 tokenizer 的麻烦。

### 步骤 2：模型

参见 `code/main.py`。模块来自第 05 课的教科书——预归一化、RMSNorm、SwiGLU、因果 MHA。4/4/128 配置的参数数量：约 800K。

### 步骤 3：训练循环

获取一个随机批次，长度为 256 个 token 的窗口。前向。偏移一位交叉熵。反向。AdamW 步进。记录。重复。

```python
for step in range(max_steps):
    x, y = get_batch("train")
    logits = model(x)
    loss = F.cross_entropy(logits.view(-1, vocab_size), y.view(-1))
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    opt.zero_grad()
```

### 步骤 4：采样

给定一个提示，重复前向、从 top-p logits 采样、追加、继续。生成 500 个 token 后停止。

### 步骤 5：读取输出

经过 2000 步：

```
ROMEO:
Away and mild will not thy friend, that thou shalt wit:
The chief that well shame and hath been his friends,
...
```

不是莎士比亚。但是是莎士比亚风格。对约 800K 参数和在笔记本上 6 分钟的训练来说，这是一个明显的胜利。

## 使用

这个综合项目是一个参考架构。将其推向真实应用的三个扩展：

1. **更换 tokenizer。** 使用 BPE（例如 `tiktoken.get_encoding("cl100k_base")`）。词汇表大小从 65 跳到约 50,000。模型容量需要相应扩大。
2. **在更大语料上训练。** 使用 `OpenWebText` 或 `fineweb-edu`（HuggingFace）。对于 125M 参数的 GPT，在单张 A100 上训练 10B token 约需 24 小时。
3. **添加 RoPE + KV cache + Flash Attention。** 下面的练习将带你逐步完成。

这最终成为一个能生成流利英语的 125M 参数 GPT。不是一个前沿模型。但同样的代码路径——只是规模更大——正是 Karpathy、EleutherAI 和 Allen Institute 在 2026 年用来训练研究检查点的方法。

## 交付

参见 `outputs/skill-transformer-review.md`。该技能根据前面 13 课的内容审查从零构建 Transformer 实现的正确性。

## 练习

1. **简单。** 运行 `code/main.py`。验证你训练好的模型最后一步的验证损失低于 2.0。将 `max_steps` 从 2000 改为 5000——验证损失是否持续改善？
2. **中等。** 将学习的位置嵌入替换为 RoPE。在 `MultiHeadAttention` 内部对 Q 和 K 应用旋转。训练并验证验证损失至少一样低。
3. **中等。** 在采样循环中实现 KV cache。生成 500 个 token，分别使用和不使用 cache。在笔记本上时钟时间应改善 5-20 倍。
4. **困难。** 为模型添加第二个头，预测下一个加一个 token（MTP——DeepSeek-V3 的多 token 预测）。联合训练。这有帮助吗？
5. **困难。** 将每个模块中的单个 FFN 替换为 4 专家的 MoE。路由器 + top-2 路由。在匹配活跃参数的情况下，查看验证损失如何变化。

## 关键术语

| 术语 | 人们说的意思 | 实际含义 |
|------|-----------------|-----------------------|
| nanoGPT | "Karpathy 的教程仓库" | 最小化的仅解码器 Transformer 训练代码，约 300 行；权威参考。 |
| tinyshakespeare | "标准的玩具语料" | 约 1.1 MB 文本；自 2015 年以来每个字符级 LM 教程都使用它。 |
| 绑定嵌入 | "共享输入/输出矩阵" | LM 头权重 = token 嵌入矩阵的转置；节省参数，提升质量。 |
| bf16 自动混合精度 | "训练精度技巧" | 前向/反向用 bf16 运行，优化器状态保持 fp32；自 2021 年以来的标准做法。 |
| 梯度裁剪 | "阻止尖峰" | 将全局梯度范数上限设为 1.0；防止训练崩溃。 |
| 余弦学习率调度 | "2020+ 年的默认方式" | 学习率线性上升（预热）后按余弦形状衰减到峰值的 10%。 |
| MFU | "模型 FLOP 利用率" | 实际 FLOPs / 理论峰值；2026 年密集模型 40%、MoE 30% 算优秀。 |
| 验证损失 | "保留集损失" | 在模型从未见过的数据上的交叉熵；过拟合检测器。 |

## 扩展阅读

- [The Annotated Transformer (Harvard NLP)](https://nlp.seas.harvard.edu/annotated-transformer/) — 经典的带注释实现。
