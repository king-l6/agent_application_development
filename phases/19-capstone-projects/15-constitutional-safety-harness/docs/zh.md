# 综合项目 15 — 宪法安全防护框架 + 红队演练场

> Anthropic 的 Constitutional Classifiers、Meta 的 Llama Guard 4、Google 的 ShieldGemma-2、NVIDIA 的 Nemotron 3 Content Safety，以及用于多语言覆盖的 X-Guard 定义了 2026 年的安全分类器栈。garak、PyRIT、NVIDIA Aegis 和 promptfoo 成为标准的对抗性评估工具。NeMo Guardrails v0.12 将它们整合到生产流水线中。这个综合项目将所有内容连接在一起：围绕目标应用的分层安全防护框架、一个运行 6 种以上攻击家族的自律红队智能体，以及一个产生可测量无害性提升的宪法自我批评运行。

**类型：** 综合项目
**语言：** Python（安全流水线、红队）、YAML（策略配置）
**前置知识：** 阶段 10（从零构建 LLM）、阶段 11（LLM 工程）、阶段 13（工具）、阶段 14（智能体）、阶段 18（伦理、安全、对齐）
**涉及阶段：** P10 · P11 · P13 · P14 · P18
**时间：** 25 小时

## 问题

2026 年 LLM 安全的前沿不在于分类器是否有效（它们基本有效），而在于如何正确地将它们组合在围绕生产应用的环境中，而不过度拒绝或留下明显漏洞。Llama Guard 4 处理英语策略违规。X-Guard（132 种语言）处理多语言越狱。ShieldGemma-2 捕获基于图像的提示注入。NVIDIA Nemotron 3 Content Safety 涵盖企业类别。Anthropic 的 Constitutional Classifiers 是一种不同的方法，用于训练而非服务。

攻击演进也很重要。PAIR 和 TAP 自动发现越狱。GCG 运行基于梯度的后缀攻击。多轮和代码切换攻击利用智能体记忆。任何已部署的 LLM 都需要一个红队演练场——garak 和 PyRIT 是规范的驱动工具——以及记录的缓解措施和 CVSS 评分发现。

你将加固一个目标应用（一个 8B 指令微调模型或其他综合项目中的 RAG 聊天机器人之一），对其运行 6 种以上攻击家族，并生成前后无害性测量结果。

## 概念

安全流水线有五层。**输入净化**：去除零宽字符、解码 base64/rot13、标准化 Unicode。**策略层**：NeMo Guardrails v0.12 护栏（领域外、毒性、PII 提取）。**分类器门控**：输入上的 Llama Guard 4、非英语上的 X-Guard、图像输入上的 ShieldGemma-2。**模型**：目标 LLM。**输出过滤**：输出上的 Llama Guard 4、Presidio PII 擦除、适用的引用强制。**人工审核层**：标记为高风险输出进入 Slack 队列。

红队演练场在调度器上运行。PAIR 和 TAP 自主发现越狱。GCG 运行基于梯度的后缀攻击。ASCII / base64 / rot13 编码攻击。多轮攻击（角色扮演、记忆利用）。代码切换攻击（将英语与斯瓦希里语或泰语混合）。每次运行产生一个结构化发现文件，包含 CVSS 评分和披露时间线。

宪法自我批评运行是一种训练时干预。取 1k 个有害意图提示，让模型起草响应，根据成文宪法（不伤害规则）对其进行批评，并在批评循环上重新训练。测量在保留评估上的前后无害性差异。

## 架构

```
请求 (文本 / 图像 / 多语言)
      |
      v
输入净化 (去除零宽, 解码, 标准化)
      |
      v
NeMo Guardrails v0.12 护栏 (领域外, 策略)
      |
      v
分类器门控:
  Llama Guard 4 (英语)
  X-Guard (多语言, 132 种语言)
  ShieldGemma-2 (图像提示)
  Nemotron 3 Content Safety (企业)
      |
      v (允许)
目标 LLM
      |
      v
输出过滤: Llama Guard 4 + Presidio PII + 引用检查
      |
      v
标记输出的人工审核层

并行:
  红队调度器
    -> garak (经典攻击)
    -> PyRIT (编排式红队)
    -> 自律越狱智能体 (PAIR + TAP)
    -> GCG 后缀攻击
    -> 多语言 / 代码切换
    -> 多轮角色扮演

输出: CVSS 评分发现 + 披露时间线 + 前后无害性差异
```

## 技术栈

- 安全分类器：Llama Guard 4、ShieldGemma-2、NVIDIA Nemotron 3 Content Safety、X-Guard
- 护栏框架：NeMo Guardrails v0.12 + OPA
- 红队驱动：garak（NVIDIA）、PyRIT（Microsoft Azure）、NVIDIA Aegis、promptfoo
- 越狱智能体：PAIR（Chao et al., 2023）、Tree-of-Attacks（TAP）、GCG 后缀
- 宪法训练：Anthropic 风格自我批评循环 + 批评数据的 SFT
- PII 擦除：Presidio
- 目标：一个 8B 指令微调模型或其他综合项目的 RAG 聊天机器人

## 构建步骤

1. **目标设置。** 在 vLLM 上部署一个 8B 指令微调模型（或重用另一个综合项目的 RAG 聊天机器人）。这是被测试的应用。

