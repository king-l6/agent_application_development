"""Phase 11 / 14-model-context-protocol —— 课程搜索

在课程文档里搜关键词。相比 MCP real_server 里的「整串子串匹配」，
这里把 query 按空格/标点拆成多个词，任一命中即算匹配，并按命中词数排序，
所以「缓存 成本」这种多词查询也能搜到。
"""
import os
import re
import time
from pathlib import Path

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec, block_list, block_text,
)

PHASES_BASE = Path(
    "/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/phases"
)

# 口语停用词，避免「都有啥课」这类整句拖累匹配
_STOPWORDS = {"的", "了", "吗", "啥", "都", "有", "课", "是", "在", "和", "与", "怎么", "什么"}


def _tokenize(query: str) -> list:
    # 英文按词，中文按 2-gram 粗切，过滤停用词与单字噪声
    parts = re.split(r"[\s,，。、;；]+", query.strip())
    tokens = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if re.match(r"^[a-zA-Z0-9_\-]+$", p):
            tokens.append(p.lower())
        else:
            # 中文短语：整体 + 去停用词后的剩余整体
            tokens.append(p)
            cleaned = "".join(c for c in p if c not in _STOPWORDS)
            if cleaned and cleaned != p and len(cleaned) >= 2:
                tokens.append(cleaned)
    # 去重保序
    seen = set()
    result = []
    for t in tokens:
        if t and t not in seen:
            seen.add(t)
            result.append(t)
    return result


class LessonSearch(PlaygroundModule):
    name = "lesson_search"
    display_name = "课程搜索"
    description = "在课程文档中搜索关键词（支持多关键词，按命中数排序）"
    phase = "11-llm-engineering"
    lesson = "14-model-context-protocol"
    order = 140

    input_schema = [
        field_spec("query", "关键词", type="text",
                   placeholder="例如：缓存 成本  /  embedding",
                   help="可输入多个词，空格分隔"),
        field_spec("phase", "限定阶段(可选)", type="text",
                   placeholder="例如 11，留空搜全部"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        query = (inputs.get("query") or "").strip()
        phase = (inputs.get("phase") or "").strip()

        if not query:
            return ModuleResult(ok=False, error="请输入搜索关键词")

        tokens = _tokenize(query)
        if not tokens:
            return ModuleResult(ok=False, error="未能从输入中提取有效关键词")

        if phase:
            try:
                search_dirs = list(PHASES_BASE.glob(f"{int(phase):02d}-*"))
            except ValueError:
                return ModuleResult(ok=False, error=f"阶段号无效：{phase}")
        else:
            search_dirs = [d for d in PHASES_BASE.iterdir() if d.is_dir()]

        scored = []
        for phase_dir in search_dirs:
            if not phase_dir.is_dir():
                continue
            for lesson_dir in sorted(os.listdir(phase_dir)):
                lesson_path = phase_dir / lesson_dir
                if not lesson_path.is_dir():
                    continue
                for doc_file in ["docs/zh.md", "docs/en.md"]:
                    doc_path = lesson_path / doc_file
                    if not doc_path.exists():
                        continue
                    try:
                        content = doc_path.read_text(encoding="utf-8").lower()
                    except Exception:
                        continue
                    hits = [t for t in tokens if t.lower() in content]
                    if hits:
                        scored.append((len(hits), phase_dir.name, lesson_dir, hits))
                    break  # 一节课只算一次

        scored.sort(key=lambda x: -x[0])
        latency = (time.time() - start) * 1000

        if not scored:
            return ModuleResult(
                ok=True,
                summary=f"没有课程命中关键词：{', '.join(tokens)}",
                blocks=[block_text(
                    f"已尝试的关键词：{', '.join(tokens)}\n"
                    "提示：课程文档里用的是技术术语，试试 embedding、RAG、缓存、提示词 等。",
                    label="无结果",
                )],
                latency_ms=latency,
            )

        items = [
            f"{phase_name}/{lesson}  （命中 {n} 个词：{', '.join(hits)}）"
            for n, phase_name, lesson, hits in scored[:15]
        ]
        return ModuleResult(
            ok=True,
            summary=f"找到 {len(scored)} 节相关课程（关键词：{', '.join(tokens)}）",
            blocks=[block_list(items, label="匹配课程", ordered=True)],
            latency_ms=latency,
        )
