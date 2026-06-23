# 感知机

> 感知机是神经网络的原子。把它拆开，你会发现权重、偏置和一个决策。

**类型：** 构建
**语言：** Python
**前置知识：** 第一阶段（线性代数直觉）
**时间：** 约60分钟

## 学习目标

- 在Python中从头实现感知机，包括权重更新规则和阶跃激活函数
- 解释为什么单个感知机只能解决线性可分问题，并演示XOR失败案例
- 通过组合OR、NAND和AND门构建多层感知机来解决XOR
- 使用sigmoid激活和反向传播训练一个两层网络，自动学习XOR

## 问题

你知道向量和点积。你知道矩阵将输入转换为输出。但机器如何*学习*使用哪种变换？

感知机回答了这个问题。它是最简单的学习机器：接受一些输入，乘以权重，加偏置，然后做出二值决策。然后调整。就是这样。每个曾经构建过的神经网络都是这种思想堆叠起来的层次。

理解感知机意味着理解"学习"在代码中实际意味着什么：调整数字直到输出与真实情况匹配。

## 概念

### 一个神经元，一个决策

感知机接受n个输入，每个乘以一个权重，求和，加偏置，然后通过激活函数传递结果。

```mermaid
graph LR
    x1["x1"] -- "w1" --> sum["Σ(wi*xi) + b"]
    x2["x2"] -- "w2" --> sum
    x3["x3"] -- "w3" --> sum
    bias["偏置"] --> sum
    sum --> step["阶跃(z)"]
    step --> out["输出 (0 或 1)"]
```

阶跃函数是粗暴的：如果加权和加偏置 >= 0，输出1。否则，输出0。

```
step(z) = 1  if z >= 0
           0  if z < 0
```

这是一个线性分类器。权重和偏置定义了一条线（或更高维的超平面），将输入空间分成两个区域。

### 决策边界

对于两个输入，感知机在二维空间中画一条线：

```
  x2
  ┤
  │  类别1        /
  │    (0)        /
  │              /
  │             / w1·x1 + w2·x2 + b = 0
  │            /
  │           /     类别2
  │          /        (1)
  ┼─────────/────────── x1
```

线一侧的所有东西输出0。另一侧的所有东西输出1。训练移动这条线，直到它正确分离类别。

### 学习规则

感知机学习规则很简单：

```
对于每个训练样本 (x, y_true):
    y_pred = predict(x)
    error = y_true - y_pred

    对于每个权重：
        w_i = w_i + learning_rate * error * x_i
    偏置 = 偏置 + learning_rate * error
```

如果预测正确，error=0，什么都不变。如果预测0但应该是1，权重增加。如果预测1但应该是0，权重减少。学习率控制每次调整的大小。

### XOR问题

这是它失效的地方。看看这些逻辑门：

```
AND门：           OR门：            XOR门：
x1  x2  out         x1  x2  out         x1  x2  out
0   0   0           0   0   0           0   0   0
0   1   0           0   1   1           0   1   1
1   0   0           1   0   1           1   0   1
1   1   1           1   1   1           1   1   0
```

AND和OR是线性可分的：你可以画一条线来分开0和1。XOR不是。没有一条线可以分离[0,1]和[1,0]与[0,0]和[1,1]。

```
AND（可分离）：        XOR（不可分离）：

  x2                      x2
  1 ┤  0     1            1 ┤  1     0
    │     /                 │
  0 ┤  0 / 0              0 ┤  0     1
    ┼──/──────── x1         ┼──────────── x1
       线有效！               没有单条线有效！
```

这是一个根本限制。单个感知机只能解决线性可分问题。Minsky和Papert在1969年证明了这一点，它几乎杀死了神经网络研究十年。

解决方法：将感知机堆叠成层。多层感知机可以通过组合两个线性决策成为一个非线性决策来解决XOR。

```figure
perceptron-boundary
```

## 构建

### 第1步：感知机类

```python
class Perceptron:
    def __init__(self, n_inputs, learning_rate=0.1):
        self.weights = [0.0] * n_inputs
        self.bias = 0.0
        self.lr = learning_rate

    def predict(self, inputs):
        total = sum(w * x for w, x in zip(self.weights, inputs))
        total += self.bias
        return 1 if total >= 0 else 0

    def train(self, training_data, epochs=100):
        for epoch in range(epochs):
            errors = 0
            for inputs, target in training_data:
                prediction = self.predict(inputs)
                error = target - prediction
                if error != 0:
                    errors += 1
                    for i in range(len(self.weights)):
                        self.weights[i] += self.lr * error * inputs[i]
                    self.bias += self.lr * error
            if errors == 0:
                print(f"在第 {epoch + 1} 轮收敛")
                return
        print(f"在 {epochs} 轮后未收敛")
```

