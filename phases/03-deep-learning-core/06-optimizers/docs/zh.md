# 优化器

> 梯度下降告诉你该往哪个方向走。但它对走多远或多快只字不提。SGD 是指南针。Adam 是具有交通数据的 GPS。

**类型：** 构建
**语言：** Python
**前置知识：** 课程 03.05（损失函数）
**时间：** ~75 分钟

## 学习目标

- 从零在 Python 中实现 SGD、带动量的 SGD、Adam 和 AdamW 优化器
- 解释 Adam 的偏置修正如何补偿早期训练步骤中零初始化的矩估计
- 展示为什么 AdamW 在相同任务上比带 L2 正则化的 Adam 产生更好的泛化
- 为 Transformer、CNN、GAN 和微调选择适当的优化器和默认超参数

## 问题

你已经计算了梯度。你知道权重 #4,721 应该减少 0.003 以减少损失。但 0.003 是以什么为单位？按什么缩放？而且你应该在第 1 步和第 1,000 步移动相同的量吗？

普通梯度下降对每一步的每个参数应用相同的学习率：w = w - lr * gradient。这在实践中造成了三个使神经网络训练痛苦的问题。

第一，振荡。损失景观很少像一个光滑的碗。它更像一个狭窄的长谷。梯度指向谷的对面（陡峭方向），而不是沿着它（浅方向）。梯度下降在狭窄维度上来回弹跳，同时在有用的维度上取得微小的进展。你见过这种情况：损失快速下降然后停滞，不是因为模型收敛了，而是因为它在振荡。

第二，所有参数共用一个学习率是错误的。有些权重需要大的更新（它们处于早期欠拟合阶段）。其他需要微小的更新（它们接近最优值）。对前者有效的学习率会破坏后者，反之亦然。

第三，鞍点。在高维空间中，损失景观有广阔的平坦区域，梯度接近零。普通 SGD 以梯度的速度爬行通过这些区域，而梯度实际上为零。模型看起来卡住了。它并没有卡住——它处在一个平坦区域，另一边有有用的下降路径。但 SGD 没有机制可以突破。

Adam 解决了所有三个问题。它为每个参数维护两个运行平均值——平均梯度（动量，处理振荡）和平均平方梯度（自适应率，处理不同尺度）。结合前几步的偏置修正，它为你提供了一个单一的优化器，能在 80% 的问题上使用默认超参数工作。本课程从头构建它，以便你准确理解它何时以及为什么在另外 20% 上失败。

## 概念

### 随机梯度下降（SGD）

最简单的优化器。在小批量上计算梯度，然后向相反方向迈出一步。

```
w = w - lr * gradient
```

"随机"意味着你使用数据的随机子集（小批量）来估计梯度，而不是完整数据集。这种噪声实际上是有用的——它有助于逃离尖锐的局部最小值。但噪声也会导致振荡。

学习率是唯一的旋钮。太高：损失发散。太低：训练需要永远。最优值取决于架构、数据、批量大小和当前的训练阶段。对于现代网络上的普通 SGD，典型值范围从 0.01 到 0.1。但即使在一个训练过程中，理想的学习率也会变化。

### 动量

球滚下山的类比被过度使用但准确。不是仅靠梯度迈步，而是维护一个累积过去梯度的速度。

```
m_t = beta * m_{t-1} + gradient
w = w - lr * m_t
```

Beta（通常为 0.9）控制保留多少历史。当 beta = 0.9 时，动量大约是最近 10 个梯度的平均值（1 / (1 - 0.9) = 10）。

为什么这能修复振荡：指向相同方向的梯度会累积。方向翻转的梯度会抵消。在那个狭窄的山谷中，"横向"分量每一步都会翻转符号并被削弱。"纵向"分量保持一致并被放大。结果是在有用方向上的平稳加速。

实际数字：在条件差的损失景观上，单独 SGD 可能需要 10,000 步。带动量的 SGD（beta=0.9）在相同问题上通常需要 3,000-5,000 步。这种加速不是微不足道的。

### RMSProp

第一个实际有效的逐参数自适应学习率方法。由 Hinton 在 Coursera 讲座中提出（从未正式发表）。

