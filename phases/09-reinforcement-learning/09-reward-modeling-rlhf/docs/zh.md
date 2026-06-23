# 奖励建模与 RLHF

> 人类无法为"好的助手回答"编写奖励函数，但他们可以比较两个回答并选出更好的。根据这些比较拟合一个奖励模型，然后让语言模型通过 RL 来对抗该模型。Christiano 2017。InstructGPT 2022。将 GPT-3 变成 ChatGPT 的配方。在 2026 年，它大部分已被 DPO 取代——但心智模型仍然存在。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 05（情感分析），阶段 9 · 08（PPO）
**时间：** ~45 分钟

## 问题

你在下一个 token 预测目标上训练了一个语言模型。它能写出语法正确的英语。但它也会撒谎、漫无边际地闲聊，并且拒绝拒绝。你无法通过更多预训练来解决这个问题——网络文本是问题，而不是解药。

你想要一个*标量奖励*来表达"对于指令 X，回答 A 优于回答 B"。手动编写这样的奖励函数是不可能的。"有帮助"不是一个关于 token 的封闭形式表达式。但人类可以比较两个输出并标记偏好。这在大规模收集上是廉价的。

RLHF（Christiano 等人 2017；Ouyang 等人 2022）将偏好转换为奖励模型，然后通过 PPO 针对该奖励优化 LM。分三步：SFT → RM → PPO。这是交付 ChatGPT、Claude、Gemini 和 2023–2025 年间每个其他对齐 LLM 的配方。

在 2026 年，PPO 步骤大多被 DPO（阶段 10 · 08）取代，因为它更便宜且在对齐微调方面几乎一样好。但*奖励模型*部分仍然是每个 Best-of-N 采样器、每个基于可验证奖励的 RL 流水线以及每个使用过程奖励模型的推理模型的基础。理解 RLHF 就理解了整个对齐栈。

## 概念

![三阶段 RLHF：SFT、成对偏好上的 RM 训练、带 KL 惩罚的 PPO](../assets/rlhf.svg)

**阶段 1：监督微调（SFT）。** 从预训练基础模型开始。在目标行为的人工编写的演示（指令遵循回答、有帮助的回复等）上微调。结果：一个*偏向良好行为*但仍具有无界动作空间的模型 `π_SFT`。

**阶段 2：奖励模型训练。**

- 收集回答对 `(y_+, y_-)`，对应提示 `x`，由人类标记为"y_+ 优于 y_-"。
- 训练奖励模型 `R_φ(x, y)` 为 `y_+` 分配更高的分数。
- 损失：**Bradley-Terry 成对逻辑损失**：

  `L(φ) = -E[ log σ(R_φ(x, y_+) - R_φ(x, y_-)) ]`

  σ 是 sigmoid 函数。奖励的差值意味着偏好的对数几率。BT 自 1952 年以来一直是标准（Bradley-Terry），并且是现代 RLHF 中的主导选择。

- `R_φ` 通常从 SFT 模型初始化，并在顶部加一个标量头。相同的 Transformer 骨干；一个线性层输出奖励。

**阶段 3：带 KL 惩罚的 PPO 对抗 RM。**

- 从 `π_SFT` 初始化可训练策略 `π_θ`。保留一个冻结的*参考*模型 `π_ref = π_SFT`。
- 回答 `y` 结束时的奖励：

  `r_total(x, y) = R_φ(x, y) - β · KL(π_θ(·|x) || π_ref(·|x))`

  KL 惩罚防止 `π_θ` 任意漂移远离 `π_SFT`——它是一个*正则化器*，而不是硬信任区域。`β` 通常为 `0.01`-`0.05`。
- 使用此奖励运行 PPO（课程 08）。优势在 token 级轨迹上计算，但 RM 只对完整回答评分。

**为什么需要 KL？** 没有它，PPO 会愉快地发现奖励黑客策略——RM 只在分布内的完成序列上训练。分布外的回答可能比任何人类编写的回答得分更高。KL 使 `π_θ` 保持在 RM 训练所依据的流形附近。它是 RLHF 中最重要的旋钮。

**2026 年现状：**

