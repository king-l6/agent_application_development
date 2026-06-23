# 对齐研究生态系统——MATS、Redwood、Apollo、METR

> 五个组织定义了 2026 年非实验室对齐研究层。MATS（ML 对齐与理论学者计划）：自 2021 年底以来 527+ 名研究人员、180+ 篇论文、10K+ 次引用、h-index 47；2024 年夏季批次注册为 501(c)(3)，约 90 名学者和 40 名导师；2025 年前校友中约 80% 从事安全/安保工作，200+ 人就职于 Anthropic、DeepMind、OpenAI、英国 AISI、RAND、Redwood、METR、Apollo。Redwood Research：由 Buck Shlegeris 创立的应用对齐实验室；引入了 AI 控制（第 10 课）；与英国 AISI 合作进行控制安全案例研究。Apollo Research：为前沿实验室提供部署前策划评估；撰写了"上下文中的策划"（第 8 课）和"AI 策划的安全案例研究"。METR（模型评估与威胁研究）：基于任务的能力评估、自主任务时间跨度研究；"前沿 AI 安全政策的共同要素"比较了实验室框架。Eleos AI Research：部署前模型福利评估（第 19 课）；进行了 Claude Opus 4 福利评估。

**类型：** 学习
**语言：** 无
**前置知识：** 阶段 18 · 01-27（先前阶段 18 课程）
**时长：** ~45 分钟

## 学习目标

- 识别非实验室对齐研究生态系统的五个组织及其核心产出。
- 描述 MATS 的规模（学者、论文、h-index）及其作为人才管道的作用。
- 描述 Redwood 的 AI 控制议程及其与英国 AISI 的合作。
- 描述 METR 基于任务评估的方法论。

## 问题

前沿实验室（第 18 课）内部产生安全评估并发布选定的结果。实验室之外的生态系统是评估得到验证、新故障模式首次被发现、以及人才得到培训的地方。理解该生态系统有助于解读哪些研究发现被谁信任。

## 概念

### MATS（ML 对齐与理论学者计划）

始于 2021 年底。研究指导计划；学者与资深研究员在特定对齐问题上花费 10-12 周。

规模（2026 年）：
- 自成立以来 527+ 名研究人员。
- 180+ 篇论文发表。
- 10K+ 次引用。
- h-index 47。
- 2024 年夏季：90 名学者 + 40 名导师；注册为 501(c)(3)。

职业成果：约 80% 的 2025 年前校友从事安全/安保工作。200+ 人就职于 Anthropic、DeepMind、OpenAI、英国 AISI、RAND、Redwood、METR、Apollo。

### Redwood Research

应用对齐实验室。由 Buck Shlegeris 创立。引入了 AI 控制议程（第 10 课）。与英国 AISI 合作进行控制安全案例研究。为 DeepMind 和 Anthropic 提供评估设计咨询。

经典论文：Greenblatt、Shlegeris 等人"AI 控制"（arXiv:2312.06942，ICML 2024）；"对齐伪装"（Greenblatt、Denison、Wright 等人，arXiv:2412.14093，与 Anthropic 合作）。

风格：特定威胁模型、最坏情况对手、可经受压力测试的具体协议。

### Apollo Research

为前沿实验室提供部署前策划评估。撰写了"上下文中的策划"（第 8 课，arXiv:2412.04984）。参与 2025 年 OpenAI 反策划训练合作。制作了"AI 策划的安全案例研究"（2024）。

风格：欺骗可能出现的代理设置评估；三支柱分解（不匹配、目标导向性、情境感知）。

### METR（模型评估与威胁研究）

基于任务的能力评估。自主任务完成时间跨度研究。"前沿 AI 安全政策的共同要素"（metr.org/common-elements，2025）比较了实验室框架。

与 Apollo 合作撰写 AI 策划安全案例草案。

风格：长跨度任务评估、经验能力测量、框架综合。

### Eleos AI Research

部署前模型福利评估。进行了 Claude Opus 4 的福利评估，记录在系统卡第 5.3 节中。为第 19 课的福利相关声明提供外部方法论检查。

### 流动

MATS 培训研究人员。毕业生进入 Anthropic、DeepMind、OpenAI（实验室安全团队）或 Redwood、Apollo、METR、Eleos（外部评估）。外部评估者与实验室以及英国 AISI / CAISI 合作。出版物将生态系统反馈给 MATS 用于下一批学员。

### 为什么这一层很重要

单一来源的评估不可靠：实验室评估自己的模型存在结构性利益冲突。外部评估者可以提出并验证实验室可能低估的故障模式。2024 年的"潜伏代理"论文（第 7 课）是 Anthropic + Redwood；"对齐伪装"是 Anthropic + Redwood；"上下文中的策划"是 Apollo；"反策划"是 Apollo + OpenAI。多组织结构就是质量控制。

### 在阶段 18 中的位置

第 7-11 课引用了 Redwood 和 Apollo 的工作；第 18 课引用了 METR 的框架比较；第 19 课引用了 Eleos。第 28 课是阶段其余部分所依赖的生态系统的明确组织地图。

## 使用

无代码。阅读 METR 的"前沿 AI 安全政策的共同要素"，了解外部综合分析如何为实验室内部政策工作增加价值。

## 交付

本课生成 `outputs/skill-ecosystem-map.md`。针对给定的对齐声明或评估，识别组织、发表场所和方法论风格，并与已知对应组织进行交叉检查。

## 练习

1. 从第 7-15 课中选择一篇论文，识别涉及的组织。将作者与 MATS 校友和当前生态系统职位进行交叉检查。

2. 阅读 METR 的"前沿 AI 安全政策的共同要素"。识别他们强调的三个跨实验室趋同点和两个最大分歧点。

3. MATS 的职业成果约 80% 在安全/安保领域。论证这种选择压力是适应性的（培养该领域）还是偏颇的（过滤了异端立场）。

4. Redwood 和 Apollo 都从事控制/策划工作，但风格不同。选择一个故障模式并描述每个组织会如何调查它。

5. Eleos AI 是唯一纯粹关注模型福利的组织。设计一个假设的第二组织，专注于不同的福利相关问题（认知自由、机器人具身化等），并阐明其方法论。

## 关键术语

| 术语 | 人们所说的 | 实际含义 |
|------|-----------|---------|
| MATS | "那个指导计划" | ML 对齐与理论学者计划；自 2021 年以来 527+ 名研究人员 |
| Redwood Research | "那个控制实验室" | 应用对齐；AI 控制作者；英国 AISI 合作伙伴 |
| Apollo Research | "那个策划评估" | 为前沿实验室提供部署前策划评估 |
| METR | "那个任务跨度评估" | 基于任务的能力评估；框架综合 |
| Eleos AI | "那个福利实验室" | 部署前模型福利评估 |
| 人才管道 | "MATS -> 实验室" | MATS 毕业生流向 Anthropic、DM、OpenAI、Redwood、Apollo、METR |
| 外部评估 | "非实验室检查" | 非模型生产方进行的评估；增加可信度 |

## 延伸阅读

- [MATS（ML 对齐与理论学者计划）](https://www.matsprogram.org/) — 指导计划
- [Redwood Research](https://www.redwoodresearch.org/) — AI 控制论文
- [Apollo Research](https://www.apolloresearch.ai/) — 策划评估
- [METR — 前沿 AI 安全政策的共同要素](https://metr.org/blog/2025-03-26-common-elements-of-frontier-ai-safety-policies/) — 框架比较
- [Eleos AI Research](https://www.eleosai.org/research) — 模型福利方法论
