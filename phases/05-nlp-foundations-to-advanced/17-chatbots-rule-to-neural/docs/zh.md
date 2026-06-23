# 聊天机器人 — 从基于规则到神经网络再到 LLM 智能体

> ELIZA 用模式匹配回复。DialogFlow 映射意图。GPT 从权重中回答。Claude 运行工具并验证。每个时代解决了前一个时代最严重的失败。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 13（问答系统）、阶段 5 · 14（信息检索）
**时间：** ~75 分钟

## 问题

用户说"我想改签航班。"系统必须弄清楚他们想要什么、缺少什么信息、如何获取以及如何完成操作。然后用户说"等等，如果我取消呢？"系统必须记住上下文、切换任务并保持状态。

对话对 ML 系统来说很难。输入是开放式的。输出必须在多轮对话中保持一致。系统可能需要对世界采取行动（改签航班、扣款）。每一个错误步骤都是用户可见的。

聊天机器人架构经历了四种范式，每一种都是因为前一种失败得太明显而被引入的。本节课按顺序介绍它们。2026 年的生产环境是最后两种的混合。

## 概念

![聊天机器人演进：基于规则 → 检索 → 神经 → 智能体](../assets/chatbot.svg)

**基于规则（ELIZA、AIML、DialogFlow）。** 手工编写的模式匹配用户输入并产生回复。意图分类器路由到预定义的流程。槽填充状态机收集所需信息。在其设计的狭窄范围内工作得很好。超出范围立即失败。仍在安全关键领域（银行认证、机票预订）中部署，这些地方不允许幻觉。

**基于检索。** 类似 FAQ 的系统。编码每一对（话语、回复）。运行时，编码用户的消息并检索最接近的存储回复。可以想象成 Zendesk 经典的"相似文章"功能。比规则更好地处理改写。没有生成，所以没有幻觉。

**神经（seq2seq）。** 在对话日志上训练的编码器-解码器。从头生成回复。流畅但倾向于通用输出（"我不知道"）和事实漂移。从不可靠地保持在主题上。这就是 Google、Facebook 和微软在 2016-2019 年都有令人失望的聊天机器人的原因。

**LLM 智能体。** 一个语言模型包裹在一个循环中，进行规划、调用工具和验证结果。不是带长提示的聊天机器人。一个智能体循环：规划 → 调用工具 → 观察结果 → 决定下一步。检索优先的基础（RAG）防止它产生幻觉。工具调用让它实际上能完成任务。这是 2026 年的架构。

四种范式并非顺序替代关系。一个 2026 年的生产聊天机器人会经过所有四种路由：认证和破坏性操作用基于规则，FAQ 用检索，自然措辞用神经生成，歧义开放式查询用 LLM 智能体。

## 构建

### 步骤 1：基于规则的模式匹配

```python
import re


class RulePattern:
    def __init__(self, pattern, response_template):
        self.regex = re.compile(pattern, re.IGNORECASE)
        self.template = response_template


PATTERNS = [
    RulePattern(r"my name is (\w+)", "Nice to meet you, {0}."),
    RulePattern(r"i (need|want) (.+)", "Why do you {0} {1}?"),
    RulePattern(r"i feel (.+)", "Why do you feel {0}?"),
    RulePattern(r"(.*)", "Tell me more about that."),
]


def rule_based_respond(user_input):
    for pattern in PATTERNS:
        m = pattern.regex.match(user_input.strip())
        if m:
            return pattern.template.format(*m.groups())
    return "I don't understand."
```

20 行代码实现 ELIZA。反射技巧（"我感到难过" → "你为什么感到难过"）是 Weizenbaum 1966 年经典的心理治疗师演示。仍有教育意义。

### 步骤 2：基于检索（FAQ）

```python
from sentence_transformers import SentenceTransformer
import numpy as np


FAQ = [
    ("how do i reset my password", "Go to Settings > Security > Reset Password."),
    ("how do i cancel my order", "Go to Orders, find the order, click Cancel."),
    ("what is your return policy", "30-day returns on unused items, original packaging."),
]


encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
faq_questions = [q for q, _ in FAQ]
faq_embeddings = encoder.encode(faq_questions, normalize_embeddings=True)


def faq_respond(user_input, threshold=0.5):
    q_emb = encoder.encode([user_input], normalize_embeddings=True)[0]
    sims = faq_embeddings @ q_emb
    best = int(np.argmax(sims))
    if sims[best] < threshold:
        return None
    return FAQ[best][1]
```

基于阈值的拒绝是关键设计选择。如果最佳匹配不够接近，返回 `None` 让系统升级处理。

### 步骤 3：神经生成（基线）

