# 动态规划——策略迭代与值迭代

> 动态规划是开了作弊器的强化学习。你已知转移函数和奖励函数，只需迭代贝尔曼方程直到 `V` 或 `π` 不再变化。它是每个基于采样的方法努力逼近的基准。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 9 · 01（MDP）
**时间：** ~75 分钟

## 问题

你有一个已知模型的 MDP：你可以查询任意状态-动作对的 `P(s' | s, a)` 和 `R(s, a, s')`。库存管理员知道需求分布。棋盘游戏具有确定性转移。网格世界只是四行 Python 代码。你拥有一个*模型*。

无模型 RL（Q-learning、PPO、REINFORCE）的发明是为了处理你没有模型的情况——你只能从环境中采样。但当你有模型时，存在更快、更好的方法：动态规划。贝尔曼在 1957 年设计了它们。它们至今定义着正确性：当人们说"这个 MDP 的最优策略"时，他们指的是 DP 会返回的策略。

你在 2026 年需要它们有三个原因。首先，RL 研究中的每个表格环境（GridWorld、FrozenLake、CliffWalking）都用 DP 求解以产生黄金标准策略。其次，精确的值让你可以*调试*采样方法：如果 Q-learning 对 `V*(s_0)` 的估计与 DP 答案相差 30%，你的 Q-learning 有 bug。第三，现代离线 RL 和规划方法（MCTS、AlphaZero 的搜索、阶段 9 · 10 中的基于模型 RL）都在学习或给定的模型上迭代贝尔曼备份。

## 概念

![策略迭代与值迭代，并列对比](../assets/dp.svg)

**两种算法，都是对贝尔曼方程的不动点迭代。**

**策略迭代。** 交替执行两个步骤，直到策略不再改变。

1. *评估：* 给定策略 `π`，重复应用 `V(s) ← Σ_a π(a|s) Σ_{s',r} P(s',r|s,a) [r + γ V(s')]` 直到收敛，计算 `V^π`。
2. *改进：* 给定 `V^π`，使 `π` 相对于 `V^π` 贪婪：`π(s) ← argmax_a Σ_{s',r} P(s',r|s,a) [r + γ V(s')]`。

收敛是有保证的，因为 (a) 每次改进步骤要么保持 `π` 不变，要么严格增加某些状态的 `V^π`，(b) 确定性策略空间是有限的。即使对于大型状态空间，通常也在 ~5–20 次外部迭代内收敛。

**值迭代。** 将评估和改进合并为一次扫描。应用贝尔曼*最优性*方程：

`V(s) ← max_a Σ_{s',r} P(s',r|s,a) [r + γ V(s')]`

重复直到 `max_s |V_{new}(s) - V(s)| < ε`。最后通过取贪婪动作提取策略。每次迭代严格更快——没有内部评估循环——但通常需要更多迭代才能收敛。

**广义策略迭代（GPI）。** 统一的框架。值函数和策略被锁定在双向改进循环中；任何驱动两者走向相互一致的方法（异步值迭代、修正策略迭代、Q-learning、actor-critic、PPO）都是 GPI 的一个实例。

**为什么 `γ < 1` 重要。** 贝尔曼算子在无穷范数下是 `γ`-压缩的：`||T V - T V'||_∞ ≤ γ ||V - V'||_∞`。压缩意味着唯一不动点和几何收敛。去掉 `γ < 1` 你就失去了这个保证——你需要有限时域或吸收终止状态。

```figure
value-iteration-gamma
```

## 构建

### 第 1 步：构建 GridWorld MDP 模型

使用与课程 01 相同的 4×4 GridWorld。我们添加一个随机变体：以概率 `0.1`，智能体滑向随机垂直方向。

```python
SLIP = 0.1

def transitions(state, action):
    if state == TERMINAL:
        return [(state, 0.0, 1.0)]
    outcomes = []
    for direction, prob in action_probs(action):
        outcomes.append((apply_move(state, direction), -1.0, prob))
    return outcomes
```

