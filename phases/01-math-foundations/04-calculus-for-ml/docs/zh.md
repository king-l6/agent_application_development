# 面向机器学习的微积分

> 导数告诉你哪个方向是下坡。这就是神经网络学习所需的全部。

**类型:** 学习
**语言:** Python
**前置要求:** 阶段 1，第 01-03 课
**时间:** ~60 分钟

## 学习目标

- 计算常见机器学习函数（x^2、sigmoid、交叉熵）的数值导数和解析导数
- 从零实现梯度下降以最小化一维和二维的损失函数
- 推导线性回归模型的梯度并通过手动权重更新进行训练
- 解释 Hessian 矩阵、泰勒级数近似及其与优化方法的联系

## 问题

你有一个拥有数百万个权重的神经网络。每个权重都是一个旋钮。你需要弄清楚该朝哪个方向转动每个旋钮，使模型稍微不那么错误。微积分给了你那个方向。

没有微积分，训练神经网络就意味着尝试随机变化并希望最好。有了导数，你就能确切知道每个权重如何影响误差。你每次都以正确的方式转动每个旋钮。

## 概念

### 什么是导数？

导数衡量变化率。对于函数 y = f(x)，导数 f'(x) 告诉你：如果你将 x 微调一个极小的量，y 改变多少？

几何上，导数是某一点处切线的斜率。

**f(x) = x^2：**

| x | f(x) | f'(x) (斜率) |
|---|------|---------------|
| 0 | 0    | 0（平坦，在底部） |
| 1 | 1    | 2 |
| 2 | 4    | 4（该点切线斜率） |
| 3 | 9    | 6 |

在 x=2 处，斜率为 4。如果你将 x 向右移动一点，y 增加约 4 倍的那个量。在 x=0 处，斜率为 0。你在碗的底部。

正式定义：

```
f'(x) = lim   f(x + h) - f(x)
        h->0  -----------------
                     h
```

在代码中，你跳过极限，只使用一个非常小的 h。这就是数值导数。

### 偏导数：一次一个变量

真实函数有很多输入。神经网络损失依赖于数千个权重。偏导数保持除一个变量之外的所有变量不变，然后关于那个变量求导。

```
f(x, y) = x^2 + 3xy + y^2

df/dx = 2x + 3y     （将 y 视为常数）
df/dy = 3x + 2y     （将 x 视为常数）
```

每个偏导数回答的是：如果我微调这一个权重，损失如何变化？

### 梯度：所有偏导数的向量

梯度将所有偏导数收集到一个向量中。对于函数 f(x, y, z)，梯度为：

```
grad f = [ df/dx, df/dy, df/dz ]
```

梯度指向最陡上升的方向。要最小化一个函数，往相反方向走。

**f(x,y) = x^2 + y^2 的等高线图：**

该函数呈碗状，等高线为同心圆。最小值在 (0, 0) 处。

| 点 | grad f | -grad f（下降方向） |
|-------|--------|----------------------------|
| (1, 1) | [2, 2]（指向上坡，远离最小值） | [-2, -2]（指向下坡，朝向最小值） |
| (0, 0) | [0, 0]（平坦，在最小值） | [0, 0] |

这就是梯度下降的图示。计算梯度，取其相反方向，迈出一步。

### 与优化的联系

训练神经网络就是优化。你有一个衡量模型错误程度的损失函数 L(w1, w2, ..., wn)。你想要最小化它。

```
梯度下降更新规则：

  w_new = w_old - learning_rate * dL/dw

对于每个权重：
  1. 计算损失关于该权重的偏导数
  2. 从权重中减去它的一个小倍数
  3. 重复
```

学习率控制步长。太大你会过头。太小你只能爬行。

**损失景观（一维切片）：**

损失函数 L(w) 随着权重 w 的变化形成一条有峰有谷的曲线。

| 特征 | 描述 |
|---------|-------------|
| 全局最小值 | 整条曲线上的最低点——最佳解 |
| 局部最小值 | 比相邻点低但不是全局最低的谷 |
| 斜率 | 梯度下降从任何起点沿着坡度下坡 |

梯度下降沿着坡度下坡。它可能陷入局部最小值，但在高维空间（数百万权重）中，这很少是实际问题。

### 数值导数 vs 解析导数

