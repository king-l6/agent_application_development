---
name: skill-gradient-computation
description: 计算常见 ML 损失函数的梯度并选择正确的求导方法
version: 1.0.0
phase: 1
lesson: 4
tags: [calculus, gradients, backpropagation]
---

# ML 梯度计算

用于计算神经网络中使用的损失函数、激活函数和层运算梯度的实用参考。

## 决策清单

1. 函数是否由简单原语（幂、指数、对数、三角函数）组成？使用解析导数和链式法则。
2. 函数是自定义还是黑箱操作？使用数值微分：`(f(x+h) - f(x-h)) / (2h)`，取 h = 1e-7。
3. 函数是否由 PyTorch/JAX 中的张量运算构建？让 autograd 处理。用数值检查验证。
4. 你需要标量损失关于权重矩阵的梯度吗？通过计算图一次应用一个节点的链式法则。
5. 是否有不可微操作（argmax、取整、采样）？使用直通估计器或重参数化技巧。

## 何时使用每种方法

| 方法 | 何时使用 | 代价 |
|---|---|---|
| 解析法（手工推导） | 简单函数，验证 autograd 输出 | 运行时免费 |
| 数值法（有限差分） | 调试、梯度检查、黑箱函数 | n 个参数需要 2n 次前向传播 |
| 自动微分 | 任何可微计算图（默认选择） | 一次反向传播 |
| 符号法（SymPy、Mathematica） | 为论文推导闭式梯度 | 仅编译时 |

## 快速参考：常见导数

| 函数 | f(x) | f'(x) | ML 上下文 |
|---|---|---|---|
| MSE 损失 | (1/n) sum(y_hat - y)^2 | (2/n)(y_hat - y) | 回归 |
| 交叉熵（二分类） | -(y log(p) + (1-y) log(1-p)) | p - y（sigmoid 之后） | 二分类 |
| 交叉熵（多分类） | -log(p_true_class) | p - one_hot(y)（softmax 之后） | 多分类 |
| Sigmoid | 1 / (1 + e^(-x)) | sigma(x) * (1 - sigma(x)) | 输出门，二值输出 |
| Tanh | (e^x - e^(-x)) / (e^x + e^(-x)) | 1 - tanh(x)^2 | 隐藏层激活（传统） |
| ReLU | max(0, x) | 1 如果 x > 0，0 如果 x < 0 | 默认隐藏层激活 |
| Leaky ReLU | max(0.01x, x) | 1 如果 x > 0，0.01 如果 x < 0 | 避免死亡神经元 |
| GELU | x * Phi(x) | Phi(x) + x * phi(x) | Transformer |
| Softmax_i | e^(x_i) / sum(e^(x_j)) | s_i(1 - s_i) 当 i=j, -s_i*s_j 当 i!=j | 输出层（Jacobian） |
| Log-softmax | x_i - log(sum(e^(x_j))) | 对第 i 项为 1 - softmax(x_i) | 数值稳定的 CE |
| 线性层 | y = Wx + b | dL/dW = dL/dy * x^T, dL/db = dL/dy | 每一层 |
| L2 正则化 | lambda * sum(w^2) | 2 * lambda * w | 权重衰减 |
| L1 正则化 | lambda * sum(\|w\|) | lambda * sign(w) | 稀疏性 |

## 常见错误

- 忘记批平均损失（MSE、交叉熵）中的 1/n 因子。梯度按批次大小缩放。
- 将 softmax 梯度计算为向量，而它实际上是一个 Jacobian 矩阵。对于交叉熵 + softmax 的组合，梯度简化为 (p - y)，避免了完整的 Jacobian。
- 以错误的顺序应用链式法则。从损失向后推导：dL/dW = dL/dy * dy/dW。
- 数值导数使用太大（h = 0.1）或太小（h = 1e-15）的 h。对于 float64 坚持使用 h = 1e-7。
- 忘记 ReLU 在 x = 0 处梯度未定义。实践中设为 0 或 0.5。

## 梯度检查配方

```
对于每个参数 w：
  numeric_grad = (loss(w + h) - loss(w - h)) / (2h)
  auto_grad = 反向传播值
  relative_error = |numeric - auto| / max(|numeric|, |auto|, 1e-8)
  assert relative_error < 1e-5
```

相对误差超过 1e-3 表示有问题。在 1e-5 到 1e-3 之间，需要调查。
