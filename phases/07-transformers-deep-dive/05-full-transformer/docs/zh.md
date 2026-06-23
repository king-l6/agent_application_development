# 完整 Transformer——编码器 + 解码器

> 注意力是主角。其他一切——残差连接、归一化、前馈网络、交叉注意力——是让你能把它堆叠得很深的脚手架。

**类型：** 构建
**语言：** Python
**前置要求：** 阶段 7 · 02（自注意力）、阶段 7 · 03（多头注意力）、阶段 7 · 04（位置编码）
**时间：** ~75 分钟

## 问题

单个注意力层是一个特征提取器，不是一个模型。每层一次矩阵乘法不足以容纳语言的能力。你需要深度——而没有正确的管道，深度就会出问题。

2017 年 Vaswani 的论文打包了六个设计决策，将单个注意力层变成了一个可堆叠的模块。此后的每个 transformer——编码器专用（BERT）、解码器专用（GPT）、编码器-解码器（T5）——都继承了相同的骨架。在 2026 年，这些模块已经被精炼（RMSNorm、SwiGLU、pre-norm、RoPE），但骨架是相同的。

本课就是这个骨架。后续课程将其特化——第 06 课用于编码器，第 07 课用于解码器，第 08 课用于编码器-解码器。

## 概念

![编码器和解码器模块内部，接线图](../assets/full-transformer.svg)

### 六个组成部分

1. **嵌入 + 位置信号。** Token → 向量。通过 RoPE（现代）或正弦（经典）注入位置。
2. **自注意力。** 每个位置关注所有其他位置。解码器中需要掩码。
3. **前馈网络（FFN）。** 逐位置的两层 MLP：`W_2 · activation(W_1 · x)`。默认扩展比 4×。
4. **残差连接。** `x + sublayer(x)`。没有它，梯度在大约 6 层之后就会消失。
5. **层归一化。** `LayerNorm` 或 `RMSNorm`（现代）。稳定残差流。
6. **交叉注意力（仅解码器）。** 查询来自解码器，键和值来自编码器的输出。

观察向量流经一个模块：注意力跨位置混合，残差将其向前传递，FFN 对其进行变换，归一化保持流稳定。

```figure
transformer-block
```

### 编码器模块（由 BERT、T5 编码器使用）

```
x → LN → MHA(自身) → + → LN → FFN → + → out
                     ^              ^
                     |              |
                     └── 残差连接 ──┘
```

编码器是双向的。没有掩码。所有位置都能看到所有位置。

### 解码器模块（由 GPT、T5 解码器使用）

```
x → LN → MHA(掩码自身) → + → LN → MHA(交叉到编码器) → + → LN → FFN → + → out
```

解码器每层有三个子层。中间的那个——交叉注意力——是信息从编码器流向解码器的唯一地方。在纯解码器架构（GPT）中，交叉注意力被省略，只有掩码自注意力 + FFN。

### Pre-norm vs post-norm

原始论文：`x + sublayer(LN(x))` vs `LN(x + sublayer(x))`。Post-norm 在 2019 年左右失宠——没有精心预热就很难深度训练。Pre-norm（`LN` 在*子层之前*）是 2026 年的默认选择：Llama、Qwen、GPT-3+、Mistral 都使用它。

### 2026 年现代化模块

Vaswani 2017 使用了 LayerNorm + ReLU。现代技术栈已经替换了这两个。生产模块的实际样貌：

| 组件 | 2017 | 2026 |
|-----------|------|------|
| 归一化 | LayerNorm | RMSNorm |
| FFN 激活 | ReLU | SwiGLU |
| FFN 扩展 | 4× | 2.6×（SwiGLU 使用三个矩阵，总参数匹配） |
| 位置 | 正弦绝对 | RoPE |
| 注意力 | 完整 MHA | GQA（或 MLA） |
| 偏置项 | 有 | 无 |

RMSNorm 去掉了 LayerNorm 的均值中心化（少一次减法），节省了计算，且经验上至少同样稳定。SwiGLU（`Swish(W1 x) ⊙ W3 x`）在 Llama、PaLM 和 Qwen 论文中始终比 ReLU/GELU FFN 好约 0.5 个 ppl 点。

### 参数计数

对于 `d_model = d` 和 FFN 扩展比 `r` 的一个模块：

- MHA：`4 · d²`（Q、K、V、O 投影）
- FFN（SwiGLU）：`3 · d · (r · d)` ≈ `3rd²`
- 归一化：可忽略

在 `d = 4096, r = 2.6, layers = 32`（大致相当于 Llama 3 8B）时，总计：`32 · (4·4096² + 3·2.6·4096²) ≈ 32 · (16 + 32) M = ~1.5B 参数每层 × 32 ≈ 7B`（加上嵌入和头）。与公布的数字一致。

## 构建

### 步骤 1：构建模块

使用第 03 课的微型 `Matrix` 类（为独立运行复制到本文件中）：

- `layer_norm(x, eps=1e-5)` —— 减去均值，除以标准差。
- `rms_norm(x, eps=1e-6)` —— 除以 RMS。不减去均值。
- `gelu(x)` 和 `silu(x) * W3 x`（SwiGLU）。
- `ffn_swiglu(x, W1, W2, W3)`。
- `encoder_block(x, params)` 和 `decoder_block(x, enc_out, params)`。

