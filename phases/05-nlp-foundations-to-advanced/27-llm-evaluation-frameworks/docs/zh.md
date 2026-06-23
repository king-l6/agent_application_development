# LLM 评估 — RAGAS、DeepEval、G-Eval

> 精确匹配（Exact Match）和 F1 无法捕捉语义等价。人工审核无法规模化。LLM 作为评判官是生产环境的答案——但要经过充分校准才能信任那个分数。

**类型：** 构建
**语言：** Python
**前置知识：** 阶段 5 · 13（问答），阶段 5 · 14（信息检索）
**时间：** ~75 分钟

## 问题

你的 RAG 系统回答："June 29th, 2007。"
标准答案是："June 29, 2007。"
精确匹配得分 0。F1 得分约 75%。人类会打分 100%。

现在把这个场景乘以 10,000 个测试用例。再乘以对检索器、分块策略、提示或模型的每次更改。你需要一个能理解含义、大规模运行成本低廉、不隐瞒回归问题、并能揭示正确失败模式的评估器。

2026 年有三个框架主导这个问题。

- **RAGAS。** 检索增强生成评估。四个 RAG 指标（忠实度、答案相关性、上下文精确率、上下文召回率），使用 NLI + LLM 评判后端。研究支持，轻量级。
- **DeepEval。** 面向 LLM 的 Pytest。G-Eval、任务完成度、幻觉、偏见指标。CI/CD 原生集成。
- **G-Eval。** 一种方法（也是 DeepEval 的一个指标）：LLM 作为评判官，带思维链、自定义标准、0-1 评分。

三者都依赖 LLM 作为评判官。本课建立对该方法及其信任层的直觉。

## 概念

![四个评估维度，LLM 作为评判官架构](../assets/llm-evaluation.svg)

**LLM 作为评判官。** 用 LLM 替代静态指标，根据评分标准对输出进行打分。给定 `(查询, 上下文, 答案)`，提示评判 LLM："在忠实度上打分 0-1。"返回分数。

为什么有效：LLM 以极低的成本近似人工判断。GPT-4o-mini 每评分一个案例约 $0.003，使得 1000 样本回归评估运行成本低于 $5。

为什么它会悄无声息地失败：

1. **评判偏见。** 评判官偏爱更长的答案、来自同模型家族的答案、与提示风格匹配的答案。
2. **JSON 解析失败。** 错误的 JSON → NaN 分数 → 被悄无声息地从汇总中排除。RAGAS 用户深知这个痛点。用 try/except + 显式失败模式来防范。
3. **模型版本间的漂移。** 升级评判官会改变所有指标。固定评判模型 + 版本。

**RAGAS 四指标。**

| 指标 | 问题 | 后端 |
|--------|----------|---------|
| 忠实度 | 答案中的每个主张都来自检索到的上下文吗？ | 基于 NLI 的蕴涵判断 |
| 答案相关性 | 答案是否回答了问题？ | 从答案生成假设性问题；与真实问题比较 |
| 上下文精确率 | 在检索到的块中，有多大比例是相关的？ | LLM 评判 |
| 上下文召回率 | 检索返回了所有需要的内容吗？ | LLM 评判（对比标准答案） |

**G-Eval。** 定义一个自定义标准："答案是否引用了正确的来源？"框架自动将其扩展为思维链评估步骤，然后打分 0-1。适用于 RAGAS 未覆盖的特定领域质量维度。

**校准。** 在与人标注的相关性得到验证之前，永远不要信任原始的评判分数。运行 100 个人工标注的示例。绘制评判分数 vs 人工分数。计算 Spearman rho。如果 rho < 0.7，你的评判标准需要改进。

## 动手实现

### 步骤 1：使用 NLI 的忠实度（RAGAS 风格）

