# LLM 功能的 A/B 测试 — GrowthBook、Statsig 和"凭感觉"问题

> 传统的 A/B 测试不是为非确定性的 LLM 设计的。关键区别在于：评估回答"模型能完成任务吗？"A/B 测试回答"用户在乎吗？"两者都需要；凭感觉发布已经过时了。2026 年要测试的内容：提示工程（措辞）、模型选择（GPT-4 vs GPT-3.5 vs 开源；准确率 vs 成本 vs 延迟）、生成参数（温度、top-p）。实际案例：一个聊天机器人奖励模型变体使对话长度增加 70%，留存率增加 30%；Nextdoor AI 主题行实验在奖励函数优化后实现了 +1% 的点击率；Khan Academy Khanmigo 在延迟与数学准确率的权衡上进行了迭代。平台分化：**Statsig**（2025 年 9 月被 OpenAI 以 $11 亿收购）— 序贯测试、CUPED、一体化平台。**GrowthBook** — 开源、数据仓库原生、贝叶斯 + 频率派 + 序贯引擎、CUPED、SRM 检查、Benjamini-Hochberg + Bonferroni 校正。你根据对数据仓库 SQL 的偏好以及"被 OpenAI 收购"对你的组织是否重要来进行选择。

**类型：** 学习
**语言：** Python（标准库，玩具序贯测试模拟器）
**前置知识：** 阶段 17 · 13（可观测性），阶段 17 · 20（渐进式部署）
**时间：** ~60 分钟

## 学习目标

- 区分评估（"模型能完成任务吗"）和 A/B 测试（"用户在乎吗"）。
- 列举三个可测试的维度（提示、模型、参数）并为每个维度选择指标。
- 解释 CUPED、序贯测试和 Benjamini-Hochberg 多重比较校正。
- 根据数据仓库 SQL 姿态和企业收购立场选择 Statsig 或 GrowthBook。

## 问题

你手动调优了一个系统提示。感觉更好了。你发布了它。转化率变化被噪声淹没。你责怪指标。或者你发布了一个新模型而转化率没有变化 — 是模型退化了还是变化太小无法检测？你不知道，因为你没有做 A/B 测试就发布了。

评估回答模型是否能在标注集上完成任务。它们不回答用户是否更喜欢输出。只有受控的在线实验能回答这个问题，而且只有当实验具有足够的统计功效、控制非确定性并进行多重比较校正时才能回答。

## 概念

### 评估 vs A/B 测试

**评估** — 离线、标注集、评判者（评分标准或 LLM 作为评判者或人工）。回答："在这个固定分布上，输出是否正确/有帮助/安全？"

**A/B 测试** — 在线、真实用户、随机化。回答："新变体是否改变了用户级别的关键指标？"

两者都需要。评估在暴露前捕获回归；A/B 在暴露后确认产品影响。

### 测试什么

1. **提示工程** — 措辞、系统提示结构、示例。指标：任务成功率、用户留存、每次请求成本。
2. **模型选择** — GPT-4 vs GPT-3.5-Turbo vs Llama 开源。指标：准确率（任务）+ 每次请求成本 + 延迟 P99。多目标优化。
3. **生成参数** — 温度、top-p、max_tokens。指标：任务特定（输出多样性 vs 确定性）。

### CUPED — 方差缩减

利用实验前数据进行控制实验。在比较实验后数据之前，回归掉实验前周期中的方差。典型方差缩减：30-70%。有效样本量免费增加。

实现：Statsig 和 GrowthBook 都已实现。

### 序贯测试

经典 A/B 假设固定样本量。序贯测试（"边看边决定"）在反复查看下控制假阳性率。始终有效的序贯程序（mSPRT、Howard 置信序列）允许你在明确胜者时提前停止。

### 多重比较校正

在 95% 置信水平下运行 20 个 A/B 测试，会有 1 个假阳性。Bonferroni 校正使每个测试的 α 更严格；Benjamini-Hochberg 控制错误发现率。GrowthBook 两者都实现了。

### SRM — 样本比率不匹配

分配哈希将用户随机分配到变体。如果 50/50 的分裂变成了 47/53，说明出了问题 — SRM 检查会标记它。两个平台都实现了。

### Statsig vs GrowthBook