参见 `code/main.py` 了解完整接线。

### 步骤 2：连接一个 2 层编码器和一个 2 层解码器

堆叠它们。将编码器的输出传入每个解码器的交叉注意力。在输出投影之前添加一个最终的 LN。

```python
def encode(tokens, params):
    x = embed(tokens, params.emb) + sinusoidal(len(tokens), params.d)
    for block in params.encoder_blocks:
        x = encoder_block(x, block)
    return x

def decode(target_tokens, encoder_out, params):
    x = embed(target_tokens, params.emb) + sinusoidal(len(target_tokens), params.d)
    for block in params.decoder_blocks:
        x = decoder_block(x, encoder_out, block)
    return x
```

### 步骤 3：在玩具示例上运行前向传播

输入一个 6 token 的源序列和一个 5 token 的目标序列。验证输出形状为 `(5, vocab)`。不进行训练——本课关注架构，不关注损失。

### 步骤 4：替换为 RMSNorm + SwiGLU

将 LayerNorm 和 ReLU-FFN 替换为 RMSNorm 和 SwiGLU。确认形状仍然匹配。这是用一个函数替换完成的 2026 现代化改造。

## 使用

PyTorch/TF 参考实现：`nn.TransformerEncoderLayer`、`nn.TransformerDecoderLayer`。但大多数 2026 年生产代码会自己编写模块，因为：

- Flash Attention 在注意力内部调用，而不是通过 `nn.MultiheadAttention`。
- GQA / MLA 不在标准库参考中。
- RoPE、RMSNorm、SwiGLU 不是 PyTorch 的默认选项。

HF `transformers` 有清晰的参考模块，你应该阅读：`modeling_llama.py` 是规范的 2026 年解码器专用模块。大约 500 行，值得通读一遍。

**编码器 vs 解码器 vs 编码器-解码器——何时选择：**

| 需求 | 选择 | 示例 |
|------|------|---------|
| 分类、嵌入、文本问答 | 编码器专用 | BERT、DeBERTa、ModernBERT |
| 文本生成、对话、代码、推理 | 解码器专用 | GPT、Llama、Claude、Qwen |
| 结构化输入 → 结构化输出（翻译、摘要） | 编码器-解码器 | T5、BART、Whisper |

解码器专用在语言领域胜出，因为它扩展最干净，且同时处理理解和生成。当输入有清晰的"源序列"身份时（翻译、语音识别、结构化任务），编码器-解码器仍然是最好的。

## 交付

参见 `outputs/skill-transformer-block-reviewer.zh.md`。该技能根据 2026 年默认规范审查新的 transformer 模块实现，并标记缺失的部分（pre-norm、RoPE、RMSNorm、GQA、FFN 扩展比）。

## 练习

1. **简单。** 在 `d_model=512, n_heads=8, ffn_expansion=4, swiglu=True` 时，计算你的 encoder_block 中的参数数量。通过实现该模块并使用 `sum(p.numel() for p in block.parameters())` 验证。
2. **中等。** 从 post-norm 切换到 pre-norm。初始化两者，在随机输入上测量 12 个堆叠层后的激活范数。Post-norm 的激活应爆炸；pre-norm 的应保持有界。
3. **困难。** 实现一个 4 层编码器-解码器用于玩具复制任务（反向复制 `x`）。训练 100 步。报告损失。替换为 RMSNorm + SwiGLU + RoPE——损失会下降吗？

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------------|-----------------------|
| 模块 | "一个 transformer 层" | 归一化 + 注意力 + 归一化 + FFN 的堆叠，包裹在残差连接中。 |
| 残差连接 | "跳跃连接" | `x + f(x)` 输出；使梯度能够在深层堆叠中流动。 |
| Pre-norm | "之前归一化，不是之后" | 现代：`x + sublayer(LN(x))`。无需预热技巧即可训练更深。 |
| RMSNorm | "去掉均值的 LayerNorm" | 除以 RMS；少一次运算，相同经验稳定性。 |
| SwiGLU | "大家都切换到的 FFN" | `Swish(W1 x) ⊙ W3 x → W2`。在 LM ppl 上胜过 ReLU/GELU。 |
| 交叉注意力 | "解码器如何看到编码器" | Q 来自解码器，K/V 来自编码器输出的 MHA。 |
| FFN 扩展 | "中间 MLP 有多宽" | 隐藏大小与 d_model 的比例，通常为 4（LayerNorm）或 2.6（SwiGLU）。 |
| 无偏置 | "去掉 +b 项" | 现代技术栈省略线性层中的偏置；略微提升 ppl，模型更小。 |

## 延伸阅读

- [Vaswani et al. (2017). Attention Is All You Need](https://arxiv.org/abs/1706.03762) —— 原始模块规范。
- [Xiong et al. (2020). On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745) —— 为什么 pre-norm 在深度上胜过 post-norm。
- [Zhang, Sennrich (2019). Root Mean Square Layer Normalization](https://arxiv.org/abs/1910.07467) —— RMSNorm。
- [Shazeer (2020). GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202) —— SwiGLU 论文。
- [HuggingFace `modeling_llama.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/llama/modeling_llama.py) —— 规范的 2026 年解码器专用模块。
