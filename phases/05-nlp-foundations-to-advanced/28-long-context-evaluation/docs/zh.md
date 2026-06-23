# 长上下文评估 — NIAH、RULER、LongBench、MRCR

> Gemini 3 Pro 宣称支持 1000 万 token 的上下文。在 100 万 token 时，8-needle MRCR 降至 26.3%。宣称的不等于可用的。长上下文评估告诉你实际部署的模型真正有多大的能力。

**类型：** 学习
**语言：** Python
**前置知识：** 阶段 5 · 13（问答），阶段 5 · 23（分块策略）
**时间：** ~60 分钟

## 问题

你有一份 200 页的合同。模型声称有 100 万 token 的上下文窗口。你将合同粘贴进去问："终止条款是什么？"模型回答了——但答案来自封面页，因为终止条款在 12 万 token 深处，超出了模型实际关注的范围。

这就是 2026 年的上下文容量差距。规格说明书写着 100 万或 1000 万。现实是其中 60-70% 是可用的，而"可用"取决于任务。

- **检索（大海捞针）：** 在前沿模型的宣称最大值内接近完美。
- **多跳 / 聚合：** 在大多数模型上，超过 12.8 万后急剧下降。
- **分散事实上的推理：** 第一个失效的任务。

长上下文评估衡量这些维度。本课介绍了各个基准测试的名称、每个基准实际测量什么，以及如何为你的领域构建自定义的 needle 测试。

## 概念

![NIAH 基线、RULER 多任务、LongBench 整体评估](../assets/long-context-eval.svg)

**大海捞针（NIAH, 2023）。** 在长上下文中的控制深度放置一个事实（"魔法词是 pineapple"）。让模型检索它。遍历深度 × 长度。最初的长上下文基准。前沿模型现在在这个测试上已经饱和；这是一个必要但不充分的基线。

**RULER（Nvidia, 2024）。** 4 个类别的 13 种任务类型：检索（单键 / 多键 / 多值）、多跳追踪（变量跟踪）、聚合（常见词频率）、QA。可配置上下文长度（4k 到 128k+）。揭示了那些在 NIAH 上表现良好但在多跳上失败的模型。在 2024 年的版本中，声称 32k+ 上下文的 17 个模型中只有一半在 32k 时保持了质量。

**LongBench v2（2024）。** 503 道多项选择题，8k-200 万词上下文，六个任务类别：单文档 QA、多文档 QA、长上下文学习、长对话、代码仓库、长结构化数据。面向真实世界长上下文行为的生产环境基准。

**MRCR（多轮共指消解）。** 大规模多轮共指。8-needle、24-needle、100-needle 变体。揭示了模型在注意力退化之前能处理多少个事实。

**NoLiMa。** "非词汇 needle"。needle 和查询没有字面上的重叠；检索需要一步语义推理。比 NIAH 更难。

**HELMET。** 拼接多个文档，从其中任一文档中提问。测试选择性注意力。

**BABILong。** 将 bAbI 推理链嵌入无关的干草堆中。测试"在干草堆中推理"，而不仅仅是检索。

### 实际应该报告什么

- **宣称的上下文窗口。** 规格说明书上的数字。
- **有效检索长度。** 在某个阈值（如 90%）下的 NIAH 通过率。
- **有效推理长度。** 在该阈值下的多跳或聚合通过率。
- **退化曲线。** 准确率 vs 上下文长度，按任务类型绘制。

你的规格说明书上两个数字：检索有效长度和推理有效长度。通常推理有效长度是宣称窗口的 25-50%。

## 动手实现

### 步骤 1：为你的领域构建自定义 NIAH

参见 `code/main.py`。骨架代码：

```python
def build_haystack(filler_text, needle, depth_ratio, total_tokens):
    if not (0.0 <= depth_ratio <= 1.0):
        raise ValueError(f"depth_ratio must be in [0, 1], got {depth_ratio}")
    if total_tokens <= 0:
        raise ValueError(f"total_tokens must be positive, got {total_tokens}")

    filler_tokens = tokenize(filler_text)
    needle_tokens = tokenize(needle)
    if not filler_tokens:
        raise ValueError("filler_text produced no tokens")

    # Repeat filler until long enough to fill the haystack body.
    body_len = max(total_tokens - len(needle_tokens), 0)
    while len(filler_tokens) < body_len:
        filler_tokens = filler_tokens + filler_tokens
    filler_tokens = filler_tokens[:body_len]

    insert_at = min(int(body_len * depth_ratio), body_len)
    haystack = filler_tokens[:insert_at] + needle_tokens + filler_tokens[insert_at:]
    return " ".join(haystack)


def score_niah(model, haystack, question, expected):
    answer = model.complete(f"Context: {haystack}\nQ: {question}\nA:", max_tokens=50)
    return 1 if expected.lower() in answer.lower() else 0
```

遍历 `depth_ratio` ∈ {0, 0.25, 0.5, 0.75, 1.0} × `total_tokens` ∈ {1k, 4k, 16k, 64k}。绘制热力图。这就是你目标模型的 NIAH 卡片。

### 步骤 2：多 needle 变体

```python
def build_multi_needle(filler, needles, total_tokens):
    depths = [0.1, 0.4, 0.7]
    chunks = [filler[:int(total_tokens * 0.1)]]
    for depth, needle in zip(depths, needles):
        chunks.append(needle)
        next_chunk = filler[int(total_tokens * depth): int(total_tokens * (depth + 0.3))]
        chunks.append(next_chunk)
    return " ".join(chunks)
```

像"三个魔法词是什么？"这样的问题需要检索全部三个。单 needle 的成功并不能预测多 needle 的成功。

