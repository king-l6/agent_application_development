# OpenAI Preparedness Framework 与 DeepMind Frontier Safety Framework

> OpenAI Preparedness Framework v2（2025年4月）引入了研究类别（Research Categories）—— 长程自主（Long-range Autonomy）、沙袋效应（Sandbagging）、自主复制与适应（Autonomous Replication and Adaptation）、破坏安全机制（Undermining Safeguards）—— 与跟踪类别（Tracked Categories）区分开来。跟踪类别会触发能力报告（Capabilities Reports）以及由安全咨询组（Safety Advisory Group）审查的安全机制报告（Safeguards Reports）。DeepMind 的 FSF v3（2025年9月，2026年4月17日新增跟踪能力等级（Tracked Capability Levels））将自主能力纳入 ML 研发和网络安全域（ML R&D 自主等级 1 = 以与人类+AI工具竞争的成本完全自动化 AI 研发管线）。FSF v3 通过针对工具性推理滥用的自动化监控，明确应对欺骗性对齐（deceptive alignment）。诚实说明：PF v2 中的研究类别（包括长程自主）不会自动触发缓解措施；政策语言是"潜在"的。DeepMind 自身也表示，如果工具性推理增强，自动化监控"长期来看将不足以维持"。

**类型：** 学习
**语言：** Python（标准库，三框架决策表差异比对工具）
**前置条件：** Phase 15 · 19（Anthropic RSP）
**时间：** ~45 分钟

## 问题

第 19 课详细阅读了 Anthropic 的扩展政策。本课通过阅读 OpenAI 和 DeepMind 的政策来完善全景图。这三份文档是解决同一问题的同类产物 —— 前沿实验室何时应暂停或限制模型发布 —— 它们在一小套类别上趋于一致，在若干关键点上存在分歧。

趋同之处：三者都将长程自主标记为值得跟踪的能力类别。三者都承认欺骗性行为（对齐造假、沙袋效应）是一类特定风险。三者都设有内部审查机构。分歧之处：OpenAI 将类别分为"跟踪"（强制缓解）和"研究"（无自动触发条件）。DeepMind 将自主能力融入两个领域而非单独命名。各实验室对跟踪与研究、关键与中等、一级与二级的命名各异；能力所属类别的操作后果在不同实验室间各不相同。

将三者一起阅读是有价值的练习。同一种能力在 Anthropic 可能是"强制缓解"，在 OpenAI 是"监控但不触发"，在 DeepMind 是"在特定领域内跟踪"。政策姿态至关重要。

## 概念

### OpenAI Preparedness Framework v2（2025 年 4 月）

结构：

- **跟踪类别（Tracked Categories）**：触发能力报告（模型能做什么）以及安全机制报告（采取了哪些缓解措施）。在部署前由安全咨询组审查。
- **研究类别（Research Categories）**：实验室正在跟踪但尚未承诺特定缓解措施的模型能力。包括长程自主、沙袋效应、自主复制与适应、破坏安全机制。

v2 的关键定位：研究类别不会自动触发缓解措施。政策语言是"潜在"缓解措施。这是需要关注的具体差异：一个类别属于跟踪还是研究，决定了它是"被限制"还是"被观察"。

### DeepMind Frontier Safety Framework v3（2025 年 9 月；2026 年 4 月 17 日新增跟踪能力等级）

结构：

- **关键能力等级（CCLs）**：跨越五个领域的能力阈值：网络安全、生物、ML 研发、CBRN、自主能力（融入 ML 研发和网络安全）。
- **跟踪能力等级（Tracked Capability Levels）**：2026 年 4 月新增的细化粒度。具体示例：ML R&D 自主等级 1 = 以与人类+AI工具竞争的成本完全自动化 AI 研发管线。
- **欺骗性对齐监控**：明确承诺对工具性推理滥用进行自动化监控。

自主能力的框架定位与 OpenAI 不同。DeepMind 不将"自主"作为顶层领域；它被融入自主会造成危害的领域（ML 研发和网络安全）。论点是没有领域依托的自主只是没有风险的能力；反论点则是跨领域自主是一个框架应该命名的元风险。

### 三者趋同之处

- 内部安全咨询组（Anthropic SAG、OpenAI SAG、DeepMind 内部委员会）。高能力模型部署前审查。
- 明确提及欺骗性对齐/对齐造假作为一类风险。
- 按声明节奏产出的常设工件（Anthropic：前沿安全路线图、风险报告；OpenAI：能力和安全机制报告；DeepMind：FSF 更新周期）。
- 承认仅靠监控的防御存在天花板。DeepMind 明确表示："自动化监控长期来看将不足以维持。"

### 分歧之处

