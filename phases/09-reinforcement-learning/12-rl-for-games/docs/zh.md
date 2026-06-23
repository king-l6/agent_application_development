# 游戏的强化学习——AlphaZero、MuZero与LLM推理时代

> 1992年：TD-Gammon用纯粹的TD方法击败了双陆棋人类冠军。2016年：AlphaGo击败了李世石。2017年：AlphaZero从零开始称霸国际象棋、将棋和围棋。2024年：DeepSeek-R1证明了同样的配方——用GRPO替代PPO——在推理任务上也有效。游戏是这个阶段每个突破性进展的基准测试平台。

**类型：** 构建
**语言：** Python
**前置知识：** Phase 9 · 05（DQN）、Phase 9 · 08（PPO）、Phase 9 · 09（RLHF）、Phase 9 · 10（MARL）
**时间：** ~120分钟

## 问题

游戏拥有强化学习想要的一切。清晰的奖励（赢/输）。无限回合（自我对弈重置）。完美仿真（游戏*本身就是*模拟器）。离散或小规模连续动作空间。强制对抗鲁棒性的多智能体结构。

而游戏正是每个重大强化学习突破的测试平台。TD-Gammon（双陆棋，1992年）。Atari-DQN（2013年）。AlphaGo（2016年）。AlphaZero（2017年）。OpenAI Five（Dota 2，2019年）。AlphaStar（星际争霸II，2019年）。MuZero（学习模型，2019年）。AlphaTensor（矩阵乘法，2022年）。AlphaDev（排序算法，2023年）。DeepSeek-R1（数学推理，2025年）——这是游戏RL技术适用于文本的最新证明。

本专题综述通过一个统一的视角审视三个里程碑式的架构——AlphaZero、MuZero和GRPO：**自我对弈 + 搜索 + 策略改进**。每一个都是对前一个的泛化；GRPO尤其是将AlphaZero的配方应用到LLM推理上，以token作为动作，以数学验证作为胜利信号。

## 概念

![AlphaZero ↔ MuZero ↔ GRPO：相同循环，不同环境](../assets/rl-games.svg)

**统一循环。**

```
while True:
    trajectory = self_play(current_policy, search)     # 自我对弈
    policy_target = search.improved_policy(trajectory) # 搜索改进原始策略
    policy_net.update(policy_target, value_target)     # 基于搜索输出进行监督学习
```

**AlphaZero（2017年）。** Silver等人。给定一个已知规则的游戏（国际象棋、将棋、围棋）：

- 策略-价值网络：一个单一网络 `f_θ(s) → (p, v)`。`p` 是合法动作的先验分布。`v` 是期望的游戏结果。
- 蒙特卡洛树搜索（MCTS）：在每一步，展开一个可能的后续走法的树。使用 `(p, v)` 作为先验 + 自举。通过UCB（PUCT）选择节点：`a* = argmax Q(s, a) + c · p(a|s) · √N(s) / (1 + N(s, a))`。
- 自我对弈：智能体与智能体对战。在时刻 `t`，MCTS的访问分布 `π_t` 成为策略训练目标。
- 损失函数：`L = (v - z)² - π · log p + c · ||θ||²`。`z` 是游戏结果（+1 / 0 / -1）。

零人类知识。零手工设计的启发式。一个单一的配方，经过数千万局自我对弈后掌握了国际象棋、将棋和围棋。

**MuZero（2019年）。** Schrittwieser等人。去掉了要求规则已知的前提。

- 不依赖于固定环境，而是学习一个*潜在动力学模型* `(h, g, f)`：
  - `h(s)`：将观测编码为潜在状态。
  - `g(s_latent, a)`：预测下一个潜在状态 + 奖励。
  - `f(s_latent)`：预测策略先验 + 价值。
- MCTS在*学到的潜在空间*中运行。相同的搜索，相同的训练循环。
- 适用于围棋、国际象棋、将棋*和*Atari——一种算法，无需规则知识。

**随机化MuZero（2022年）。** 添加了随机动力学和机会节点；扩展到双陆棋类游戏。

**Muesli、Gumbel MuZero（2022-2024年）。** 在样本效率和确定性搜索方面进行了改进。

**GRPO（2024-2025年）。** DeepSeek-R1的配方。相同的AlphaZero形态循环，应用于语言模型推理：

