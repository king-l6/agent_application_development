# 提示缓存与上下文缓存

> 你的系统提示是 4,000 个 token。你的 RAG 上下文是 20,000 个 token。你在每次请求中都发送这两者。你也在每次请求中都为它们付费。提示缓存（Prompt caching）让提供者在其侧保留那个前缀，并在复用时只向你收取正常费率的 10%。正确使用时，它能将推理成本降低 50-90%，将首 token 延迟降低 40-85%。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 11 · 01（提示工程），阶段 11 · 05（上下文工程），阶段 11 · 11（缓存与成本）
**时间：** ~60 分钟

## 问题

一个编码代理在对话的每一轮中都向 Claude 发送相同的 15,000 token 系统提示。二十轮对话，按 $3/M 输入 token 计算，仅输入成本就达 $0.90——还不包括用户的任何实际消息。乘以 10,000 个日常对话，账单达到 $9,000/天，只为那些从不改变的文本。

你无法在不影响质量的情况下缩小提示。你也无法避免发送它——模型在每一轮都需要它。唯一的办法是停止为提供者已经见过的前缀支付全价。

这个办法就是提示缓存。Anthropic 于 2024 年 8 月发布了它（2025 年推出了 1 小时扩展 TTL 变体），OpenAI 在同年晚些时候实现了自动化，Google 在 Gemini 1.5 旁发布了显式上下文缓存，现在这三家都在其前沿模型上将其作为一级功能提供。

## 概念

![提示缓存：一次写入，廉价读取](../assets/prompt-caching.svg)

**机制。** 当一个请求的前缀与最近某个请求的前缀匹配时，提供者会使用之前运行的 KV 缓存，而不是重新编码这些 token。你第一次支付一个小额的写入溢价，之后每次读取都能享受大幅折扣。

**2026 年的三种提供者风格。**

| 提供者 | API 风格 | 命中折扣 | 写入溢价 | 默认 TTL | 最小可缓存量 |
|---------|----------|---------|---------|----------|------------|
| Anthropic | 内容块上的显式 `cache_control` 标记 | 输入费用 90% 折扣 | 25% 附加费 | 5 分钟（可延长至 1 小时） | 1,024 token（Sonnet/Opus），2,048（Haiku） |
| OpenAI | 自动前缀检测 | 输入费用 50% 折扣 | 无 | 最长 1 小时（尽力而为） | 1,024 token |
| Google（Gemini） | 显式 `CachedContent` API | 存储计费；读取约为正常费率的 25% | 每 token·小时存储费 | 用户设置（默认 1 小时） | 4,096 token（Flash），32,768（Pro） |

**不变规则。** 三家都只缓存前缀。如果请求之间有任何 token 不同，第一个不同 token 之后的所有内容都会缓存未命中。将*稳定*的部分放在顶部，*可变*的部分放在底部。

### 缓存友好的布局

```
[系统提示]           <-- 缓存这部分
[工具定义]           <-- 缓存这部分
[少样本示例]         <-- 缓存这部分
[检索到的文档]       <-- 如果复用则缓存，否则不缓存
[对话历史]           <-- 缓存到最近一轮
[当前用户消息]       <-- 永远不缓存（每次不同）
```

违反这个顺序——将用户消息放在系统提示之上，在少样本示例之间插入动态检索——缓存将永远不会命中。

### 盈亏平衡计算

Anthropic 的 25% 写入溢价意味着一个缓存块至少需要被读取两次才能净省钱。1 次写入 + 1 次读取平均每请求 0.675x 成本（节省 32%）；1 次写入 + 10 次读取平均 0.205x（节省 80%）。经验法则：缓存任何你预期在 TTL 内至少复用 3 次的内容。

## 构建它

### 步骤 1：Anthropic 的显式标记提示缓存

```python
import anthropic

client = anthropic.Anthropic()

SYSTEM = [
    {
        "type": "text",
        "text": "你是一位资深的 Python 审查员。请严格按照评分标准进行审查。\n\n" + RUBRIC_15K_TOKENS,
        "cache_control": {"type": "ephemeral"},
    }
]

def review(code: str):
    return client.messages.create(
        model="claude-opus-4-7",
        max_tokens=1024,
        system=SYSTEM,
        messages=[{"role": "user", "content": code}],
    )
```

`cache_control` 标记告诉 Anthropic 将该块存储 5 分钟。在该窗口内复用时命中；过期后复用时重新写入。

**响应使用量字段：**

```python
response = review(code_a)
response.usage
# InputTokensUsage(
#     input_tokens=120,
#     cache_creation_input_tokens=15023,   # 按 1.25x 计费
#     cache_read_input_tokens=0,
#     output_tokens=340,
# )

response_b = review(code_b)
response_b.usage
# cache_creation_input_tokens=0
# cache_read_input_tokens=15023           # 按 0.1x 计费
```

