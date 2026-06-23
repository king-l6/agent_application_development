# ControlNet、LoRA与条件化

> 仅靠文本是一种笨拙的控制信号。ControlNet让你克隆一个预训练的扩散模型，并用深度图、姿态骨架、涂鸦或边缘图像来引导它。LoRA让你通过训练1000万个参数来微调一个20亿参数的模型。它们一起将Stable Diffusion从玩具变成了2026年每个代理公司都在部署的图像流水线。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段8·07（潜在扩散）、阶段10（从零实现LLM——LoRA基础）
**时间：** ~75分钟

## 问题

像"一个穿着红裙子的女人在繁忙街道上遛狗"这样的提示，没有给模型提供任何关于*狗在哪里*、*女人是什么姿态*或*街道的视角*的信息。文本只能确定你指定一幅图像所需的大约10%。其余的是视觉信息，无法用文字有效描述。

为每个信号（姿态、深度、canny边缘、分割）从头训练一个新的条件模型是不可行的。你希望保持26亿参数的SDXL骨干网络冻结，附加一个读取条件化信息的小型侧网络，让它推动骨干网络的中间特征。这就是ControlNet。

你还希望教模型新概念（你的脸、你的产品、你的风格），而不需要重新训练整个模型。你需要一个小100倍的增量。这就是LoRA——低秩适配器，插入到现有的注意力权重中。

ControlNet + LoRA + 文本 = 2026年从业者的工具箱。大多数生产图像流水线在SDXL / SD3 / Flux底座上叠加2-5个LoRA、1-3个ControlNet和一个IP-Adapter。

## 概念

![ControlNet克隆编码器；LoRA添加低秩增量](../assets/controlnet-lora.svg)

### ControlNet（Zhang et al., 2023）

取一个预训练的SD。*克隆*U-Net的编码器部分。冻结原始模型。训练克隆模型接受额外的条件化输入（边缘、深度、姿态）。通过*零卷积*跳跃连接（初始化为零的1×1卷积——开始时是无操作，学习一个增量）将克隆模型连接回原始模型的解码器部分。

```
SD U-Net解码器：   ... ← orig_enc_features + zero_conv(controlnet_enc(condition))
```

零卷积初始化意味着ControlNet从恒等映射开始——即使训练前也没有不良影响。在100万（提示、条件、图像）三元组上使用标准的扩散损失进行训练。

每个模态的ControlNet作为小型侧模型发布（SDXL约360M，SD 1.5约70M）。你可以在推理时组合它们：

```
features += weight_a * control_a(depth) + weight_b * control_b(pose)
```

### LoRA（Hu et al., 2021）

对于模型中的任何线性层`W ∈ R^{d×d}`，冻结`W`并添加一个低秩增量：

```
W' = W + ΔW,  ΔW = B @ A,  A ∈ R^{r×d},  B ∈ R^{d×r}
```

其中`r << d`。注意力层通常使用秩4-16，重度微调使用秩64-128。新增参数量：`2 · d · r`而不是`d²`。对于SDXL注意力层，`d=640`，`r=16`：每个适配器2万参数而不是41万——减少了20倍。在整个模型上：一个LoRA通常为20-200MB，而基础模型为5GB。

推理时你可以缩放LoRA：`W' = W + α · B @ A`。`α = 0.5-1.5`是正常范围。多个LoRA可以叠加（通常的警告是它们以非线性方式相互作用）。

### IP-Adapter（Ye et al., 2023）

一个接受*图像*作为条件化（与文本并列）的小型适配器。使用CLIP图像编码器产生图像令牌，将它们注入交叉注意力中与文本令牌并列。每个基础模型约20MB。让你可以在没有LoRA的情况下"以这个参考图像的风格生成图像"。

## 可组合性矩阵

| 工具 | 控制什么 | 大小 | 何时使用 |
|------|---------|------|---------|
| ControlNet | 空间结构（姿态、深度、边缘） | 70-360MB | 精确布局、构图 |
| LoRA | 风格、主体、概念 | 20-200MB | 个性化、风格 |
| IP-Adapter | 从参考图像获取风格或主体 | 20MB | 没有文本可以描述外观 |
| Textual Inversion | 将单一概念作为新令牌 | 10KB | 遗留方法，已被LoRA取代 |
| DreamBooth | 在主体上进行全量微调 | 2-5GB | 强身份保持、高计算量 |
| T2I-Adapter | 更轻量的ControlNet替代方案 | 70MB | 边缘设备、推理预算有限 |

ControlNet ≈ 空间控制。LoRA ≈ 语义控制。两者一起使用。

## 构建

`code/main.py`在1维空间上模拟了这两种机制：

1. **LoRA。** 一个预训练的线性层`W`。冻结它。训练一个低秩`B @ A`，使得`W + BA`匹配一个目标线性层。展示`r = 1`足以完美学习一个秩1修正。

2. **ControlNet精简版。** 一个"冻结的基础"预测器和一个读取额外信号的"侧网络"。侧网络的输出由初始化为零的可学习标量（我们的零卷积版本）门控。训练并观察门控值上升。

### 步骤1：LoRA数学

```python
def lora(W, A, B, x, alpha=1.0):
    # W是冻结的；A、B是可训练的低秩因子。
    return [W[i][j] * x[j] for i, j in ...] + alpha * (B @ (A @ x))
```

### 步骤2：零初始化侧网络

```python
side_out = control_net(x, condition)
gated = gate * side_out  # gate初始化为0
h = base(x) + gated
```

在第0步，输出与基础模型完全相同。早期训练更新`gate`速度缓慢——没有灾难性漂移。

## 陷阱

