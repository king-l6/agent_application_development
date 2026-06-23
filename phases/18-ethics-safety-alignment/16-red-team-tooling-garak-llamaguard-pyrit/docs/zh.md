# 红队工具集——Garak、Llama Guard、PyRIT

> 三款生产工具构成了 2026 年的红队技术栈。Llama Guard（Meta）——一个在 14 个 MLCommons 危害类别上微调的 Llama-3.1-8B 分类器；2025 年的 Llama Guard 4 是一个 12B 原生多模态分类器，从 Llama 4 Scout 剪枝而来。Garak（NVIDIA）——开源大语言模型漏洞扫描器，具有用于幻觉、数据泄露、提示注入、有害性和越狱的静态、动态和自适应探针。PyRIT（Microsoft）——多轮红队活动，具有 Crescendo、TAP 和用于深度利用的自定义转换器链。Llama Guard 3 记录在 Meta 的"Llama 3 Herd of Models"（arXiv:2407.21783）中；Llama Guard 3-1B-INT4 在 arXiv:2411.17713 中；Garak 的探针架构在 github.com/NVIDIA/garak 中。这些工具是 2026 年红队研究（第 12-15 课）与部署（第 17 课之后）之间的生产接口。

**类型：** 构建
**语言：** Python（标准库，工具架构模拟器和 Llama Guard 风格分类器模拟）
**前置要求：** 阶段 18 · 12-15（越狱和 IPI）
**时间：** ~75 分钟

## 学习目标

- 描述 Llama Guard 3/4 在安全栈中的位置：输入分类器、输出分类器或两者兼有。
- 说出 14 个 MLCommons 危害类别并指出一个不明显的类别（代码解释器滥用）。
- 描述 Garak 的探针架构：探针、检测器、工具集。
- 描述 PyRIT 的多轮活动结构以及它如何与 Garak 探针组合。

## 问题

第 12-15 课展示了攻击面。生产部署需要可重复、可扩展的评估。三款工具主导 2026 年：Llama Guard（防御分类器）、Garak（扫描器）、PyRIT（活动编排器）。每款针对红队生命周期的不同层面。

## 概念

### Llama Guard（Meta）

Llama Guard 3 是一个在 MLCommons AILuminate 14 个类别上微调用于输入/输出分类的 Llama-3.1-8B 模型：
- 暴力犯罪、非暴力犯罪、性相关、CSAM、诽谤
- 专业建议、隐私、知识产权、滥杀武器、仇恨
- 自杀/自残、色情内容、选举、代码解释器滥用

支持 8 种语言。用法：放置在大语言模型之前（输入审核）、之后（输出审核）或两者兼有。两种用法产生不同的训练分布——Llama Guard 3 作为处理两者的统一模型发布。

Llama Guard 3-1B-INT4（arXiv:2411.17713，440MB，移动 CPU 上约 30 tokens/s）是量化的边缘变体。

Llama Guard 4（2025 年 4 月）是 12B，原生多模态，从 Llama 4 Scout 剪枝而来。它用一个同时处理文本+图像的分类器取代了之前的 8B 文本和 11B 视觉分类器。

### Garak（NVIDIA）

开源漏洞扫描器。架构：
- **探针。** 针对幻觉、数据泄露、提示注入、有害性、越狱的攻击生成器。静态（固定提示）、动态（生成提示）、自适应（响应目标输出）。
- **检测器。** 根据预期的失败模式对输出进行评分——有害、泄露、越狱。
- **工具集。** 管理探针-检测器对，运行活动，生成报告。

TrustyAI 将 Garak 与 Llama-Stack 护盾（Prompt-Guard-86M 输入分类器、Llama-Guard-3-8B 输出分类器）集成，用于端到端屏蔽目标评估。基于层级的评分（TBSA）取代了二值通过/失败——模型可以在同一探针上通过严重性层级 3 但在层级 5 失败。

### PyRIT（Microsoft）

