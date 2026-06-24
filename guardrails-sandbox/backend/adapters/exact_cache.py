"""Layer 0: 精确缓存适配器——相同输入直接返回历史结果

来自 Phase 11-11 Caching & Cost 的 ExactCache 思想。
对 guardrail 判断结果做缓存：同一段文本不用重复跑全部 adapter。
"""
import time
import hashlib
import json
from .base import GuardrailAdapter, GuardrailResult


class ExactCacheAdapter(GuardrailAdapter):
    name = "exact_cache"
    display_name = "精确缓存"
    description = "相同文本的 guardrail 结果缓存，省去重复检测"
    category = "input"
    order = 1  # 第一个执行，最快短路
    enabled = True

    def __init__(self, max_size: int = 1000, ttl_seconds: int = 300):
        self.cache: dict[str, dict] = {}
        self.max_size = max_size
        self.ttl = ttl_seconds

    def _make_key(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()

    def get(self, text: str):
        key = self._make_key(text)
        entry = self.cache.get(key)
        if entry and time.time() - entry["ts"] < self.ttl:
            return entry["result"]
        if entry:
            del self.cache[key]
        return None

    def put(self, text: str, result: GuardrailResult):
        key = self._make_key(text)
        if len(self.cache) >= self.max_size:
            oldest = min(self.cache, key=lambda k: self.cache[k]["ts"])
            del self.cache[oldest]
        self.cache[key] = {"result": result, "ts": time.time()}

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()

        # 只在非 benchmark 模式下启用缓存
        if context and context.get("_benchmark"):
            return GuardrailResult(passed=True, latency_ms=0.0)

        cached = self.get(text)
        if cached:
            return GuardrailResult(
                passed=cached.passed,
                reason=f"[缓存命中] {cached.reason}" if cached.reason else "",
                details={"cache_hit": True, "cached_result": cached.passed},
                confidence=cached.confidence,
                latency_ms=round((time.time() - start) * 1000, 2),
            )

        # 缓存未命中，标记让 pipeline 跳过——本 adapter 不做实质检测
        return GuardrailResult(
            passed=True,
            reason="",
            details={"cache_hit": False},
            confidence=0.0,
            latency_ms=round((time.time() - start) * 1000, 2),
        )