```python
from typing import Callable
from transformers import pipeline

nli = pipeline("text-classification",
               model="MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli",
               top_k=None)

# `llm` 是任何可调用对象：prompt str -> generated str。
# 示例：llm = lambda p: client.messages.create(model="claude-haiku-4-5", ...).content[0].text
LLM = Callable[[str], str]


def atomic_claims(answer: str, llm: LLM) -> list[str]:
    prompt = f"""Break this answer into simple factual claims (one per line):
{answer}
"""
    return llm(prompt).splitlines()


def faithfulness(answer: str, context: str, llm: LLM) -> float:
    claims = atomic_claims(answer, llm)
    if not claims:
        return 0.0
    supported = 0
    for claim in claims:
        result = nli({"text": context, "text_pair": claim})[0]
        entail = next((s for s in result if s["label"] == "entailment"), None)
        if entail and entail["score"] > 0.5:
            supported += 1
    return supported / len(claims)
```

将答案分解为原子主张。使用 NLI 检查每个主张与检索到的上下文。忠实度 = 被支持的比例。

### 步骤 2：答案相关性

```python
import numpy as np
from sentence_transformers import SentenceTransformer

# encoder: 任何实现 .encode(texts, normalize_embeddings=True) -> ndarray 的模型
# 例如: encoder = SentenceTransformer("BAAI/bge-small-en-v1.5")

def answer_relevance(question: str, answer: str, encoder, llm: LLM, n: int = 3) -> float:
    prompt = f"Write {n} questions this answer could be the answer to:\n{answer}"
    generated = [line for line in llm(prompt).splitlines() if line.strip()][:n]
    if not generated:
        return 0.0
    q_emb = np.asarray(encoder.encode([question], normalize_embeddings=True)[0])
    g_embs = np.asarray(encoder.encode(generated, normalize_embeddings=True))
    sims = [float(q_emb @ g_emb) for g_emb in g_embs]
    return sum(sims) / len(sims)
```

如果答案暗示的问题与提出的问题不同，则相关性下降。

### 步骤 3：G-Eval 自定义指标

```python
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCaseParams, LLMTestCase

metric = GEval(
    name="Correctness",
    criteria="The answer should be factually accurate and match the expected output.",
    evaluation_steps=[
        "Read the expected output.",
        "Read the actual output.",
        "List factual claims in the actual output.",
        "For each claim, mark supported or unsupported by the expected output.",
        "Return score = fraction supported.",
    ],
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
)

test = LLMTestCase(input="When was the first iPhone released?",
                   actual_output="June 29th, 2007.",
                   expected_output="June 29, 2007.")
metric.measure(test)
print(metric.score, metric.reason)
```

评估步骤就是评分标准。显式的步骤比隐式的"打分 0-1"提示更稳定。

### 步骤 4：CI 关卡

```python
import deepeval
from deepeval.metrics import FaithfulnessMetric, ContextualRelevancyMetric


def test_rag_system():
    cases = load_regression_cases()
    faith = FaithfulnessMetric(threshold=0.85)
    rel = ContextualRelevancyMetric(threshold=0.7)
    for case in cases:
        faith.measure(case)
        assert faith.score >= 0.85, f"faithfulness regression on {case.id}"
        rel.measure(case)
        assert rel.score >= 0.7, f"relevancy regression on {case.id}"
```

作为 pytest 文件部署。在每次 PR 上运行。对回归问题进行合并阻断。

### 步骤 5：从零开始的玩具评估

参见 `code/main.py`。仅标准库的忠实度近似（答案主张与上下文的 overlap）和相关性近似（答案 token 与问题 token 的 overlap）。不能用于生产。展示了基本形态。

## 陷阱

- **没有校准。** 与人工标注相关性 0.3 的评判官只是噪声。部署前要求进行校准运行。
- **自我评估。** 使用同一个 LLM 进行生成和评判会使分数提高 10-20%。使用不同的模型家族作为评判官。
- **成对评判中的位置偏见。** 评判官偏爱第一个呈现的选项。始终随机化顺序并双向评估。
- **原始均值掩盖失败。** 均值 0.85 往往掩盖了 5% 的灾难性失败。始终检查最低分位。
- **黄金数据集退化。** 未经版本管理的评估集会随时间漂移，破坏纵向比较。在每次更改时标记数据集。
- **LLM 成本。** 在大规模下，评判调用占主导成本。使用满足校准阈值的最便宜模型。GPT-4o-mini、Claude Haiku、Mistral-small。

