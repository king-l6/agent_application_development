# 随机过程

> 有结构的随机性。随机游走、马尔可夫链和扩散模型背后的数学。

**类型：** 学习
**语言：** Python
**前置知识：** 第一阶段，第06-07课（概率、贝叶斯）
**时间：** ~75分钟

## 学习目标

- 模拟一维和二维随机游走，验证位移的sqrt(n)缩放
- 构建马尔可夫链模拟器，并通过特征分解计算其平稳分布
- 实现Metropolis-Hastings MCMC和Langevin动力学，用于从目标分布中采样
- 将前向扩散过程与布朗运动联系起来，并解释反向过程如何生成数据

## 问题

许多AI系统涉及随时间演化的随机性。不是静态的随机性——而是有结构的、序列化的随机性，每一步都依赖于之前发生的事情。

语言模型一次生成一个标记。每个标记依赖于之前的上下文。模型输出一个概率分布，从中采样，然后继续。这就是一个随机过程。

扩散模型逐步向图像添加噪声，直到它变成纯静态噪声。然后它们反转这个过程，逐步去噪直到新图像出现。前向过程是马尔可夫链。反向过程是一个学习到的反向运行的马尔可夫链。

强化学习智能体在环境中采取行动。每个行动以某种概率导致新状态。智能体在随机世界中遵循随机策略。整个过程是一个马尔可夫决策过程。

MCMC采样——贝叶斯推理的支柱——构建一个马尔可夫链，其平稳分布是你想要采样的后验分布。

所有这些都建立在四个基础概念之上：
1. 随机游走——最简单的随机过程
2. 马尔可夫链——具有转移矩阵的结构化随机性
3. Langevin动力学——带噪声的梯度下降
4. Metropolis-Hastings——从任何分布中采样

## 概念

### 随机游走

从位置0开始。每一步，抛一枚公平硬币。正面：向右移动（+1）。反面：向左移动（-1）。

经过n步后，你的位置是n个随机+/-1值的和。期望位置是0（游走是无偏的）。但到原点的期望距离随sqrt(n)增长。

这是反直觉的。游走是公平的——没有任何方向漂移。但随着时间的推移，它离起点越来越远。经过n步后的标准差是sqrt(n)。

```
第0步：  位置 = 0
第1步：  位置 = +1 或 -1
第2步：  位置 = +2、0 或 -2
...
第100步：   到原点的期望距离 ~ 10（sqrt(100)）
第10000步： 到原点的期望距离 ~ 100（sqrt(10000)）
```

**在二维中**，游走以等概率向上、下、左、右移动。同样的sqrt(n)缩放适用于到原点的距离。路径描绘出类似分形的图案。

**为什么是sqrt(n)？** 每一步以等概率为+1或-1。经过n步后，位置S_n = X_1 + X_2 + ... + X_n，其中每个X_i是+/-1。每一步的方差为1，且步长是独立的，所以Var(S_n) = n。标准差 = sqrt(n)。根据中心极限定理，S_n / sqrt(n)收敛到标准正态分布。

这种sqrt(n)缩放处处出现在ML中。SGD噪声按1/sqrt(batch_size)缩放。嵌入维度按sqrt(d)缩放。平方根是独立随机加法的标志。

**与布朗运动的联系。** 取步长为1/sqrt(n)、单位时间n步的随机游走。当n趋近无穷大时，游走收敛到布朗运动B(t)——一种连续时间过程，其中B(t)服从均值为0、方差为t的正态分布。

布朗运动是扩散的数学基础。它模拟了流体中粒子的随机抖动、股票价格的波动，以及——关键的——扩散模型中的噪声过程。

**赌徒破产。** 从位置k开始的随机游走者，在0和N处有吸收壁。到达N之前到达0的概率是多少？对于公平游走：P(到达N) = k/N。这惊人地简单和优雅。它与鞅理论相关——公平随机游走是一个鞅（期望的未来值 = 当前值）。

### 马尔可夫链

马尔可夫链是一个根据固定概率在状态之间切换的系统。关键性质：下一个状态只依赖于当前状态，而不依赖于历史。

```
P(X_{t+1} = j | X_t = i, X_{t-1} = ...) = P(X_{t+1} = j | X_t = i)
```

这就是马尔可夫性质。这意味着你可以用一个转移矩阵P来描述整个动态系统：

```
P[i][j] = 从状态i到状态j的概率
```

P的每一行之和为1（你必须去某个地方）。

**示例——天气：**

