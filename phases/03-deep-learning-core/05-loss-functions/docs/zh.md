# 损失函数

> 你的网络做出了预测。真实情况却并非如此。它错得有多离谱？这个数字就是损失。选错了损失函数，你的模型就完全优化错了方向。

**类型：** 构建
**语言：** Python
**前置知识：** 课程 03.04（激活函数）
**时间：** ~75 分钟

## 学习目标

- 从零实现 MSE、二分类交叉熵、多分类交叉熵和对比损失（InfoNCE）及其梯度
- 解释为什么 MSE 在分类任务上失败，通过展示"对所有东西预测 0.5"的失败模式
- 对交叉熵应用标签平滑，并描述它如何防止过于自信的预测
- 为回归、二分类、多分类和嵌入学习任务选择正确的损失函数

## 问题

一个在分类问题上最小化 MSE 的模型会自信地对所有东西预测 0.5。它在最小化损失。但它也是无用的。

损失函数是你的模型实际优化的唯一东西。不是准确率。不是 F1 分数。不是任何你向经理报告的指标。优化器获取损失函数的梯度并调整权重来使那个数字变小。如果损失函数没有捕捉到你关心的东西，模型会找到在数学上满足它的最廉价方式，而那方式几乎永远不会是你想要的。

这里有一个具体的例子。你有一个二分类任务。两个类别，50/50 分布。你使用 MSE 作为损失函数。模型对每个输入预测 0.5。平均 MSE 是 0.25，这是在没有真正学到任何东西的情况下的最小值。模型没有判别能力，但从技术上讲它已经最小化了你的损失函数。切换到交叉熵，同样的模型被强制将预测推向 0 或 1，因为 -log(0.5) = 0.693 是一个糟糕的损失，而 -log(0.99) = 0.01 奖励自信的正确预测。损失函数的选择是模型能学习和模型会钻指标空子之间的区别。

情况更糟。在自监督学习中，你甚至没有标签。对比损失完全定义了学习信号：什么算相似，什么算不同，以及模型应该以多大的力度将它们分开。搞错了对比损失，你的嵌入会坍缩到一个点——每个输入都映射到相同的向量。从技术上讲损失为零。完全毫无价值。

## 概念

### 均方误差（MSE）

回归的默认选择。计算预测和目标之间的平方差，对所有样本取平均。

```
MSE = (1/n) * sum((y_pred - y_true)^2)
```

为什么平方重要：它以二次方式惩罚大误差。误差 2 的代价是误差 1 的 4 倍。误差 10 的代价是 100 倍。这使得 MSE 对异常值敏感——一个疯狂错误的预测就能主导整个损失。

实际数字：如果你的模型预测房价，大多数房子误差 10,000 美元，但一栋豪宅误差 200,000 美元，MSE 会激进地试图修复那栋豪宅，可能损害其他 99 套房子的表现。

MSE 相对于预测的梯度是：

```
dMSE/dy_pred = (2/n) * (y_pred - y_true)
```

与误差呈线性关系。越大的误差获得越大的梯度。这对回归来说是一个特性（大误差需要大修正），但对分类来说是一个 bug（你希望以指数方式惩罚自信的错误答案，而不是线性方式）。

### 交叉熵损失

分类的损失函数。源于信息论——它衡量预测概率分布与真实分布之间的散度。

**二分类交叉熵（BCE）：**

```
BCE = -(y * log(p) + (1 - y) * log(1 - p))
```

其中 y 是真实标签（0 或 1），p 是预测概率。

为什么 -log(p) 有效：当真实标签为 1 且你预测 p = 0.99 时，损失是 -log(0.99) = 0.01。当你预测 p = 0.01 时，损失是 -log(0.01) = 4.6。这 460 倍的差值就是交叉熵有效的原因。它残酷地惩罚自信的错误预测，同时几乎不惩罚自信的正确预测。

梯度讲述同样的故事：

```
dBCE/dp = -(y/p) + (1-y)/(1-p)
```

当 y = 1 且 p 接近零时，梯度是 -1/p，趋近于负无穷。模型得到一个巨大的信号来修正它的错误。当 p 接近 1 时，梯度很小。已经正确，无需修正。