- **DPO**（Rafailov 2023）：封闭形式代数将阶段 2+3 坍缩为偏好数据上的单一监督损失。不需要 RM，不需要 PPO。在对齐基准上质量相同，计算量少一个数量级。在阶段 10 · 08 中介绍。
- **GRPO**（DeepSeek 2024–2025）：带有组相对基线（而不是评论家）的 PPO，奖励来自*验证器*（代码运行 / 数学答案匹配）而不是人类训练的 RM。推理模型的主导方法。在阶段 9 · 12 中介绍。
- **过程奖励模型（PRM）：** 对部分解决方案（每个推理步骤）进行评分，在推理的 RLHF 和 GRPO 变体中使用。
- **宪法 AI / RLAIF：** 使用对齐的 LLM 代替人类生成偏好。扩展偏好预算。

## 构建

本课程使用微小的合成"提示"和"回答"（表示为字符串）。RM 是基于词袋表示上的线性评分器。没有真正的 LLM——重要的是流水线的*形状*，而不是规模。见 `code/main.py`。

### 第 1 步：合成偏好数据

```python
PROMPTS = ["help me", "answer me", "explain this"]
GOOD_WORDS = {"clear", "specific", "kind", "thorough"}
BAD_WORDS = {"vague", "rude", "wrong", "short"}

def make_pair(rng):
    x = rng.choice(PROMPTS)
    y_good = rng.choice(list(GOOD_WORDS)) + " " + rng.choice(list(GOOD_WORDS))
    y_bad = rng.choice(list(BAD_WORDS)) + " " + rng.choice(list(BAD_WORDS))
    return (x, y_good, y_bad)
```

在真实的 RLHF 中，这由人类标注者替代。形状——`(prompt, preferred_response, rejected_response)`——是相同的。

### 第 2 步：Bradley-Terry 奖励模型

线性得分：`R(x, y) = w · bag(y)`。训练以最小化 BT 成对对数损失：

```python
def rm_train_step(w, x, y_pos, y_neg, lr):
    r_pos = dot(w, bag(y_pos))
    r_neg = dot(w, bag(y_neg))
    p = sigmoid(r_pos - r_neg)
    for tok, cnt in bag(y_pos).items():
        w[tok] += lr * (1 - p) * cnt
    for tok, cnt in bag(y_neg).items():
        w[tok] -= lr * (1 - p) * cnt
```

几百次更新后，`w` 为好的词 token 分配正权重，为坏的词 token 分配负权重。

### 第 3 步：RM 之上的 PPO 类策略

我们的玩具策略从词汇表中产生一个 token。我们在 RM 下对 token 评分，计算 `log π_θ(token | prompt)`，添加 KL-to-reference 惩罚，并应用裁剪后的 PPO 替代目标。

```python
def rlhf_step(theta, ref, w, prompt, rng, eps=0.2, beta=0.1, lr=0.05):
    logits_theta = policy_logits(theta, prompt)
    probs = softmax(logits_theta)
    token = sample(probs, rng)
    logits_ref = policy_logits(ref, prompt)
    probs_ref = softmax(logits_ref)
    reward = dot(w, bag([token])) - beta * kl(probs, probs_ref)
    # 对 theta 进行 ppo 风格更新，将 reward 视为回报
    ...
```

### 第 4 步：监控 KL

每次更新跟踪平均 `KL(π_θ || π_ref)`。如果它超过 `~5-10`，策略已漂移远离 `π_SFT`——要么 `β` 正在上升，要么奖励黑客攻击开始了。这是真实 RLHF 中最重要的诊断。

### 第 5 步：使用 TRL 的生产配方

