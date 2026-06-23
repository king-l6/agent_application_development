# 优化

> 训练神经网络不过是找到山谷的底部。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 1，第 04-05 课（导数、梯度）
**时间：** ~75 分钟

## 学习目标

- 从头实现普通梯度下降、带动量的 SGD 和 Adam
- 在 Rosenbrock 函数上比较优化器的收敛速度，解释 Adam 如何自适应每个权重的学习率
- 区分凸损失景观和非凸损失景观，解释鞍点在高维空间中的作用
- 配置学习率调度（阶梯衰减、余弦退火、预热）以确保训练稳定

## 问题

你有一个损失函数。它告诉你模型有多错。你有梯度。它们告诉你哪个方向会使损失更大。现在你需要一个下山策略。

朴素方法很简单：向梯度的反方向移动。用一个称为学习率的数字缩放步长。重复。这就是梯度下降，它确实有效。但"有效"是有条件的。学习率太大，你会完全越过山谷，在墙壁之间来回反弹。学习率太小，你会经过数千个不必要的步骤缓慢爬向答案。碰到鞍点，即使你还没有找到最小值，也会停止移动。

深度学习中的每个优化器都是对同一个问题的回答：如何更快、更可靠地到达山谷底部？

## 概念

### 优化的含义

优化是找到使函数最小化（或最大化）的输入值。在机器学习中，函数是损失。输入是模型的权重。训练就是优化。

```
最小化 L(w) 其中：
  L = 损失函数
  w = 模型权重（可能有数百万个参数）
```

### 梯度下降（普通版）

最简单的优化器。计算损失相对于每个权重的梯度。沿着每个权重梯度的反方向移动。用学习率缩放步长。

```
w = w - lr * gradient
```

这就是整个算法。一行代码。

```mermaid
graph TD
    A["* 起点（高损失）"] --> B["沿梯度方向下山"]
    B --> C["接近最小值"]
    C --> D["o 最小值（低损失）"]
```

### 学习率：最重要的超参数

学习率控制步长。它决定了收敛的一切。

```mermaid
graph LR
    subgraph 太大["太大（lr = 1.0）"]
        A1["步 1"] -->|"越过"| A2["步 2"]
        A2 -->|"越过"| A3["步 3"]
        A3 -->|"发散"| A4["..."]
    end
    subgraph 太小["太小（lr = 0.0001）"]
        B1["步 1"] -->|"微小步"| B2["步 2"]
        B2 -->|"微小步"| B3["步 3"]
        B3 -->|"10,000 步后"| B4["最小值"]
    end
    subgraph 刚好["刚好合适（lr = 0.01）"]
        C1["开始"] --> C2["..."] --> C3["~100 步内收敛"]
    end
```

没有公式可以计算正确的学习率。你通过实验找到它。常见的起点：Adam 用 0.001，带动量的 SGD 用 0.01。

### SGD vs 批量 vs 小批量

普通梯度下降在走一步之前计算整个数据集上的梯度。这被称为批量梯度下降。它稳定但缓慢。

随机梯度下降（SGD）在单个随机样本上计算梯度并立即更新。它噪声大但快速。

小批量梯度下降取中间路线。在一个小批量（32、64、128、256 个样本）上计算梯度，然后更新。这是大家实际使用的。

| 变体 | 批量大小 | 梯度质量 | 每步速度 | 噪声 |
|------|---------|---------|---------|------|
| 批量 GD | 整个数据集 | 精确 | 慢 | 无 |
| SGD | 1 个样本 | 非常嘈杂 | 快 | 高 |
| 小批量 | 32-256 | 良好的估计 | 平衡 | 中等 |

SGD 和小批量中的噪声不是 bug。它有助于逃离浅层局部最小值和鞍点。

### 动量：滚下山的球

普通梯度下降只看到当前的梯度。如果梯度曲折前进（在狭窄山谷中常见），进展会缓慢。动量通过将过去的梯度累积到速度项中来修复这个问题。

```
v = beta * v + gradient
w = w - lr * v
```

