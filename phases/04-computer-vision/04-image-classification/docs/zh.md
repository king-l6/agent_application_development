# 图像分类

> 分类器是一个从像素到类别概率分布的函数。其他一切都是管道。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 2 第 09 课（模型评估）、阶段 3 第 10 课（Mini 框架）、阶段 4 第 03 课（CNN）
**时间：** ~75 分钟

## 学习目标

- 在 CIFAR-10 上构建端到端的图像分类流水线：数据集、数据增强、模型、训练循环、评估
- 解释每个组件（数据加载器、损失、优化器、调度器、数据增强）的作用，并预测破坏其中任何一个会在损失曲线上如何表现
- 从零实现 mixup、cutout 和标签平滑，并说明每种方法何时值得添加
- 读取混淆矩阵和每类精度/召回率表，以诊断聚合准确率之外的模型和数据集故障

## 问题

每个交付的视觉任务在某种程度上都归结为图像分类。检测对区域进行分类。分割对像素进行分类。检索通过类质心的相似度进行排序。把分类做好——数据集循环、数据增强策略、损失、评估——是转移到本阶段每个其他任务的技能。

大多数分类 bug 不在模型中。它们存在于流水线中：损坏的归一化、未打乱的训练集、扭曲标签的数据增强、被训练数据污染的验证集、在 30 个 epoch 后静默发散的学习率。一个在正确设置下能在 CIFAR-10 上达到 93% 的 CNN，在损坏的流水线下通常只能得到 70-75%，而损失曲线看起来一直很合理。

本课手动连接整个流水线，使每个部分都可检查。你将不会使用任何可能隐藏 bug 的 `torchvision.datasets` 功能。

## 概念

### 分类流水线

```mermaid
flowchart LR
    A["数据集<br/>(图像 + 标签)"] --> B["数据增强<br/>(随机变换)"]
    B --> C["归一化<br/>(均值/标准差)"]
    C --> D["DataLoader<br/>(批处理 + 打乱)"]
    D --> E["模型<br/>(CNN)"]
    E --> F["Logits<br/>(N, C)"]
    F --> G["交叉熵损失"]
    F --> H["Argmax<br/>评估时"]
    G --> I["反向传播"]
    I --> J["优化器步进"]
    J --> K["调度器步进"]
    K --> E

    style A fill:#dbeafe,stroke:#2563eb
    style E fill:#fef3c7,stroke:#d97706
    style G fill:#fecaca,stroke:#dc2626
    style H fill:#dcfce7,stroke:#16a34a
```

这个循环中的每一行都可能是 bug 的藏身之处。交叉熵接收原始 logits，而不是 softmax 输出，所以在损失之前任何 `model(x).softmax()` 都会静默计算错误的梯度。数据增强仅应用于输入而不是标签——除了 mixup，它同时混合两者。`optimizer.zero_grad()` 必须在每一步发生一次；跳过它会累积梯度并看起来像一个疯狂不稳定的学习率。这些 bug 中的每一个都会在不抛出异常的情况下压平学习曲线。

### 交叉熵、logits 和 softmax

分类器为每张图像产生 `C` 个数字，称为 logits。应用 softmax 将它们转换为概率分布：

```
softmax(z)_i = exp(z_i) / sum_j exp(z_j)
```

交叉熵测量正确类别的负对数概率：

```
CE(z, y) = -log( softmax(z)_y )
        = -z_y + log( sum_j exp(z_j) )
```

右边的形式是数值稳定的形式（log-sum-exp）。PyTorch 的 `nn.CrossEntropyLoss` 在一个操作中融合了 softmax + NLL，并直接接收原始 logits。自己先应用 softmax 几乎总是一个 bug——你计算的是 log(softmax(softmax(z)))，一个无意义的量。

### 为什么数据增强有效

CNN 有平移的归纳偏差（来自权重共享），但对裁剪、翻转、颜色抖动或遮挡没有内置的不变性。教授这些不变性的唯一方法是向它展示使用它们的像素。训练期间的每个随机变换都是在说："这两张图像有相同的标签；学习忽略差异的特征。"