有两种计算导数的方法。

解析方法：手工应用微积分规则。对于 f(x) = x^2，导数为 f'(x) = 2x。精确。快速。

数值方法：使用定义近似。对于一个很小的 h，计算 f(x+h) 和 f(x-h)，然后使用差值。

```
数值方法（中心差分）：

f'(x) ~= f(x + h) - f(x - h)
          -----------------------
                  2h

h = 0.0001 在实践中效果良好
```

数值导数更慢，但适用于任何函数。解析导数快速，但需要你推导公式。神经网络框架使用第三种方法：自动微分，它机械地计算精确导数。你将在阶段 3 中看到这一点。

### 简单函数的手工求导

这些是你在 ML 中会反复遇到的导数。

```
函数            导数            用途
--------        ----------       -------
f(x) = x^2     f'(x) = 2x      损失函数（MSE）
f(x) = wx + b  f'(w) = x        线性层（关于权重的梯度）
                f'(b) = 1        线性层（关于偏置的梯度）
                f'(x) = w        线性层（关于输入的梯度）
f(x) = e^x     f'(x) = e^x     Softmax，注意力
f(x) = ln(x)   f'(x) = 1/x     交叉熵损失
f(x) = 1/(1+e^-x)  f'(x) = f(x)(1-f(x))   Sigmoid 激活
```

对于 f(x) = x^2：

```
f(x) = x^2    f'(x) = 2x

  x    f(x)   f'(x)   含义
  -2    4      -4      斜率向左倾斜（递减）
  -1    1      -2      斜率向左倾斜（递减）
   0    0       0      平坦（最小值！）
   1    1       2      斜率向右倾斜（递增）
   2    4       4      斜率向右倾斜（递增）
```

对于 f(w) = wx + b，其中 x=3，b=1：

```
f(w) = 3w + 1    f'(w) = 3

关于 w 的导数就是 x。
如果 x 很大，w 的微小变化会引起输出的巨大变化。
```

### 链式法则

当函数复合时，链式法则告诉你如何求导。

```
如果 y = f(g(x))，则 dy/dx = f'(g(x)) * g'(x)

例子：y = (3x + 1)^2
  外层：f(u) = u^2       f'(u) = 2u
  内层：g(x) = 3x + 1    g'(x) = 3
  dy/dx = 2(3x + 1) * 3 = 6(3x + 1)
```

神经网络是函数的链条：输入 -> 线性 -> 激活 -> 线性 -> 激活 -> 损失。反向传播就是从输出到输入反复应用链式法则。这就是整个算法。

### Hessian 矩阵

梯度告诉你斜率。Hessian 告诉你曲率。

Hessian 是二阶偏导数的矩阵。对于函数 f(x1, x2, ..., xn)，Hessian 的 (i, j) 条目为：

```
H[i][j] = d^2f / (dx_i * dx_j)
```

对于二元函数 f(x, y)：

```
H = | d^2f/dx^2    d^2f/dxdy |
    | d^2f/dydx    d^2f/dy^2 |
```

**Hessian 在临界点（梯度 = 0 处）告诉你的信息：**

| Hessian 性质 | 含义 | 示例曲面 |
|-----------------|---------|-----------------|
| 正定（所有特征值 > 0） | 局部最小值 | 朝上的碗 |
| 负定（所有特征值 < 0） | 局部最大值 | 朝下的碗 |
| 不定（特征值有正有负） | 鞍点 | 马鞍形状 |

**例子：** f(x, y) = x^2 - y^2（一个鞍函数）

```
df/dx = 2x       df/dy = -2y
d^2f/dx^2 = 2    d^2f/dy^2 = -2    d^2f/dxdy = 0

H = | 2   0 |
    | 0  -2 |

特征值：2 和 -2（一正一负）
--> (0, 0) 处为鞍点
```

与 f(x, y) = x^2 + y^2（一个碗）对比：

```
H = | 2  0 |
    | 0  2 |

特征值：2 和 2（都为正）
--> (0, 0) 处为局部最小值
```

**为什么 Hessian 在 ML 中很重要：**

牛顿法使用 Hessian 采取比梯度下降更优的优化步骤。它不仅跟随斜率，还考虑了曲率：

```
牛顿法更新：    w_new = w_old - H^(-1) * gradient
梯度下降：     w_new = w_old - lr * gradient
```

