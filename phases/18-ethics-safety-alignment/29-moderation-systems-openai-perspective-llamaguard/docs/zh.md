# 审核系统——OpenAI、Perspective、Llama Guard

> 生产审核系统将第 12-16 课定义的安全策略付诸实施。OpenAI 审核 API：`omni-moderation-latest`（2024）基于 GPT-4o 构建，一次调用即可分类文本和图像；在多语言测试集上比之前版本好 42%；响应模式返回 13 个类别布尔值——骚扰、骚扰/威胁、仇恨、仇恨/威胁、违法、违法/暴力、自残、自残/意图、自残/指令、色情、色情/未成年人、暴力、暴力/色情；对大多数开发者免费。分层模式：输入审核（生成前）、输出审核（生成后）、自定义审核（领域规则）。异步并行调用隐藏延迟；在标记时返回占位符响应。Llama Guard 3/4（第 16 课）：14 个 MLCommons 危害类别、代码解释器滥用、8 种语言（v3）、多图像（v4）。Perspective API（Google Jigsaw）：毒性评分，早于 LLM-as-moderator 浪潮；主要是单一维度毒性评分，带有严重毒性/侮辱/粗俗变体；内容审核研究的基线。弃用：Azure Content Moderator 于 2024 年 2 月弃用，2027 年 2 月退役，由 Azure AI Content Safety 取代。

**类型：** 构建
**语言：** Python（标准库，三层审核工具集）
**前置知识：** 阶段 18 · 16（Llama Guard / Garak / PyRIT）
**时长：** ~60 分钟

## 学习目标

- 描述 OpenAI 审核 API 的类别分类法及其与 Llama Guard 3 的 MLCommons 集合的不同之处。
- 描述三层审核模式（输入、输出、自定义）并指出每层的一个故障模式。
- 描述 Perspective API 作为前 LLM 时代基线的位置及其为何在研究领域仍被使用。
- 说明 Azure 的弃用时间线。

## 问题

第 12-16 课描述了攻击和防御工具。第 29 课涵盖了在用户接触产品的界面上落实防御措施的已部署审核系统。三层模式是 2026 年的默认配置。

## 概念

### OpenAI 审核 API

`omni-moderation-latest`（2024）。基于 GPT-4o 构建。一次调用即可分类文本和图像。对大多数开发者免费。

类别（响应模式中的 13 个布尔值）：
- 骚扰、骚扰/威胁
- 仇恨、仇恨/威胁
- 自残、自残/意图、自残/指令
- 色情、色情/未成年人
- 暴力、暴力/色情
- 违法、违法/暴力

多模态支持适用于`暴力`、`自残`和`色情`，但不适用于`色情/未成年人`；其余为纯文本。

在 `code/main.py` 的代码工具中，为教学简洁起见，我们将 `/威胁`、`/意图`、`/指令` 和 `/色情` 子类别折叠到其顶级父类别中。生产代码应使用完整的 13 类别模式。

在多语言测试集上比上一代审核端点好 42%。按类别评分；应用程序设置阈值。

### Llama Guard 3/4

在第 16 课中涵盖。14 个 MLCommons 危害类别（组织方式不同于 OpenAI 的 13 个响应模式布尔值）。支持 8 种语言（v3）。Llama Guard 4（2025 年 4 月）原生多模态，12B。

OpenAI 和 Llama Guard 的分类法有重叠也有分歧。OpenAI 有"违法"作为宽泛类别；Llama Guard 将"暴力犯罪"和"非暴力犯罪"分开。部署根据其政策分类法契合度进行选择。

### Perspective API（Google Jigsaw）

毒性评分系统，早于 LLM-as-moderator 浪潮（2020 年前）。类别：TOXICITY、SEVERE_TOXICITY、INSULT、PROFANITY、THREAT、IDENTITY_ATTACK。单一维度主评分（TOXICITY）带有子维度变体。

广泛用作内容审核研究基线，因为该 API 稳定、有文档且拥有多年的校准数据。对于现代 LLM 相关用例，Llama Guard 或 OpenAI 审核通常是更合适的选择。

### 三层模式