- "游戏"：回答一个数学/代码/推理问题。"胜利" = 验证器（测试用例通过、数值答案匹配）返回1。
- 策略：LLM。动作：token。状态：提示 + 已生成的回答。
- 没有评论家（PPO风格的V_φ）。相反，对于每个提示，从策略中采样 `G` 个完整回答。计算每个回答的奖励。使用**群体相对优势** `A_i = (r_i - mean_r) / std_r` 作为REINFORCE风格更新的信号。
- 对参考策略的KL惩罚以防止漂移（类似RLHF）。
- 完整损失函数：

  `L_GRPO(θ) = -E_{q, {o_i}} [ (1/G) Σ_i A_i · log π_θ(o_i | q) ] + β · KL(π_θ || π_ref)`

不需要奖励模型、不需要评论家、不需要MCTS。群体相对基线替代了三者。在推理基准上达到或超过PPO-RLHF的质量，而计算量仅为后者的一小部分。

**完整的R1配方。** DeepSeek-R1（DeepSeek 2025）在一篇论文中包含了两个模型：

- **R1-Zero。** 从DeepSeek-V3基础模型开始。没有SFT。直接应用GRPO，使用两个奖励组件：*准确率奖励*（基于规则——最终答案是否解析为正确的数字/代码是否通过了单元测试）和*格式奖励*（回答是否将思维链包裹在 `<think>…</think>` 标签中）。经过数千步，平均回答长度从约100增加到约10,000个token，数学基准分数上升到接近o1-preview的水平。模型从零开始学会了推理。缺点：思维链通常不可读、混用语言、缺乏风格上的打磨。
- **R1。** 通过一个四阶段流程修复R1-Zero的可读性问题：
  1. **冷启动SFT。** 收集数千条格式清晰的长思维链演示。在基础模型上进行监督微调。这给出了一个可读的起点。
  2. **面向推理的GRPO。** 应用GRPO，使用准确率+格式奖励，外加一个*语言一致性*奖励以防止语码转换。
  3. **拒绝采样 + 第二轮SFT。** 从RL检查点采样约600K条推理轨迹，只保留那些答案正确且思维链可读的轨迹，并与约200K条非推理SFT示例（写作、问答、自我认知）合并。再次微调基础模型。
  4. **全光谱GRPO。** 再进行一轮RL，涵盖推理（基于规则的奖励）和通用对齐（有帮助性/无害性偏好基础奖励）。

结果在AIME和MATH-500上以开放权重匹配o1，并且足够小以至于可以蒸馏。同一篇论文还发布了六个蒸馏的稠密模型（Qwen-1.5B到Llama-70B），通过在R1的推理轨迹上进行SFT——学生端没有RL。蒸馏一个强大的RL教师始终优于在学生规模上从头开始做RL。

**为什么推理任务用GRPO而不是PPO。** DeepSeekMath论文（2024年2月）中给出了三个原因：（1）不需要训练价值网络，内存减半；（2）群体基线自然地处理推理任务产生的稀疏的轨迹末端奖励；（3）每个提示的归一化使得优势在难度差异巨大的问题之间具有可比性，而PPO的单一评论家无法做到这一点。

**无搜索 vs 基于搜索。** 游戏领域已经分化为：

- *具有长时域完美信息的游戏*（围棋、国际象棋）：仍然基于搜索。AlphaZero / MuZero 主导。
- *LLM推理*：生产环境中还没有MCTS；GRPO用于完整轨迹展开，best-of-N用于推理计算。过程奖励模型（PRM）暗示了逐步搜索可能会被重新加入。

## 动手构建

`code/main.py` 中的代码实现了**微型GRPO**——一个具有多组样本的赌博机。算法与LLM上的相同；只是策略和环境更简单。它教你*损失*和*群体相对优势*——这是2025年的创新。

### 第1步：微型验证器环境

```python
QUESTIONS = [
    {"prompt": "q1", "correct": 3},
    {"prompt": "q2", "correct": 1},
]

def verify(prompt_idx, answer_token):
    return 1.0 if answer_token == QUESTIONS[prompt_idx]["correct"] else 0.0
```

在真实的GRPO中，验证器运行单元测试或检查数学等式。

### 第2步：策略：每个提示对K个答案token的softmax

```python
def policy_probs(theta, p_idx):
    return softmax(theta[p_idx])
```

等同于LLM在给定提示条件下的最后一层输出。

### 第3步：群体采样和群体相对优势