牛顿法收敛更快，因为 Hessian "重新缩放"了梯度——陡峭的方向步长更小，平坦的方向步长更大。

问题在于：对于有 N 个参数的神经网络，Hessian 是 N x N 的。一个有一百万个参数的模型需要一个有 1 万亿个条目的矩阵。这就是为什么我们使用近似方法。

| 方法 | 使用什么 | 代价 | 收敛速度 |
|--------|-------------|------|-------------|
| 梯度下降 | 仅一阶导数 | 每步 O(N) | 慢（线性） |
| 牛顿法 | 完整 Hessian | 每步 O(N^3) | 快（二次） |
| L-BFGS | 从梯度历史近似 Hessian | 每步 O(N) | 中等（超线性） |
| Adam | 逐参数自适应学习率（对角 Hessian 近似） | 每步 O(N) | 中等 |
| 自然梯度 | Fisher 信息矩阵（统计 Hessian） | 每步 O(N^2) | 快 |

在实践中，Adam 是深度学习中最常用的优化器。它通过追踪每个参数梯度的运行均值和方差，廉价地近似二阶信息。

### 泰勒级数近似

任何光滑函数都可以在局部用多项式近似：

```
f(x + h) = f(x) + f'(x)*h + (1/2)*f''(x)*h^2 + (1/6)*f'''(x)*h^3 + ...
```

包含的项越多，近似越好——但只在点 x 附近。

**为什么泰勒级数对 ML 很重要：**

- **一阶泰勒 = 梯度下降。** 当你使用 f(x + h) ~ f(x) + f'(x)*h 时，你在做线性近似。梯度下降最小化这个线性模型，选择 h = -lr * f'(x)。

- **二阶泰勒 = 牛顿法。** 使用 f(x + h) ~ f(x) + f'(x)*h + (1/2)*f''(x)*h^2，你得到一个二次模型。最小化它给出 h = -f'(x)/f''(x) —— 牛顿步。

- **损失函数设计。** MSE 和交叉熵是光滑的，这意味着它们的泰勒展开表现良好。这不是巧合。光滑损失让优化变得可预测。

```
近似阶数          捕获的内容           优化方法
-------------------    -----------------   -------------------
0 阶（常数）           只有值              随机搜索
1 阶（线性）           斜率                梯度下降
2 阶（二次）           曲率                牛顿法
更高阶                更精细的结构         ML 中很少使用
```

关键洞察：所有基于梯度的优化本质上都是对损失函数进行局部近似，然后迈步到该近似的最小值。

### ML 中的积分

导数告诉你变化率。积分计算累积量——曲线下的面积。

在 ML 中，你很少手工计算积分，但这个概念无处不在：

**概率。** 对于密度为 p(x) 的连续随机变量：
```
P(a < X < b) = 从 a 到 b 对 p(x) dx 的积分
```
概率密度曲线下从 a 到 b 的面积就是在该区间取值的概率。

**期望值。** 按概率加权的平均结果：
```
E[f(X)] = f(x) * p(x) dx 的积分
```
数据分布上的期望损失就是一个积分。训练最小化了这个期望的经验近似值。

**KL 散度。** 衡量两个分布的差异程度：
```
KL(p || q) = p(x) * log(p(x) / q(x)) dx 的积分
```
用于 VAE、知识蒸馏和贝叶斯推断。

**归一化常数。** 在贝叶斯推断中：
```
p(w | data) = p(data | w) * p(w) / 对 p(data | w) * p(w) dw 的积分
```
分母是对所有可能参数值的积分。它通常难以处理，这就是为什么我们使用像 MCMC 和变分推断这样的近似方法。

| 积分概念 | 在 ML 中出现的位置 |
|-----------------|----------------------|
| 曲线下面积 | 来自密度函数的概率 |
| 期望值 | 损失函数，风险最小化 |
| KL 散度 | VAE，策略优化，蒸馏 |
| 归一化 | 贝叶斯后验，softmax 分母 |
| 边际似然 | 模型比较，证据下界（ELBO） |

### 计算图中的多元链式法则

链式法则不仅仅适用于标量函数的线性链。在神经网络中，变量会分叉和合并。以下是一个简单前向传播中导数的流动方式：