```
s_t = beta * s_{t-1} + (1 - beta) * gradient^2
w = w - lr * gradient / (sqrt(s_t) + epsilon)
```

s_t 跟踪平方梯度的运行平均值。具有持续大梯度的参数被除以一个大数（更小的有效学习率）。具有小梯度的参数被除以一个小数（更大的有效学习率）。

这解决了"所有参数共用一个学习率"的问题。一个已经在获得大更新的权重可能接近其目标——减慢它。一个一直在获得微小更新的权重可能训练不足——加快它。

Epsilon（通常为 1e-8）防止在参数从未更新时除以零。

### Adam：动量 + RMSProp

Adam 结合了两种思想。它为每个参数维护两个指数移动平均：

```
m_t = beta1 * m_{t-1} + (1 - beta1) * gradient        （一阶矩：均值）
v_t = beta2 * v_{t-1} + (1 - beta2) * gradient^2       （二阶矩：方差）
```

**偏置修正是大多数解释跳过的关键细节。** 在第 1 步，m_1 = (1 - beta1) * gradient。当 beta1 = 0.9 时，那就是 0.1 * gradient——小了十倍。移动平均还没有预热。偏置修正补偿了这一点：

```
m_hat = m_t / (1 - beta1^t)
v_hat = v_t / (1 - beta2^t)
```

在第 1 步，beta1 = 0.9：m_hat = m_1 / (1 - 0.9) = m_1 / 0.1 = 实际梯度。在第 100 步：(1 - 0.9^100) 约等于 1.0，所以修正消失了。偏置修正在前 ~10 步很重要，在 ~50 步后无关紧要。

更新步骤：

```
w = w - lr * m_hat / (sqrt(v_hat) + epsilon)
```

Adam 默认值：lr = 0.001, beta1 = 0.9, beta2 = 0.999, epsilon = 1e-8。这些默认值在 80% 的问题上有效。当它们无效时，先改 lr。然后改 beta2。几乎从不改 beta1 或 epsilon。

### AdamW：正确的权重衰减

L2 正则化向损失添加 lambda * w^2。在普通 SGD 中，这等价于权重衰减（每一步从权重中减去 lambda * w）。在 Adam 中，这种等价性被打破。

Loshchilov & Hutter 的洞察：当你将 L2 添加到损失中，然后 Adam 处理梯度时，自适应学习率也会缩放正则化项。具有大梯度方差的参数获得更少的正则化。具有小方差的参数获得更多。这不是你想要的——你想要统一的正则化，无论梯度统计如何。

AdamW 通过在 Adam 更新之后直接将权重衰减应用于权重来修复这一点：

```
w = w - lr * m_hat / (sqrt(v_hat) + epsilon) - lr * lambda * w
```

权重衰减项（lr * lambda * w）不被 Adam 的自适应因子缩放。每个参数获得相同的比例收缩。

这看似一个小细节。但事实并非如此。AdamW 在几乎每个任务上都收敛到比 Adam + L2 正则化更好的解。它是 PyTorch 中训练 Transformer、扩散模型和大多数现代架构的默认优化器。BERT、GPT、LLaMA、Stable Diffusion——都是使用 AdamW 训练的。

### 学习率：最重要的超参数

```mermaid
graph TD
    LR["学习率"] --> TooHigh["太高（lr > 0.01）"]
    LR --> JustRight["恰到好处"]
    LR --> TooLow["太低（lr < 0.00001）"]

    TooHigh --> Diverge["损失爆炸<br/>NaN 权重<br/>训练崩溃"]
    JustRight --> Converge["损失稳步下降<br/>达到好的最小值<br/>泛化良好"]
    TooLow --> Stall["损失缓慢下降<br/>陷入次优最小值<br/>浪费计算"]

    JustRight --> Schedule["通常需要调度"]
    Schedule --> Warmup["预热：从 0 升到最大值<br/>前 1-10% 的训练"]
    Schedule --> Decay["衰减：随时间减少<br/>余弦或线性"]
```

如果你只调一个超参数，就调学习率。学习率变化 10 倍比你做的任何架构决策都重要。常见默认值：

