# Actor-Critic——A2C 与 A3C

> REINFORCE 是有噪声的。添加一个学习 `V̂(s)` 的评论家，将其从回报中减去，你就得到了一个具有相同期望但方差低得多的优势。这就是 actor-critic。A2C 同步运行它；A3C 跨线程运行它。两者都是每个现代深度 RL 方法的心智模型。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 9 · 04（TD 学习），阶段 9 · 06（REINFORCE）
**时间：** ~75 分钟

## 问题

原始 REINFORCE 有效，但方差巨大。蒙特卡洛回报 `G_t` 可以在回合之间波动一个数量级。将该噪声乘以 `∇ log π` 并取平均，产生一个梯度估计器，需要数千回合才能将策略移动与少得多的 DQN 更新相同的距离。

方差来自使用原始回报。如果你减去一个基线 `b(s_t)`——任何状态的函数，包括学习到的值——期望不变，方差下降。最好的可处理基线是 `V̂(s_t)`。现在乘以 `∇ log π` 的量是*优势*：

`A(s, a) = G - V̂(s)`

如果动作产生了高于平均的回报，它就是好的；如果低于平均，就是坏的。带学习到的评论家的 REINFORCE 就是 *actor-critic*。评论家给了演员一个低方差的教师。这是 2015 年之后每个深度策略方法（A2C、A3C、PPO、SAC、IMPALA）的基础。

## 概念

![Actor-critic：策略网络加值网络，TD 残差作为优势](../assets/actor-critic.svg)

**两个网络，一个共享损失：**

- **演员** `π_θ(a | s)`：策略。通过采样来行动。使用策略梯度训练。
- **评论家** `V_φ(s)`：从状态估计期望回报。训练以最小化 `(V_φ(s) - target)²`。

**优势。** 两种标准形式：

- *MC 优势：* `A_t = G_t - V_φ(s_t)`。无偏，方差较高。
- *TD 优势：* `A_t = r_{t+1} + γ V_φ(s_{t+1}) - V_φ(s_t)`。有偏（使用 `V_φ`），方差低得多。也称为 *TD 残差* `δ_t`。

**n 步优势。** 在两者之间插值：

`A_t^{(n)} = r_{t+1} + γ r_{t+2} + … + γ^{n-1} r_{t+n} + γ^n V_φ(s_{t+n}) - V_φ(s_t)`

`n = 1` 是纯 TD。`n = ∞` 是 MC。大多数实现中 Atari 使用 `n = 5`，MuJoCo 上的 PPO 使用 `n = 2048`。

**广义优势估计（GAE）。** Schulman 等人（2016）提出了所有 n 步优势的指数加权平均：

`A_t^{GAE} = Σ_{l=0}^{∞} (γλ)^l δ_{t+l}`

其中 `λ ∈ [0, 1]`。`λ = 0` 是 TD（低方差，高偏差）。`λ = 1` 是 MC（高方差，无偏）。`λ = 0.95` 是 2026 年的默认值——调整直到偏差/方差旋钮达到你想要的位置。

**A2C：同步优势 Actor-Critic。** 跨 `N` 个并行环境收集 `T` 步。计算每个步骤的优势。在合并的批次上更新演员和评论家。重复。A3C 的更简单、更可扩展的兄弟。

**A3C：异步优势 Actor-Critic。** Mnih 等人（2016）。产生 `N` 个工作线程，每个运行一个环境。每个工作线程在自有轨迹上本地计算梯度，然后异步地将它们应用到共享参数服务器。不需要重放缓冲区——工作线程通过运行不同的轨迹来去相关化。A3C 证明了你可以在 CPU 上进行大规模训练。在 2026 年，基于 GPU 的 A2C（批量并行环境）占主导地位，因为 GPU 需要大批量。

**组合损失。**

`L(θ, φ) = -E[ A_t · log π_θ(a_t | s_t) ]  +  c_v · E[(V_φ(s_t) - G_t)²]  -  c_e · E[H(π_θ(·|s_t))]`