```python
def grpo_step(theta, p_idx, G=8, beta=0.01, lr=0.1, rng=None):
    probs = policy_probs(theta, p_idx)
    samples = [sample(probs, rng) for _ in range(G)]
    rewards = [verify(p_idx, s) for s in samples]
    mean_r = sum(rewards) / G
    std_r = stddev(rewards) + 1e-8
    advs = [(r - mean_r) / std_r for r in rewards]

    for a, A in zip(samples, advs):
        grad = onehot(a) - probs
        for i in range(len(probs)):
            theta[p_idx][i] += lr * A * grad[i]
    # KL惩罚：将theta拉向参考
    for i in range(len(probs)):
        theta[p_idx][i] -= beta * (theta[p_idx][i] - reference[p_idx][i])
```

群体相对优势是2024年DeepSeek的技巧。无需评论家。"基线"是群体均值，归一化使用群体标准差。

### 第4步：与REINFORCE基线比较（无价值函数）

同样的设置，同样的计算量，纯REINFORCE。GRPO收敛更快、更稳定。

### 第5步：观察熵和KL

与RLHF相同的诊断指标：相对于参考的均值KL、策略熵、奖励随时间的变化。一旦这些指标稳定，训练就完成了。

## 陷阱

- **通过验证器游戏进行奖励黑客。** GRPO继承了RLHF的风险：如果验证器是错误的或可利用的，LLM就会找到利用方式。鲁棒的验证器（多个测试用例、形式化证明）至关重要。
- **群体规模太小。** 群体基线的方差为 `1/√G`。低于 `G = 4` 时优势信号噪声很大；标准选择是 `G = 8` 到 `64`。
- **长度偏差。** 不同长度的LLM回答具有不同的对数概率。通过token数量归一化，或使用序列级对数概率，或截断到最大长度。
- **纯自我对弈循环。** AlphaZero式训练可能在一般和博弈中陷入主导循环。通过多样化的对手池缓解（联赛玩法，第10课）。
- **搜索-策略不匹配。** AlphaZero训练策略去模仿搜索输出。如果策略网络太小而无法表示搜索的分布，训练就会停滞。
- **计算门槛。** MuZero / AlphaZero需要大量计算。单次消融实验往往需要数百个GPU小时。存在小型演示（例如Connect Four上的AlphaZero）用于学习。
- **验证器覆盖范围。** 通过了有缺陷解决方案的单元测试会强化该缺陷。设计能捕捉边缘情况的验证器。

## 应用

2026年游戏RL版图，按领域：

| 领域 | 主导方法 |
|--------|-----------------|
| 双人零和棋盘游戏（围棋、国际象棋、将棋） | AlphaZero / MuZero / KataGo |
| 不完美信息纸牌游戏（扑克） | CFR + 深度学习（DeepStack、Libratus、Pluribus） |
| Atari / 像素游戏 | Muesli / MuZero / IMPALA-PPO |
| 大型多人策略游戏（Dota、星际争霸） | PPO + 自我对弈 + 联赛（OpenAI Five、AlphaStar） |
| LLM数学/代码推理 | GRPO（DeepSeek-R1、Qwen-RL、开源复现） |
| LLM对齐 | DPO / RLHF-PPO（不是GRPO；验证器是偏好而非可验证） |
| 机器人技术 | PPO + DR（不是游戏RL，但使用相同的策略梯度工具） |
| 组合优化问题 | AlphaZero变体（AlphaTensor、AlphaDev） |

*配方*——自我对弈、搜索增强的策略改进、策略蒸馏——跨越了文本、像素和物理控制。GRPO是最年轻的实例；还会有更多。

## 交付

保存为 `outputs/skill-game-rl-designer.md`：

```markdown
---
name: game-rl-designer
description: 为给定领域设计一个游戏RL或推理RL训练流程（AlphaZero / MuZero / GRPO）。
version: 1.0.0
phase: 9
lesson: 12
tags: [rl, alphazero, muzero, grpo, self-play]
---

给定一个目标（完美信息游戏 / 不完美信息 / Atari / LLM推理 / 组合优化），输出：

1. 环境适配。已知规则？马尔可夫？随机化？多智能体？决定选择AlphaZero vs MuZero vs GRPO。
2. 搜索策略。MCTS（使用学习先验的PUCT）、Gumbel采样、best-of-N，或无搜索。
3. 自我对弈计划。对称自我对弈 / 联赛 / 离线数据 / 验证器生成。
4. 目标信号。游戏结果 / 验证器奖励 / 偏好 / 学习模型。包含鲁棒性计划。
5. 诊断指标。对基线的胜率、ELO曲线、验证器通过率、相对于参考的KL。

拒绝在不完美信息游戏上使用AlphaZero（应使用CFR）。拒绝在没有可信验证器的情况下使用GRPO。拒绝任何没有固定基线对手集的游戏RL流程（否则自我对弈ELO未经校准）。
```