使用小型指令调优的编码器-解码器（FLAN-T5）或微调的对话模型。2026 年单独在生产中不可用（矛盾、离题漂移、事实性胡言乱语），但作为混合系统中自然措辞的一部分部署。DialoGPT 风格的仅解码器模型需要显式的轮次分隔符和 EOS 处理才能产生连贯回复；FLAN-T5 的 text2text 管道对教学示例开箱即用。

```python
from transformers import pipeline

chatbot = pipeline("text2text-generation", model="google/flan-t5-small")

response = chatbot("Respond politely to: Hi there!", max_new_tokens=40)
print(response[0]["generated_text"])
```

### 步骤 4：LLM 智能体循环

2026 年生产形态：

```python
def agent_loop(user_message, tools, llm, max_steps=5):
    history = [{"role": "user", "content": user_message}]
    for _ in range(max_steps):
        response = llm(history, tools=tools)
        tool_call = response.get("tool_call")
        if tool_call:
            tool_name = tool_call.get("name")
            args = tool_call.get("arguments")
            if not isinstance(tool_name, str) or tool_name not in tools:
                history.append({"role": "assistant", "tool_call": tool_call})
                history.append({"role": "tool", "name": str(tool_name), "content": f"error: unknown tool {tool_name!r}"})
                continue
            if not isinstance(args, dict):
                history.append({"role": "assistant", "tool_call": tool_call})
                history.append({"role": "tool", "name": tool_name, "content": f"error: arguments must be a dict, got {type(args).__name__}"})
                continue
            fn = tools[tool_name]
            result = fn(**args)
            history.append({"role": "assistant", "tool_call": tool_call})
            history.append({"role": "tool", "name": tool_name, "content": result})
        else:
            return response["content"]
    return "I could not complete the task in the step budget."
```

三件事需要说明。工具是 LLM 可以调用的可调用函数。当 LLM 返回最终答案而不是工具调用时，循环终止。步骤预算防止在歧义任务上无限循环。

真实生产环境会添加：检索优先的基础（在每次 LLM 调用前注入相关文档）、护栏（拒绝未经确认的破坏性操作）、可观测性（记录每一步）和评估（自动检查智能体行为是否符合规范）。

### 步骤 5：混合路由

```python
def hybrid_chat(user_input):
    if is_destructive_action(user_input):
        return structured_flow(user_input)

    faq_answer = faq_respond(user_input, threshold=0.6)
    if faq_answer:
        return faq_answer

    return agent_loop(user_input, tools, llm)


def is_destructive_action(text):
    danger_words = ["delete", "cancel", "charge", "refund", "transfer"]
    return any(w in text.lower() for w in danger_words)
```

模式：破坏性操作使用确定性规则，预设 FAQ 使用检索，其他一切使用 LLM 智能体。这就是 2026 年客户支持系统中部署的方式。

## 使用

2026 年的技术栈：

| 用例 | 架构 |
|---------|---------------|
| 预订、支付、认证 | 基于规则的状态机 + 槽填充 |
| 客户支持 FAQ | 在精选答案上的检索 |
| 开放式帮助聊天 | 带 RAG + 工具调用的 LLM 智能体 |
| 内部工具 / IDE 助手 | 带工具调用（搜索、读取、写入）的 LLM 智能体 |
| 陪伴 / 角色聊天机器人 | 调优的 LLM 带角色系统提示、知识检索 |

在生产中始终使用混合路由。没有单一架构能完美处理所有请求。路由层本身通常是一个小型意图分类器。

## 仍然存在的失败模式

- **自信的编造。** LLM 智能体声称完成了它并未完成的操作。缓解措施：验证结果、记录工具调用、绝不让 LLM 在没有成功工具返回的情况下声称做了某事。
- **提示注入。** 用户插入覆盖系统提示的文本。在 OWASP 2025 年 LLM 应用 Top 10 中排名 LLM01。两种形式：直接注入（粘贴到聊天中）和间接注入（隐藏在智能体读取的文档、电子邮件或工具输出中）。

  攻击率因场景而异。在通用工具使用和编码基准上的测量成功率在前沿模型上约为 0.5-8.5%。特定的高风险设置（针对 AI 编码智能体的自适应攻击、易受攻击的编排）已达到约 84%。生产 CVE 包括 EchoLeak（CVE-2025-32711，CVSS 9.3）——Microsoft 365 Copilot 中由攻击者控制的电子邮件触发的零点击数据泄露漏洞。

  缓解措施：在循环中将用户输入视为不可信；在工具调用前进行清理；将工具输出与主提示隔离；使用规划-验证-执行（PVE）模式，智能体先规划，然后验证每个行动是否符合计划再执行（这可以防止工具结果注入新的非计划行动）；对破坏性操作要求用户确认；对工具范围应用最小权限原则。

  没有任何数量的提示工程能完全消除这一风险。需要外部运行时防御层（LLM Guard、白名单验证、语义异常检测）。