一旦你理解了玩具流水线，下面是真实库用户编写相同循环的方式。Hugging Face 的 [TRL](https://huggingface.co/docs/trl) 是参考实现——`RewardTrainer` 用于阶段 2，`PPOTrainer`（内置 KL-to-reference）用于阶段 3。

```python
# 阶段 2：来自成对偏好的奖励模型
from trl import RewardTrainer, RewardConfig
from transformers import AutoModelForSequenceClassification, AutoTokenizer

tok = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B-Instruct")
rm = AutoModelForSequenceClassification.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct", num_labels=1
)

# 数据集行：{"prompt", "chosen", "rejected"} — Bradley-Terry 格式
trainer = RewardTrainer(
    model=rm,
    tokenizer=tok,
    train_dataset=preference_data,
    args=RewardConfig(output_dir="./rm", num_train_epochs=1, learning_rate=1e-5),
)
trainer.train()
```

```python
# 阶段 3：带 KL 惩罚（到 SFT 参考）的 PPO 对抗 RM
from trl import PPOTrainer, PPOConfig, AutoModelForCausalLMWithValueHead

policy = AutoModelForCausalLMWithValueHead.from_pretrained("./sft-checkpoint")
ref    = AutoModelForCausalLMWithValueHead.from_pretrained("./sft-checkpoint")  # 冻结

ppo = PPOTrainer(
    config=PPOConfig(learning_rate=1.41e-5, batch_size=64, init_kl_coef=0.05,
                     target_kl=6.0, adap_kl_ctrl=True),
    model=policy, ref_model=ref, tokenizer=tok,
)

for batch in dataloader:
    responses = ppo.generate(batch["query_ids"], max_new_tokens=128)
    rewards   = rm(torch.cat([batch["query_ids"], responses], dim=-1)).logits[:, 0]
    stats     = ppo.step(batch["query_ids"], responses, rewards)
    # stats 包括：mean_kl, clip_frac, value_loss — 三个 PPO 诊断指标
```

库为你做了三件事。`adap_kl_ctrl=True` 实现自适应 β 调度：如果观测到的 KL 超过 `target_kl`，β 加倍；如果低于一半，β 减半。参考模型按惯例是冻结的——你不能意外地与 `policy` 共享参数。值头与策略在同一个骨干上（`AutoModelForCausalLMWithValueHead` 附加了一个标量 MLP 头），这就是 TRL 分别报告 `policy/kl` 和 `value/loss` 的原因。

## 陷阱

- **过度优化 / 奖励黑客。** RM 不完美；`π_θ` 找到得分高但不好的对抗性完成序列。症状：奖励无限攀升而人类评估分数持平或下降。修复：提前停止，提高 `β`，扩大 RM 训练数据。
- **长度黑客。** 在助人回答上训练的 RM 通常隐式奖励长度。策略学会填充回答。补救措施：长度归一化奖励，或使用长度感知 RM 的 RLAIF。
- **RM 太小。** RM 至少需要与策略一样大。小的 RM 无法忠实地对策略的输出评分。
- **KL 调参。** β 太低 → 漂移和奖励黑客。β 太高 → 策略几乎没有变化。标准技巧是使用*自适应* β，目标为每步固定 KL。
- **偏好数据噪声。** 约 30% 的人类标签有噪声或模糊。通过在一致性过滤的数据上训练 RM 或对 BT 使用温度来校准。
- **离策略问题。** 第一轮后 PPO 数据稍微离策略。像课程 08 中那样监控裁剪比例。

## 应用

2026 年的 RLHF 是分层的：

| 层 | 目标 | 方法 |
|-------|--------|--------|
| 指令遵循、助人性、无害性 | 对齐 | DPO（阶段 10 · 08）优于 RLHF-PPO。 |
| 推理正确性（数学、代码）| 能力 | 带验证器奖励的 GRPO（阶段 9 · 12）。|
| 长时域多步任务 | 智能体 | 带过程奖励模型（跨步骤）的 PPO / GRPO。|
| 安全 / 拒绝行为 | 安全 | 带独立安全 RM 的 RLHF-PPO，或宪法 AI。|
| 推理时的 Best-of-N | 快速对齐 | 解码时使用 RM；无需策略训练。|
| 奖励蒸馏 | 推理计算 | 在冻结的 LM 上训练小的"奖励头"。|

RLHF 是 2022–2024 年的*核心*方法。在 2026 年，生产对齐流水线首选 DPO，仅在 RM 密集型或安全关键步骤中使用 PPO。

## 交付物

保存为 `outputs/skill-rlhf-architect.md`：

```markdown
---
name: rlhf-architect
description: 为语言模型设计 RLHF / DPO / GRPO 对齐流水线，包括 RM、KL 和数据策略。
version: 1.0.0
phase: 9
lesson: 9
tags: [rl, rlhf, alignment, llm]
---

给定一个基础 LM、一个目标行为（对齐 / 推理 / 拒绝 / 智能体）和偏好或验证器预算，输出：

1. 阶段。SFT？RM？DPO？GRPO？附理由。
2. 偏好或验证器来源。人类、AI 反馈、基于规则、单元测试通过、或奖励蒸馏。
3. KL 策略。固定 β、自适应 β、或 DPO（隐式 KL）。
4. 诊断。平均 KL、奖励稳定性、过度优化防护（保留的人类评估）。
5. 安全门。红队测试集、拒绝率、独立于助人性 RM 的安全性 RM。

拒绝在没有 KL 监控的情况下交付 RLHF-PPO。拒绝使用比目标策略小的 RM。拒绝仅长度奖励。标记任何没有保留盲审人类评估集的流水线为缺乏过度优化保护。
```

## 练习

1. **简单。** 在 `code/main.py` 中的 500 个合成偏好对上训练 Bradley-Terry 奖励模型。在保留的 100 对上测量成对准确率。应超过 90%。
2. **中等。** 运行玩具 PPO-RLHF 循环，使用 `β ∈ {0.0, 0.1, 1.0}`。对每个，绘制 RM 得分 vs KL-to-reference 随更新变化。哪个运行出现了奖励黑客？
3. **困难。** 在相同的偏好数据上实现 DPO（封闭形式偏好似然损失），并在计算量和最终 RM 得分方面比较与 RLHF-PPO 流水线。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| RLHF | "对齐 RL" | 三阶段 SFT + RM + PPO 流水线（Christiano 2017，Ouyang 2022）。|
| 奖励模型（RM）| "评分网络" | 通过 Bradley-Terry 拟合到成对偏好的学习到的标量函数。 |
| Bradley-Terry | "成对逻辑损失" | `P(y_+ ≻ y_-) = σ(R(y_+) - R(y_-))`；标准的 RM 目标。 |
| KL 惩罚 | "保持在参考附近" | 奖励中的 `β · KL(π_θ \|\| π_ref)`；反奖励黑客正则化器。 |
| 奖励黑客 | "古德哈特定律" | 策略利用 RM 缺陷；症状：奖励上升，人类评估持平。 |
| RLAIF | "AI 标记的偏好" | 标签来自另一个 LM 而非人类的 RLHF。 |
| PRM | "过程奖励模型" | 对部分推理步骤评分；用于推理流水线。 |
| 宪法 AI | "Anthropic 的方法" | 由明确规则引导的 AI 生成的偏好。 |

## 延伸阅读

- [Christiano et al. (2017). 基于人类偏好的深度强化学习](https://arxiv.org/abs/1706.03741) — 开启 RLHF 的论文。
- [Ouyang et al. (2022). InstructGPT — 训练语言模型以通过人类反馈遵循指令](https://arxiv.org/abs/2203.02155) — ChatGPT 背后的配方。
- [Stiennon et al. (2020). 通过人类反馈学习摘要](https://arxiv.org/abs/2009.01325) — 早期的摘要 RLHF。
- [Rafailov et al. (2023). 直接偏好优化](https://arxiv.org/abs/2305.18290) — DPO；2026 年后 RLHF 的默认方法。
- [Bai et al. (2022). 宪法 AI：来自 AI 反馈的无害性](https://arxiv.org/abs/2212.08073) — RLAIF 和自我批评循环。
- [Anthropic RLHF 论文 (Bai et al. 2022). 训练一个有益且无害的助手](https://arxiv.org/abs/2204.05862) — HH 论文。
- [Hugging Face TRL 库](https://huggingface.co/docs/trl) — 生产级 `RewardTrainer` 和 `PPOTrainer`。阅读训练器源码了解自适应 KL 和值头详情。
- [Hugging Face — 图解人类反馈强化学习](https://huggingface.co/blog/rlhf) 作者 Lambert, Castricato, von Werra, Havrilla — 带图表的三阶段流水线规范讲解。
- [von Werra et al. (2020). TRL：Transformer 强化学习](https://github.com/huggingface/trl) — 该库；`examples/` 包含 Llama、Mistral 和 Qwen 的端到端 RLHF 脚本。
- [Sutton & Barto (2018). 第 17.4 章 — 设计奖励信号](http://incompleteideas.net/book/RLbook2020.pdf) — 奖励假说视角；思考奖励黑客的必备前提知识。