`transitions(s, a)` 返回一个 `(s', r, p)` 列表。这就是整个模型。

### 第 2 步：策略评估

给定一个策略 `π(s) = {action: prob}`，迭代贝尔曼方程直到 `V` 不再变化：

```python
def policy_evaluation(policy, gamma=0.99, tol=1e-6):
    V = {s: 0.0 for s in states()}
    while True:
        delta = 0.0
        for s in states():
            v = sum(pi_a * sum(p * (r + gamma * V[s_prime])
                              for s_prime, r, p in transitions(s, a))
                   for a, pi_a in policy(s).items())
            delta = max(delta, abs(v - V[s]))
            V[s] = v
        if delta < tol:
            return V
```

### 第 3 步：策略改进

将 `π` 替换为相对于 `V` 的贪婪策略。如果 `π` 没有变化，返回——我们已处于最优。

```python
def policy_improvement(V, gamma=0.99):
    new_policy = {}
    for s in states():
        best_a = max(
            ACTIONS,
            key=lambda a: sum(p * (r + gamma * V[s_prime])
                              for s_prime, r, p in transitions(s, a)),
        )
        new_policy[s] = best_a
    return new_policy
```

### 第 4 步：将它们缝合在一起

```python
def policy_iteration(gamma=0.99):
    policy = {s: "up" for s in states()}   # 任意起始
    for _ in range(100):
        V = policy_evaluation(lambda s: {policy[s]: 1.0}, gamma)
        new_policy = policy_improvement(V, gamma)
        if new_policy == policy:
            return V, policy
        policy = new_policy
```

4×4 上的典型收敛：4–6 次外部迭代。输出 `V*(0,0) ≈ -6` 和严格减少步数的策略。

### 第 5 步：值迭代（单循环版本）

```python
def value_iteration(gamma=0.99, tol=1e-6):
    V = {s: 0.0 for s in states()}
    while True:
        delta = 0.0
        for s in states():
            v = max(sum(p * (r + gamma * V[s_prime])
                       for s_prime, r, p in transitions(s, a))
                   for a in ACTIONS)
            delta = max(delta, abs(v - V[s]))
            V[s] = v
        if delta < tol:
            break
    policy = policy_improvement(V, gamma)
    return V, policy
```

相同的不动点，更少的代码行数。

## 陷阱

- **忘记处理终止状态。** 如果将贝尔曼方程应用于吸收状态，它仍然会选择一个不改变任何东西的"最佳动作"。用 `if s == terminal: V[s] = 0` 保护。
- **无穷范数 vs L2 收敛。** 使用 `max |V_new - V|`，而不是平均值。理论保证是基于无穷范数的。
- **原地更新 vs 同步更新。** 原地更新 `V[s]`（Gauss-Seidel）比单独的 `V_new` 字典（Jacobi）收敛更快。生产代码使用原地更新。
- **策略平局。** 如果两个动作具有相同的 Q 值，`argmax` 可能在每次迭代中不同地打破平局，导致"策略稳定"检查振荡。使用稳定的平局打破（固定顺序中的第一个动作）。
- **状态空间爆炸。** DP 每次扫描的复杂度为 `O(|S| · |A|)`。最多适用于 ~10⁷ 个状态。超过这个范围，你需要函数近似（从阶段 9 · 05 开始）。

## 应用

在 2026 年，DP 是正确性基线和规划器的内部循环：

| 用例 | 方法 |
|----------|--------|
| 精确求解小型表格 MDP | 值迭代（更简单）或策略迭代（更少外部步骤）|
| 验证 Q-learning / PPO 实现 | 在玩具环境上与 DP 最优的 V* 进行比较 |
| 基于模型 RL（阶段 9 · 10）| 在学习到的转移模型上的贝尔曼备份 |
| AlphaZero / MuZero 中的规划 | 蒙特卡洛树搜索 = 异步贝尔曼备份 |
| 离线 RL（CQL、IQL）| 保守 Q 迭代——对 OOD 动作施加惩罚的 DP |