## 应用

2026 年的技术栈：

| 用例 | 框架 |
|---------|-----------|
| RAG 质量监控 | RAGAS（4 个指标） |
| CI/CD 回归关卡 | DeepEval + pytest |
| 自定义领域标准 | DeepEval 中的 G-Eval |
| 在线实时流量监控 | 带无参考模式的 RAGAS |
| 人在回路抽查 | LangSmith 或带标注 UI 的 Phoenix |
| 红队 / 安全评估 | Promptfoo + DeepEval |

典型技术栈：RAGAS 用于监控，DeepEval 用于 CI，G-Eval 用于新颖维度。三者都运行；它们会有用地产生分歧。

## 交付

保存为 `outputs/skill-eval-architect.md`：

```markdown
---
name: eval-architect
description: 设计一个包含校准评判官和 CI 关卡的 LLM 评估方案。
version: 1.0.0
phase: 5
lesson: 27
tags: [nlp, evaluation, rag]
---

给定一个用例（RAG / agent / 生成式任务），输出：

1. 指标。忠实度 / 相关性 / 上下文精确率 / 上下文召回率 + 任何带标准的自定义 G-Eval 指标。
2. 评判模型。命名的模型 + 版本，成本 vs 准确率的理由。
3. 校准。人工标注集大小，目标 Spearman rho 与人类 > 0.7。
4. 数据集版本管理。标签策略、变更日志、分层策略。
5. CI 关卡。每个指标的阈值、回归窗口逻辑、最低分位告警。

拒绝依赖未经 ≥50 个人工标注示例测试的评判官。拒绝自我评估（同一模型生成 + 评判）。拒绝仅报告汇总均值而不展示底部 10% 的做法。标记任何评判官升级却没有并行基线评估的流水线。
```

## 练习

1. **简单。** 在 10 个已知幻觉的 RAG 示例上使用 RAGAS。验证忠实度指标能捕获每一个。
2. **中等。** 人工标注 50 个 QA 答案的正确性（0-1）。使用 G-Eval 评分。测量评判官和人工之间的 Spearman rho。
3. **困难。** 使用 DeepEval 构建一个 pytest CI 关卡。故意使检索器回归。验证关卡失败。通过最低 10% 的阈值检查添加最低分位告警。

## 关键术语

| 术语 | 通常说法 | 实际含义 |
|------|-----------------|-----------------------|
| LLM 作为评判官 | 用 LLM 评分 | 提示评判模型根据评分标准对输出打分 0-1。 |
| RAGAS | RAG 指标库 | 开源评估框架，提供 4 个无参考 RAG 指标。 |
| 忠实度 | 答案有依据吗？ | 答案主张被检索上下文蕴涵的比例。 |
| 上下文精确率 | 检索到的块相关吗？ | top-K 块中实际相关的比例。 |
| 上下文召回率 | 检索找到了所有内容吗？ | 标准答案中被检索块支持的主张比例。 |
| G-Eval | 自定义 LLM 评判 | 评分标准 + 思维链评估步骤 + 0-1 分数。 |
| 校准 | 信任但验证 | 评判分数与人工分数的 Spearman 相关性。 |

## 延伸阅读

- [Es 等 (2023). RAGAS: Automated Evaluation of Retrieval Augmented Generation](https://arxiv.org/abs/2309.15217) — RAGAS 论文。
- [Liu 等 (2023). G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment](https://arxiv.org/abs/2303.16634) — G-Eval 论文。
- [DeepEval 文档](https://deepeval.com/docs/metrics-introduction) — 开源生产栈。
- [Zheng 等 (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — 偏见、校准、限制。
- [MLflow GenAI Scorer](https://mlflow.org/blog/third-party-scorers) — 统一框架，集成 RAGAS、DeepEval、Phoenix。