```
原始裁剪：   "面朝左的狗"
翻转：       "面朝右的狗"       <- 相同标签，不同像素
旋转(+15)：   "狗，轻微倾斜"
颜色抖动：   "暖光下的狗"
随机擦除：   "有块缺失的狗"
```

规则：数据增强必须保留标签。Cutout 和旋转在数字上可以将"6"变成"9"；对于那个数据集，你使用较小的旋转范围，并选择尊重数字特定不变性的数据增强。

### Mixup 和 CutMix

普通数据增强变换像素但保持标签为 one-hot。**Mixup** 和 **cutmix** 通过插值两者来打破这一点。

```
Mixup：
  lambda ~ Beta(a, a)
  x = lambda * x_i + (1 - lambda) * x_j
  y = lambda * y_i + (1 - lambda) * y_j

CutMix：
  将 x_j 中的一个随机矩形粘贴到 x_i 中
  y = 面积加权的 y_i 和 y_j 混合
```

为什么有帮助：模型停止记忆尖锐的 one-hot 目标，并学习在类别之间插值。训练损失上升，测试准确率上升。这是任何分类器最便宜的鲁棒性升级。

### 标签平滑

Mixup 的同类。不再针对 `[0, 0, 1, 0, 0]` 训练，而是针对 `[eps/C, eps/C, 1-eps, eps/C, eps/C]` 训练，其中 `eps` 为 0.1 这样的小值。阻止模型产生任意尖锐的 logits，并以几乎零成本改善校准。自 PyTorch 1.10 起内置于 `nn.CrossEntropyLoss(label_smoothing=0.1)`。

### 超越准确率的评估

聚合准确率掩盖了不平衡。一个总是预测多数类的 90-10 二元分类器得分为 90%。真正告诉你发生了什么的是：

- **每类准确率** — 每类一个数字；立即显现表现不佳的类别。
- **混淆矩阵** — C x C 网格，第 i 行第 j 列 = 真实类 i 被预测为类 j 的计数；对角线是正确的，非对角线是你的模型出错的地方。
- **Top-1 / Top-5** — 正确类别是否在前 1 或前 5 个预测中；Top-5 对 ImageNet 很重要，因为像"Norwich terrier"与"Norfolk terrier"这样的类别确实模糊不清。
- **校准 (ECE)** — 0.8 置信度的预测有 80% 的时间正确吗？现代网络系统性地过度自信；通过温度缩放或标签平滑修复。

```figure
receptive-field
```

## 构建

### 步骤 1：确定性的合成数据集

CIFAR-10 存储在磁盘上。为了使本课程可重复且快速，我们构建一个看起来像 CIFAR 的合成数据集——32x32 RGB 图像，具有模型必须学习的类特定结构。完全相同的流水线在真实 CIFAR-10 上无需更改即可工作。

```python
import numpy as np
import torch
from torch.utils.data import Dataset


def synthetic_cifar(num_per_class=1000, num_classes=10, seed=0):
    rng = np.random.default_rng(seed)
    X = []
    Y = []
    for c in range(num_classes):
        centre = rng.uniform(0, 1, (3,))
        freq = 2 + c
        for _ in range(num_per_class):
            yy, xx = np.meshgrid(np.linspace(0, 1, 32), np.linspace(0, 1, 32), indexing="ij")
            r = np.sin(xx * freq) * 0.5 + centre[0]
            g = np.cos(yy * freq) * 0.5 + centre[1]
            b = (xx + yy) * 0.5 * centre[2]
            img = np.stack([r, g, b], axis=-1)
            img += rng.normal(0, 0.08, img.shape)
            img = np.clip(img, 0, 1)
            X.append(img.astype(np.float32))
            Y.append(c)
    X = np.stack(X)
    Y = np.array(Y)
    idx = rng.permutation(len(X))
    return X[idx], Y[idx]


class ArrayDataset(Dataset):
    def __init__(self, X, Y, transform=None):
        self.X = X
        self.Y = Y
        self.transform = transform

    def __len__(self):
        return len(self.X)

    def __getitem__(self, i):
        img = self.X[i]
        if self.transform is not None:
            img = self.transform(img)
        img = torch.from_numpy(img).permute(2, 0, 1)
        return img, int(self.Y[i])
```