- SGD：lr = 0.01 到 0.1
- Adam/AdamW：lr = 1e-4 到 3e-4
- 微调预训练模型：lr = 1e-5 到 5e-5
- 学习率预热：在前 1-10% 的步骤中线性上升

### 优化器对比

```mermaid
flowchart LR
    subgraph "优化路径"
        SGD_P["SGD<br/>跨山谷振荡<br/>慢但找到平坦最小值"]
        Mom_P["SGD + 动量<br/>更平滑的路径<br/>比 SGD 快 3 倍"]
        Adam_P["Adam<br/>逐参数自适应<br/>快速收敛"]
        AdamW_P["AdamW<br/>Adam + 正确衰减<br/>最佳泛化"]
    end
    SGD_P --> Mom_P --> Adam_P --> AdamW_P
```

### 每个优化器何时胜出

```mermaid
flowchart TD
    Task["你在训练什么？"] --> Type{"模型类型？"}

    Type -->|"Transformer / LLM"| AdamW["AdamW<br/>lr=1e-4, wd=0.01-0.1"]
    Type -->|"CNN / ResNet"| SGD_M["SGD + 动量<br/>lr=0.1, momentum=0.9"]
    Type -->|"GAN"| Adam2["Adam<br/>lr=2e-4, beta1=0.5"]
    Type -->|"微调"| AdamW2["AdamW<br/>lr=2e-5, wd=0.01"]
    Type -->|"还不知道"| Default["从 AdamW 开始<br/>lr=3e-4, wd=0.01"]
```

```figure
optimizer-trajectory
```

## 构建

### 步骤 1：普通 SGD

```python
class SGD:
    def __init__(self, lr=0.01):
        self.lr = lr

    def step(self, params, grads):
        for i in range(len(params)):
            params[i] -= self.lr * grads[i]
```

### 步骤 2：带动量的 SGD

```python
class SGDMomentum:
    def __init__(self, lr=0.01, beta=0.9):
        self.lr = lr
        self.beta = beta
        self.velocities = None

    def step(self, params, grads):
        if self.velocities is None:
            self.velocities = [0.0] * len(params)
        for i in range(len(params)):
            self.velocities[i] = self.beta * self.velocities[i] + grads[i]
            params[i] -= self.lr * self.velocities[i]
```

### 步骤 3：Adam

```python
import math

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

        for i in range(len(params)):
            self.m[i] = self.beta1 * self.m[i] + (1 - self.beta1) * grads[i]
            self.v[i] = self.beta2 * self.v[i] + (1 - self.beta2) * grads[i] ** 2

            m_hat = self.m[i] / (1 - self.beta1 ** self.t)
            v_hat = self.v[i] / (1 - self.beta2 ** self.t)

            params[i] -= self.lr * m_hat / (math.sqrt(v_hat) + self.epsilon)
```

### 步骤 4：AdamW

```python
class AdamW:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, epsilon=1e-8, weight_decay=0.01):
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.weight_decay = weight_decay
        self.m = None
        self.v = None
        self.t = 0

    def step(self, params, grads):
        if self.m is None:
            self.m = [0.0] * len(params)
            self.v = [0.0] * len(params)

        self.t += 1

        for i in range(len(params)):
            self.m[i] = self.beta1 * self.m[i] + (1 - self.beta1) * grads[i]
            self.v[i] = self.beta2 * self.v[i] + (1 - self.beta2) * grads[i] ** 2

            m_hat = self.m[i] / (1 - self.beta1 ** self.t)
            v_hat = self.v[i] / (1 - self.beta2 ** self.t)

            params[i] -= self.lr * m_hat / (math.sqrt(v_hat) + self.epsilon)
            params[i] -= self.lr * self.weight_decay * params[i]
```

### 步骤 5：训练对比

用所有四种优化器在课程 05 中的圆形数据集上训练相同的两层网络。比较收敛。