### 第2步：在逻辑门上训练

```python
and_data = [
    ([0, 0], 0),
    ([0, 1], 0),
    ([1, 0], 0),
    ([1, 1], 1),
]

or_data = [
    ([0, 0], 0),
    ([0, 1], 1),
    ([1, 0], 1),
    ([1, 1], 1),
]

not_data = [
    ([0], 1),
    ([1], 0),
]

print("=== AND门 ===")
p_and = Perceptron(2)
p_and.train(and_data)
for inputs, _ in and_data:
    print(f"  {inputs} -> {p_and.predict(inputs)}")

print("\n=== OR门 ===")
p_or = Perceptron(2)
p_or.train(or_data)
for inputs, _ in or_data:
    print(f"  {inputs} -> {p_or.predict(inputs)}")

print("\n=== NOT门 ===")
p_not = Perceptron(1)
p_not.train(not_data)
for inputs, _ in not_data:
    print(f"  {inputs} -> {p_not.predict(inputs)}")
```

### 第3步：观察XOR失败

```python
xor_data = [
    ([0, 0], 0),
    ([0, 1], 1),
    ([1, 0], 1),
    ([1, 1], 0),
]

print("\n=== XOR门（单个感知机）===")
p_xor = Perceptron(2)
p_xor.train(xor_data, epochs=1000)
for inputs, expected in xor_data:
    result = p_xor.predict(inputs)
    status = "正确" if result == expected else "错误"
    print(f"  {inputs} -> {result} (期望 {expected}) {status}")
```

它永远不会收敛。这是单个感知机无法学习XOR的确凿证明。

### 第4步：用两层解决XOR

技巧：XOR = (x1 OR x2) AND NOT (x1 AND x2)。组合三个感知机：

```mermaid
graph LR
    x1["x1"] --> OR["OR神经元"]
    x1 --> NAND["NAND神经元"]
    x2["x2"] --> OR
    x2 --> NAND
    OR --> AND["AND神经元"]
    NAND --> AND
    AND --> out["输出"]
```

```python
def xor_network(x1, x2):
    or_neuron = Perceptron(2)
    or_neuron.weights = [1.0, 1.0]
    or_neuron.bias = -0.5

    nand_neuron = Perceptron(2)
    nand_neuron.weights = [-1.0, -1.0]
    nand_neuron.bias = 1.5

    and_neuron = Perceptron(2)
    and_neuron.weights = [1.0, 1.0]
    and_neuron.bias = -1.5

    hidden1 = or_neuron.predict([x1, x2])
    hidden2 = nand_neuron.predict([x1, x2])
    output = and_neuron.predict([hidden1, hidden2])
    return output


print("\n=== XOR门（多层网络）===")
for inputs, expected in xor_data:
    result = xor_network(inputs[0], inputs[1])
    print(f"  {inputs} -> {result} (期望 {expected})")
```

所有四种情况都正确。将感知机堆叠成层，创建的决策边界是单个感知机无法产生的。

### 第5步：训练一个两层网络

第4步手工设置了权重。这对XOR有效，但对你不知道正确权重的实际问题则不然。解决方法：用sigmoid替换阶跃函数，通过反向传播自动学习权重。

```python
class TwoLayerNetwork:
    def __init__(self, learning_rate=0.5):
        import random
        random.seed(0)
        self.w_hidden = [[random.uniform(-1, 1), random.uniform(-1, 1)] for _ in range(2)]
        self.b_hidden = [random.uniform(-1, 1), random.uniform(-1, 1)]
        self.w_output = [random.uniform(-1, 1), random.uniform(-1, 1)]
        self.b_output = random.uniform(-1, 1)
        self.lr = learning_rate

    def sigmoid(self, x):
        import math
        x = max(-500, min(500, x))
        return 1.0 / (1.0 + math.exp(-x))

    def forward(self, inputs):
        self.inputs = inputs
        self.hidden_outputs = []
        for i in range(2):
            z = sum(w * x for w, x in zip(self.w_hidden[i], inputs)) + self.b_hidden[i]
            self.hidden_outputs.append(self.sigmoid(z))
        z_out = sum(w * h for w, h in zip(self.w_output, self.hidden_outputs)) + self.b_output
        self.output = self.sigmoid(z_out)
        return self.output

    def train(self, training_data, epochs=10000):
        for epoch in range(epochs):
            total_error = 0
            for inputs, target in training_data:
                output = self.forward(inputs)
                error = target - output
                total_error += error ** 2

                d_output = error * output * (1 - output)

                saved_w_output = self.w_output[:]
                hidden_deltas = []
                for i in range(2):
                    h = self.hidden_outputs[i]
                    hd = d_output * saved_w_output[i] * h * (1 - h)
                    hidden_deltas.append(hd)

                for i in range(2):
                    self.w_output[i] += self.lr * d_output * self.hidden_outputs[i]
                self.b_output += self.lr * d_output

                for i in range(2):
                    for j in range(len(inputs)):
                        self.w_hidden[i][j] += self.lr * hidden_deltas[i] * inputs[j]
                    self.b_hidden[i] += self.lr * hidden_deltas[i]
```

