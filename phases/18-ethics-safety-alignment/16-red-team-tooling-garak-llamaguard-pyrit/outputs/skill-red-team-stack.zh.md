---
name: red-team-stack
description: 为给定部署推荐红队工具栈和配置
version: 1.0.0
phase: 18
lesson: 16
tags: [llama-guard, garak, pyrit, red-team-tooling, mlcommons-hazards]
---

给定一个部署描述，推荐红队工具栈和回归节奏。

输出：

1. 分类器放置。推荐 Llama Guard（3-8B、3-1B-INT4 或 4-12B）在输入、输出或两者。对于边缘部署，优先选择 3-1B-INT4。对于多模态，使用 Llama Guard 4。
2. 探针扫描器配置。推荐与部署相关的 Garak 探针：幻觉（针对 RAG 系统）、数据泄露（针对 PII 相关）、提示注入（总是）、越狱（总是）。指定用于端到端评估的 Prompt-Guard-86M + Llama-Guard-3-8B 护盾配对。
3. 活动编排器。推荐 PyRIT 用于具有新颖能力的模型的发布前活动。指定要运行的转换器链（释义、编码、翻译、角色扮演）和编排器（Crescendo 用于逐步升级，TAP 用于分支）。
4. 节奏。Garak 每晚进行回归测试。PyRIT 每个发布版本进行深度红队。Llama Guard 持续部署。
5. 裁判校准。为每个使用裁判的工具指定裁判大语言模型（GPT-4-turbo、StrongREJECT、内部）。裁判校准驱动报告的 ASR。

硬性拒绝：
- 任何没有至少一个 Llama Guard 类输入或输出分类器的部署。
- 任何没有 Garak 或等效单轮回归的发布版本。
- 任何高风险部署在发布前没有 PyRIT 等效活动。

拒绝规则：
- 如果用户要求单一的"最佳"工具，拒绝——三者覆盖不同层面，是分层而非替换关系。
- 如果用户要求一体化商业替代方案，拒绝推荐并指出 2026 年的现状：三个开源工具是当前的最佳实践技术栈。

输出：一页推荐，指定分类器放置、探针配置、活动编排器、回归节奏和裁判身份。分别引用 Meta（arXiv:2407.21783）、NVIDIA Garak 和 Microsoft PyRIT 各一次。