每个类都有自己的调色板和频率模式，加上高斯噪声，迫使模型学习信号而不是记忆像素。十个类别，每个类别一千张图像，已排列。

### 步骤 2：归一化和数据增强

每个视觉流水线都有的两个变换。

```python
def standardize(mean, std):
    mean = np.array(mean, dtype=np.float32)
    std = np.array(std, dtype=np.float32)
    def _fn(img):
        return (img - mean) / std
    return _fn


def random_hflip(p=0.5):
    def _fn(img):
        if np.random.random() < p:
            return img[:, ::-1, :].copy()
        return img
    return _fn


def random_crop(pad=4):
    def _fn(img):
        h, w = img.shape[:2]
        padded = np.pad(img, ((pad, pad), (pad, pad), (0, 0)), mode="reflect")
        y = np.random.randint(0, 2 * pad)
        x = np.random.randint(0, 2 * pad)
        return padded[y:y + h, x:x + w, :]
    return _fn


def compose(*fns):
    def _fn(img):
        for fn in fns:
            img = fn(img)
        return img
    return _fn
```

裁剪前使用反射填充，而不是零填充，因为黑色边界是模型会以一种无用的方式学会忽略的信号。

### 步骤 3：Mixup

在训练步骤内部混合两张图像和两个标签。作为批次变换实现，使其位于前向传递附近，而不是数据集内部。

```python
def mixup_batch(x, y, num_classes, alpha=0.2):
    if alpha <= 0:
        return x, torch.nn.functional.one_hot(y, num_classes).float()
    lam = float(np.random.beta(alpha, alpha))
    idx = torch.randperm(x.size(0), device=x.device)
    x_mixed = lam * x + (1 - lam) * x[idx]
    y_onehot = torch.nn.functional.one_hot(y, num_classes).float()
    y_mixed = lam * y_onehot + (1 - lam) * y_onehot[idx]
    return x_mixed, y_mixed


def soft_cross_entropy(logits, soft_targets):
    log_probs = torch.log_softmax(logits, dim=-1)
    return -(soft_targets * log_probs).sum(dim=-1).mean()
```

`soft_cross_entropy` 是针对软标签分布的交叉熵。当目标恰好是 one-hot 时，它简化为通常的 one-hot 情况。

### 步骤 4：训练循环

完整的配方：一次数据遍历，每批次一次梯度，每个 epoch 步进一次调度器。

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.optim import SGD
from torch.optim.lr_scheduler import CosineAnnealingLR

def train_one_epoch(model, loader, optimizer, device, num_classes, use_mixup=True):
    model.train()
    total, correct, loss_sum = 0, 0, 0.0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        if use_mixup:
            x_m, y_soft = mixup_batch(x, y, num_classes)
            logits = model(x_m)
            loss = soft_cross_entropy(logits, y_soft)
        else:
            logits = model(x)
            loss = nn.functional.cross_entropy(logits, y, label_smoothing=0.1)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        loss_sum += loss.item() * x.size(0)
        total += x.size(0)
        # 使用 mixup 时，针对未混合标签 y 的训练准确率只是一个近似值。
        # 将其视为粗略的进度信号；依靠验证准确率了解真实性能。
        with torch.no_grad():
            pred = logits.argmax(dim=-1)
            correct += (pred == y).sum().item()
    return loss_sum / total, correct / total


@torch.no_grad()
def evaluate(model, loader, device, num_classes):
    model.eval()
    total, correct = 0, 0
    loss_sum = 0.0
    cm = torch.zeros(num_classes, num_classes, dtype=torch.long)
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss = nn.functional.cross_entropy(logits, y)
        pred = logits.argmax(dim=-1)
        for t, p in zip(y.cpu(), pred.cpu()):
            cm[t, p] += 1
        loss_sum += loss.item() * x.size(0)
        total += x.size(0)
        correct += (pred == y).sum().item()
    return loss_sum / total, correct / total, cm
