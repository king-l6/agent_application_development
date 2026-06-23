# 近端策略优化（PPO）

> A2C 在每次更新后丢弃轨迹。PPO 将策略梯度包裹在裁剪的重要性比率中，这样你可以在同一数据上做 10+ 轮更新而策略不会爆炸。Schulman 等人（2017）。在 2026 年仍然是默认的策略梯度算法。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 9 · 06（REINFORCE），阶段 9 · 07（Actor-Critic）
**时间：** ~75 分钟

## 问题

A2C（课程 07）是在策略的：梯度 `E_{π_θ}[A · ∇ log π_θ]` 需要从*当前* `π_θ` 采样的数据。做一次更新后，`π_θ` 就变了；你使用的数据现在是离策略的。重复使用它，你的梯度就会有偏。

轨迹是昂贵的。在 Atari 上，一次跨 8 个环境 × 128 步 = 1024 次转移的轨迹需要大约十几秒的环境时间。在一次梯度步后将其丢弃是浪费的。

信任区域策略优化（TRPO，Schulman 2015）是第一个修复方案：约束每次更新，使新旧策略之间的 KL 散度保持在 `δ` 以下。理论上干净，但每次更新需要共轭梯度求解。2026 年没有人运行 TRPO。

PPO（Schulman 等人 2017）用简单的裁剪目标替换了硬信任区域约束。多一行代码。每次轨迹十轮更新。没有共轭梯度。足够好的理论保证。九年后，它仍然是所有领域（从 MuJoCo 到 RLHF）的默认策略梯度算法。

## 概念

![PPO 裁剪替代目标：在 1 ± ε 处裁剪比率](../assets/ppo.svg)

**重要性比率。**

`r_t(θ) = π_θ(a_t | s_t) / π_{θ_old}(a_t | s_t)`

这是新策略与收集数据的策略的似然比。`r_t = 1` 意味着没有变化。`r_t = 2` 意味着新策略采取 `a_t` 的可能性是旧策略的两倍。

**裁剪替代目标。**

`L^{CLIP}(θ) = E_t [ min( r_t(θ) A_t, clip(r_t(θ), 1-ε, 1+ε) A_t ) ]`

两项：

- 如果优势 `A_t > 0` 且比率试图增长超过 `1 + ε`，裁剪会扁平化梯度——不要将好动作推得超过旧概率的 `+ε`。
- 如果优势 `A_t < 0` 且比率试图增长超过 `1 - ε`（意味着我们会使坏动作比其裁剪后的减少更可能发生），裁剪会限制梯度——不要将坏动作推到 `-ε` 以下。

`min` 处理另一个方向：如果比率已经向*有利*方向移动，你仍然得到梯度（在会伤害你的一侧没有裁剪）。

典型的 `ε = 0.2`。将目标作为 `r_t` 的函数绘制出来：一个分段线性函数，在"好侧"有一个平顶，在"坏侧"有一个平底。

**完整的 PPO 损失。**

`L(θ, φ) = L^{CLIP}(θ) - c_v · (V_φ(s_t) - V_t^{target})² + c_e · H(π_θ(·|s_t))`

与 A2C 相同的 actor-critic 结构。三个系数，通常 `c_v = 0.5`，`c_e = 0.01`，`ε = 0.2`。

**训练循环。**

1. 跨 `N` 个并行环境收集 `N × T` 次转移，每个 `T` 步。
2. 计算优势（GAE），将它们冻结为常数。
3. 将 `π_{θ_old}` 冻结为当前 `π_θ` 的快照。
4. 对于 `K` 轮，对于每个 `(s, a, A, V_target, log π_old(a|s))` 的小批量：
   - 计算 `r_t(θ) = exp(log π_θ(a|s) - log π_old(a|s))`。
   - 应用 `L^{CLIP}` + 值损失 + 熵。
   - 梯度步。
5. 丢弃轨迹。返回到步骤 1。

`K = 10` 和 64 的小批量是标准的超参数集。PPO 是稳健的：确切数值在 ±50% 内很少重要。

**KL 惩罚变体。** 原始论文提出了使用自适应 KL 惩罚的替代方案：`L = L^{PG} - β · KL(π_θ || π_old)`，其中 `β` 根据观测到的 KL 进行调整。裁剪版本成为主导；KL 变体在 RLHF 中幸存下来（其中与参考策略的 KL 是你始终想要的独立约束）。