**多分类交叉熵：**

用于带独热编码目标的多分类。

```
CCE = -sum(y_i * log(p_i))
```

只有真实类别对损失有贡献（因为所有其他 y_i 都为零）。如果有 10 个类别且正确类别的概率为 0.1（随机猜测），损失是 -log(0.1) = 2.3。如果正确类别的概率为 0.9，损失是 -log(0.9) = 0.105。模型学习将概率质量集中在正确答案上。

### 为什么 MSE 在分类任务上失败

```mermaid
graph TD
    subgraph "MSE 在分类上"
        P1["对类别 1 预测 0.5<br/>MSE = 0.25"]
        P2["对类别 1 预测 0.9<br/>MSE = 0.01"]
        P3["对类别 1 预测 0.1<br/>MSE = 0.81"]
    end
    subgraph "交叉熵在分类上"
        C1["对类别 1 预测 0.5<br/>CE = 0.693"]
        C2["对类别 1 预测 0.9<br/>CE = 0.105"]
        C3["对类别 1 预测 0.1<br/>CE = 2.303"]
    end
    P3 -->|"MSE 梯度<br/>在饱和附近<br/>变平"| Slow["修正缓慢"]
    C3 -->|"CE 梯度<br/>在错误答案附近<br/>激增"| Fast["修正快速"]
```

当预测接近 0 或 1 时，MSE 梯度变平（由于 sigmoid 饱和）。交叉熵梯度补偿了这一点——-log 抵消了 sigmoid 的平坦区域，在最需要的地方提供强梯度。

### 标签平滑

标准的独热标签说"这 100% 是类别 3，0% 是其他所有。"这是一个强烈的声明。标签平滑使其变得柔和：

```
smooth_label = (1 - alpha) * one_hot + alpha / num_classes
```

使用 alpha = 0.1 和 10 个类别：目标变成 [0.01, 0.01, 0.91, 0.01, ...]，而不是 [0, 0, 1, 0, ...]。模型目标是 0.91 而不是 1.0。

为什么这有效：一个试图通过 softmax 输出恰好 1.0 的模型需要将 logits 推到无穷大。这会导致过度自信，损害泛化能力，并使模型对分布变化脆弱。标签平滑将目标上限设为 0.9（使用 alpha=0.1），保持 logits 在合理范围内。GPT 和大多数现代模型都使用标签平滑或其等价形式。

### 对比损失

没有标签。没有类别。只有成对的输入和这个问题：它们是相似还是不同？

**SimCLR 风格的对比损失（NT-Xent / InfoNCE）：**

取一张图片。创建它的两个增强视图（裁剪、旋转、颜色抖动）。这些是"正面对"——它们应该有相似的嵌入。批次中的其他每张图片形成"负面对"——它们应该有不同的嵌入。

```
L = -log(exp(sim(z_i, z_j) / tau) / sum(exp(sim(z_i, z_k) / tau)))
```

其中 sim() 是余弦相似度，z_i 和 z_j 是正面对，求和遍历所有负样本，tau（温度）控制分布的尖锐程度。温度越低 = 负样本越难 = 越激进的分离。

实际数字：批次大小 256 意味着每个正面对有 255 个负样本。温度 tau = 0.07（SimCLR 默认值）。损失看起来像是对相似度进行的 softmax——它希望正面对的相似度在 256 个选项中最高。

**三重损失：**

接受三个输入：锚点、正样本（同类）、负样本（不同类）。

```
L = max(0, d(anchor, positive) - d(anchor, negative) + margin)
```

边界（通常 0.2-1.0）强制正负距离之间有一个最小差距。如果负样本已经足够远，损失为零——没有梯度，没有更新。这使得训练高效，但需要仔细的三元组挖掘（选择靠近锚点的难负样本）。

### 焦点损失

用于不平衡数据集。标准交叉熵平等对待所有正确分类的样本。焦点损失降低简单样本的权重：

```
FL = -alpha * (1 - p_t)^gamma * log(p_t)
```

其中 p_t 是真实类别的预测概率，gamma 控制聚焦程度。当 gamma = 0 时，这是标准交叉熵。当 gamma = 2（默认值）时：