在 CI 中检查这两个字段——如果 `cache_read_input_tokens` 在多次请求中保持为零，你的缓存键正在漂移。

### 步骤 2：一小时扩展 TTL

对于长时间运行的批处理作业，5 分钟默认值可能在作业之间过期。设置 `ttl`：

```python
{"type": "text", "text": RUBRIC, "cache_control": {"type": "ephemeral", "ttl": "1h"}}
```

1 小时 TTL 的成本是写入溢价的 2 倍（比基准高 50%，而非 25%），但在任何复用水前缀超过 5 次的批次中都能快速回本。

### 步骤 3：OpenAI 自动缓存

OpenAI 没有给你任何需要配置的东西。任何超过 1,024 个 token 且与最近请求匹配的前缀都会自动获得 50% 的折扣。

```python
from openai import OpenAI
client = OpenAI()

resp = client.chat.completions.create(
    model="gpt-5",
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},   # 长且稳定
        {"role": "user", "content": user_msg},
    ],
)
resp.usage.prompt_tokens_details.cached_tokens  # 打折的部分
```

同样的缓存友好布局规则适用。有两件事会破坏 OpenAI 的缓存但不会破坏 Anthropic 的：更改 `user` 字段（用作缓存键的组成部分）和重新排列工具。

### 步骤 4：Gemini 显式上下文缓存

Gemini 将缓存视为一个你创建和命名的一级对象：

```python
from google import genai
from google.genai import types

client = genai.Client()

cache = client.caches.create(
    model="gemini-3-pro",
    config=types.CreateCachedContentConfig(
        display_name="rubric-v3",
        system_instruction=RUBRIC,
        contents=[FEW_SHOT_EXAMPLES],
        ttl="3600s",
    ),
)

resp = client.models.generate_content(
    model="gemini-3-pro",
    contents=["Review this code:\n" + code],
    config=types.GenerateContentConfig(cached_content=cache.name),
)
```

Gemini 在缓存存活期间按每 token·小时收取存储费，读取费用约为正常输入费率的 25%。当你在数天内跨多个会话复用同一个巨大提示时，这是正确的选择。

### 步骤 5：在生产中测量命中率

参见 `code/main.py`，了解一个模拟的三提供者会计程序，它跟踪写入/读取/未命中次数并计算每 1K 请求的混合成本。在达到目标命中率之前不要部署——预热后，大多数 Anthropic 生产设置应看到 >80% 的读取占比。

## 2026 年仍然存在的陷阱

- **顶部的动态时间戳。** 系统提示顶部的 `"Current time: 2026-04-22 15:30:02"`。每次请求都会未命中。将时间戳移到缓存断点之下。
- **工具重新排列。** 以稳定顺序序列化工具——部署之间的字典重排会破坏每一次命中。
- **自由文本的近似重复。** "You are helpful." 与 "You are a helpful assistant." ——一个字节的差异 = 完全未命中。
- **块太小。** Anthropic 强制执行 1,024 token 下限（Haiku 为 2,048）。较小的块静默地不缓存。
- **盲目的成本仪表盘。** 将"输入 token"拆分为已缓存和未缓存。否则流量下降看起来像是缓存的胜利。

## 使用它

2026 年的缓存技术栈：

| 场景 | 选择 |
|------|------|
| 具有稳定 10k+ 系统提示、多轮对话的代理 | Anthropic `cache_control`，5 分钟 TTL |
| 复用前缀超过 30 分钟的批处理作业 | Anthropic 带 `ttl: "1h"` |
| GPT-5 上的无服务器端点，无自定义基础设施 | OpenAI 自动缓存（只需让你的前缀稳定且足够长） |
| 多天复用大型代码/文档库 | Gemini 显式 `CachedContent` |
| 跨提供者回退 | 保持可缓存前缀布局在所有提供者中相同，以便任何命中都能工作 |

结合语义缓存（阶段 11 · 11）用于用户消息层：提示缓存处理 *token 相同* 的复用，语义缓存处理 *含义相同* 的复用。

## 交付物

保存 `outputs/skill-prompt-caching-planner.zh.md`：