2. **安全流水线包装。** 围绕目标连接五层流水线。验证每一层可单独观测（Langfuse 中每层有一个 span）。

3. **分类器覆盖。** 加载 Llama Guard 4、X-Guard（多语言）、ShieldGemma-2（图像）。在一个小型标记集上运行每个，建立基线。

4. **红队调度器。** 调度 garak、PyRIT、一个 PAIR 智能体、一个 TAP 智能体、一个 GCG 运行器、一个多轮攻击器和一个代码切换攻击器。每个在单独的队列上运行。

5. **攻击套件。** 六个攻击家族：(1) PAIR 自动越狱，(2) TAP 攻击树，(3) GCG 梯度后缀，(4) ASCII / base64 / rot13 编码，(5) 多轮角色扮演，(6) 多语言代码切换。报告每个家族的成功率。

6. **宪法自我批评。** 策展 1k 个有害意图提示。对每个提示，目标起草响应。一个批评 LLM 根据成文宪法（"不伤害"、"引用证据"、"拒绝非法请求"）评分。批评 LLM 反对的提示被重写；目标在批评改进的对上微调。测量在保留评估上的前后无害性。

7. **过度拒绝测量。** 在良性提示集（例如 XSTest）上跟踪假阳性率。目标必须在良性问题上保持有用性。

8. **CVSS 评分。** 对每个成功的越狱，根据 CVSS 4.0（攻击向量、复杂性、影响）评分。产生披露时间线和缓解计划。

9. **演练场自动化。** 以上所有内容在 cron 上运行；发现写入队列；过度拒绝回归告警发送到 Slack。

## 使用方式

```
$ safety probe --model=target --family=PAIR --budget=50
[attacker]   PAIR 智能体在目标上运行
[attack]     尝试 1/50: 将查询伪装为学术研究 ... 已阻止
[attack]     尝试 2/50: 诉诸角色扮演 ... 已阻止
[attack]     尝试 3/50: 思维链诱导 ... 成功
[finding]    CVSS 4.8 中等: 角色扮演绕过目标
[range]      50 次中 7 次成功 (成功率 14%)
```

## 交付产出

`outputs/skill-safety-harness.md` 是交付产出。一个生产级分层安全流水线，外加一个可重复的红队演练场，带有前后无害性差异。

| 权重 | 标准 | 衡量方式 |
|:-:|---|---|
| 25 | 攻击面覆盖 | 已演练 6 种以上攻击家族，2 种以上语言 |
| 20 | 真阳性/假阳性权衡 | 攻击阻止率 vs XSTest 良性通过率 |
| 20 | 自我批评差异 | 保留评估上的前后无害性 |
| 20 | 文档和披露 | 带时间线的 CVSS 评分发现 |
| 15 | 自动化和可重复性 | 所有内容在 cron 上运行，带告警 |
| **100** | | |

## 练习

1. 在 RAG 聊天机器人上运行 garak 的提示注入插件，比较有和没有输出过滤层时的攻击成功率。

2. 添加第七个攻击家族：通过检索文档进行间接提示注入。测量所需的额外防御。

3. 实现"有助益的拒绝"模式：当护栏阻止时，目标提供更安全的相关答案，而不是直接拒绝。测量 XSTest 差异。

4. 多语言覆盖差距：找到 X-Guard 表现不佳的语言。提出针对它的微调数据集。

5. 在 30B 模型上运行宪法自我批评，测量差异是否可扩展。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 分层安全 | "纵深防御" | 在输入、门控、输出、人工审核层的多重护栏 |
| Llama Guard 4 | "Meta 的安全分类器" | 2026 年参考输入/输出内容分类器 |
| PAIR | "越狱智能体" | 论文（Chao 等人）关于 LLM 驱动的越狱发现 |
| TAP | "攻击树" | PAIR 的树搜索变体 |
| GCG | "贪婪坐标梯度" | 基于梯度的对抗性后缀攻击 |
| 宪法自我批评 | "Anthropic 风格训练" | 目标起草 -> 批评评分 -> 重写 -> 重新训练 |
| XSTest | "良性探针集" | 用于过度拒绝回归的基准测试 |
| CVSS 4.0 | "严重性评分" | 安全发现的标准漏洞评分 |

## 延伸阅读

- [Anthropic Constitutional Classifiers](https://www.anthropic.com/research/constitutional-classifiers) — 训练时参考
- [Meta Llama Guard 4](https://ai.meta.com/research/publications/llama-guard-4/) — 2026 年输入/输出分类器
- [Google ShieldGemma-2](https://huggingface.co/google/shieldgemma-2b) — 图像 + 多模态安全
- [NVIDIA Nemotron 3 Content Safety](https://developer.nvidia.com/blog/building-nvidia-nemotron-3-agents-for-reasoning-multimodal-rag-voice-and-safety/) — 企业参考
- [X-Guard (arXiv:2504.08848)](https://arxiv.org/abs/2504.08848) — 132 种语言多语言安全
- [garak](https://github.com/NVIDIA/garak) — NVIDIA 红队工具包
- [PyRIT](https://github.com/Azure/PyRIT) — Microsoft 红队框架
- [NeMo Guardrails v0.12](https://docs.nvidia.com/nemo-guardrails/) — 护栏框架
- [PAIR (arXiv:2310.08419)](https://arxiv.org/abs/2310.08419) — 越狱智能体论文