```mermaid
graph LR
    x ["x (输入)"] -->|"*w"| z1 ["z1 = w*x"]
    z1 -->|"+b"| z2 ["z2 = w*x + b"]
    z2 -->|"sigmoid"| a ["a = sigmoid(z2)"]
    a -->|"损失函数"| L ["L = -(y*log(a) + (1-y)*log(1-a))"]
```

反向传播从右到左计算梯度：

```mermaid
graph RL
    dL ["dL/dL = 1"] -->|"dL/da"| da ["dL/da = -y/a + (1-y)/(1-a)"]
    da -->|"da/dz2 = a(1-a)"| dz2 ["dL/dz2 = dL/da * a(1-a)"]
    dz2 -->|"dz2/dw = x"| dw ["dL/dw = dL/dz2 * x"]
    dz2 -->|"dz2/db = 1"| db ["dL/db = dL/dz2 * 1"]
```

每个箭头乘以局部导数。任何参数的梯度都是沿着从损失到该参数的路径上所有局部导数的乘积。当路径分支和合并时，你求和贡献（多元链式法则）。

这就是反向传播的全部：通过计算图从输出到输入系统地应用链式法则。

### Jacobian 矩阵

当一个函数将向量映射到向量（如神经网络层）时，它的导数是一个矩阵。Jacobian 包含每个输出关于每个输入的所有偏导数。

对于 f: R^n -> R^m，Jacobian J 是一个 m x n 矩阵：

| | x1 | x2 | ... | xn |
|---|---|---|---|---|
| f1 | df1/dx1 | df1/dx2 | ... | df1/dxn |
| f2 | df2/dx1 | df2/dx2 | ... | df2/dxn |
| ... | ... | ... | ... | ... |
| fm | dfm/dx1 | dfm/dx2 | ... | dfm/dxn |

你不会为神经网络手工计算 Jacobian。PyTorch 会处理它。但知道它的存在有助于你理解反向传播中的形状：如果一个层将 R^n 映射到 R^m，它的 Jacobian 是 m x n。梯度通过该矩阵的转置反向流动。

### 为什么这对神经网络很重要

神经网络中的每个权重都会得到一个梯度。梯度告诉你如何调整该权重以减小损失。

```mermaid
graph LR
    subgraph Forward["前向传播"]
        I ["输入"] --> W1 ["W1"] --> R ["relu"] --> W2 ["W2"] --> S ["softmax"] --> L ["损失"]
    end
```

```mermaid
graph RL
    subgraph Backward["反向传播"]
        dL ["dL/d损失"] --> dW2 ["dL/dW2"] --> d2 ["..."] --> dW1 ["dL/dW1"]
    end
```

每个权重更新：
- `W1 = W1 - lr * dL/dW1`
- `W2 = W2 - lr * dL/dW2`

前向传播计算预测和损失。反向传播计算损失关于每个权重的梯度。然后每个权重向下坡迈出一小步。重复数百万步。这就是深度学习。

```figure
derivative-tangent
```

## 动手实现

### 步骤 1：从零实现数值导数

```python
def numerical_derivative(f, x, h=1e-7):
    return (f(x + h) - f(x - h)) / (2 * h)

def f(x):
    return x ** 2

for x in [-2, -1, 0, 1, 2]:
    numerical = numerical_derivative(f, x)
    analytical = 2 * x
    print(f"x={x:2d}  f'(x) numerical={numerical:.6f}  analytical={analytical:.1f}")
```

数值导数与解析导数匹配到许多位小数。

### 步骤 2：偏导数和梯度

```python
def numerical_gradient(f, point, h=1e-7):
    gradient = []
    for i in range(len(point)):
        point_plus = list(point)
        point_minus = list(point)
        point_plus[i] += h
        point_minus[i] -= h
        partial = (f(point_plus) - f(point_minus)) / (2 * h)
        gradient.append(partial)
    return gradient

def f_multi(point):
    x, y = point
    return x**2 + 3*x*y + y**2

grad = numerical_gradient(f_multi, [1.0, 2.0])
print(f"Numerical gradient at (1,2): {[f'{g:.4f}' for g in grad]}")
print(f"Analytical gradient at (1,2): [2*1+3*2, 3*1+2*2] = [{2*1+3*2}, {3*1+2*2}]")
```