## 练习

1. **简单。** 在 `code/main.py` 中实现GRPO赌博机。在2个提示 × 4个答案token上训练。使用 `G=8` 在 < 1,000次更新内收敛。
2. **中等。** 加入PPO（带裁剪）和普通REINFORCE。与GRPO在同一个赌博机上比较样本效率和奖励方差。
3. **困难。** 扩展为长度为2的"推理链"：智能体发出两个token，验证器奖励这对组合。测量GRPO如何在两步序列中处理信用分配。（提示：按*完整序列*计算群体优势，传播到两个token位置。）

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| MCTS | "带学习网络的树搜索" | 蒙特卡洛树搜索；使用学习到的 `(p, v)` 先验进行UCB1/PUCT选择。 |
| AlphaZero | "自我对弈 + MCTS" | 训练策略-价值网络以匹配MCTS访问分布和游戏结果。 |
| MuZero | "学习模型的AlphaZero" | 相同循环，但通过学到的动力学在潜在空间中运行。 |
| GRPO | "无评论家的PPO" | 群体相对策略优化；带群体均值基线和KL惩罚的REINFORCE。 |
| PUCT | "AlphaZero的UCB" | `Q + c · p · √N / (1 + N_a)` — 平衡价值估计与先验。 |
| 自我对弈 | "智能体对战过去的自己" | 零和博弈的标准；对称训练信号。 |
| 联赛玩法 | "基于种群的自我对弈" | 过去+当前+利用者作为对手采样。 |
| 验证器奖励 | "可验证的RL" | 奖励来自确定性检查器（测试通过、答案匹配）。 |
| 过程奖励 | "PRM" | 对每个推理步骤评分，而不仅仅是最终答案。 |

## 延伸阅读

- [Silver等人（2017年）。无需人类知识掌握围棋（AlphaGo Zero）](https://www.nature.com/articles/nature24270)。
- [Silver等人（2018年）。一个通过自我对弈掌握国际象棋、将棋和围棋的通用强化学习算法（AlphaZero）](https://www.science.org/doi/10.1126/science.aar6404)。
- [Schrittwieser等人（2020年）。通过使用学习模型进行规划掌握Atari、围棋、国际象棋和将棋（MuZero）](https://www.nature.com/articles/s41586-020-03051-4)。
- [Vinyals等人（2019年）。星际争霸II的大师级水平（AlphaStar）](https://www.nature.com/articles/s41586-019-1724-z)。
- [DeepSeek-AI（2024年）。DeepSeekMath：在开放语言模型中推动数学推理的极限（GRPO）](https://arxiv.org/abs/2402.03300) — 引入GRPO和群体相对基线的论文。
- [DeepSeek-AI（2025年）。DeepSeek-R1：通过强化学习激励LLM的推理能力](https://arxiv.org/abs/2501.12948) — 完整的四阶段R1配方加上R1-Zero消融实验。
- [Brown等人（2019年）。多人扑克的超人AI（Pluribus）](https://www.science.org/doi/10.1126/science.aay2400) — 大规模CFR+深度学习。
- [Tesauro（1995年）。时序差分学习与TD-Gammon](https://dl.acm.org/doi/10.1145/203330.203343) — 开启一切的论文。
- [Hugging Face TRL — GRPOTrainer](https://huggingface.co/docs/trl/main/en/grpo_trainer) — 使用自定义奖励函数应用GRPO的生产参考。
- [Qwen Team（2024年）。Qwen2.5-Math — GRPO复现](https://github.com/QwenLM/Qwen2.5-Math) — 多尺度R1配方的开源复现。
- [Sutton & Barto（2018年）。第17章——强化学习的前沿](http://incompleteideas.net/book/RLbook2020.pdf) — 教材中关于自我对弈、搜索和"设计奖励"的框架，R1在LLM规模上实现了这一框架。