每当有人说"最优值函数"时，他们指的是"DP 不动点"。当你在论文中看到 `V*` 或 `Q*` 时，想象这个循环。

## 交付物

保存为 `outputs/skill-dp-solver.md`：

```markdown
---
name: dp-solver
description: 通过策略迭代或值迭代精确求解小型表格 MDP。报告收敛行为。
version: 1.0.0
phase: 9
lesson: 2
tags: [rl, dynamic-programming, bellman]
---

给定一个已知模型的 MDP，输出：

1. 选择。策略迭代 vs 值迭代。理由与 |S|、|A|、γ 相关。
2. 初始化。V_0，起始策略。收敛敏感性。
3. 停止条件。无穷范数容差 ε。预期扫描次数。
4. 验证。精确计算的 V*(s_0)。提取的贪婪策略。
5. 用途。此基线将如何用于调试/评估基于采样的方法。

拒绝在大于 10⁷ 的状态空间上运行 DP。拒绝在没有无穷范数检查的情况下声称收敛。标记任何无限时域任务上 γ ≥ 1 的情况为保证违规。
```

## 练习

1. **简单。** 在 4×4 GridWorld 上以 `γ ∈ {0.9, 0.99}` 运行值迭代。需要多少次扫描直到 `max |ΔV| < 1e-6`？将 `V*` 打印为 4×4 网格。
2. **中等。** 在*随机* GridWorld（滑动概率 `0.1`）上比较策略迭代和值迭代。统计：扫描次数、挂钟时间、最终 `V*(0,0)`。哪个在迭代次数上收敛更快？在挂钟时间上呢？
3. **困难。** 构建修正策略迭代：在评估步骤中，只运行 `k` 次扫描而不是收敛。绘制 `V*(0,0)` 误差 vs `k` 对于 `k ∈ {1, 2, 5, 10, 50}`。曲线告诉了你关于评估/改进权衡的什么信息？

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 策略迭代 | "DP 算法" | 交替评估（`V^π`）和改进（贪婪的 `π` 相对于 `V^π`），直到策略不再变化。 |
| 值迭代 | "更快的 DP" | 一次扫描中应用贝尔曼最优性备份；几何收敛到 `V*`。 |
| 贝尔曼算子 | "递归" | `(T V)(s) = max_a Σ P (r + γ V(s'))`；无穷范数下的 `γ`-压缩。 |
| 压缩 | "DP 收敛的原因" | 任何满足 `||T x - T y|| ≤ γ ||x - y||` 的算子 `T` 都有唯一不动点。 |
| GPI | "一切都是 DP" | 广义策略迭代：驱动 `V` 和 `π` 达到相互一致的任何方法。 |
| 同步更新 | "Jacobi 风格" | 在一次扫描中使用旧的 `V`；可清晰分析但更慢。 |
| 原地更新 | "Gauss-Seidel 风格" | 在更新过程中使用 `V`；实践中收敛更快。 |

## 延伸阅读

- [Sutton & Barto (2018). 第 4 章 — 动态规划](http://incompleteideas.net/book/RLbook2020.pdf) — 策略迭代和值迭代的权威介绍。
- [Bertsekas (2019). 强化学习与最优控制](http://www.athenasc.com/rlbook.html) — 压缩映射论证的严谨处理。
- [Puterman (2005). 马尔可夫决策过程](https://onlinelibrary.wiley.com/doi/book/10.1002/9780470316887) — 修正策略迭代及其收敛性分析。
- [Howard (1960). 动态规划与马尔可夫过程](https://mitpress.mit.edu/9780262582300/dynamic-programming-and-markov-processes/) — 原始策略迭代论文。
- [Bertsekas & Tsitsiklis (1996). 神经-动态规划](http://www.athenasc.com/ndpbook.html) — 从 DP 到近似 DP / 深度 RL 的桥梁，为后续每节课所用。