### 步骤 3：梯度下降寻找 f(x) = x^2 的最小值

```python
x = 5.0
lr = 0.1
for step in range(20):
    grad = 2 * x
    x = x - lr * grad
    print(f"step {step:2d}  x={x:8.4f}  f(x)={x**2:10.6f}")
```

从 x=5 开始，每一步都更接近 x=0（最小值）。

### 步骤 4：二维函数上的梯度下降

```python
def f_2d(point):
    x, y = point
    return x**2 + y**2

point = [4.0, 3.0]
lr = 0.1
for step in range(30):
    grad = numerical_gradient(f_2d, point)
    point = [p - lr * g for p, g in zip(point, grad)]
    loss = f_2d(point)
    if step % 5 == 0 or step == 29:
        print(f"step {step:2d}  point=({point[0]:7.4f}, {point[1]:7.4f})  f={loss:.6f}")
```

### 步骤 5：比较数值导数和解析导数

```python
import math

test_functions = [
    ("x^2",      lambda x: x**2,          lambda x: 2*x),
    ("x^3",      lambda x: x**3,          lambda x: 3*x**2),
    ("sin(x)",   lambda x: math.sin(x),   lambda x: math.cos(x)),
    ("e^x",      lambda x: math.exp(x),   lambda x: math.exp(x)),
    ("1/x",      lambda x: 1/x,           lambda x: -1/x**2),
]

x = 2.0
print(f"{'Function':<12} {'Numerical':>12} {'Analytical':>12} {'Error':>12}")
print("-" * 50)
for name, f, df in test_functions:
    num = numerical_derivative(f, x)
    ana = df(x)
    err = abs(num - ana)
    print(f"{name:<12} {num:12.6f} {ana:12.6f} {err:12.2e}")
```

### 步骤 6：数值计算 Hessian

```python
def hessian_2d(f, x, y, h=1e-5):
    fxx = (f(x + h, y) - 2 * f(x, y) + f(x - h, y)) / (h ** 2)
    fyy = (f(x, y + h) - 2 * f(x, y) + f(x, y - h)) / (h ** 2)
    fxy = (f(x + h, y + h) - f(x + h, y - h) - f(x - h, y + h) + f(x - h, y - h)) / (4 * h ** 2)
    return [[fxx, fxy], [fxy, fyy]]

def saddle(x, y):
    return x ** 2 - y ** 2

def bowl(x, y):
    return x ** 2 + y ** 2

H_saddle = hessian_2d(saddle, 0.0, 0.0)
H_bowl = hessian_2d(bowl, 0.0, 0.0)
print(f"Saddle Hessian: {H_saddle}")  # [[2, 0], [0, -2]] -- 符号混合
print(f"Bowl Hessian:   {H_bowl}")    # [[2, 0], [0, 2]]  -- 都为正
```

鞍函数的 Hessian 特征值为 2 和 -2（符号混合，确认是鞍点）。碗状函数的特征值为 2 和 2（都为正，确认是最小值）。

### 步骤 7：泰勒近似的实际应用

```python
import math

def taylor_approx(f, f_prime, f_double_prime, x0, h, order=2):
    result = f(x0)
    if order >= 1:
        result += f_prime(x0) * h
    if order >= 2:
        result += 0.5 * f_double_prime(x0) * h ** 2
    return result

x0 = 0.0
for h in [0.1, 0.5, 1.0, 2.0]:
    true_val = math.sin(h)
    t1 = taylor_approx(math.sin, math.cos, lambda x: -math.sin(x), x0, h, order=1)
    t2 = taylor_approx(math.sin, math.cos, lambda x: -math.sin(x), x0, h, order=2)
    print(f"h={h:.1f}  sin(h)={true_val:.4f}  order1={t1:.4f}  order2={t2:.4f}")
```

在 x0=0 附近，sin(x) ~ x（一阶泰勒）。对小 h 近似效果极好，但对大 h 会失效。这就是为什么梯度下降在较小的学习率下效果最好——每一步都假设线性近似是准确的。

### 步骤 8：为什么这对神经网络很重要