- **范围蔓延。** 智能体因工具调用返回了外围相关信息而偏离任务。缓解措施：缩小工具契约；保持系统提示专注；增加离题率的评估。
- **无限循环。** 智能体持续调用同一个工具。缓解措施：步骤预算、工具调用去重、关于"我们是否在取得进展"的 LLM 评判。
- **上下文窗口耗尽。** 长对话将最早的历史挤出上下文。缓解措施：总结较早的轮次、通过相似性检索相关的过去轮次、或使用长上下文模型。

## 产出

保存为 `outputs/skill-chatbot-architect.md`：

```markdown
---
name: chatbot-architect
description: 为给定的用例设计聊天机器人技术栈。
version: 1.0.0
phase: 5
lesson: 17
tags: [nlp, agents, chatbot]
---

给定产品上下文（用户需求、合规约束、可用工具、数据量），输出：

1. 架构。基于规则、检索、神经、LLM 智能体或混合（指定哪种路径去哪里）。
2. LLM 选择（如适用）。命名模型家族（Claude、GPT-4、Llama-3.1、Mixtral）。匹配工具使用质量和成本。
3. 基础策略。RAG 来源、检索方法（见第 14 课）、工具契约。
4. 评估计划。任务成功率、工具调用正确性、离题率、保留对话上的幻觉率。

拒绝为任何破坏性操作（支付、账户删除、数据修改）推荐纯 LLM 智能体，除非有结构化的确认流程。拒绝在智能体对任何内容具有写入权限时跳过提示注入审计。
```

## 练习

1. **（简单）** 用 10 个模式为咖啡店点单机器人实现基于规则的回复。测试边界情况：重复订单、修改、取消、不明确意图。
2. **（中等）** 构建混合 FAQ + LLM 回退。为 SaaS 产品准备 50 个预设 FAQ 条目，LLM 回退带文档站点检索。在 100 个真实支持问题上测量拒绝率和准确率。
3. **（困难）** 用三个工具（搜索、读取用户数据、发送邮件）实现上述智能体循环。用 50 个测试场景（包括提示注入尝试）运行评估。报告离题率、失败任务率和任何注入成功的案例。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|-----------------|-----------------------|
| 意图 | 用户想要什么 | 分类标签（book_flight、reset_password）。路由到处理器。 |
| 槽 | 一条信息 | 机器人需要的参数（日期、目的地）。槽填充是依次询问的序列。 |
| RAG | 检索加生成 | 检索相关文档，然后将 LLM 的回复扎根于其中。 |
| 工具调用 | 函数调用 | LLM 发出带名称+参数的结构化调用。运行时执行并返回结果。 |
| 智能体循环 | 规划、行动、验证 | 控制器运行 LLM 调用与工具调用交错，直到任务完成。 |
| 提示注入 | 用户攻击提示 | 试图覆盖系统提示的恶意输入。 |

## 延伸阅读

- [Weizenbaum (1966). ELIZA — A Computer Program For the Study of Natural Language Communication](https://web.stanford.edu/class/cs124/p36-weizenabaum.pdf) — 原始基于规则的聊天机器人论文。
- [Thoppilan et al. (2022). LaMDA: Language Models for Dialog Applications](https://arxiv.org/abs/2201.08239) — Google 在 LLM 智能体接管前的晚期神经聊天机器人论文。
- [Yao et al. (2022). ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — 命名智能体循环模式的论文。
- [Anthropic's guide on building effective agents](https://www.anthropic.com/research/building-effective-agents) — 2024 年生产指南，2026 年仍然有效。
- [Greshake et al. (2023). Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection](https://arxiv.org/abs/2302.12173) — 提示注入论文。
- [OWASP Top 10 for LLM Applications 2025 — LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — 使提示注入成为首要安全问题的排名。
- [AWS — Securing Amazon Bedrock Agents against Indirect Prompt Injections](https://aws.amazon.com/blogs/machine-learning/securing-amazon-bedrock-agents-a-guide-to-safeguarding-against-indirect-prompt-injections/) — 实用的编排层防御，包括规划-验证-执行和用户确认流程。
- [EchoLeak (CVE-2025-32711)](https://www.vectra.ai/topics/prompt-injection) — 来自间接提示注入的经典零点击数据泄露 CVE。说明为什么具有写入权限的智能体需要运行时防御的参考案例。