- 简单样本（p_t = 0.9）：权重 = (0.1)^2 = 0.01。被有效忽略。
- 困难样本（p_t = 0.1）：权重 = (0.9)^2 = 0.81。完整的梯度信号。

焦点损失由 Lin 等人为物体检测引入，其中 99% 的候选区域是背景（简单的负样本）。没有焦点损失，模型会被简单的背景样本淹没，永远学不会检测物体。有了它，模型将其能力集中在重要且困难的模棱两可的案例上。

### 损失函数决策树

```mermaid
flowchart TD
    Start["你的任务是什么？"] --> Reg{"回归？"}
    Start --> Cls{"分类？"}
    Start --> Emb{"学习嵌入？"}

    Reg -->|"是"| Outliers{"对异常值敏感？"}
    Outliers -->|"是，惩罚异常值"| MSE["使用 MSE"]
    Outliers -->|"否，对异常值鲁棒"| MAE["使用 MAE / Huber"]

    Cls -->|"二分类"| BCE["使用二分类 CE"]
    Cls -->|"多分类"| CCE["使用多分类 CE"]
    Cls -->|"不平衡"| FL["使用焦点损失"]
    CCE -->|"过度自信？"| LS["添加标签平滑"]

    Emb -->|"配对数据"| CL["使用对比损失"]
    Emb -->|"可用三元组"| TL["使用三重损失"]
    Emb -->|"大批量自监督"| NCE["使用 InfoNCE"]
```

### 损失景观

```mermaid
graph LR
    subgraph "损失曲面形状"
        MSE_S["MSE<br/>平滑抛物线<br/>单个最小值<br/>易于优化"]
        CE_S["交叉熵<br/>在错误答案附近陡峭<br/>在正确答案附近平坦<br/>在需要处有强梯度"]
        CL_S["对比损失<br/>许多局部最小值<br/>依赖批次组成<br/>温度控制尖锐度"]
    end
    MSE_S -->|"最适合"| Reg2["回归"]
    CE_S -->|"最适合"| Cls2["分类"]
    CL_S -->|"最适合"| Emb2["表示学习"]
```

```figure
cross-entropy-loss
```

## 构建

### 步骤 1：MSE 及其梯度

```python
def mse(predictions, targets):
    n = len(predictions)
    total = 0.0
    for p, t in zip(predictions, targets):
        total += (p - t) ** 2
    return total / n

def mse_gradient(predictions, targets):
    n = len(predictions)
    grads = []
    for p, t in zip(predictions, targets):
        grads.append(2.0 * (p - t) / n)
    return grads
```

### 步骤 2：二分类交叉熵

log(0) 问题是真实存在的。如果模型对正样本预测恰好为 0，log(0) = 负无穷。裁剪可以防止这个问题。

```python
import math

def binary_cross_entropy(predictions, targets, eps=1e-15):
    n = len(predictions)
    total = 0.0
    for p, t in zip(predictions, targets):
        p_clipped = max(eps, min(1 - eps, p))
        total += -(t * math.log(p_clipped) + (1 - t) * math.log(1 - p_clipped))
    return total / n

def bce_gradient(predictions, targets, eps=1e-15):
    grads = []
    for p, t in zip(predictions, targets):
        p_clipped = max(eps, min(1 - eps, p))
        grads.append(-(t / p_clipped) + (1 - t) / (1 - p_clipped))
    return grads
```

### 步骤 3：带 Softmax 的多分类交叉熵

Softmax 将原始 logits 转换为概率。然后我们计算与独热目标之间的交叉熵。

```python
def softmax(logits):
    max_val = max(logits)
    exps = [math.exp(x - max_val) for x in logits]
    total = sum(exps)
    return [e / total for e in exps]

def categorical_cross_entropy(logits, target_index, eps=1e-15):
    probs = softmax(logits)
    p = max(eps, probs[target_index])
    return -math.log(p)

def cce_gradient(logits, target_index):
    probs = softmax(logits)
    grads = list(probs)
    grads[target_index] -= 1.0
    return grads
```

softmax + 交叉熵的梯度美妙地简化了：对于真实类别，就是（预测概率 - 1），对所有其他类别，就是（预测概率）。这种优雅的简化并非巧合——这就是为什么 softmax 和交叉熵是配对使用的。