```python
import random

random.seed(42)

w = random.gauss(0, 1)
b = random.gauss(0, 1)
lr = 0.01

xs = [1.0, 2.0, 3.0, 4.0, 5.0]
ys = [3.0, 5.0, 7.0, 9.0, 11.0]

for epoch in range(200):
    total_loss = 0
    dw = 0
    db = 0
    for x, y in zip(xs, ys):
        pred = w * x + b
        error = pred - y
        total_loss += error ** 2
        dw += 2 * error * x
        db += 2 * error
    dw /= len(xs)
    db /= len(xs)
    total_loss /= len(xs)
    w -= lr * dw
    b -= lr * db
    if epoch % 40 == 0 or epoch == 199:
        print(f"epoch {epoch:3d}  w={w:.4f}  b={b:.4f}  loss={total_loss:.6f}")

print(f"\nLearned: y = {w:.2f}x + {b:.2f}")
print(f"Actual:  y = 2x + 1")
```

每个基于梯度的训练循环都遵循这个模式：预测，计算损失，计算梯度，更新权重。

## 实际使用

使用 NumPy，相同的操作更快速、更简洁：

```python
import numpy as np

x = np.array([1, 2, 3, 4, 5], dtype=float)
y = np.array([3, 5, 7, 9, 11], dtype=float)

w, b = np.random.randn(), np.random.randn()
lr = 0.01

for epoch in range(200):
    pred = w * x + b
    error = pred - y
    loss = np.mean(error ** 2)
    dw = np.mean(2 * error * x)
    db = np.mean(2 * error)
    w -= lr * dw
    b -= lr * db

print(f"Learned: y = {w:.2f}x + {b:.2f}")
```

你刚刚从零构建了梯度下降。PyTorch 自动化了梯度计算，但更新循环是相同的。

## 练习

1. 实现 `numerical_second_derivative(f, x)`，对 `numerical_derivative` 调用两次。验证 x^3 在 x=2 处的二阶导数为 12。
2. 使用梯度下降求 f(x, y) = (x - 3)^2 + (y + 1)^2 的最小值。从 (0, 0) 开始。答案应收敛到 (3, -1)。
3. 为梯度下降循环添加动量：维护一个累积过去梯度的速度向量。比较在 f(x) = x^4 - 3x^2 上使用和不使用动量的收敛速度。

## 关键术语

| 术语 | 人们怎么说 | 实际含义 |
|------|----------------|----------------------|
| 导数 | "斜率" | 函数在某一点的变化率。告诉你每单位输入变化导致输出变化多少。 |
| 偏导数 | "一个变量的导数" | 关于一个变量的导数，其他所有变量保持不变。 |
| 梯度 | "最陡上升方向" | 所有偏导数的向量。指向函数增加最快的方向。 |
| 梯度下降 | "走下坡" | 从参数中减去梯度（乘以学习率）以减少损失。神经网络训练的核心。 |
| 学习率 | "步长" | 控制每次梯度下降步长大小的标量。太大：发散。太小：收敛缓慢。 |
| 链式法则 | "乘导数" | 复合函数求导法则：df/dx = df/dg * dg/dx。反向传播的数学基础。 |
| Jacobian | "导数矩阵" | 当函数将向量映射到向量时，Jacobian 是输出关于输入的所有偏导数的矩阵。 |
| 数值导数 | "有限差分" | 通过在两个邻近点评估函数并计算它们之间的斜率来近似导数。 |
| 反向传播 | "反向模式自动微分" | 使用链式法则从输出到输入逐层计算梯度。神经网络学习的方式。 |
| Hessian | "二阶导数矩阵" | 所有二阶偏导数的矩阵。描述函数的曲率。临界点处正定 Hessian 意味着局部最小值。 |
| 泰勒级数 | "多项式近似" | 使用函数的导数在一点附近近似它：f(x+h) ~ f(x) + f'(x)h + (1/2)f''(x)h^2 + ... 理解梯度下降和牛顿法为何有效的基础。 |
| 积分 | "曲线下面积" | 一定范围内数量的累积。在 ML 中，积分定义了概率、期望值和 KL 散度。 |

## 延伸阅读

- [3Blue1Brown：微积分的本质](https://www.3blue1brown.com/topics/calculus) —— 导数、积分和链式法则的可视化直觉
- [Stanford CS231n：反向传播](https://cs231n.github.io/optimization-2/) —— 梯度如何流过神经网络层