```python
net = TwoLayerNetwork(learning_rate=2.0)
net.train(xor_data, epochs=10000)
for inputs, expected in xor_data:
    result = net.forward(inputs)
    predicted = 1 if result >= 0.5 else 0
    print(f"  {inputs} -> {result:.4f} (四舍五入: {predicted}, 期望 {expected})")
```

与第4步的两个关键区别。首先，sigmoid替换了阶跃函数——它是平滑的，所以存在梯度。其次，`train` 方法将误差从输出反向传播到隐藏层，根据每个权重对误差的贡献比例进行调整。这就是20行代码的反向传播。

这是通往第03课的桥梁。`d_output` 和 `hidden_deltas` 背后的数学是链式法则在网络图上的应用。我们在那里会正确推导它。

## 使用

你刚刚从头构建的一切都在一个import中：

```python
from sklearn.linear_model import Perceptron as SkPerceptron
import numpy as np

X = np.array([[0,0],[0,1],[1,0],[1,1]])
y = np.array([0, 0, 0, 1])

clf = SkPerceptron(max_iter=100, tol=1e-3)
clf.fit(X, y)
print([clf.predict([x])[0] for x in X])
```

五行代码。你的30行 `Perceptron` 类做着同样的事。sklearn版本添加了收敛检查、多个损失函数和稀疏输入支持——但核心循环是相同的：加权和、阶跃函数、出错时权重更新。

真正的差距在规模上显现。生产网络中改变的内容：

- 阶跃函数变成sigmoid、ReLU或其他平滑激活函数
- 权重通过反向传播自动学习（第03课）
- 层变得更深：3层、10层、100+层
- 相同原理成立：每一层从上一层的输出创建新特征

单个感知机只能画直线。堆叠它们，你可以画出任何形状。

## 交付

本课程产出：
- `outputs/skill-perceptron.md` - 一个涵盖何时需要单层vs多层架构的技能

## 练习

1. 训练一个感知机学习NAND门（通用门——任何逻辑电路都可以从NAND构建）。验证其权重和偏置形成有效的决策边界。
2. 修改Perceptron类，跟踪每个轮次的决策边界（w1*x1 + w2*x2 + b = 0）。打印在AND门训练过程中线如何移动。
3. 构建一个3输入感知机，当3个输入中至少2个为1时输出1（多数投票函数）。这是线性可分的吗？为什么？

## 关键术语

| 术语 | 通俗说法 | 实际含义 |
|------|---------|---------|
| 感知机 | "一个假神经元" | 线性分类器：输入和权重的点积加偏置，通过阶跃函数 |
| 权重 | "输入的重要性" | 缩放每个输入对决策贡献的乘数 |
| 偏置 | "阈值" | 移动决策边界的常量，使感知机即使输入为零也能触发 |
| 激活函数 | "压缩值的东西" | 在加权和后应用的函数——感知机用阶跃函数，现代网络用sigmoid/ReLU |
| 线性可分 | "你可以在它们之间画一条线" | 数据集可以通过单个超平面完美分离类别 |
| XOR问题 | "感知机做不了的事" | 单层网络无法学习非线性可分函数的证明 |
| 决策边界 | "分类器切换的地方" | 将输入空间分成两个类别的超平面 w*x + b = 0 |
| 多层感知机 | "一个真正的神经网络" | 感知机堆叠成层，每层的输出馈入下一层的输入 |

## 扩展阅读

- Frank Rosenblatt, "The Perceptron: A Probabilistic Model for Information Storage and Organization in the Brain" (1958) -- 开启一切的开创性论文
- Minsky & Papert, "Perceptrons" (1969) -- 证明XOR无法被单层网络解决并杀死了感知机研究十年的书
- Michael Nielsen, "Neural Networks and Deep Learning", Chapter 1 (http://neuralnetworksanddeeplearning.com/) -- 免费在线，关于感知机如何组成网络的最佳视觉解释