类比：一个滚下山的球。它不会在每个凸起处停下来重新开始。它在一致的方向上积累速度，并抑制振荡。

```mermaid
graph TD
    subgraph 无动量["无动量（曲折，缓慢）"]
        W1["开始"] -->|"向左"| W2[" "]
        W2 -->|"向右"| W3[" "]
        W3 -->|"向左"| W4[" "]
        W4 -->|"向右"| W5[" "]
        W5 -->|"向左"| W6[" "]
        W6 --> W7["最小值"]
    end
    subgraph 有动量["有动量（平滑，快速）"]
        M1["开始"] --> M2[" "] --> M3[" "] --> M4["最小值"]
    end
```

`beta`（通常为 0.9）控制保留多少历史信息。beta 越高，动量越大，路径越平滑，但对方向变化的响应越慢。

### Adam：自适应学习率

不同的权重需要不同的学习率。一个很少获得大梯度的权重应该在终于获得时迈出更大的步子。一个不断获得巨大梯度的权重应该迈出更小的步子。

Adam（自适应矩估计）为每个权重追踪两项：

1. 一阶矩（m）：梯度的运行平均值（如动量）
2. 二阶矩（v）：梯度平方的运行平均值（梯度幅度）

```
m = beta1 * m + (1 - beta1) * gradient
v = beta2 * v + (1 - beta2) * gradient^2

m_hat = m / (1 - beta1^t)    偏差修正
v_hat = v / (1 - beta2^t)    偏差修正

w = w - lr * m_hat / (sqrt(v_hat) + epsilon)
```

除以 `sqrt(v_hat)` 是关键洞见。梯度大的权重被一个大数除（有效步长小）。梯度小的权重被一个小数除（有效步长大）。每个权重都有自己的自适应学习率。

默认超参数：`lr=0.001, beta1=0.9, beta2=0.999, epsilon=1e-8`。这些默认值对大多数问题都适用。

### 学习率调度

固定的学习率是一种妥协。训练早期，你想要大步子以快速进展。训练后期，你想要小步子以在最小值附近微调。

常见调度：

| 调度 | 公式 | 使用场景 |
|------|------|---------|
| 阶梯衰减 | 每 N 个 epoch lr = lr * factor | 简单，手动控制 |
| 指数衰减 | lr = lr_0 * decay^t | 平滑减少 |
| 余弦退火 | lr = lr_min + 0.5 * (lr_max - lr_min) * (1 + cos(pi * t / T)) | Transformer，现代训练 |
| 预热 + 衰减 | 线性上升，然后衰减 | 大型模型，防止早期不稳定 |

### 凸与非凸

凸函数只有一个最小值。梯度下降总能找到它。像 `f(x) = x^2` 这样的二次函数是凸的。

神经网络损失函数是非凸的。它们有许多局部最小值、鞍点和平坦区域。

```mermaid
graph LR
    subgraph 凸["凸：一个山谷，一个答案"]
        direction TB
        CV1["高损失"] --> CV2["全局最小值"]
    end
    subgraph 非凸["非凸：多个山谷，鞍点"]
        direction TB
        NC1["开始"] --> NC2["局部最小值"]
        NC1 --> NC3["鞍点"]
        NC1 --> NC4["全局最小值"]
    end
```

在实践中，高维神经网络中的局部最小值很少是问题。大多数局部最小值的损失值接近全局最小值。鞍点（在某些方向上平坦，在其他方向上弯曲）才是真正的障碍。动量和来自小批量的噪声有助于逃离它们。

### 损失景观可视化

损失是所有权重的函数。对于一个有 100 万个权重的模型，损失景观存在于 1,000,001 维空间中。我们通过选取权重空间中的两个随机方向，并沿这些方向绘制损失来可视化它，从而生成一个 2D 表面。

```mermaid
graph TD
    HL["高损失区域"] --> SP["鞍点"]
    HL --> LM["局部最小值"]
    SP --> LM
    SP --> GM["全局最小值"]
    LM -.->|"浅层障碍"| GM
    style HL fill:#ff6666,color:#000
    style SP fill:#ffcc66,color:#000
    style LM fill:#66ccff,color:#000
    style GM fill:#66ff66,color:#000
```

