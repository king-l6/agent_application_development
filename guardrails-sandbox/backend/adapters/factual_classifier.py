"""Phase 11-11 Caching & Cost → FactualClassifier 适配器

事实性问题（查订单、问政策）走宽松阈值，避免误拦。
创意性问题（写文章、分析）走严格阈值，防止注入。

本质：根据问题类型动态调整后续 adapter 的拦截标准。
"""
import time
import re
from .base import GuardrailAdapter, GuardrailResult

# 轻量级关键词判断（生产级用 cross-encoder 小模型）
CREATIVE_PATTERNS = [
    "写", "创作", "生成", "编", "骂", "评价", "比较", "分析",
    "入侵", "忽略", "投诉", "吐槽", "批判", "歌颂", "赞美",
    "想象", "假如", "假设", "编一个", "讲个故事",
]


class FactualClassifier(GuardrailAdapter):
    name = "factual_classifier"
    display_name = "事实性分类"
    description = "区分事实性/创意性问题，动态调整后续适配器阈值"
    group = "缓存与成本"
    category = "input"
    order = 5  # 在 injection/semantic 之前运行
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        ctx = context or {}

        is_creative = any(kw in text for kw in CREATIVE_PATTERNS)
        is_factual = not is_creative
        # 空消息当事实性处理
        if not text.strip():
            is_factual = True
            is_creative = False

        # 把分类结果写入 context，后续 adapter 可以读取
        ctx["query_type"] = "creative" if is_creative else "factual"

        latency = (time.time() - start) * 1000
        return GuardrailResult(
            passed=True,  # 永不拦截，只做标记
            reason="",
            details={
                "query_type": "creative" if is_creative else "factual",
                "is_factual": is_factual,
                "matched_patterns": [kw for kw in CREATIVE_PATTERNS if kw in text],
            },
            confidence=0.0,
            latency_ms=round(latency, 2),
        )