三项：策略梯度损失、值回归、熵奖励。`c_v ~ 0.5`，`c_e ~ 0.01` 是规范起点。

## 构建

### 第 1 步：评论家

线性评论家 `V_φ(s) = w · features(s)` 使用 MSE 更新：

```python
def critic_update(w, x, target, lr):
    v_hat = dot(w, x)
    err = target - v_hat
    for j in range(len(w)):
        w[j] += lr * err * x[j]
    return v_hat
```

在表格环境上，评论家在几百回合内收敛。在 Atari 上，将线性评论家替换为共享 CNN 主干 + 值头。

### 第 2 步：n 步优势

给定长度为 `T` 的轨迹和自举的最终 `V(s_T)`：

```python
def compute_advantages(rewards, values, gamma=0.99, lam=0.95, last_value=0.0):
    advantages = [0.0] * len(rewards)
    gae = 0.0
    for t in reversed(range(len(rewards))):
        next_v = values[t + 1] if t + 1 < len(values) else last_value
        delta = rewards[t] + gamma * next_v - values[t]
        gae = delta + gamma * lam * gae
        advantages[t] = gae
    returns = [a + v for a, v in zip(advantages, values)]
    return advantages, returns
```

`returns` 是评论家目标。`advantages` 是乘以 `∇ log π` 的量。

### 第 3 步：组合更新

```python
for step_i, (x, a, _r, probs) in enumerate(traj):
    adv = advantages[step_i]
    target_v = returns[step_i]

    # 评论家
    critic_update(w, x, target_v, lr_v)

    # 演员
    for i in range(N_ACTIONS):
        grad_logpi = (1.0 if i == a else 0.0) - probs[i]
        for j in range(N_FEAT):
            theta[i][j] += lr_a * adv * grad_logpi * x[j]
```

在策略，每次轨迹一次更新，演员和评论家使用不同的学习率。

### 第 4 步：并行化（A3C vs A2C）

- **A3C：** 启动 `N` 个线程。每个运行自己的环境和前向传播。定期将梯度更新推送到共享主服务器。主服务器上无锁——竞争是可以的，它们只是增加噪声。
- **A2C：** 在单个进程中运行 `N` 个环境实例，将观测堆叠为 `[N, obs_dim]` 批次，批量前向传播，批量反向传播。更高的 GPU 利用率，确定性，更容易推理。2026 年的默认选择。

我们的玩具代码为清晰起见是单线程的；重写为批量 A2C 只需三行 numpy。

## 陷阱

- **演员梯度之前的评论家偏差。** 如果评论家是随机的，其基线没有信息量，你是在纯噪声上训练。在开启策略梯度之前将评论家预热几百步，或使用慢的演员学习率。
- **优势归一化。** 每批次将优势归一化到零均值/单位标准差。以接近零的成本大幅稳定训练。
- **共享主干。** 在图像输入上为演员和评论家使用共享特征提取器。使用独立的头。共享特征可以搭便车使用两种损失。
- **在策略契约。** A2C 恰好对每个数据使用一次更新。更多使用次数会使你的梯度有偏（重要性采样修正是 PPO 添加的）。
- **熵坍塌。** 没有 `c_e > 0`，策略在几百次更新内变为接近确定性并停止探索。
- **奖励尺度。** 优势幅度取决于奖励尺度。归一化奖励（例如，除以运行标准差）以保持跨任务一致的梯度幅度。

## 应用

A2C/A3C 在 2026 年很少是最终选择，但它们是后续所有改进的架构：

| 方法 | 与 A2C 的关系 |
|--------|----------------|
| PPO | A2C + 用于多轮更新的裁剪重要性比率 |
| IMPALA | A3C + V-trace 离策略修正 |
| SAC（阶段 9 · 07）| 带软值评论家的离策略 A2C（下一课）|
| GRPO（阶段 9 · 12）| 无评论家的 A2C——组相对优势 |
| DPO | 坍缩为偏好排序损失的 A2C，无需采样 |
| AlphaStar / OpenAI Five | 带联赛训练 + 模仿预训练的 A2C |