```markdown
---
name: prompt-caching-planner
description: 设计缓存友好的提示布局并选择正确的提供者缓存模式。
version: 1.0.0
phase: 11
lesson: 15
tags: [llm-engineering, caching, cost]
---

给定一个提示（系统 + 工具 + 少样本 + 检索 + 历史 + 用户）和使用概况（每小时请求数、所需 TTL、提供者），输出：

1. 布局。重新排序的部分，标记一个缓存断点；解释哪些部分是稳定的，哪些是易变的。
2. 提供者模式。Anthropic cache_control、OpenAI 自动缓存或 Gemini CachedContent。从 TTL 和复用模式证明选择。
3. 盈亏平衡。TTL 内每次写入的预期读取次数；与无缓存相比的净成本，附带计算。
4. 验证计划。CI 断言：在第二个相同请求上，cache_read_input_tokens > 0；仪表盘按已缓存和未缓存 token 拆分。
5. 故障模式。列出此设置中缓存最可能未命中的三个原因（动态时间戳、工具重新排列、近似重复文本）以及你将如何预防每种情况。

拒绝交付将动态字段放在断点之上的缓存计划。拒绝在复用次数不足以使 2x 写入溢价回本时启用 1 小时 TTL。
```

## 练习

1. **简单。** 针对 Claude 进行一次 10 轮对话，其中包含 5,000 token 的系统提示。先不使用 `cache_control` 运行，然后使用。报告每次的输入 token 费用。
2. **中等。** 编写一个测试工具，给定一个提示模板和请求日志，计算每个提供者（Anthropic 5m、Anthropic 1h、OpenAI 自动、Gemini 显式）的预期命中率和美元节省。
3. **困难。** 构建一个布局优化器：给定一个提示和一串标记为 `stable=True/False` 的字段，在不丢失信息的情况下重写提示，将缓存断点放在最大缓存友好位置。在真实的 Anthropic 端点上验证。

## 关键术语

| 术语 | 人们说的 | 实际含义 |
|------|---------|---------|
| 提示缓存（Prompt caching） | "让长提示变便宜" | 复用提供者端的 KV 缓存以匹配前缀；重复输入 token 享受 50-90% 折扣。 |
| `cache_control` | "Anthropic 的标记" | 内容块属性，声明"从这里开始都是可缓存的"；`{"type": "ephemeral"}`。 |
| 缓存写入（Cache write） | "支付溢价" | 第一次请求填充缓存；在 Anthropic 上按约 1.25x 输入费率计费，OpenAI 免费。 |
| 缓存读取（Cache read） | "折扣" | 后续匹配前缀的请求；按 10%（Anthropic）、50%（OpenAI）、约 25%（Gemini）计费。 |
| TTL | "存活时间" | 缓存保持温热的秒数；Anthropic 默认 5 分钟（可延长至 1 小时），OpenAI 尽力最长 1 小时，Gemini 用户设置。 |
| 扩展 TTL | "1 小时 Anthropic 缓存" | `{"type": "ephemeral", "ttl": "1h"}`；2x 写入溢价但对批量复用值得。 |
| 前缀匹配（Prefix match） | "为什么我的缓存未命中" | 只有当从开始到断点的每个 token 都字节完全相同时缓存才会命中。 |
| 上下文缓存（Gemini） | "显式的那种" | Google 的有名称的、按存储计费的缓存对象；最适合多天复用大型语料库。 |

## 延伸阅读

- [Anthropic — 提示缓存](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — `cache_control`、1 小时 TTL、盈亏平衡表。
- [OpenAI — 提示缓存](https://platform.openai.com/docs/guides/prompt-caching) — 自动前缀匹配。
- [Google — 上下文缓存](https://ai.google.dev/gemini-api/docs/caching) — `CachedContent` API 和存储定价。
- [Anthropic engineering — 长上下文工作负载的提示缓存](https://www.anthropic.com/news/prompt-caching) — 原始发布文章，包含延迟数据。
- 阶段 11 · 05（上下文工程）— 在哪里切分提示以便缓存能够落地。
- 阶段 11 · 11（缓存与成本）— 将提示缓存与用户消息的语义缓存配对使用。
- [Pope 等人，"Efficiently Scaling Transformer Inference" (2022)](https://arxiv.org/abs/2211.05102) — 提示缓存暴露给用户的 KV 缓存内存模型；解释了为什么缓存前缀比重新计算便宜约 10 倍。
- [Agrawal 等人，"SARATHI: Efficient LLM Inference by Piggybacking Decodes with Chunked Prefills" (2023)](https://arxiv.org/abs/2308.16369) — 预填充是提示缓存跳过的阶段；本文解释了为什么 TTFT 在缓存命中时急剧下降而 TPOT 不受影响。
- [Leviathan 等人，"Fast Inference from Transformers via Speculative Decoding" (2023)](https://arxiv.org/abs/2211.17192) — 提示缓存与推测解码、Flash Attention 和 MQA/GQA 并列，都是弯曲推理成本曲线的杠杆；阅读本文了解其他三种。
