"""Layer 1: 速率限制——基于滑动窗口的 RPM 限制（内存版）"""
import time
from collections import defaultdict, deque
from .base import GuardrailAdapter, GuardrailResult


class RateLimiter(GuardrailAdapter):
    name = "rate_limiter"
    display_name = "速率限制"
    description = "基于滑动窗口的 RPM 限制，防刷"
    group = "Guardrails 基础"
    category = "input"
    order = 10
    enabled = True

    # 按 tier 限制：免费用户 10 RPM，Pro 用户 100 RPM
    TIER_LIMITS = {"free": 10, "pro": 100, "enterprise": 10000}

    def __init__(self):
        self.windows = defaultdict(deque)  # user_id -> deque of timestamps

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        ctx = context or {}
        start = time.time()

        user_id = ctx.get("user_id", "default")
        tier = ctx.get("tier", "free")
        limit = self.TIER_LIMITS.get(tier, 10)

        now = time.time()
        window = self.windows[user_id]

        # 移除 60 秒前的记录
        while window and window[0] < now - 60:
            window.popleft()

        if len(window) >= limit:
            latency = (time.time() - start) * 1000
            return GuardrailResult(
                passed=False,
                reason=f"速率限制: {tier} 用户每分钟上限 {limit} 次",
                details={"tier": tier, "limit": limit, "current": len(window)},
                confidence=1.0,
                latency_ms=round(latency, 2),
            )

        window.append(now)
        latency = (time.time() - start) * 1000
        return GuardrailResult(
            passed=True,
            reason="",
            details={"tier": tier, "limit": limit, "current": len(window)},
            confidence=0.0,
            latency_ms=round(latency, 2),
        )
