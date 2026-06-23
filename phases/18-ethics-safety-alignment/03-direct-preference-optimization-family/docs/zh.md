# 直接偏好优化家族

> Rafailov 等人（2023）证明了 RLHF 的最优解在偏好数据上具有闭式解，因此你可以跳过显式奖励模型，直接优化策略。这一洞察催生了一个家族——IPO、KTO、SimPO、ORPO、BPO——每个都修复了 DPO 的一个失败模式。到 2026 年，直接对齐算法在前沿后训练中占据了比 PPO 更多的份额。但第 2 课的过度优化曲线仍然适用：DAA 并没有逃过古德哈特定律，它们只是改变了定律发挥作用的位置。

**类型：** 学习
**语言：** Python（标准库，六种变体偏好损失比较器）
**前置要求：** 阶段 18 · 01（InstructGPT），阶段 18 · 02（奖励黑客），阶段 10 · 08（DPO 基础）
**时间：** ~75 分钟

## 学习目标

- 从带 KL 约束的 RLHF 最优解推导出 DPO 闭式解。
- 指出 IPO、KTO、SimPO、ORPO、BPO 各自修复了 DPO 中的哪个失败模式。
- 区分"隐式奖励差距"与"偏好强度"，并解释为什么 IPO 的恒等映射很重要。
- 解释为什么 Rafailov 等人（NeurIPS 2024）证明 DAA 虽无显式 RM 但仍然过度优化。

## 问题

RLHF 目标（第 1 课）：

```
max_pi E_{x,y~pi} [ r(x, y) ] - beta * KL(pi || pi_ref)
```

具有已知的最优解：

```
pi*(y|x) = (1/Z(x)) * pi_ref(y|x) * exp(r(x, y) / beta)
```

因此奖励由最优策略与参考策略的比率隐式定义：

```
r(x, y) = beta * log(pi*(y|x) / pi_ref(y|x)) + beta * log Z(x)
```

将其代入 Bradley-Terry 偏好似然函数后，配分函数 `Z(x)` 被消去，因为它只依赖于 `x`。剩下的是一个仅包含策略参数的损失函数——不需要奖励模型。这就是 DPO。

难点在于：推导假设最优解是可达到的、偏好数据是分布内的、参考策略是真实模式锚点。这些假设没有一个是完全成立的。家族中的每个成员都修复了一个被违反的假设。

## 概念

### DPO（Rafailov 等人，2023）

```
L_DPO = -log sigmoid(
  beta * log(pi(y_w | x) / pi_ref(y_w | x))
  - beta * log(pi(y_l | x) / pi_ref(y_l | x))
)
```

可能出错的地方：

- 隐式奖励差距 `beta * (log(pi/pi_ref)_w - log(pi/pi_ref)_l)` 是无界的。一个微小的偏好可能产生任意大的差距。
- 损失函数驱使选中和拒绝的对数概率向相反方向移动。只要拒绝的对数概率下降得更快，它就可以使选中的绝对对数概率下降。这就是"降级选中回复"现象。
- 分布外的偏好（罕见对 vs 罕见对）会产生任意的隐式奖励。

### IPO（Azar 等人，2024）

恒等偏好优化将对数 sigmoid 替换为偏好概率上的恒等映射。损失函数变为有界目标上的平方误差：

```
L_IPO = (log(pi(y_w | x) / pi_ref(y_w | x)) - log(pi(y_l | x) / pi_ref(y_l | x)) - 1/(2 beta))^2
```

边界由 `1/(2 beta)` 限定。偏好强度与隐式奖励差距成正比。不存在爆炸问题。

### KTO（Ethayarajh 等人，2024）

Kahneman-Tversky 优化完全去除了成对结构。给定单个标注输出和一个二值"可取"或"不可取"信号，将其映射到前景理论效用：

```
v(x, y) = sigma(beta * log(pi(y|x) / pi_ref(y|x)) - z_ref)
```

对收益和损失采用不同权重（损失厌恶）。优点：可以使用非配对数据，这类数据要丰富得多。

### SimPO（Meng 等人，2024）

简单偏好优化将训练信号与生成对齐。完全移除参考策略，并按长度归一化对数似然：

```
L_SimPO = -log sigmoid(
  (beta / |y_w|) * log pi(y_w | x)
  - (beta / |y_l|) * log pi(y_l | x)
  - gamma
)
```

使用边界 `gamma` 来稳定训练。长度归一化消除了利用 DPO 长度偏差失败模式的动机（较长的 `y_w` 天然会产生更大的对数概率差距）。

### ORPO（Hong 等人，2024）

几率比偏好优化在标准 SFT 负对数似然基础上增加了一个偏好项：

```
L_ORPO = L_NLL(y_w) + lambda * L_OR
L_OR = -log sigmoid(log(odds(y_w) / odds(y_l)))
```

无需参考策略——SFT 项本身就是正则化器。从基础模型到对齐模型只需单阶段训练，无需单独的 SFT 检查点。

### BPO（ICLR 2026 投稿，OpenReview id=b97EwMUWu7）

识别了"降级选中回复"问题：DPO 保留了 `y_w > y_l` 的排序，但 `y_w` 的绝对对数概率可能下降。BPO 增加了一行修正代码，惩罚选中回复上的下降。在 Llama-3.1-8B-Instruct 的数学推理上报告比 DPO 提升 +10.1% 的准确率。