```

每次编写训练循环时检查的五个不变性：

1. 训练前 `model.train()`，评估前 `model.eval()`——翻转 dropout 和批归一化行为。
2. `.backward()` 前 `.zero_grad()`。
3. 累积指标时使用 `.item()`，以免保持计算图存活。
4. 评估期间使用 `@torch.no_grad()`——节省内存和时间，防止细微错误。
5. 对原始 logits 使用 Argmax，而不是 softmax——相同结果，少一个操作。

### 步骤 5：整合在一起

使用上一课的 `TinyResNet`，训练几个 epoch，进行评估。

```python
from main import synthetic_cifar, ArrayDataset
from main import standardize, random_hflip, random_crop, compose
from main import mixup_batch, soft_cross_entropy
from main import train_one_epoch, evaluate
# TinyResNet 来自上一课（03-cnns-lenet-to-resnet）。
# 调整导入路径到存储上一课代码的位置。
from cnns_lenet_to_resnet import TinyResNet  # 示例占位符

X, Y = synthetic_cifar(num_per_class=500)
split = int(0.9 * len(X))
X_train, Y_train = X[:split], Y[:split]
X_val, Y_val = X[split:], Y[split:]

mean = [0.5, 0.5, 0.5]
std = [0.25, 0.25, 0.25]
train_tf = compose(random_hflip(), random_crop(pad=4), standardize(mean, std))
eval_tf = standardize(mean, std)

train_ds = ArrayDataset(X_train, Y_train, transform=train_tf)
val_ds = ArrayDataset(X_val, Y_val, transform=eval_tf)

train_loader = DataLoader(train_ds, batch_size=128, shuffle=True, num_workers=0)
val_loader = DataLoader(val_ds, batch_size=256, shuffle=False, num_workers=0)

device = "cuda" if torch.cuda.is_available() else "cpu"
model = TinyResNet(num_classes=10).to(device)
optimizer = SGD(model.parameters(), lr=0.1, momentum=0.9, weight_decay=5e-4, nesterov=True)
scheduler = CosineAnnealingLR(optimizer, T_max=10)

for epoch in range(10):
    tr_loss, tr_acc = train_one_epoch(model, train_loader, optimizer, device, 10, use_mixup=True)
    va_loss, va_acc, _ = evaluate(model, val_loader, device, 10)
    scheduler.step()
    print(f"epoch {epoch:2d}  lr {scheduler.get_last_lr()[0]:.4f}  "
          f"train {tr_loss:.3f}/{tr_acc:.3f}  val {va_loss:.3f}/{va_acc:.3f}")
```

在合成数据集上，这会在五个 epoch 内达到接近完美的验证准确率，这正是目的：流水线是正确的，模型可以学习可学习的内容。将数据集换成真实的 CIFAR-10，相同的循环无需更改即可训练到约 90%。

### 步骤 6：读取混淆矩阵

仅靠准确率永远不能告诉你模型在哪里失败。混淆矩阵可以。

```python
def print_confusion(cm, labels=None):
    c = cm.shape[0]
    labels = labels or [str(i) for i in range(c)]
    print(f"{'':>6}" + "".join(f"{l:>5}" for l in labels))
    for i in range(c):
        row = cm[i].tolist()
        print(f"{labels[i]:>6}" + "".join(f"{v:>5}" for v in row))
    print()
    tp = cm.diag().float()
    fp = cm.sum(dim=0).float() - tp
    fn = cm.sum(dim=1).float() - tp
    prec = tp / (tp + fp).clamp_min(1)
    rec = tp / (tp + fn).clamp_min(1)
    f1 = 2 * prec * rec / (prec + rec).clamp_min(1e-9)
    for i in range(c):
        print(f"{labels[i]:>6}  prec {prec[i]:.3f}  rec {rec[i]:.3f}  f1 {f1[i]:.3f}")

_, _, cm = evaluate(model, val_loader, device, 10)
print_confusion(cm)
```

行是真实类别，列是预测。类别 3 和 5 之间的非对角线计数集群意味着模型混淆了这两个类别，为你提供了针对性数据收集或类特定数据增强的起点。

## 使用

`torchvision` 将以上所有内容包装成惯用组件。对于真实的 CIFAR-10，完整流水线是四行代码加上一个训练循环。

```python
from torchvision.datasets import CIFAR10
from torchvision.transforms import Compose, RandomCrop, RandomHorizontalFlip, ToTensor, Normalize