尖锐的最小值泛化能力差。平坦的最小值泛化能力好。这是带动量的 SGD 在最终测试精度上常优于 Adam 的原因之一：它的噪声防止了落入尖锐的最小值。

```figure
gradient-descent
```

## 构建

### 步骤 1：定义测试函数

Rosenbrock 函数是一个经典的优化基准。其最小值在 (1, 1) 处，位于一个狭窄弯曲的山谷中，容易找到但难以跟上。

```
f(x, y) = (1 - x)^2 + 100 * (y - x^2)^2
```

```python
def rosenbrock(params):
    x, y = params
    return (1 - x) ** 2 + 100 * (y - x ** 2) ** 2

def rosenbrock_gradient(params):
    x, y = params
    df_dx = -2 * (1 - x) + 200 * (y - x ** 2) * (-2 * x)
    df_dy = 200 * (y - x ** 2)
    return [df_dx, df_dy]
```

### 步骤 2：普通梯度下降

```python
class GradientDescent:
    def __init__(self, lr=0.001):
        self.lr = lr

    def step(self, params, grads):
        return [p - self.lr * g for p, g in zip(params, grads)]
```

### 步骤 3：带动量的 SGD

```python
class SGDMomentum:
    def __init__(self, lr=0.001, momentum=0.9):
        self.lr = lr
        self.momentum = momentum
        self.velocity = None

    def step(self, params, grads):
        if self.velocity is None:
            self.velocity = [0.0] * len(params)
        self.velocity = [
            self.momentum * v + g
            for v, g in zip(self.velocity, grads)
        ]
        return [p - self.lr * v for p, v in zip(params, self.velocity)]
```

### 步骤 4：Adam

```python
class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, epsilon=1e-8):
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.m = None
        self.v = None
        self.t = 0

    def step(self, params, grads):
        if self.m is None:
            self.m = [0.0] * len(params)
            self.v = [0.0] * len(params)

        self.t += 1

        self.m = [
            self.beta1 * m + (1 - self.beta1) * g
            for m, g in zip(self.m, grads)
        ]
        self.v = [
            self.beta2 * v + (1 - self.beta2) * g ** 2
            for v, g in zip(self.v, grads)
        ]

        m_hat = [m / (1 - self.beta1 ** self.t) for m in self.m]
        v_hat = [v / (1 - self.beta2 ** self.t) for v in self.v]

        return [
            p - self.lr * mh / (vh ** 0.5 + self.epsilon)
            for p, mh, vh in zip(params, m_hat, v_hat)
        ]
```

### 步骤 5：运行并比较

```python
def optimize(optimizer, func, grad_func, start, steps=5000):
    params = list(start)
    history = [params[:]]
    for _ in range(steps):
        grads = grad_func(params)
        params = optimizer.step(params, grads)
        history.append(params[:])
    return history

start = [-1.0, 1.0]

gd_history = optimize(GradientDescent(lr=0.0005), rosenbrock, rosenbrock_gradient, start)
sgd_history = optimize(SGDMomentum(lr=0.0001, momentum=0.9), rosenbrock, rosenbrock_gradient, start)
adam_history = optimize(Adam(lr=0.01), rosenbrock, rosenbrock_gradient, start)

for name, history in [("GD", gd_history), ("SGD+M", sgd_history), ("Adam", adam_history)]:
    final = history[-1]
    loss = rosenbrock(final)
    print(f"{name:6s} -> x={final[0]:.6f}, y={final[1]:.6f}, loss={loss:.8f}")
```

预期输出：Adam 收敛最快。带动量的 SGD 路径更平滑。普通 GD 在狭窄山谷中进展缓慢。

## 使用

在实践中，使用 PyTorch 或 JAX 优化器。它们处理参数组、权重衰减、梯度裁剪和 GPU 加速。

```python
import torch

model = torch.nn.Linear(784, 10)

sgd = torch.optim.SGD(model.parameters(), lr=0.01, momentum=0.9)
adam = torch.optim.Adam(model.parameters(), lr=0.001)
adamw = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.01)

scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(adam, T_max=100)
```