### 普适结论：DAA 仍然过度优化

Rafailov 等人的"直接对齐算法中奖励模型过度优化的缩放定律"（NeurIPS 2024）使用 DPO、IPO、SLiC 在多个数据集上跨 KL 预算训练策略。黄金奖励 vs KL 的曲线具有与 Gao 等人相同的峰值-崩溃形状。隐式奖励在训练期间查询了分布外样本；KL 正则化无法稳定这一现象。

DAA 并没有逃过古德哈特定律。它们只是将问题发生的表面从"奖励模型过度优化"变成了"参考策略比率过度优化。"通用的解决办法——更好的数据、集成方法、早停——对两者都适用。

### 如何选择（2026）

- 如果你有大量成对的偏好数据：使用带保守 beta 的 DPO，如果存在明显的长度偏差则使用 SimPO。
- 如果你有非配对的二值反馈：使用 KTO。
- 如果你想要从基础模型开始的单阶段流程：使用 ORPO。
- 如果你在 DPO 日志中看到选中的对数概率下降：使用 BPO。
- 如果偏好强度差异很大且 DPO 正在饱和：使用 IPO。

每个实验室都会在电池测试中运行全部五种方法，然后为每个任务选择胜者。没有理由认为数学推理和安全性的最优解是一样的。

```figure
dpo-margin
```

## 使用它

`code/main.py` 在一个玩具偏好数据集上比较六种损失函数（DPO、IPO、KTO、SimPO、ORPO、BPO），其中真实的偏好强度因不同配对而异。每种损失函数都针对相同的 500 对样本进行优化，使用一个小的 softmax 策略。最终绘制每种方法的胜率、选中对数概率漂移和隐式奖励分布。

## 交付成果

本课产生 `outputs/skill-preference-loss-selector.md`。给定数据集统计信息（成对 vs 非配对、可变 vs 均匀偏好强度、长度分布）和目标（单阶段或 SFT 后偏好），推荐一个偏好损失并报告它防范的失败模式。

## 练习

1. 运行 `code/main.py`。报告 DPO 和 BPO 最终选中的对数概率下降。BPO 应保持更高的选中绝对概率——验证这一点。

2. 修改偏好数据，使所有配对具有相同的强度。六种方法中哪种最鲁棒？哪种退化？解释 IPO 在此处的优势。

3. 使拒绝回复的平均长度是选中回复的 2 倍。在不改变其他任何条件的情况下，用数据展示 DPO 的长度利用现象和 SimPO 的修复。

4. Rafailov 等人（NeurIPS 2024）声称 DAA 过度优化。重现一个单点版本：绘制选中减去拒绝的 KL 散度，并观察 DPO 在较大 beta 下的过度优化。

5. 阅读 BPO 论文摘要（OpenReview b97EwMUWu7）。写下 BPO 在 DPO 基础上添加的一行修正代码。与 `code/main.py` 中的实现进行对照确认。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| DPO | "没有奖励模型的 RLHF" | 从 RLHF 闭式最优解推导出的损失函数；仅包含策略参数 |
| 隐式奖励 | "对数比率" | `beta * log(pi(y\|x) / pi_ref(y\|x))` — DPO 隐含的奖励 |
| IPO | "有界 DPO" | 将对数 sigmoid 替换为恒等映射；隐式奖励差距由 `1/(2 beta)` 限定 |
| KTO | "非配对 DPO" | 基于前景理论的单标签效用函数，具有损失厌恶特性 |
| SimPO | "无参考 DPO" | 长度归一化对数似然 + 边界；无需参考策略 |
| ORPO | "单阶段 DPO" | NLL + 几率比偏好项；从基础模型一次训练完成 |
| BPO | "保留选中的 DPO" | DPO 加上对降低选中回复绝对对数概率的惩罚 |
| 降级选中 | "选中下降" | DPO 降低选中的对数概率，只要拒绝的下降得更快 |
| DAA | "直接对齐算法" | 任何跳过显式 RM 的偏好损失方法 |

## 延伸阅读

- [Rafailov 等人 — Direct Preference Optimization (NeurIPS 2023, arXiv:2305.18290)](https://arxiv.org/abs/2305.18290)
- [Azar 等人 — A General Theoretical Paradigm to Understand Learning from Human Preferences (AISTATS 2024, arXiv:2310.12036)](https://arxiv.org/abs/2310.12036) — IPO
- [Ethayarajh 等人 — KTO: Model Alignment as Prospect Theoretic Optimization (arXiv:2402.01306)](https://arxiv.org/abs/2402.01306)
- [Meng, Xia, Chen — SimPO (NeurIPS 2024, arXiv:2405.14734)](https://arxiv.org/abs/2405.14734)
- [Hong, Lee, Thorne — ORPO (EMNLP 2024, arXiv:2403.07691)](https://arxiv.org/abs/2403.07691)
- [BPO — Behavior Preservation Optimization (ICLR 2026 OpenReview b97EwMUWu7)](https://openreview.net/forum?id=b97EwMUWu7)
- [Rafailov 等人 — Scaling Laws for RM Overoptimization in DAAs (NeurIPS 2024, arXiv:2406.02900)](https://arxiv.org/abs/2406.02900)