**Statsig**：
- 2025 年 9 月被 OpenAI 以 $11 亿收购。托管式 SaaS。
- 序贯测试、CUPED、保留人群。
- 一体化：功能标志 + 实验 + 可观测性。
- 最适合：团队已经想要一个捆绑产品，不关心 OpenAI 所有权。

**GrowthBook**：
- 开源（MIT）；数据仓库原生（直接从 Snowflake/BigQuery/Redshift 读取）。
- 多个引擎：贝叶斯、频率派、序贯。
- CUPED、SRM、Bonferroni、BH 校正。
- 自托管或托管云。
- 最适合：数据仓库 SQL 型团队，数据团队控制指标层，想要开源方案。

### 非确定性使统计功效复杂化

相同的提示产生不同的输出。传统的功效计算假设 IID 观测值。由于 LLM 的非确定性，有效样本量低于名义样本量。将所需样本量乘以约 1.3-1.5 倍作为安全边际。

### 真实案例结果

- 聊天机器人奖励模型变体：对话长度 +70%，留存率 +30%。
- Nextdoor 主题行：奖励函数优化后点击率 +1%。
- Khan Academy Khanmigo：延迟与数学准确率的迭代权衡。

### 反模式：凭感觉发布

每位资深工程师都能说出一个因为"感觉更好"而没有做 A/B 就发布的功能。其中大多数回归了产品指标而团队数月都没有注意到。A/B 是强制约束。

### 你应该记住的数字

- Statsig 被 OpenAI 收购：$11 亿，2025 年 9 月。
- GrowthBook：开源 MIT；贝叶斯 + 频率派 + 序贯。
- CUPED 方差缩减：30-70%。
- LLM 非确定性 → +30-50% 样本量缓冲。

## 使用它

`code/main.py` 模拟了具有固定和序贯边界的序贯 A/B 测试。展示了序贯如何让你提前停止。

## 交付物

本课程产出 `outputs/skill-ab-plan.md`。根据功能变更、工作负载和基线，选择平台、门控和样本量。

## 练习

1. 运行 `code/main.py`。对于预期提升 5%、基线转化率 3% 的情况，达到 80% 统计功效需要多少样本量？
2. 为受医疗监管的本地部署客户选择 Statsig 或 GrowthBook。
3. 设计一个在每次解决工单的成本上测试 GPT-4 vs GPT-3.5 的 A/B 测试。主指标、护栏指标和次要指标是什么？
4. 你的金丝雀通过了但 A/B 显示转化率下降了 1.2%。你发布吗？写出升级标准。
5. 对实验前周期应用 CUPED，该周期的方差是实验后周期的 60%。计算有效样本量的提升。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|----------|----------|
| 评估 | "离线测试" | 基于标注集对模型能力的评估 |
| A/B 测试 | "实验" | 在用户上进行实时随机化比较 |
| CUPED | "方差缩减" | 利用实验前数据回归以减少方差 |
| 序贯测试 | "可边看边测的测试" | 允许提前停止的始终有效程序 |
| 多重比较 | "族系错误" | 运行多个测试会膨胀假阳性 |
| Bonferroni | "严格校正" | 将 α 除以测试数量 |
| Benjamini-Hochberg | "BH 错误发现率" | 错误发现率控制，较不保守 |
| SRM | "分配错误" | 样本比率不匹配；分配错误 |
| Statsig | "OpenAI 所有" | 商业一体化产品，2025 年被收购 |
| GrowthBook | "那个开源的" | MIT 数据仓库原生平台 |
| mSPRT | "序贯概率比检验" | 经典序贯程序 |

## 延伸阅读

- [GrowthBook — How to A/B Test AI](https://blog.growthbook.io/how-to-a-b-test-ai-a-practical-guide/)
- [Statsig — Beyond Prompts: Data-Driven LLM Optimization](https://www.statsig.com/blog/llm-optimization-online-experimentation)
- [Statsig vs GrowthBook comparison](https://www.statsig.com/perspectives/ab-testing-feature-flags-comparison-tools)
- [Deng et al. — CUPED](https://www.exp-platform.com/Documents/2013-02-CUPED-ImprovingSensitivityOfControlledExperiments.pdf)
- [Howard — Confidence Sequences](https://arxiv.org/abs/1810.08240)