- **LoRA过度缩放。** `α = 2`或`α = 3`是一种常见的"让它更强"的hack，会产生过度风格化/破损的输出。保持`α ≤ 1.5`。
- **ControlNet权重冲突。** 同时使用权重1.0的姿态ControlNet和权重1.0的深度ControlNet通常会过度。权重之和≈ 1.0是一个安全的默认值。
- **基础模型错误的LoRA。** SDXL的LoRA在SD 1.5上静默无效，因为注意力维度不匹配。Diffusers 0.30+会发出警告。
- **Textual Inversion漂移。** 在一个检查点上训练的令牌在另一个检查点上严重漂移。LoRA更便携。
- **LoRA权重复合与存储。** 你可以将LoRA烘焙到基础模型权重中以提高推理速度（无运行时加法），但会失去在运行时缩放`α`的能力。保留两个版本。

## 使用

| 目标 | 2026年流水线 |
|------|-------------|
| 复现品牌的艺术风格 | 在约30张精选图像上训练的秩32 LoRA |
| 把我的脸放进生成的图像 | DreamBooth 或 LoRA + IP-Adapter-FaceID |
| 特定姿态 + 提示 | ControlNet-Openpose + SDXL + 文本 |
| 深度感知构图 | ControlNet-Depth + SD3 |
| 参考图 + 提示 | IP-Adapter + 文本 |
| 精确布局 | ControlNet-Scribble 或 ControlNet-Canny |
| 背景替换 | ControlNet-Seg + 修补（第09课） |
| 快速1步风格 | SDXL-Turbo上的LCM-LoRA |

## 交付

保存`outputs/skill-sd-toolkit-composer.md`。该技能接收任务（输入资源：提示、可选的参考图像、可选的姿态、可选的深度、可选的涂鸦）并输出工具栈、权重和可重现的种子协议。

## 练习

1. **简单。** 在`code/main.py`中，将LoRA秩`r`从1变化到4。在哪个秩下，LoRA的增量恰好匹配秩2的目标增量？
2. **中等。** 在两个目标变换上分别训练两个LoRA。一起加载它们并展示它们的加性交互。交互在什么时候破坏线性？
3. **困难。** 使用diffusers叠加：SDXL-base + Canny-ControlNet（权重0.8）+ 风格LoRA（α 0.8）+ IP-Adapter（权重0.6）。在叠层权重变化时测量FID与提示遵循度的权衡。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|-----------|---------|
| ControlNet | "空间控制" | 克隆的编码器 + 零卷积跳跃连接；读取条件化图像。 |
| 零卷积 | "从恒等映射开始" | 初始化为零的1×1卷积；ControlNet从无操作开始。 |
| LoRA | "低秩适配器" | `W + B @ A`，`r << d`；参数比全量微调少100倍。 |
| 秩 r | "旋钮" | LoRA压缩度；通常4-16，64+用于重度个性化。 |
| α | "LoRA强度" | LoRA增量的运行时缩放。 |
| IP-Adapter | "参考图像" | 通过CLIP图像令牌的小型图像条件化适配器。 |
| DreamBooth | "全量主体微调" | 在大约30张主体图像上训练完整模型。 |
| Textual Inversion | "新令牌" | 仅学习一个新的词嵌入；遗留方法，基本已被取代。 |

## 生产说明：LoRA切换、ControlNet通道、多租户服务

一个真实的文生图SaaS在同一个基础检查点上服务数百个LoRA和十几个ControlNet。服务问题看起来很像LLM多租户（生产文献在连续批处理和LoRAX / S-LoRA下涵盖了LLM的情况）：

- **热切换LoRA，不要合并。** 将`W' = W + α·B·A`合并到基础模型中可使每步推理加快约3-5%，但冻结了`α`和基础模型。将LoRA作为秩r增量保持在VRAM中；diffusers提供了`pipe.load_lora_weights()` + `pipe.set_adapters([...], adapter_weights=[...])`用于按需激活。切换成本是`2 · d · r · num_layers`的权重——MB级别，亚秒级。
- **将ControlNet作为第二个注意力通道。** 克隆的编码器与基础模型并行运行。每个权重1.0的两个ControlNet = 每步两次额外的前向传递，而不是一次合并的传递。批处理空间二次下降。每个活动的ControlNet预算约1.5倍的步成本。
- **量化LoRA也可以。** 如果你量化了基础模型（参见第07课，Flux在8GB上），LoRA增量也可以干净地量化到8位或4位。QLoRA风格的加载让你可以在4位Flux底座上叠加5-10个LoRA而不会爆内存。

Flux特定：Niels的Flux-on-8GB笔记将基础模型量化到4位；在该量化底座上叠加一个风格LoRA（`pipe.load_lora_weights("user/style-lora")`，`weight_name="pytorch_lora_weights.safetensors"`）仍然有效。这是2026年大多数SaaS代理公司使用的方案。

## 延伸阅读

- [Zhang, Rao, Agrawala (2023). Adding Conditional Control to Text-to-Image Diffusion Models](https://arxiv.org/abs/2302.05543) — ControlNet。
- [Hu et al. (2021). LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) — LoRA（最初用于LLMs；移植到扩散模型）。
- [Ye et al. (2023). IP-Adapter: Text Compatible Image Prompt Adapter](https://arxiv.org/abs/2308.06721) — IP-Adapter。
- [Mou et al. (2023). T2I-Adapter: Learning Adapters to Dig Out More Controllable Ability](https://arxiv.org/abs/2302.08453) — ControlNet的更轻量替代方案。
- [Ruiz et al. (2023). DreamBooth: Fine Tuning Text-to-Image Diffusion Models for Subject-Driven Generation](https://arxiv.org/abs/2208.12242) — DreamBooth。
- [HuggingFace Diffusers — ControlNet / LoRA / IP-Adapter docs](https://huggingface.co/docs/diffusers/training/controlnet) — 参考流水线。