### 步骤 4：标签平滑

```python
def label_smoothed_cce(logits, target_index, num_classes, alpha=0.1, eps=1e-15):
    probs = softmax(logits)
    loss = 0.0
    for i in range(num_classes):
        if i == target_index:
            smooth_target = 1.0 - alpha + alpha / num_classes
        else:
            smooth_target = alpha / num_classes
        p = max(eps, probs[i])
        loss += -smooth_target * math.log(p)
    return loss
```

### 步骤 5：对比损失（简化的 InfoNCE）

```python
def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a < 1e-10 or norm_b < 1e-10:
        return 0.0
    return dot / (norm_a * norm_b)

def contrastive_loss(anchor, positive, negatives, temperature=0.07):
    sim_pos = cosine_similarity(anchor, positive) / temperature
    sim_negs = [cosine_similarity(anchor, neg) / temperature for neg in negatives]

    max_sim = max(sim_pos, max(sim_negs)) if sim_negs else sim_pos
    exp_pos = math.exp(sim_pos - max_sim)
    exp_negs = [math.exp(s - max_sim) for s in sim_negs]
    total_exp = exp_pos + sum(exp_negs)

    return -math.log(max(1e-15, exp_pos / total_exp))
```

### 步骤 6：MSE vs 交叉熵在分类上的比较

用两种损失函数训练课程 04 中的相同网络（圆形数据集）。观察交叉熵收敛更快。

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


class LossComparisonNetwork:
    def __init__(self, loss_type="bce", hidden_size=8, lr=0.1):
        random.seed(0)
        self.loss_type = loss_type
        self.lr = lr
        self.hidden_size = hidden_size

        self.w1 = [[random.gauss(0, 0.5) for _ in range(2)] for _ in range(hidden_size)]
        self.b1 = [0.0] * hidden_size
        self.w2 = [random.gauss(0, 0.5) for _ in range(hidden_size)]
        self.b2 = 0.0

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

    def backward(self, target):
        if self.loss_type == "mse":
            d_loss = 2.0 * (self.out - target)
        else:
            eps = 1e-15
            p = max(eps, min(1 - eps, self.out))
            d_loss = -(target / p) + (1 - target) / (1 - p)

        d_sigmoid = self.out * (1 - self.out)
        d_out = d_loss * d_sigmoid

        for i in range(self.hidden_size):
            d_relu = 1.0 if self.z1[i] > 0 else 0.0
            d_h = d_out * self.w2[i] * d_relu
            self.w2[i] -= self.lr * d_out * self.h[i]
            for j in range(2):
                self.w1[i][j] -= self.lr * d_h * self.x[j]
            self.b1[i] -= self.lr * d_h
        self.b2 -= self.lr * d_out

    def compute_loss(self, pred, target):
        if self.loss_type == "mse":
            return (pred - target) ** 2
        else:
            eps = 1e-15
            p = max(eps, min(1 - eps, pred))
            return -(target * math.log(p) + (1 - target) * math.log(1 - p))

    def train(self, data, epochs=200):
        losses = []
        for epoch in range(epochs):
            total_loss = 0.0
            correct = 0
            for x, y in data:
                pred = self.forward(x)
                self.backward(y)
                total_loss += self.compute_loss(pred, y)
                if (pred >= 0.5) == (y >= 0.5):
                    correct += 1
            avg_loss = total_loss / len(data)
            accuracy = correct / len(data) * 100
            losses.append((avg_loss, accuracy))
            if epoch % 50 == 0 or epoch == epochs - 1:
                print(f"    Epoch {epoch:3d}: loss={avg_loss:.4f}, accuracy={accuracy:.1f}%")
        return losses
```

## 使用

PyTorch 提供所有标准损失函数，内置数值稳定性：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

predictions = torch.tensor([0.9, 0.1, 0.7], requires_grad=True)
targets = torch.tensor([1.0, 0.0, 1.0])

mse_loss = F.mse_loss(predictions, targets)
bce_loss = F.binary_cross_entropy(predictions, targets)

logits = torch.randn(4, 10)
labels = torch.tensor([3, 7, 1, 9])
ce_loss = F.cross_entropy(logits, labels)
ce_smooth = F.cross_entropy(logits, labels, label_smoothing=0.1)
```