### 步骤 3：多跳变量追踪（RULER 风格）

```python
haystack = """X1 = 42. ... (filler) ... X2 = X1 + 10. ... (filler) ... X3 = X2 * 2."""
question = "What is X3?"
```

答案需要串联三个赋值。前沿模型在 128k 时通常降至 50-70% 的准确率。

### 步骤 4：在你的栈上运行 LongBench v2

```python
from datasets import load_dataset
longbench = load_dataset("THUDM/LongBench-v2")

def eval_model_on_longbench(model, subset="single-doc-qa"):
    tasks = [x for x in longbench["test"] if x["task"] == subset]
    correct = 0
    for x in tasks:
        answer = model.complete(x["context"] + "\n\nQ: " + x["question"], max_tokens=20)
        if normalize(answer) == normalize(x["answer"]):
            correct += 1
    return correct / len(tasks)
```

按类别报告准确率。聚合分数掩盖了大的任务级差异。

## 陷阱

- **仅 NIAH 评估。** 在 100 万 token 上通过 NIAH 并不能说明多跳能力。始终运行 RULER 或自定义多跳测试。
- **均匀深度采样。** 许多实现只测试 depth=0.5。测试 depth=0, 0.25, 0.5, 0.75, 1.0——"中间丢失"效应是真实存在的。
- **与 filler 的词汇重叠。** 如果 needle 与 filler 共享关键词，检索变得微不足道。使用 NoLiMa 风格的非重叠 needles。
- **忽略延迟。** 100 万 token 的提示需要 30-120 秒进行预填充。在准确率的同时测量首 token 时间。
- **厂商自报数字。** OpenAI、Google、Anthropic 都发布自己的分数。始终在你自己的用例上独立重新运行。

## 应用

2026 年的技术栈：

| 场景 | 基准 |
|-----------|-----------|
| 快速健康检查 | 自定义 NIAH，3 个深度 × 3 个长度 |
| 生产环境模型选择 | 在目标长度上的 RULER（13 个任务） |
| 真实世界问答质量 | LongBench v2 单文档 QA 子集 |
| 多跳推理 | BABILong 或自定义变量追踪 |
| 对话式 | 在目标长度上的 MRCR 8-needle |
| 模型升级回归 | 固定的内部 NIAH + RULER 框架，每个新模型上运行 |

生产环境的经验法则：在你确认 NIAH + 至少一个推理任务在你预期的长度上通过之前，永远不要信任上下文窗口。

## 交付

保存为 `outputs/skill-long-context-eval.md`：

```markdown
---
name: long-context-eval
description: 为给定模型和用例设计一套长上下文评估方案。
version: 1.0.0
phase: 5
lesson: 28
tags: [nlp, long-context, evaluation]
---

给定目标模型、目标上下文长度和用例，输出：

1. 测试。NIAH 深度 × 长度网格；RULER 多跳；自定义领域任务。
2. 采样。在每个长度上测试深度 0, 0.25, 0.5, 0.75, 1.0。
3. 指标。检索通过率；推理通过率；首 token 时间；每次查询成本。
4. 截断点。有效检索长度（90% 通过率）和有效推理长度（70% 通过率）。报告两者。
5. 回归。固定框架，在每个模型升级时重新运行，展示差异。

拒绝仅凭模型卡片就信任上下文窗口。拒绝为任何多跳工作负载使用仅 NIAH 的评估。拒绝将厂商自报的长上下文分数作为独立证据。
```

## 练习

1. **简单。** 构建一个 NIAH，包含 3 个深度（0.25, 0.5, 0.75）× 3 个长度（1k, 4k, 16k）。在任何模型上运行。绘制 3×3 通过率热力图。
2. **中等。** 添加一个 3-needle 变体。测量在每个长度上检索全部 3 个的能力。与相同长度下的单 needle 通过率进行比较。
3. **困难。** 构建一个嵌入在 64k filler 中的变量追踪任务（X1 → X2 → X3，3 跳）。在 3 个前沿模型上测量准确率。报告每个模型的有效推理长度。

## 关键术语

| 术语 | 通常说法 | 实际含义 |
|------|-----------------|-----------------------|
| NIAH | 大海捞针 | 在 filler 中植入一个事实，让模型检索它。 |
| RULER | NIAH 的增强版 | 13 种任务类型，覆盖检索 / 多跳 / 聚合 / QA。 |
| 有效上下文 | 真正的容量 | 准确率仍高于阈值时的长度。 |
| 中间丢失 | 深度偏见 | 模型对长输入中间部分的内容关注不足。 |
| 多 needle | 同时多个事实 | 多个植入点；测试注意力分配，而不仅仅是检索。 |
| MRCR | 多轮共指 | 8、24 或 100-needle 共指；揭示注意力饱和。 |
| NoLiMa | 非词汇 needle | needle 和查询没有字面上的 token 重叠；需要推理。 |

## 延伸阅读

- [Kamradt (2023). Needle in a Haystack analysis](https://github.com/gkamradt/LLMTest_NeedleInAHaystack) — 原始的 NIAH 仓库。
- [Hsieh 等 (2024). RULER: What's the Real Context Size of Your Long-Context LMs?](https://arxiv.org/abs/2404.06654) — 多任务基准测试。
- [Bai 等 (2024). LongBench v2](https://arxiv.org/abs/2412.15204) — 真实世界长上下文评估。
- [Modarressi 等 (2024). NoLiMa: Non-lexical needles](https://arxiv.org/abs/2404.06666) — 更难 needle。
- [Kuratov 等 (2024). BABILong](https://arxiv.org/abs/2406.10149) — 干草堆中推理。
- [Liu 等 (2024). Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — 深度偏见论文。
