"""输出层: 相关性检查——LLM 输出是否偏离用户输入的话题"""
import time
from .base import GuardrailAdapter, GuardrailResult

STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "it", "this", "that", "i", "you",
    "he", "she", "we", "they", "my", "your", "his", "her", "our", "their",
    "what", "which", "who", "when", "where", "how", "not", "no", "and",
    "or", "but", "的", "了", "是", "在", "有", "不", "到", "吗", "吧",
    "啊", "呢", "就", "都", "也", "还", "要", "和", "与", "或", "这",
    "那", "你", "我", "他", "她", "它", "们", "什么", "怎么", "哪里",
}

THRESHOLD = 0.05  # 重叠度低于此值视为不相关

# 输出较短（<3 个非停用词）时跳过检查，因为简洁回答不易计算重叠度
MIN_MEANINGFUL_WORDS = 3


class RelevanceChecker(GuardrailAdapter):
    name = "relevance_checker"
    display_name = "相关性检查"
    description = "检查 LLM 输出是否偏离输入话题（关键词重叠度阈值 0.05）"
    group = "Guardrails 基础"
    category = "output"
    order = 20
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()

        input_text = (context or {}).get("input_text", "")

        input_words = set(input_text.lower().split()) - STOP_WORDS
        output_words = set(text.lower().split()) - STOP_WORDS

        # 输入或输出缺乏有效关键词时跳过（如简短回答）
        if len(input_words) < 2 or len(output_words) < MIN_MEANINGFUL_WORDS:
            latency = (time.time() - start) * 1000
            return GuardrailResult(
                passed=True,
                reason="",
                details={
                    "skipped": True,
                    "input_words": len(input_words),
                    "output_words": len(output_words),
                },
                confidence=0.0,
                latency_ms=round(latency, 2),
            )

        overlap = input_words & output_words
        score = len(overlap) / max(len(input_words), 1)
        latency = (time.time() - start) * 1000

        return GuardrailResult(
            passed=score >= THRESHOLD,
            reason=f"输出与输入不相关（重叠度 {score:.2f} < 阈值 {THRESHOLD}）" if score < THRESHOLD else "",
            details={
                "overlap_score": round(score, 4),
                "threshold": THRESHOLD,
                "shared_words": list(overlap)[:10],
            },
            confidence=1.0 - min(score, 1.0),
            latency_ms=round(latency, 2),
        )