## 构建

### 第 1 步：在轨迹时捕获 `log π_old(a | s)`

```python
for step in range(T):
    probs = softmax(logits(theta, state_features(s)))
    a = sample(probs, rng)
    s_next, r, done = env.step(s, a)
    buffer.append({
        "s": s, "a": a, "r": r, "done": done,
        "v_old": value(w, state_features(s)),
        "log_pi_old": log(probs[a] + 1e-12),
    })
    s = s_next
```

快照在轨迹时拍摄一次。在更新期间它不会改变。

### 第 2 步：计算 GAE 优势（课程 07）

与 A2C 相同。在整个批次上归一化。

### 第 3 步：裁剪替代更新

```python
for _ in range(K_EPOCHS):
    for mb in minibatches(buffer, size=64):
        for rec in mb:
            x = state_features(rec["s"])
            probs = softmax(logits(theta, x))
            logp = log(probs[rec["a"]] + 1e-12)
            ratio = exp(logp - rec["log_pi_old"])
            adv = rec["advantage"]
            surrogate = min(
                ratio * adv,
                clamp(ratio, 1 - EPS, 1 + EPS) * adv,
            )
            # 反向传播 -surrogate，添加值损失，减去熵
            grad_logpi = onehot(rec["a"]) - probs
            if (adv > 0 and ratio >= 1 + EPS) or (adv < 0 and ratio <= 1 - EPS):
                pg_grad = 0.0  # 已裁剪
            else:
                pg_grad = ratio * adv
            for i in range(N_ACTIONS):
                for j in range(N_FEAT):
                    theta[i][j] += LR * pg_grad * grad_logpi[i] * x[j]
```

"裁剪 → 零梯度"模式是 PPO 的核心。如果新策略已经在有利方向上漂移得太远，更新会停止。

### 第 4 步：值和熵

添加与 A2C 相同的评论家目标的标准 MSE 和演员上的熵奖励。

### 第 5 步：诊断

每次更新要关注的三件事：

- **平均 KL** `E[log π_old - log π_θ]`。应保持在 `[0, 0.02]`。如果它超过 `0.1`，减少 `K_EPOCHS` 或 `LR`。
- **裁剪比例**——比率在 `[1-ε, 1+ε]` 之外的样本比例。应为 `~0.1-0.3`。如果 `~0`，裁剪从未触发 → 提高 `LR` 或 `K_EPOCHS`。如果 `~0.5+`，你正在过拟合轨迹 → 降低它们。
- **解释方差** `1 - Var(V_target - V_pred) / Var(V_target)`。评论家质量度量。应随着评论家学习而向 1 攀升。

## 陷阱

- **裁剪系数调错。** `ε = 0.2` 是事实标准。设为 `0.1` 使更新太胆小；`0.3+` 会引发不稳定。
- **太多轮数。** `K > 20` 通常会破坏稳定性，因为策略漂移远离 `π_old`。限制轮数，特别是对于大型网络。
- **没有奖励归一化。** 大的奖励尺度会侵蚀裁剪范围。在计算优势之前归一化奖励（运行标准差）。
- **忘记优势归一化。** 每批次零均值/单位标准差归一化是标准做法。跳过它会在大多数基准上破坏 PPO。
- **学习率不衰减。** PPO 受益于线性 LR 衰减到零。常数 LR 通常更差。
- **重要性比率数学错误。** 始终使用 `exp(log_new - log_old)` 以获得数值稳定性，而不是 `new / old`。
- **梯度符号错误。** 最大化替代目标 = *最小化* `-L^{CLIP}`。翻转的符号是最常见的 PPO 错误。

## 应用

PPO 是 2026 年令人惊讶地横跨许多领域的默认 RL 算法：

| 用例 | PPO 变体 |
|----------|-------------|
| MuJoCo / 机器人控制 | 带高斯策略、GAE(0.95) 的 PPO |
| Atari / 离散游戏 | 带分类策略、128 步滚动轨迹的 PPO |
| LLM 的 RLHF | 带 KL 惩罚（到参考模型）、响应结束时来自 RM 的奖励的 PPO |
| 大规模游戏智能体 | IMPALA + PPO（AlphaStar、OpenAI Five）|
| 推理 LLM | GRPO（课程 12）——无评论家的 PPO 变体 |
| 仅偏好数据 | DPO——PPO+KL 的封闭形式坍缩，无需在线采样 |