mean = (0.4914, 0.4822, 0.4465)
std = (0.2470, 0.2435, 0.2616)
train_tf = Compose([
    RandomCrop(32, padding=4, padding_mode="reflect"),
    RandomHorizontalFlip(),
    ToTensor(),
    Normalize(mean, std),
])
eval_tf = Compose([ToTensor(), Normalize(mean, std)])

train_ds = CIFAR10(root="./data", train=True,  download=True, transform=train_tf)
val_ds   = CIFAR10(root="./data", train=False, download=True, transform=eval_tf)
```

两件需要注意的事情：均值/标准差是**数据集特定的**——在 CIFAR-10 训练集上计算的，而不是 ImageNet——并且反射填充是社区默认的裁剪策略。在这里复制粘贴 ImageNet 统计量是一个约 1% 的准确率泄漏，直到有人分析模型之前没人会发现。

## 交付

本课程产出：

- `outputs/prompt-classifier-pipeline-auditor.md` — 一个提示词，审计训练脚本的上述五个不变性，并暴露第一个违规。
- `outputs/skill-classification-diagnostics.md` — 一个技能，给定混淆矩阵和类名列表，总结每类失败并提出单个最有影响力的修复。

## 练习

1. **（简单）** 在合成数据集上，使用和不使用 mixup 分别训练相同模型五个 epoch。绘制两者的训练和验证损失。解释为什么使用 mixup 时训练损失更高，但验证准确率相似或更好。
2. **（中等）** 实现 Cutout——在每个训练图像中随机将 8x8 正方形置零——并进行消融实验，对比无数据增强、hflip+crop、hflip+crop+cutout、hflip+crop+mixup。报告每种方法的验证准确率。
3. **（困难）** 构建 CIFAR-100 流水线（100 个类别，相同输入尺寸）并将 ResNet-34 训练运行复现到已发表准确率的 1% 以内。额外：扫描三个学习率和两个权重衰减，记录到本地 CSV，生成最终的混淆矩阵顶部混淆表。

## 关键术语

| 术语 | 人们的说法 | 实际含义 |
|------|----------------|----------------------|
| Logits | "原始输出" | 每张图像 C 个数字的 softmax 前向量；交叉熵期望这些，而不是 softmax 后的值 |
| 交叉熵 | "损失" | 正确类别的负对数概率；在一个稳定操作中组合 log-softmax 和 NLL |
| DataLoader | "批处理器" | 用打乱、批处理和（可选的）多工作线程加载包装数据集；一半训练 bug 的替罪羊 |
| 数据增强 | "随机变换" | 训练期间任何保持标签的像素级变换；教授 CNN 原生不具有的不变性 |
| Mixup / CutMix | "混合两张图像" | 混合输入和标签，使分类器学习平滑插值而不是硬边界 |
| 标签平滑 | "更软的目标" | 将 one-hot 替换为 (1-eps, eps/(C-1), ...)；改善校准并略微提升准确率 |
| Top-k 准确率 | "Top-5" | 正确类别在 k 个最高概率预测中；用于类别确实模糊的数据集 |
| 混淆矩阵 | "错误所在之处" | C x C 表格，其中条目 (i, j) 统计真实类 i 被预测为 j 的图像数量；对角线是对的，非对角线告诉你修复什么 |

## 延伸阅读

- [CS231n: Training Neural Networks](https://cs231n.github.io/neural-networks-3/) — 仍然是单页上训练流水线最清晰的导览
- [Bag of Tricks for Image Classification (He et al., 2019)](https://arxiv.org/abs/1812.01187) — 每个小技巧合起来在 ImageNet 上为 ResNet 增加 3-4% 的准确率
- [mixup: Beyond Empirical Risk Minimization (Zhang et al., 2017)](https://arxiv.org/abs/1710.09412) — 原始的 mixup 论文；三页理论加令人信服的实验
- [Why temperature scaling matters (Guo et al., 2017)](https://arxiv.org/abs/1706.04599) — 证明现代网络校准错误并用一个标量参数修复的论文
