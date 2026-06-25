"""Phase 11 / 01-prompt-engineering —— Prompt 结构分析器

输入一段提示词，本地分析它是否具备「好提示」的要素：角色、任务、
上下文、输出格式、约束、示例等。给出评分与改进建议。不调用 LLM。
"""
import re
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_score, block_table, block_list,
)

# 每个维度：名称 -> (匹配关键词/正则, 说明, 满分权重)
DIMENSIONS = [
    ("角色设定", [r"你是", r"作为", r"扮演", r"you are", r"act as", r"role"],
     "告诉模型它的身份/专长", 1.0),
    ("明确任务", [r"请", r"帮我", r"生成", r"分析", r"总结", r"翻译", r"写", r"列出",
                r"summarize", r"translate", r"generate", r"analyze", r"list"],
     "有清晰的动词指令", 1.0),
    ("输出格式", [r"格式", r"json", r"markdown", r"表格", r"列表", r"步骤", r"bullet",
                r"format", r"table", r"步", r"分点"],
     "指定了期望的输出结构", 1.0),
    ("约束条件", [r"不要", r"必须", r"限制", r"字数", r"不超过", r"至少", r"only",
                r"must", r"don't", r"do not", r"限定", r"控制在"],
     "划定了边界/限制", 1.0),
    ("提供示例", [r"例如", r"比如", r"示例", r"样例", r"example", r"e\.g\.", r"如下"],
     "给了 few-shot 示例", 1.0),
    ("上下文", [r"背景", r"上下文", r"已知", r"context", r"given", r"基于"],
     "提供了任务背景", 1.0),
]


class PromptAnalyzer(PlaygroundModule):
    name = "prompt_analyzer"
    display_name = "Prompt 结构分析"
    description = "分析一段提示词是否具备好提示的要素，给出评分和改进建议（本地分析，不调 LLM）"
    phase = "11-llm-engineering"
    lesson = "01-prompt-engineering"
    order = 10

    input_schema = [
        field_spec("prompt", "你的提示词", type="textarea",
                   placeholder="例如：你是一位资深 Python 工程师，请帮我把下面的代码重构得更易读，用 markdown 代码块返回，不要改变其行为。"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        prompt = (inputs.get("prompt") or "").strip()
        if not prompt:
            return ModuleResult(ok=False, error="请输入一段提示词")

        low = prompt.lower()
        rows = []
        hit_count = 0
        missing = []
        for name, patterns, desc, _ in DIMENSIONS:
            hit = any(re.search(p, low) for p in patterns)
            if hit:
                hit_count += 1
            else:
                missing.append(f"{name}：{desc}")
            rows.append([name, "✅" if hit else "—", desc])

        score = hit_count / len(DIMENSIONS)
        char_len = len(prompt)

        if score >= 0.8:
            verdict = "结构完整，是一条高质量提示"
        elif score >= 0.5:
            verdict = "基本可用，还能更好"
        else:
            verdict = "过于简单，模型容易自由发挥"

        blocks = [
            block_score(score, "提示完整度", max_value=1.0,
                        hint=f"{hit_count}/{len(DIMENSIONS)} 个要素 · {verdict}"),
            block_table(
                headers=["要素", "是否具备", "说明"],
                rows=rows,
                label="要素检查",
            ),
        ]
        if missing:
            blocks.append(block_list(missing, label="可以补充的要素"))

        return ModuleResult(
            ok=True,
            summary=f"提示完整度 {score:.0%}（{char_len} 字）—— {verdict}",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
