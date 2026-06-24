"""Layer 7: 话题分类——检查输入是否在允许范围内"""
import time
from .base import GuardrailAdapter, GuardrailResult

ALLOWED_TOPICS = [
    "technology", "programming", "science", "math", "business",
    "education", "health_info", "cooking", "travel", "general_knowledge",
    "语言", "文化", "历史", "地理", "体育", "音乐", "电影",
    "AI", "机器学习", "深度学习", "编程", "Python", "前端", "后端",
]

# 拒绝对话的话题（全是非法的）
BLOCKED_KEYWORDS = [
    "制造武器", "购买枪支", "毒品交易", "儿童色情",
    "weapon manufacturing", "drug trafficking", "child exploitation",
    "制作炸弹", "制作毒品",
]


class TopicClassifier(GuardrailAdapter):
    name = "topic_classifier"
    display_name = "话题分类"
    description = "话题分类，检查输入是否在允许范围内"
    group = "Guardrails 基础"
    category = "input"
    order = 70
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        text_lower = text.lower()

        # 先检查明确禁止的话题
        for kw in BLOCKED_KEYWORDS:
            if kw in text_lower:
                latency = (time.time() - start) * 1000
                return GuardrailResult(
                    passed=False,
                    reason=f"话题被禁止: 包含敏感关键词",
                    details={"matched_keyword": kw, "topic": "blocked"},
                    confidence=0.95,
                    latency_ms=round(latency, 2),
                )

        # 允许的话题检查（宽松：只要不是明确禁止的，就放行）
        latency = (time.time() - start) * 1000
        return GuardrailResult(
            passed=True,
            reason="",
            details={"topics_allowed": True},
            confidence=0.0,
            latency_ms=round(latency, 2),
        )