PPO 的*损失形状*——裁剪替代 + 值 + 熵——是 DPO、GRPO 和几乎所有 RLHF 流水线的脚手架。

## 交付物

保存为 `outputs/skill-ppo-trainer.md`：

```markdown
---
name: ppo-trainer
description: 为给定环境生成 PPO 训练配置和诊断计划。
version: 1.0.0
phase: 9
lesson: 8
tags: [rl, ppo, policy-gradient]
---

给定一个环境和训练预算，输出：

1. 轨迹大小。`N` 个环境 × `T` 步。
2. 更新调度。`K` 轮，小批量大小，LR 调度。
3. 替代参数。`ε`（裁剪），`c_v`，`c_e`，优势归一化开启。
4. 优势。带显式 `γ` 和 `λ` 的 GAE(`λ`)。
5. 诊断计划。KL、裁剪比例、解释方差阈值及警报。

拒绝 `K > 30` 或 `ε > 0.3`（不安全的信任区域）。拒绝任何没有优势归一化或 KL/裁剪监控的 PPO 运行。标记持续超过 0.4 的裁剪比例为漂移。
```

## 练习

1. **简单。** 在 4×4 GridWorld 上运行 PPO，使用 `ε=0.2, K=4`。在匹配的环境步数下比较样本效率与 A2C（每次轨迹一轮更新）。
2. **中等。** 扫描 `K ∈ {1, 4, 10, 30}`。绘制回报 vs 环境步数并跟踪每次更新的平均 KL。在此任务上 KL 在哪个 `K` 处爆炸？
3. **困难。** 将裁剪替代目标替换为自适应 KL 惩罚（如果 `KL > 2·target` 则 `β` 加倍，如果 `KL < target/2` 则减半）。比较最终回报、稳定性和无裁剪性。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 重要性比率 | "r_t(θ)" | `π_θ(a\|s) / π_old(a\|s)`；与收集数据的策略的偏差。 |
| 裁剪替代目标 | "PPO 的主要技巧" | `min(r·A, clip(r, 1-ε, 1+ε)·A)`；在有利侧超过裁剪后梯度扁平。 |
| 信任区域 | "TRPO / PPO 意图" | 限制每次更新的 KL 以保证单调改进。 |
| KL 惩罚 | "软信任区域" | 替代 PPO：`L - β · KL(π_θ \|\| π_old)`。自适应 `β`。 |
| 裁剪比例 | "裁剪触发的频率" | 诊断指标——应为 0.1-0.3；之外意味参数未调好。 |
| 多轮训练 | "数据重用" | 每个轨迹 K 轮；方差成本换取样本效率。 |
| 在策略-ish | "主要是在策略" | PPO 名义上是在策略的，但 K>1 轮安全地使用了轻微离策略的数据。 |
| PPO-KL | "另一种 PPO" | KL 惩罚变体；在 RLHF 中使用，其中 KL-to-reference 已经是约束。 |

## 延伸阅读

- [Schulman et al. (2017). 近端策略优化算法](https://arxiv.org/abs/1707.06347) — 论文。
- [Schulman et al. (2015). 信任区域策略优化](https://arxiv.org/abs/1502.05477) — TRPO，PPO 的前身。
- [Andrychowicz et al. (2021). 在策略 RL 中什么重要？一个大规模实证研究](https://arxiv.org/abs/2006.05990) — 每个 PPO 超参数的消融实验。
- [Ouyang et al. (2022). 训练语言模型以通过人类反馈遵循指令](https://arxiv.org/abs/2203.02155) — InstructGPT；RLHF 中的 PPO 配方。
- [OpenAI Spinning Up — PPO](https://spinningup.openai.com/en/latest/algorithms/ppo.html) — 带 PyTorch 的清晰现代阐述。
- [CleanRL PPO 实现](https://github.com/vwxyzjn/cleanrl) — 许多论文使用的参考单文件 PPO。
- [Hugging Face TRL — PPOTrainer](https://huggingface.co/docs/trl/main/en/ppo_trainer) — PPO 在语言模型上的生产配方；配合课程 09（RLHF）阅读。
- [Engstrom et al. (2020). 实现细节在深度策略梯度中很重要](https://arxiv.org/abs/2005.12729) — "37 个代码级优化"论文；哪些 PPO 技巧是承重的，哪些是传说。
