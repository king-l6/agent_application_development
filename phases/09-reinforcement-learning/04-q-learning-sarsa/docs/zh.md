# 时序差分——Q-Learning 与 SARSA

> 蒙特卡洛等待回合结束。TD 在每一步之后通过自举下一个值估计进行更新。Q-learning 是离策略且乐观的；SARSA 是在策略且谨慎的。两者都只有一行代码。两者都支撑着本阶段中的每个深度 RL 方法。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 9 · 01（MDP），阶段 9 · 02（动态规划），阶段 9 · 03（蒙特卡洛）
**时间：** ~75 分钟

## 问题

蒙特卡洛有效，但它有两个昂贵的需求。它需要终止的回合，而且它只在最终回报到来后才更新。如果你的回合有 1,000 步，MC 等待 1,000 步才能更新任何东西。它是高方差、低偏差且在实践中缓慢的。

动态规划具有相反的特征——零方差自举备份——但需要已知模型。

时序差分（TD）学习取其中间。从一个单一的转移 `(s, a, r, s')` 出发，形成单步目标 `r + γ V(s')` 并将 `V(s)` 朝它微调。不需要模型。不需要完整回合。由于在右侧使用了近似的 `V` 而产生偏差，但方差比 MC 低得多，并且从第一步开始在线更新。

这是整个现代 RL——DQN、A2C、PPO、SAC——的支点。阶段 9 的其余部分是在本课中你将编写的单步 TD 更新之上叠加的函数近似和技巧层。

## 概念

![Q-learning vs SARSA：离策略 max vs 在策略 Q(s', a')](../assets/td.svg)

**V 的 TD(0) 更新：**

`V(s) ← V(s) + α [r + γ V(s') - V(s)]`

括号中的量是 TD 误差 `δ = r + γ V(s') - V(s)`。它是在线版本的 `G_t - V(s_t)`（在 MC 中）。收敛需要 `α` 满足 Robbins-Monro（`Σ α = ∞`，`Σ α² < ∞`）且所有状态被无限频繁访问。

**Q-learning。** 一种用于控制的离策略 TD 方法：

`Q(s, a) ← Q(s, a) + α [r + γ max_{a'} Q(s', a') - Q(s, a)]`

`max` 假设从 `s'` 开始将遵循*贪婪*策略，无论智能体实际采取什么动作。这种解耦使得 Q-learning 在智能体通过 ε-贪婪探索时学习 `Q*`。Mnih 等人（2015）将其转化为 Atari 上的深度 Q-learning（课程 05）。

**SARSA。** 一种在策略 TD 方法：

`Q(s, a) ← Q(s, a) + α [r + γ Q(s', a') - Q(s, a)]`

这个名字来自元组 `(s, a, r, s', a')`。SARSA 使用智能体*实际*采取的下一个动作 `a'`，而不是贪婪的 `argmax`。收敛到当前运行的任何 ε-贪婪 `π` 的 `Q^π`，在极限 `ε → 0` 下变为 `Q*`。

**悬崖行走差异。** 在经典的悬崖行走任务（掉下悬崖 = 奖励 -100）中，Q-learning 学会沿悬崖边缘的最优路径，但在探索期间偶尔会受到惩罚。SARSA 学会离悬崖一步之遥的更安全路径，因为它将探索噪声纳入其 Q 值中。经过训练，两者在 `ε → 0` 时都达到最优。实践中这很重要：当部署时实际发生探索时，SARSA 的行为更加保守。

**期望 SARSA。** 将 `Q(s', a')` 替换为其在 `π` 下的期望值：

`Q(s, a) ← Q(s, a) + α [r + γ Σ_{a'} π(a'|s') Q(s', a') - Q(s, a)]`

方差比 SARSA 低（没有 `a'` 的采样），相同的在策略目标。通常是现代教科书中的默认选择。

**n 步 TD 与 TD(λ)。** 通过等待 `n` 步后再自举来在 TD(0) 和 MC 之间插值。`n=1` 是 TD，`n=∞` 是 MC。TD(λ) 使用几何权重 `(1-λ)λ^{n-1}` 对所有 `n` 取平均。大多数深度 RL 使用 `n` 在 3 到 20 之间。