```
状态：晴天（0），雨天（1），多云（2）

P = [[0.7, 0.1, 0.2]，    （如果晴天：70%晴天，10%雨天，20%多云）
     [0.3, 0.4, 0.3]，    （如果雨天：30%晴天，40%雨天，30%多云）
     [0.4, 0.2, 0.4]]    （如果多云：40%晴天，20%雨天，40%多云）
```

从任何状态开始。经过多次转移后，状态的分布收敛到平稳分布pi，其中pi * P = pi。这是P的特征值为1的左特征向量。

对于天气链，平稳分布可能是[0.53, 0.18, 0.29]——从长远来看，无论起始状态如何，晴天占53%的时间。

```mermaid
graph LR
    S["晴天"] -->|0.7| S
    S -->|0.1| R["雨天"]
    S -->|0.2| C["多云"]
    R -->|0.3| S
    R -->|0.4| R
    R -->|0.3| C
    C -->|0.4| S
    C -->|0.2| R
    C -->|0.4| C
```

**计算平稳分布。** 有两种方法：

1. **幂法**：将任何初始分布重复乘以P。经过足够多的迭代后，它会收敛。
2. **特征值法**：找到P的特征值为1的左特征向量。这是P^T的特征值为1的特征向量。

两种方法都要求链满足收敛条件。

**收敛条件。** 马尔可夫链收敛到唯一的平稳分布，如果它是：
- **不可约的**：每个状态可以从其他任何状态到达
- **非周期的**：链不会以固定周期循环

你在ML中遇到的大多数链都满足这两个条件。

**吸收状态。** 如果一个状态一旦进入就永远不会离开，它就是吸收态（P[i][i] = 1）。吸收马尔可夫链模拟具有终止状态的过程——游戏结束、客户流失、到达文本结束标记的标记序列。

**混合时间。** 链需要多少步才能"接近"平稳分布？形式上，从平稳分布的总变差距离降低到某个阈值以下所需的步数。快速混合 = 所需步数少。P的谱间隔（1减去第二大特征值）控制混合时间。间隔越大 = 混合越快。

### 与语言模型的联系

语言模型中的标记生成近似是一个马尔可夫过程。给定当前上下文，模型输出下一个标记上的分布。温度控制尖锐程度：

```
P(token_i) = exp(logit_i / temperature) / sum(exp(logit_j / temperature))
```

- 温度 = 1.0：标准分布
- 温度 < 1.0：更尖锐（更确定性）
- 温度 > 1.0：更平坦（更随机）
- 温度 -> 0：argmax（贪婪）

Top-k采样截断到k个最高概率的标记。Top-p（核）采样截断到累积概率超过p的最小标记集。两者都修改了马尔可夫转移概率。

### 布朗运动

随机游走的连续时间极限。位置B(t)有三个性质：
1. B(0) = 0
2. B(t) - B(s)服从均值为0、方差为t - s的正态分布（对于t > s）
3. 非重叠区间上的增量是独立的

布朗运动是连续的但处处不可微——它在每个尺度上抖动。路径在平面中具有分形维数2。

在离散模拟中，你通过以下方式近似布朗运动：

```
B(t + dt) = B(t) + sqrt(dt) * z，其中 z ~ N(0, 1)
```

sqrt(dt)缩放很重要。它来自应用于随机游走的中心极限定理。

### Langevin动力学

梯度下降找到函数的最小值。Langevin动力学找到与exp(-U(x)/T)成比例的概率分布，其中U是能量函数，T是温度。

```
x_{t+1} = x_t - dt * gradient(U(x_t)) + sqrt(2 * T * dt) * z_t
```

两个力作用于粒子：
1. **梯度力**（-dt * gradient(U)）：推向低能量（像梯度下降）
2. **随机力**（sqrt(2*T*dt) * z）：推向随机方向（探索）

在温度T = 0时，这是纯粹的梯度下降。在高温时，它几乎是一个随机游走。在合适的温度下，粒子探索能量景观，并在低能量区域花费更多时间。

**与扩散模型的联系。** 扩散模型的前向过程是：

```
x_t = sqrt(alpha_t) * x_{t-1} + sqrt(1 - alpha_t) * noise
```

这是一个马尔可夫链，逐步将数据与噪声混合。经过足够多的步骤后，x_T是纯高斯噪声。

反向过程——从噪声回到数据——也是一个马尔可夫链，但其转移概率由神经网络学习。网络学习预测每一步添加的噪声，然后减去它。