使用 `F.cross_entropy`（而不是 `F.nll_loss` 加手动 softmax）。它将 log-softmax 和负对数似然组合成一个数值稳定的操作。单独应用 softmax 然后取对数稳定性较差——你会在大的指数减法中损失精度。

对于对比学习，大多数团队使用自定义实现或像 `lightly` 或 `pytorch-metric-learning` 这样的库。核心循环总是相同的：计算成对相似度，创建正负样本的 softmax，反向传播。

## 交付

本课程产出：
- `outputs/prompt-loss-function-selector.md` —— 一个用于选择正确损失函数的可复用提示词
- `outputs/prompt-loss-debugger.md` —— 一个用于损失曲线异常时的诊断提示词

## 练习

1. 实现 Huber 损失（平滑 L1 损失），它对小误差使用 MSE，对大误差使用 MAE。训练一个预测 y = sin(x) 的回归网络，当 5% 的训练目标添加了随机噪声（异常值）时，比较 MSE 与 Huber 的最终测试误差。

2. 在二分类训练循环中添加焦点损失。创建一个不平衡数据集（90% 类别 0，10% 类别 1）。在 200 个 epoch 后，比较标准 BCE 与焦点损失 (gamma=2) 在少数类召回率上的表现。

3. 使用半难负样本挖掘实现三重损失。为 5 个类别生成 2D 嵌入数据。对每个锚点，找到仍然比正样本远的最难负样本（半难）。比较与随机三元组选择的收敛速度。

4. 运行 MSE vs 交叉熵比较，但在训练期间跟踪每层的梯度大小。绘制每个 epoch 的平均梯度范数。验证交叉熵在模型最不确定的早期 epoch 中产生更大的梯度。

5. 实现 KL 散度损失，并验证当真实分布是独热时，最小化 KL(true || predicted) 与交叉熵给出相同梯度。然后尝试软目标（如知识蒸馏），其中"真实"分布来自教师模型的 softmax 输出。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|-----------|---------|
| 损失函数 | "模型错得有多离谱" | 将预测和目标映射到一个标量的可微函数，优化器将其最小化 |
| MSE | "平均平方误差" | 预测和目标之间平方差的均值；以二次方式惩罚大误差 |
| 交叉熵 | "分类损失" | 使用 -log(p) 衡量预测概率分布与真实分布之间的散度 |
| 二分类交叉熵 | "BCE" | 两个类别的交叉熵：-(y*log(p) + (1-y)*log(1-p)) |
| 标签平滑 | "软化目标" | 将硬 0/1 目标替换为软值（例如 0.1/0.9），以防止过度自信并改善泛化 |
| 对比损失 | "拉近相似，推远不同" | 通过在嵌入空间中将相似对拉近、不相似对推远来学习表示的一种损失 |
| InfoNCE | "CLIP/SimCLR 损失" | 对相似度分数进行归一化温度标度交叉熵；将对比学习视为分类问题 |
| 焦点损失 | "不平衡数据的解决方案" | 按 (1-p_t)^gamma 加权的交叉熵，以降权简单样本并聚焦于困难样本 |
| 三重损失 | "锚点-正样本-负样本" | 在嵌入空间中将锚点推得比负样本更靠近正样本至少一个边界距离 |
| 温度 | "锐度旋钮" | logits/相似度上的标量除数，控制结果分布的峰值程度；越低越尖锐 |

## 延伸阅读

- Lin et al., "Focal Loss for Dense Object Detection" (2017) —— 引入焦点损失以处理物体检测中的极端类别不平衡（RetinaNet）
- Chen et al., "A Simple Framework for Contrastive Learning of Visual Representations" (SimCLR, 2020) —— 定义了现代对比学习流程及 NT-Xent 损失
- Szegedy et al., "Rethinking the Inception Architecture" (2016) —— 引入标签平滑作为正则化技术，现在已成为大多数大型模型的标准
- Hinton et al., "Distilling the Knowledge in a Neural Network" (2015) —— 使用软目标和 KL 散度的知识蒸馏，为模型压缩奠定了基础