1. **输入审核。** 在生成前对用户的提示进行分类。如果被标记则拒绝。延迟：一次分类器调用。
2. **输出审核。** 在投递前对模型的输出进行分类。如果被标记则替换为拒绝。延迟：生成后一次分类器调用。
3. **自定义审核。** 领域特定规则（正则表达式、允许列表、业务策略）。在输入或输出端运行。

三个层按设计顺序执行：输入审核必须在生成前完成，输出审核在生成后运行。并行性应用于同一层内——在同一文本上同时运行多个分类器（例如 OpenAI 审核 + Llama Guard + Perspective）可隐藏每个分类器的延迟。作为可选的优化，在输入审核完成和 token-1 流式传输推迟期间，可以显示占位符响应（"请稍候，正在检查..."）。标记行为是可配置的：拒绝、清理、升级到人工审核。

### 故障模式

- **仅输入。** 无法捕获输出幻觉（第 12-14 课的编码攻击可绕过输入分类器）。
- **仅输出。** 允许任何输入到达模型；增加成本；向攻击者暴露内部推理。
- **仅自定义。** 跨类别不够健壮；正则表达式很脆弱。

分层是默认配置。双重保障。

### Azure 弃用

Azure Content Moderator：2024 年 2 月弃用，2027 年 2 月退役。由 Azure AI Content Safety 取代，后者基于 LLM 并与 Azure OpenAI 集成。迁移是 Azure 部署在 2024-2027 年间的领域级项目。

### 在阶段 18 中的位置

第 16 课在红队上下文中涵盖了审核工具。第 29 课涵盖了已部署的审核。第 30 课以当前双重用途能力证据作为结束。

## 使用

`code/main.py` 构建了一个三层审核工具集：输入审核器（关键词 + 类别评分）、输出审核器（输出上的相同分类器）、自定义审核器（领域规则）。您可以运行输入并观察哪一层捕获什么。

## 交付

本课生成 `outputs/skill-moderation-stack.md`。针对给定部署，推荐审核堆栈配置：输入使用哪个分类器，输出使用哪个，哪些自定义规则，以及边界案例使用什么裁判。

## 练习

1. 运行 `code/main.py`。将良性、边界和有害输入通过所有三层运行。报告每层为哪个输入触发。

2. 扩展工具集，在特定类别上添加 Perspective API 风格的毒性评分。比较其阈值行为与类别评分。

3. 阅读 OpenAI 审核 API 文档和 Llama Guard 3 类别列表。将每个 OpenAI 类别映射到最接近的 Llama Guard 类别。识别三个不能干净映射的类别。

4. 为代码助手部署（例如 GitHub Copilot）设计审核堆栈。识别最相关和最不相关的类别，并提出自定义规则。

5. Azure Content Moderator 于 2027 年 2 月退役。规划迁移到 Azure AI Content Safety。识别迁移中风险最高的环节。

## 关键术语

| 术语 | 人们所说的 | 实际含义 |
|------|-----------|---------|
| OpenAI 审核 | "omni-moderation-latest" | 基于 GPT-4o 的 13 类别（文本）分类器，部分多模态支持 |
| Perspective API | "Google Jigsaw 毒性" | 前 LLM 时代毒性评分基线 |
| Llama Guard | "MLCommons 14 类别" | Meta 的危害分类器（v3：8B 文本，8 种语言；v4：12B 多模态） |
| 输入审核 | "生成前过滤" | 在模型调用前对用户提示进行分类 |
| 输出审核 | "生成后过滤" | 在投递前对模型输出进行分类 |
| 自定义审核 | "领域规则" | 部署特定规则（正则表达式、白名单、策略） |
| 分层审核 | "所有三层" | 标准生产部署模式 |

## 延伸阅读

- [OpenAI 审核 API 文档](https://platform.openai.com/docs/api-reference/moderations) — omni-moderation 端点
- [Meta PurpleLlama + Llama Guard](https://github.com/meta-llama/PurpleLlama) — Llama Guard 仓库
- [Google Jigsaw Perspective API](https://perspectiveapi.com/) — 毒性评分
- [Azure AI Content Safety](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/) — Azure 替代方案
