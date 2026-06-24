"""Phase 11-06 RAG + 11-07 Advanced RAG → RAGGroundedness 适配器

检测 LLM 输出是否基于提供的上下文，防止幻觉。
如果回答中的关键信息在上下文里找不到依据，说明模型在编造。

核心思想：
- 把 LLM 回答拆成"事实性断言"（含具体数字、日期、名称的句子）
- 在上下文中找这些断言的来源
- 找不到的断言越多，越可能是幻觉
"""
import time
import re
from .base import GuardrailAdapter, GuardrailResult


class RAGGroundedness(GuardrailAdapter):
    name = "rag_groundedness"
    display_name = "RAG 真实性"
    description = "检测 LLM 输出是否基于提供的上下文，防止幻觉"
    group = "RAG"
    category = "output"
    order = 65
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        ctx = context or {}
        input_text = ctx.get("input_text", "")

        # 提取上下文（如果有的话）
        context_docs = ctx.get("context_docs", "")

        latency = (time.time() - start) * 1000

        # 没有提供上下文 → 跳过检测（不是 RAG 场景）
        if not context_docs:
            return GuardrailResult(
                passed=True,
                reason="无参考上下文，跳过",
                details={"groundedness_check": "skipped"},
                confidence=0.0,
                latency_ms=round(latency, 2),
            )

        # 提取回答中的事实性断言（含数字、日期的句子）
        sentences = re.split(r'[。！？\n]', text)
        factual_claims = []
        for s in sentences:
            s = s.strip()
            if not s:
                continue
            # 含数字、金额、日期、百/千/万的句子算"事实性断言"
            if re.search(r'[\d.]+|百|千|万|亿|元|日|月|年|%|率|费用|价格|政策|规定|标准', s):
                factual_claims.append(s)

        if not factual_claims:
            return GuardrailResult(
                passed=True,
                reason="回答无事实性断言",
                details={"factual_claims": [], "groundedness_check": "no_claims"},
                confidence=0.0,
                latency_ms=round(latency, 2),
            )

        # 检查每个断言是否能在上下文中找到依据
        context_lower = context_docs.lower()
        ungrounded = []
        for claim in factual_claims:
            # 提取关键词
            key_terms = re.findall(r'[\w一-鿿]{2,}', claim.lower())
            key_terms = [t for t in key_terms if len(t) > 1]

            # 如果上下文不包含至少 2 个关键词，判为无依据
            matched = sum(1 for t in key_terms if t in context_lower)
            if matched < min(2, len(key_terms)):
                ungrounded.append({
                    "claim": claim[:50],
                    "matched_terms": matched,
                    "total_terms": len(key_terms),
                })

        latency = (time.time() - start) * 1000
        has_ungrounded = len(ungrounded) > 0
        ungrounded_ratio = len(ungrounded) / len(factual_claims)
        # 超过 40% 的断言无依据 → 标记
        passed = ungrounded_ratio < 0.4

        return GuardrailResult(
            passed=passed,
            reason=f"{len(ungrounded)}/{len(factual_claims)} 个断言无上下文依据" if has_ungrounded else "",
            details={
                "total_claims": len(factual_claims),
                "ungrounded_claims": ungrounded[:5],  # 最多暴露 5 个
                "ungrounded_ratio": round(ungrounded_ratio, 2),
                "threshold": 0.4,
            },
            confidence=round(min(ungrounded_ratio + 0.2, 0.95), 2),
            latency_ms=round(latency, 2),
        )