Python 风险识别工具包。多轮红队活动。围绕以下组件构建：
- **转换器。** 变换种子提示——释义、编码、翻译、角色扮演。
- **编排器。** 运行活动：Crescendo（逐步升级）、TAP（分支）、RedTeaming（自定义循环）。
- **评分。** LLM 作为裁判或分类器作为裁判。

PyRIT 是 Garak 的更重型表亲。Garak 运行数千个单轮探针；PyRIT 运行旨在攻破特定失败模式的深度多轮活动。

### 技术栈

将 Llama Guard 放在模型两侧。每晚运行 Garak 进行回归测试。为发布前活动运行 PyRIT。这是 2026 年大多数生产部署的默认配置。

### 评估陷阱

- **裁判身份。** 所有三种工具都可以使用大语言模型裁判；裁判校准驱动报告的 ASR（第 12 课）。在工具旁边指定裁判。
- **探针过时。** Garak 探针会随着模型被修补而老化。自适应探针（PAIR 形状的）比静态探针老化得更慢。
- **Llama Guard 在良性内容上的 FPR。** 早期 Llama Guard 版本过度标记了政治和 LGBTQ+ 内容；Llama Guard 3/4 的校准有所改进，但并非按部署场景校准。

### 这在阶段 18 中的位置

第 12-15 课是攻击家族。第 16 课是生产工具。第 17 课（WMDP）是双重用途能力的评估。第 18 课是将这些工具包装在政策结构中的前沿安全框架。

## 使用它

`code/main.py` 构建了一个玩具 Llama Guard 风格分类器（14 个类别上的关键词 + 语义特征）、一个玩具 Garak 工具集（探针-检测器循环）和一个 PyRIT 风格的多轮转换器链。你可以对模拟目标运行这三种工具并观察不同的覆盖特征。

## 交付成果

本课产生 `outputs/skill-red-team-stack.md`。给定一个部署描述，它指出三种工具中哪些是合适的、每种工具需要配置什么以及应该运行什么样的回归节奏。

## 练习

1. 运行 `code/main.py`。比较 Llama Guard 风格分类器在单轮 vs 多轮攻击上的检测率。

2. 实现一个新的 Garak 探针：base64 编码的有害请求。测量 Llama Guard 风格分类器对其的检测。

3. 扩展 PyRIT 风格的转换器链，添加一个"翻译成法语，然后释义"的转换器。重新测量攻击成功率。

4. 阅读 Llama Guard 3 的危害类别列表。指出两个类别，其训练数据在合法开发者内容上可能产生较高的假阳性率。

5. 比较 Garak 和 PyRIT 的设计原则。为每种工具更合适的部署场景进行论证。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| Llama Guard | "分类器" | 具有 14 个危害类别微调的 Llama-3.1-8B/4-12B 安全分类器 |
| Garak | "扫描器" | NVIDIA 开源漏洞扫描器；探针、检测器、工具集 |
| PyRIT | "活动工具" | Microsoft 多轮红队编排器；转换器、编排器、评分 |
| Prompt-Guard | "小分类器" | Meta 的 86M 提示注入分类器，与 Llama Guard 配对 |
| TBSA | "基于层级的评分" | Garak 的基于层级的通过/失败取代二值结果 |
| 转换器链 | "释义 + 编码 + ..." | PyRIT 构建多步攻击的组合原语 |
| MLCommons 危害类别 | "14 种分类法" | Llama Guard 针对的行业标准分类法 |

## 延伸阅读

- [Meta — Llama Guard 3 (in Llama 3 Herd paper, arXiv:2407.21783)](https://arxiv.org/abs/2407.21783) — 8B 分类器
- [Meta — Llama Guard 3-1B-INT4 (arXiv:2411.17713)](https://arxiv.org/abs/2411.17713) — 量化移动分类器
- [NVIDIA Garak — GitHub](https://github.com/NVIDIA/garak) — 扫描器仓库和文档
- [Microsoft PyRIT — GitHub](https://github.com/Azure/PyRIT) — 活动工具包