```figure
qlearning-gridworld
```

## 构建

### 第 1 步：在 ε-贪婪策略上的 SARSA

```python
def sarsa(env, episodes, alpha=0.1, gamma=0.99, epsilon=0.1):
    Q = defaultdict(lambda: {a: 0.0 for a in ACTIONS})

    def choose(s):
        if random() < epsilon:
            return choice(ACTIONS)
        return max(Q[s], key=Q[s].get)

    for _ in range(episodes):
        s = env.reset()
        a = choose(s)
        while True:
            s_next, r, done = env.step(s, a)
            a_next = choose(s_next) if not done else None
            target = r + (gamma * Q[s_next][a_next] if not done else 0.0)
            Q[s][a] += alpha * (target - Q[s][a])
            if done:
                break
            s, a = s_next, a_next
    return Q
```

八行代码。与 Q-learning 的*唯一*区别在于目标行。

### 第 2 步：Q-learning

```python
def q_learning(env, episodes, alpha=0.1, gamma=0.99, epsilon=0.1):
    Q = defaultdict(lambda: {a: 0.0 for a in ACTIONS})
    for _ in range(episodes):
        s = env.reset()
        while True:
            a = choose(s, Q, epsilon)
            s_next, r, done = env.step(s, a)
            target = r + (gamma * max(Q[s_next].values()) if not done else 0.0)
            Q[s][a] += alpha * (target - Q[s][a])
            if done:
                break
            s = s_next
    return Q
```

`max` 将目标与行为解耦。那一个符号就是在策略和离策略之间的区别。

### 第 3 步：学习曲线

跟踪每 100 回合的平均回报。Q-learning 在简单的确定性 GridWorld 上收敛更快；SARSA 在悬崖行走上更保守。在 `code/main.py` 的 4×4 GridWorld 上，两者在约 2,000 回合后接近最优，使用 `α=0.1, ε=0.1`。

### 第 4 步：与 DP 真实值比较

运行值迭代（课程 02）得到 `Q*`。检查 `max_{s,a} |Q_learned(s,a) - Q*(s,a)|`。一个健康的表格 TD 智能体在 10,000 回合后应在 4×4 GridWorld 上达到 `~0.5` 以内。

## 陷阱

- **初始 Q 值很重要。** 乐观初始化（对于负奖励任务 `Q = 0`）鼓励探索。悲观初始化会永久困住贪婪策略。
- **α 调度。** 固定 `α` 对非平稳问题有效。衰减 `α_n = 1/n` 理论上保证收敛，但实践中太慢——将 `α` 固定在 `[0.05, 0.3]` 并监控学习曲线。
- **ε 调度。** 从高开始（`ε=1.0`），衰减到 `ε=0.05`。"GLIE"（无限探索下极限贪婪）是收敛条件。
- **Q-learning 中的最大化偏差。** 当 `Q` 有噪声时，`max` 算子向上偏斜。导致高估——Hasselt 的双 Q-learning（课程 05 中 DDQN 使用）用两个 Q 表修复这个问题。
- **非终止回合。** TD 可以在没有终止状态的情况下学习，但你需要要么设置步数上限，要么在上限处正确处理自举。标准做法：将上限视为非终止，继续自举。
- **状态哈希。** 如果状态是元组/张量，使用可哈希的键（元组，而不是列表；取整后的浮点数元组，而不是原始值）。

## 应用

2026 年的 TD 应用场景：

| 任务 | 方法 | 原因 |
|------|--------|--------|
| 小型表格环境 | Q-learning | 直接学习最优策略。 |
| 在策略安全关键型 | SARSA / 期望 SARSA | 探索期间保守。 |
| 高维状态 | DQN（阶段 9 · 05）| 神经网络 Q 函数，带重放和目标网络。 |
| 连续动作 | SAC / TD3（阶段 9 · 07）| Q 网络上的 TD 更新；策略网络输出动作。 |
| LLM RL（基于奖励模型）| PPO / GRPO（阶段 9 · 08、12）| 使用 GAE 进行 TD 风格优势的 Actor-critic。 |
| 离线 RL | CQL / IQL（阶段 9 · 08）| 带保守正则化的 Q-learning。 |