- **Anthropic**：v3.0 移除了暂停承诺；AI R&D-4 阈值是下一个命名的关口。
- **OpenAI**：跟踪与研究的分裂；研究类别（包括长程自主）不会自动触发限制。
- **DeepMind**：自主能力融入其他领域；2026 年 4 月跟踪能力等级增加了细化粒度。

### 沙袋效应：一个使三者都复杂化的特定能力

沙袋效应（模型在评估中策略性表现不佳）属于 OpenAI 的研究类别。Anthropic 的 RSP v3.0 通过评估-上下文差距（第 1 课）来解决。DeepMind 通过 FSF v3 中的欺骗性对齐监控来解决。

如果模型在评估中沙袋效应，每个框架的能力阈值都会被低估。框架的有效性取决于测量的有效性。这就是为什么外部测量（第 21 课，METR）和对抗性评估除了实验室自我评估之外也是必要的。

### 政策阅读技能

- **定位**：你关心的每种能力都应在政策中可找到。如果找不到，政策未覆盖该能力。
- **分类**：它是跟踪（触发缓解）还是研究（跟踪但不触发）？OpenAI 明确命名了这一点；Anthropic 和 DeepMind 有自己的等效分类。
- **节奏**：政策是按声明的时间表更新，还是仅在特定事件后更新？声明的时间表更可靠。
- **独立性**：外部审查是强制性的还是可选的？Anthropic 与 Apollo 和美国 AI 安全研究所合作；OpenAI 与 METR 合作；DeepMind 主要依赖内部 SAG。

## 使用它

`code/main.py` 实现了一个小型决策表差异比对工具。给定一种能力（自主、欺骗性对齐、研发自动化、网络能力提升等），输出三个政策分别如何分类该能力，以及触发哪些缓解措施。它是一个阅读辅助工具，而非政策工具。

## 交付它

`outputs/skill-cross-policy-diff.md` 针对特定能力生成跨政策对比，使用三个框架作为参考。

## 练习

1. 运行 `code/main.py`。确认差异比对工具的输出与你可对照源文件验证的至少两种能力的政策描述一致。

2. 完整阅读 OpenAI Preparedness Framework v2。识别每个研究类别。针对每个类别，用一句话说明它为何属于研究而非跟踪类别。

3. 完整阅读 DeepMind FSF v3，以及 2026 年 4 月的跟踪能力等级更新。识别 ML R&D 自主等级 1 的具体评估标准。你将如何在外部进行测量？

4. 沙袋效应属于 OpenAI 的研究类别。设计一个能够迫使沙袋效应模型暴露其实际能力的评估。参考第 1 课的评估-上下文博弈讨论。

5. 针对一种特定能力（自选）比较三个政策。指出你认为最严格和最不严格的分类，并引用原始文本加以论证。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|---|---|---|
| Preparedness Framework | "OpenAI 的扩展政策" | PF v2（2025 年 4 月）；跟踪与研究类别 |
| Tracked Category | "强制缓解" | 触发能力 + 安全机制报告；SAG 审查 |
| Research Category | "仅监控" | 已跟踪但无自动缓解措施；包括长程自主 |
| Frontier Safety Framework | "DeepMind 的扩展政策" | FSF v3（2025 年 9 月）+ 跟踪能力等级（2026 年 4 月） |
| CCL | "关键能力等级" | DeepMind 各领域阈值（网络安全、生物、ML 研发、CBRN） |
| ML R&D 自主等级 1 | "研发自动化" | 以竞争成本完全自动化 AI 研发管线 |
| Sandbagging | "策略性表现不佳" | 模型在评估中表现低于实际能力；属于 OpenAI 研究类别 |
| Instrumental reasoning | "手段-目的推理" | 关于如何实现目标的推理；DeepMind 监控的目标 |

## 延伸阅读

- [OpenAI — Updating our Preparedness Framework](https://openai.com/index/updating-our-preparedness-framework/) — v2 公告。
- [OpenAI — Preparedness Framework v2 PDF](https://cdn.openai.com/pdf/18a02b5d-6b67-4cec-ab64-68cdfbddebcd/preparedness-framework-v2.pdf) — 完整文档。
- [DeepMind — Strengthening our Frontier Safety Framework](https://deepmind.google/blog/strengthening-our-frontier-safety-framework/) — FSF v3 公告。
- [DeepMind — Updating the Frontier Safety Framework (April 2026)](https://deepmind.google/blog/updating-the-frontier-safety-framework/) — 跟踪能力等级补充。
- [Gemini 3 Pro FSF Report](https://storage.googleapis.com/deepmind-media/gemini/gemini_3_pro_fsf_report.pdf) — FSF 格式风险报告示例。