```mermaid
graph LR
    subgraph "前向过程（加噪声）"
        X0["x_0（数据）"] -->|"+ 噪声"| X1["x_1"]
        X1 -->|"+ 噪声"| X2["x_2"]
        X2 -->|"..."| XT["x_T（纯噪声）"]
    end
    subgraph "反向过程（去噪）"
        XT2["x_T（噪声）"] -->|"神经网络"| XR2["x_{T-1}"]
        XR2 -->|"神经网络"| XR1["x_{T-2}"]
        XR1 -->|"..."| XR0["x_0（生成的数据）"]
    end
```

### MCMC：马尔可夫链蒙特卡罗

有时你需要从分布p(x)中采样，这个分布你可以计算（差一个常数），但不能直接采样。贝叶斯后验是典型例子——你知道似然乘以先验，但归一化常数难以处理。

**Metropolis-Hastings** 构建了一个马尔可夫链，其平稳分布是p(x)：

1. 从某个位置x开始
2. 从提议分布Q(x'|x)提出一个新位置x'
3. 计算接受比：a = p(x') * Q(x|x') / (p(x) * Q(x'|x))
4. 以概率min(1, a)接受x'。否则停留在x处。
5. 重复。

如果Q是对称的（例如，Q(x'|x) = Q(x|x') = N(x, sigma^2)），比率简化为a = p(x') / p(x)。你只需要概率的比率——归一化常数抵消了。

在温和条件下，链保证收敛到p(x)。但如果提议太小（随机游走）或太大（高拒绝率），收敛可能很慢。调整提议是MCMC的艺术。

**为什么有效。** 接受比确保了细致平衡：在x处并移动到x'的概率等于在x'处并移动到x的概率。细致平衡意味着p(x)是链的平稳分布。所以经过足够多的步骤后，样本来自p(x)。

**实践考虑：**
- **燃烧期**：丢弃前N个样本。链需要时间从起点到达平稳分布。
- **稀疏化**：每k个样本保留一个以减少自相关。
- **多条链**：从不同的起点运行多条链。如果它们收敛到相同的分布，你就有了收敛的证据。
- **接受率**：对于d维中的高斯提议，最优接受率约为23%（Roberts & Rosenthal, 2001）。太高意味着链几乎不动。太低意味着它拒绝一切。

### AI中的随机过程

| 过程 | AI应用 |
|---------|---------------|
| 随机游走 | RL中的探索，Node2Vec嵌入 |
| 马尔可夫链 | 文本生成，MCMC采样 |
| 布朗运动 | 扩散模型（前向过程） |
| Langevin动力学 | 基于分数的生成模型，SGLD |
| 马尔可夫决策过程 | 强化学习 |
| Metropolis-Hastings | 贝叶斯推理，后验采样 |

```figure
random-walk-diffusion
```

## 构建

### 步骤1：随机游走模拟器

```python
import numpy as np

def random_walk_1d(n_steps, seed=None):
    rng = np.random.RandomState(seed)
    steps = rng.choice([-1, 1], size=n_steps)
    positions = np.concatenate([[0], np.cumsum(steps)])
    return positions


def random_walk_2d(n_steps, seed=None):
    rng = np.random.RandomState(seed)
    directions = rng.choice(4, size=n_steps)
    dx = np.zeros(n_steps)
    dy = np.zeros(n_steps)
    dx[directions == 0] = 1   # 右
    dx[directions == 1] = -1  # 左
    dy[directions == 2] = 1   # 上
    dy[directions == 3] = -1  # 下
    x = np.concatenate([[0], np.cumsum(dx)])
    y = np.concatenate([[0], np.cumsum(dy)])
    return x, y
```

一维游走存储累积和。每一步是+1或-1。经过n步后，位置是和。方差随n线性增长，所以标准差随sqrt(n)增长。

### 步骤2：马尔可夫链

```python
class MarkovChain:
    def __init__(self, transition_matrix, state_names=None):
        self.P = np.array(transition_matrix, dtype=float)
        self.n_states = len(self.P)
        self.state_names = state_names or [str(i) for i in range(self.n_states)]

    def step(self, current_state, rng=None):
        if rng is None:
            rng = np.random.RandomState()
        probs = self.P[current_state]
        return rng.choice(self.n_states, p=probs)

    def simulate(self, start_state, n_steps, seed=None):
        rng = np.random.RandomState(seed)
        states = [start_state]
        current = start_state
        for _ in range(n_steps):
            current = self.step(current, rng)
            states.append(current)
        return states

    def stationary_distribution(self):
        eigenvalues, eigenvectors = np.linalg.eig(self.P.T)
        idx = np.argmin(np.abs(eigenvalues - 1.0))
        stationary = np.real(eigenvectors[:, idx])
        stationary = stationary / stationary.sum()
        return np.abs(stationary)
```

平稳分布是P的左特征向量，特征值为1。我们通过计算P^T的特征向量来找到它（转置将左特征向量变成右特征向量）。

### 步骤3：Langevin动力学

```python
def langevin_dynamics(grad_U, x0, dt, temperature, n_steps, seed=None):
    rng = np.random.RandomState(seed)
    x = np.array(x0, dtype=float)
    trajectory = [x.copy()]
    for _ in range(n_steps):
        noise = rng.randn(*x.shape)
        x = x - dt * grad_U(x) + np.sqrt(2 * temperature * dt) * noise
        trajectory.append(x.copy())
    return np.array(trajectory)
```

梯度将x推向低能量。噪声防止它卡住。在平衡时，样本的分布与exp(-U(x)/temperature)成正比。

### 步骤4：Metropolis-Hastings

```python
def metropolis_hastings(target_log_prob, proposal_std, x0, n_samples, seed=None):
    rng = np.random.RandomState(seed)
    x = np.array(x0, dtype=float)
    samples = [x.copy()]
    accepted = 0
    for _ in range(n_samples - 1):
        x_proposed = x + rng.randn(*x.shape) * proposal_std
        log_ratio = target_log_prob(x_proposed) - target_log_prob(x)
        if np.log(rng.rand()) < log_ratio:
            x = x_proposed
            accepted += 1
        samples.append(x.copy())
    acceptance_rate = accepted / (n_samples - 1)
    return np.array(samples), acceptance_rate
```

算法提出一个新点，检查它是否有更高的概率（或以与比率成比例的概率接受），然后重复。接受率应该在23-50%左右以获得良好的混合。

## 使用

在实践中，你使用成熟的库来实现这些算法。但理解机制对于调试和调优很重要。

```python
import numpy as np

rng = np.random.RandomState(42)
walk = np.cumsum(rng.choice([-1, 1], size=10000))
print(f"最终位置：{walk[-1]}")
print(f"期望距离：{np.sqrt(10000):.1f}")
print(f"实际距离：{abs(walk[-1])}")
```

### numpy用于转移矩阵

```python
import numpy as np

P = np.array([[0.7, 0.1, 0.2],
              [0.3, 0.4, 0.3],
              [0.4, 0.2, 0.4]])

distribution = np.array([1.0, 0.0, 0.0])
for _ in range(100):
    distribution = distribution @ P

print(f"平稳分布：{np.round(distribution, 4)}")
```

将初始分布重复乘以P。经过足够多的迭代后，无论你从何处开始，它都收敛到平稳分布。这是用于寻找主导左特征向量的幂法。

### 与实际框架的联系

- **PyTorch扩散：** Hugging Face `diffusers` 中的 `DDPMScheduler` 实现了前向和反向马尔可夫链
- **NumPyro / PyMC：** 使用MCMC（NUTS采样器，改进了Metropolis-Hastings）进行贝叶斯推理
- **Gymnasium（RL）：** 环境步骤函数定义了一个马尔可夫决策过程

### 验证马尔可夫链收敛

```python
import numpy as np

P = np.array([[0.9, 0.1], [0.3, 0.7]])

eigenvalues = np.linalg.eigvals(P)
spectral_gap = 1 - sorted(np.abs(eigenvalues))[-2]
print(f"特征值：{eigenvalues}")
print(f"谱间隔：{spectral_gap:.4f}")
print(f"近似混合时间：{1/spectral_gap:.1f} 步")
```

谱间隔告诉你链忘记其初始状态的速度。间隔为0.2意味着大约5步混合。间隔为0.01意味着大约100步。在运行长模拟之前一定要检查这个——混合慢的链浪费计算资源。

## 交付

本课程产出：
- `outputs/prompt-stochastic-process-advisor.md` —— 帮助识别哪个随机过程框架适用于给定问题的提示

## 联系

| 概念 | 在哪儿出现 |
|---------|------------------|
| 随机游走 | Node2Vec图嵌入，RL中的探索 |
| 马尔可夫链 | LLM中的标记生成，MCMC采样 |
| 布朗运动 | DDPM中的前向扩散过程，基于SDE的模型 |
| Langevin动力学 | 基于分数的生成模型，随机梯度Langevin动力学（SGLD） |
| 平稳分布 | MCMC收敛目标，PageRank |
| Metropolis-Hastings | 贝叶斯后验采样，模拟退火 |
| 温度 | LLM采样，RL中的玻尔兹曼探索，模拟退火 |
| 混合时间 | MCMC的收敛速度，谱间隔分析 |
| 吸收状态 | 序列结束标记，RL中的终止状态 |
| 细致平衡 | MCMC采样器的正确性保证 |

扩散模型值得特别关注。DDPM（Ho et al., 2020）定义了一个前向马尔可夫链：

```
q(x_t | x_{t-1}) = N(x_t; sqrt(1-beta_t) * x_{t-1}, beta_t * I)
```

其中beta_t是一个噪声调度。经过T步后，x_T近似为N(0, I)。反向过程由一个预测噪声的神经网络参数化：

```
p_theta(x_{t-1} | x_t) = N(x_{t-1}; mu_theta(x_t, t), sigma_t^2 * I)
```

生成的每一步都是学习到的马尔可夫链中的一步。理解马尔可夫链意味着理解扩散模型如何以及为什么生成数据。

SGLD（随机梯度Langevin动力学）结合了小批量梯度下降和Langevin噪声。它不是计算完整梯度，而是使用随机估计并添加校准噪声。随着学习率衰减，SGLD从优化过渡到采样——你免费获得了近似的贝叶斯后验样本。这是从神经网络获得不确定性估计的最简单方法之一。

所有这些联系中的关键洞见：随机过程不仅仅是理论工具。它们是现代AI系统内部的计算机制。当你调整LLM的温度时，你就在调整一个马尔可夫链。当你训练扩散模型时，你就在学习逆转一个类似布朗运动的过程。当你运行贝叶斯推理时，你就在构建一个收敛到后验的链。

## 练习

1. **模拟1000次长度为10000步的随机游走。** 绘制最终位置的分布。验证它近似为高斯分布，均值为0，标准差为sqrt(10000) = 100。

2. **使用马尔可夫链构建文本生成器。** 在小型语料库上训练：对每个词，统计到下一个词的转移次数。构建转移矩阵。通过从链中采样来生成新句子。

3. **使用Metropolis-Hastings实现模拟退火。** 从高温开始（几乎接受一切）并逐渐冷却（只接受改进）。用它来找到具有许多局部最小值的函数的最小值。

4. **比较不同温度下的Langevin动力学。** 从双阱势U(x) = (x^2 - 1)^2中采样。在低温下，样本聚集在一个阱中。在高温下，它们分布在两个阱中。找到链在两个阱之间混合的临界温度。

5. **实现前向扩散过程。** 从一个一维信号开始（例如，正弦波）。使用线性噪声调度在100步内逐步添加噪声。展示信号如何退化为纯噪声。然后实现一个简单的去噪器逆转该过程（即使是简单的减去估计噪声的去噪器也可）。

## 关键术语

| 术语 | 人们常说的 | 实际含义 |
|------|----------------|----------------------|
| 随机游走 | "抛硬币移动" | 每一步位置以随机增量变化的过程 |
| 马尔可夫性质 | "无记忆性" | 未来只依赖于当前状态，而不依赖于历史 |
| 转移矩阵 | "概率表" | P[i][j] = 从状态i移动到状态j的概率 |
| 平稳分布 | "长期平均" | 满足pi*P = pi的分布——链的平衡态 |
| 布朗运动 | "随机抖动" | 随机游走的连续时间极限，B(t) ~ N(0, t) |
| Langevin动力学 | "带噪声的梯度下降" | 结合确定性梯度和随机扰动的更新规则 |
| MCMC | "向目标行走" | 构建其平稳分布为目标分布的马尔可夫链 |
| Metropolis-Hastings | "提议并接受/拒绝" | 使用接受比确保收敛的MCMC算法 |
| 温度 | "随机性旋钮" | 控制探索与利用之间权衡的参数 |
| 扩散过程 | "噪声进，噪声出" | 前向：逐步加噪声。反向：逐步去噪声。生成数据。 |

## 拓展阅读

- **Ho, Jain, Abbeel (2020)** —— "Denoising Diffusion Probabilistic Models." 发起扩散模型革命的DDPM论文。前向和反向马尔可夫链的清晰推导。
- **Song & Ermon (2019)** —— "Generative Modeling by Estimating Gradients of the Data Distribution." 使用Langevin动力学进行采样的基于分数的方法。
- **Roberts & Rosenthal (2004)** —— "General state space Markov chains and MCMC algorithms." MCMC何时以及为何有效的理论。
- **Norris (1997)** —— "Markov Chains." 标准教科书。涵盖收敛、平稳分布和击中时间。
- **Welling & Teh (2011)** —— "Bayesian Learning via Stochastic Gradient Langevin Dynamics." 将SGD与Langevin动力学结合，实现可扩展的贝叶斯推理。