你在 2026 年论文中读到的 90% 的"RL"都是 Q-learning 或 SARSA 的某种变体。在深入了解之前，将表格更新铭记于心。

## 交付物

保存为 `outputs/skill-td-agent.md`：

```markdown
---
name: td-agent
description: 为表格或小特征 RL 任务选择 Q-learning、SARSA 或期望 SARSA。
version: 1.0.0
phase: 9
lesson: 4
tags: [rl, td-learning, q-learning, sarsa]
---

给定一个表格或小特征环境，输出：

1. 算法。Q-learning / SARSA / 期望 SARSA / n 步变体。一句话理由，与在策略 vs 离策略和方差相关。
2. 超参数。α、γ、ε、衰减调度。
3. 初始化。Q_0 值（乐观 vs 零）及其理由。
4. 收敛诊断。目标学习曲线，如果可能则检查 `|Q - Q*|`。
5. 部署注意事项。推理时探索行为如何？是否需要 SARSA 的保守性？

拒绝将表格 TD 应用于大于 10⁶ 的状态空间。拒绝在没有最大化偏差提醒的情况下交付 Q-learning 智能体。标记任何 ε 全程保持在 1.0（没有利用阶段）训练的智能体。
```

## 练习

1. **简单。** 在 4×4 GridWorld 上实现 Q-learning 和 SARSA。绘制学习曲线（每 100 回合平均回报），共 2,000 回合。哪个收敛更快？
2. **中等。** 构建悬崖行走环境（4×12，最后一行是悬崖，奖励 -100 并重置回起点）。比较 Q-learning 和 SARSA 的最终策略。截图各自采取的路径。哪个更靠近悬崖？
3. **困难。** 实现双 Q-learning。在噪声奖励 GridWorld（每步奖励添加高斯噪声 σ=5）上，展示 Q-learning 显著高估 `V*(0,0)`，而双 Q-learning 不会。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| TD 误差 | "更新信号" | `δ = r + γ V(s') - V(s)`，自举残差。 |
| TD(0) | "单步 TD" | 每次转移后仅使用下一个状态的估计进行更新。 |
| Q-learning | "离策略 RL 入门" | 使用 `max` 对下一状态动作的 TD 更新；无论行为策略如何都学习 `Q*`。 |
| SARSA | "在策略 Q-learning" | 使用实际下一个动作的 TD 更新；学习当前 ε-贪婪 π 的 `Q^π`。 |
| 期望 SARSA | "低方差 SARSA" | 将采样的 `a'` 替换为其在 π 下的期望。 |
| GLIE | "正确的探索调度" | 极限贪婪无限探索；Q-learning 收敛所需。 |
| 自举 | "在目标中使用当前估计" | 区分 TD 和 MC 的特性。偏差的来源但大幅降低方差。 |
| 最大化偏差 | "Q-learning 高估" | 对噪声估计取 `max` 导致向上偏差；由双 Q-learning 修复。 |

## 延伸阅读

- [Watkins & Dayan (1992). Q-learning](https://link.springer.com/article/10.1007/BF00992698) — 原始论文和收敛证明。
- [Sutton & Barto (2018). 第 6 章 — 时序差分学习](http://incompleteideas.net/book/RLbook2020.pdf) — TD(0)、SARSA、Q-learning、期望 SARSA。
- [Hasselt (2010). 双 Q-learning](https://papers.nips.cc/paper_files/paper/2010/hash/091d584fced301b442654dd8c23b3fc9-Abstract.html) — 修复最大化偏差。
- [Seijen, Hasselt, Whiteson, Wiering (2009). 期望 SARSA 的理论与实证分析](https://ieeexplore.ieee.org/document/4927542) — 期望 SARSA 的动机。
- [Rummery & Niranjan (1994). 使用连接主义系统的在线 Q-learning](https://www.researchgate.net/publication/2500611_On-Line_Q-Learning_Using_Connectionist_Systems) — 提出 SARSA 的论文（当时称为"修正的连接主义 Q-learning"）。
- [Sutton & Barto (2018). 第 7 章 — n 步自举](http://incompleteideas.net/book/RLbook2020.pdf) — 将 TD(0) 推广到 TD(n)，从 Q-learning 到资格迹再到后来 PPO 中的 GAE 的路径。