```python
import random

def sigmoid(x):
    x = max(-500, min(500, x))
    return 1.0 / (1.0 + math.exp(-x))

def make_circle_data(n=200, seed=42):
    random.seed(seed)
    data = []
    for _ in range(n):
        x = random.uniform(-2, 2)
        y = random.uniform(-2, 2)
        label = 1.0 if x * x + y * y < 1.5 else 0.0
        data.append(([x, y], label))
    return data


class OptimizerTestNetwork:
    def __init__(self, optimizer, hidden_size=8):
        random.seed(0)
        self.hidden_size = hidden_size
        self.optimizer = optimizer

        self.w1 = [[random.gauss(0, 0.5) for _ in range(2)] for _ in range(hidden_size)]
        self.b1 = [0.0] * hidden_size
        self.w2 = [random.gauss(0, 0.5) for _ in range(hidden_size)]
        self.b2 = 0.0

    def get_params(self):
        params = []
        for row in self.w1:
            params.extend(row)
        params.extend(self.b1)
        params.extend(self.w2)
        params.append(self.b2)
        return params

    def set_params(self, params):
        idx = 0
        for i in range(self.hidden_size):
            for j in range(2):
                self.w1[i][j] = params[idx]
                idx += 1
        for i in range(self.hidden_size):
            self.b1[i] = params[idx]
            idx += 1
        for i in range(self.hidden_size):
            self.w2[i] = params[idx]
            idx += 1
        self.b2 = params[idx]

    def forward(self, x):
        self.x = x
        self.z1 = []
        self.h = []
        for i in range(self.hidden_size):
            z = self.w1[i][0] * x[0] + self.w1[i][1] * x[1] + self.b1[i]
            self.z1.append(z)
            self.h.append(max(0.0, z))

        self.z2 = sum(self.w2[i] * self.h[i] for i in range(self.hidden_size)) + self.b2
        self.out = sigmoid(self.z2)
        return self.out

    def compute_grads(self, target):
        eps = 1e-15
        p = max(eps, min(1 - eps, self.out))
        d_loss = -(target / p) + (1 - target) / (1 - p)
        d_sigmoid = self.out * (1 - self.out)
        d_out = d_loss * d_sigmoid

        grads = [0.0] * (self.hidden_size * 2 + self.hidden_size + self.hidden_size + 1)
        idx = 0
        for i in range(self.hidden_size):
            d_relu = 1.0 if self.z1[i] > 0 else 0.0
            d_h = d_out * self.w2[i] * d_relu
            grads[idx] = d_h * self.x[0]
            grads[idx + 1] = d_h * self.x[1]
            idx += 2

        for i in range(self.hidden_size):
            d_relu = 1.0 if self.z1[i] > 0 else 0.0
            grads[idx] = d_out * self.w2[i] * d_relu
            idx += 1

        for i in range(self.hidden_size):
            grads[idx] = d_out * self.h[i]
            idx += 1

        grads[idx] = d_out
        return grads

    def train(self, data, epochs=300):
        losses = []
        for epoch in range(epochs):
            total_loss = 0.0
            correct = 0
            for x, y in data:
                pred = self.forward(x)
                grads = self.compute_grads(y)
                params = self.get_params()
                self.optimizer.step(params, grads)
                self.set_params(params)

                eps = 1e-15
                p = max(eps, min(1 - eps, pred))
                total_loss += -(y * math.log(p) + (1 - y) * math.log(1 - p))
                if (pred >= 0.5) == (y >= 0.5):
                    correct += 1
            avg_loss = total_loss / len(data)
            accuracy = correct / len(data) * 100
            losses.append((avg_loss, accuracy))
            if epoch % 75 == 0 or epoch == epochs - 1:
                print(f"    Epoch {epoch:3d}: loss={avg_loss:.4f}, accuracy={accuracy:.1f}%")
        return losses
```

## 使用

PyTorch 优化器处理参数组、梯度裁剪和学习率调度：

```python
import torch
import torch.optim as optim

model = torch.nn.Sequential(
    torch.nn.Linear(784, 256),
    torch.nn.ReLU(),
    torch.nn.Linear(256, 10),
)

optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)

scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100)

for epoch in range(100):
    optimizer.zero_grad()
    output = model(torch.randn(32, 784))
    loss = torch.nn.functional.cross_entropy(output, torch.randint(0, 10, (32,)))
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
    optimizer.step()
    scheduler.step()
```