经验法则：

- 从 Adam（lr=0.001）开始。它对大多数问题无需调参就能工作。
- 当你需要最佳最终精度并且可以承担更多调参时，切换到带动量的 SGD（lr=0.01，momentum=0.9）。
- 对 Transformer 使用 AdamW（带解耦权重衰减的 Adam）。
- 对于超过几个 epoch 的训练运行，始终使用学习率调度。
- 如果训练不稳定，降低学习率。如果训练太慢，提高学习率。

## 交付

本课程生成了一个选择正确优化器的提示。见 `outputs/prompt-optimizer-guide.md`。

这里构建的优化器类将在阶段 3 中从头训练神经网络时再次出现。

## 练习

1. **学习率扫描。** 用学习率 [0.0001, 0.0005, 0.001, 0.005, 0.01] 在 Rosenbrock 函数上运行普通梯度下降。打印每种学习率在 5000 步后的最终损失。找到仍能收敛的最大学习率。

2. **动量比较。** 用动量值 [0.0, 0.5, 0.9, 0.99] 在 Rosenbrock 函数上运行 SGD。追踪每一步的损失。哪个动量值收敛最快？哪个会越过目标？

3. **鞍点逃离。** 定义函数 `f(x, y) = x^2 - y^2`（原点处有一个鞍点）。从 (0.01, 0.01) 开始。比较普通 GD、带动量的 SGD 和 Adam 的行为。哪个能逃离鞍点？

4. **实现学习率衰减。** 给 GradientDescent 类添加指数衰减调度：`lr = lr_0 * 0.999^step`。在 Rosenbrock 函数上比较有无衰减的收敛情况。

## 关键术语

| 术语 | 人们说的话 | 实际含义 |
|------|----------|---------|
| 梯度下降 | "下山" | 通过减去梯度乘以学习率来更新权重。最基本的优化器。 |
| 学习率 | "步长" | 控制每次更新移动权重的距离的标量。太大会发散。太小浪费计算资源。 |
| 动量 | "继续滚动" | 将过去的梯度累积到速度向量中。抑制振荡并加速在一致方向上的移动。 |
| SGD | "随机采样" | 随机梯度下降。在随机子集而不是完整数据集上计算梯度。在实践中几乎总是指小批量 SGD。 |
| 小批量 | "一块数据" | 一小部分训练数据（32-256 个样本），用于估计梯度。平衡速度和梯度精度。 |
| Adam | "默认优化器" | 自适应矩估计。追踪每个权重的梯度和梯度平方的运行平均值，为每个权重提供自己的学习率。 |
| 偏差修正 | "修正冷启动" | Adam 的一阶和二阶矩初始化为零。偏差修正除以 (1 - beta^t) 以在早期步骤中补偿。 |
| 学习率调度 | "随时间改变学习率" | 在训练期间调整学习率的函数。早期大步，后期小步。 |
| 凸函数 | "一个山谷" | 任何局部最小值都是全局最小值的函数。梯度下降总能找到它。神经网络损失不是凸的。 |
| 鞍点 | "平坦但不是最小值" | 梯度为零但在某些方向是最小值在另一些方向是最大值的点。在高维空间中很常见。 |
| 损失景观 | "地形" | 在权重空间上绘制的损失函数。通过沿两个随机方向切片来可视化。 |
| 收敛 | "到达" | 优化器已达到进一步步骤不会显著减少损失的点。 |

## 进一步阅读

- [Sebastian Ruder：梯度下降优化算法概述](https://ruder.io/optimizing-gradient-descent/) - 所有主要优化器的综合调查
- [动量为何有效（Distill）](https://distill.pub/2017/momentum/) - 动量动态的交互式可视化
- [Adam：一种随机优化方法（Kingma & Ba, 2014）](https://arxiv.org/abs/1412.6980) - 原始的 Adam 论文，可读性强且简短
- [可视化神经网络的损失景观（Li et al., 2018）](https://arxiv.org/abs/1712.09913) - 展示了尖锐与平坦最小值的论文