如果你在 2026 年的论文中看到"优势"，就想到 actor-critic。

## 交付物

保存为 `outputs/skill-actor-critic-trainer.md`：

```markdown
---
name: actor-critic-trainer
description: 为给定环境生成 A2C / A3C / GAE 配置，指定优势估计和损失权重。
version: 1.0.0
phase: 9
lesson: 7
tags: [rl, actor-critic, gae]
---

给定一个环境和计算预算，输出：

1. 并行化。A2C（GPU 批量）vs A3C（CPU 异步）及工作线程数。
2. 轨迹长度 T。每个环境每次更新的步数。
3. 优势估计器。n 步或 GAE(λ)；指定 λ。
4. 损失权重。`c_v`（值），`c_e`（熵），梯度裁剪。
5. 学习率。演员和评论家（如果使用单独的学习率）。

拒绝在时域 > 1000 的环境上使用单工作线程 A2C（太在策略，太慢）。拒绝在没有优势归一化的情况下交付。标记任何 `c_e = 0` 且观测熵 < 0.1 的运行项为熵坍塌。
```

## 练习

1. **简单。** 使用 MC 优势（`G_t - V(s_t)`）在 4×4 GridWorld 上训练 actor-critic。比较样本效率与课程 06 中带运行均值基线的 REINFORCE。
2. **中等。** 切换到 TD 残差优势（`r + γ V(s') - V(s)`）。测量优势批次的方差。它下降了多少？
3. **困难。** 实现 GAE(λ)。扫描 `λ ∈ {0, 0.5, 0.9, 0.95, 1.0}`。绘制最终回报 vs 样本效率。此任务的偏差/方差最佳点在哪里？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 演员 | "策略网络" | `π_θ(a\|s)`，通过策略梯度更新。 |
| 评论家 | "值网络" | `V_φ(s)`，通过 MSE 回归到回报/TD 目标更新。 |
| 优势 | "比平均好多少" | `A(s, a) = Q(s, a) - V(s)` 或其估计器。`∇ log π` 的乘数。 |
| TD 残差 | "δ" | `δ_t = r + γ V(s') - V(s)`；单步优势估计。 |
| GAE | "插值旋钮" | n 步优势的指数加权和，由 `λ` 参数化。 |
| A2C | "同步 Actor-Critic" | 跨环境批量处理；每次轨迹一个梯度步。 |
| A3C | "异步 Actor-Critic" | 工作线程将梯度推送到共享参数服务器。原始论文；2026 年不太常见。 |
| 自举 | "在时域处使用 V" | 截断轨迹，添加 `γ^n V(s_{t+n})` 以闭合求和。 |

## 延伸阅读

- [Mnih et al. (2016). 深度强化学习的异步方法](https://arxiv.org/abs/1602.01783) — A3C，原始异步 actor-critic 论文。
- [Schulman et al. (2016). 使用广义优势估计的高维连续控制](https://arxiv.org/abs/1506.02438) — GAE。
- [Sutton & Barto (2018). 第 13 章 — Actor-Critic 方法](http://incompleteideas.net/book/RLbook2020.pdf) — 基础；与第 9 章函数近似（当评论家是神经网络时）配合阅读。
- [Espeholt et al. (2018). IMPALA](https://arxiv.org/abs/1802.01561) — 带 V-trace 离策略修正的可扩展分布式 actor-critic。
- [OpenAI Baselines / Stable-Baselines3](https://stable-baselines3.readthedocs.io/) — 值得阅读的生产级 A2C/PPO 实现。
- [Konda & Tsitsiklis (2000). Actor-Critic 算法](https://papers.nips.cc/paper/1786-actor-critic-algorithms) — 双时间尺度 actor-critic 分解的基础收敛结果。