模式总是：zero_grad, forward, loss, backward, (clip), step, (schedule)。记住这个顺序。弄错了（例如，在 optimizer.step() 之前调用 scheduler.step()）是常见微妙 bug 的来源。

对于 CNN，许多从业者仍然偏好 SGD + 动量（lr=0.1, momentum=0.9, weight_decay=1e-4）配合阶梯或余弦调度。SGD 找到更平坦的最小值，通常泛化更好。对于 Transformer 和 LLM，AdamW 配合预热 + 余弦衰减是普遍的默认选择。没有经过测量的理由就不要与共识对抗。

## 交付

本课程产出：
- `outputs/prompt-optimizer-selector.md` —— 一个为任何架构选择正确优化器和学习率的决策提示词

## 练习

1. 实现 Nesterov 动量，即在"前瞻"位置（w - lr * beta * v）而不是当前位置计算梯度。在圆形数据集上比较与标准动量的收敛。

2. 实现一个学习率预热调度：从前 10% 的训练步骤从 0 线性上升到 max_lr，然后余弦衰减到 0。使用 Adam + 预热 vs 无预热的 Adam 进行训练。测量在圆形数据集上达到 90% 准确率需要多少个 epoch。

3. 在 Adam 训练期间跟踪每个参数的有效学习率。有效率为 lr * m_hat / (sqrt(v_hat) + eps)。绘制 10、50 和 200 步后的有效率分布。所有参数是否以相同的速度更新？

4. 实现梯度裁剪（按全局范数裁剪）。设置最大梯度范数为 1.0。使用高学习率（Adam 的 lr=0.01）训练有裁剪和无裁剪。在 10 个随机种子上统计有多少次运行发散（损失变成 NaN）。

5. 在大权重网络上比较 Adam vs AdamW。将所有权重初始化为 [-5, 5] 范围内的随机值（远大于正常值）。训练 200 个 epoch，weight_decay=0.1。绘制两种优化器的权重 L2 范数随训练的变化。AdamW 应该显示更快的权重收缩。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------|---------|
| 学习率 | "步长" | 梯度更新上的标量乘数；训练中最具影响力的超参数 |
| SGD | "基础梯度下降" | 随机梯度下降：通过减去 lr * gradient 更新权重，在小批量上计算 |
| 动量 | "滚球类比" | 过去梯度的指数移动平均；削弱振荡加速一致方向 |
| RMSProp | "自适应学习率" | 将每个参数的梯度除以其最近梯度的运行 RMS；均衡学习率 |
| Adam | "默认优化器" | 结合动量（一阶矩）和 RMSProp（二阶矩）以及初始步骤的偏置修正 |
| AdamW | "正确的 Adam" | 带解耦权重衰减的 Adam；通过梯度直接对权重应用正则化 |
| 偏置修正 | "运行平均的预热" | 除以 (1 - beta^t) 以补偿 Adam 矩估计的零初始化 |
| 权重衰减 | "缩小权重" | 每一步减去权重值的一部分；惩罚大权重的正则化器 |
| 学习率调度 | "随时间改变学习率" | 一个调整训练期间学习率的函数；预热 + 余弦衰减是现代默认 |
| 梯度裁剪 | "限制梯度范数" | 当梯度向量范数超过阈值时将其缩小；防止梯度爆炸更新 |

## 延伸阅读

- Kingma & Ba, "Adam: A Method for Stochastic Optimization" (2014) —— 原始的 Adam 论文，包含收敛分析和偏置修正推导
- Loshchilov & Hutter, "Decoupled Weight Decay Regularization" (2017) —— 证明了 L2 正则化和权重衰减在 Adam 中不等价，并提出了 AdamW
- Smith, "Cyclical Learning Rates for Training Neural Networks" (2017) —— 引入了 LR 范围测试和循环调度，消除了调整固定学习率的需要
- Ruder, "An Overview of Gradient Descent Optimization Algorithms" (2016) —— 所有优化器变体最好的单一综述，带有清晰的比较和直觉
