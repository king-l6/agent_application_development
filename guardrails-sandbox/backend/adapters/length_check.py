"""Layer 5: 长度检查——防止超长输入"""
import time
from .base import GuardrailAdapter, GuardrailResult

MAX_CHARS = 10000
MAX_WORDS = 2000


class LengthChecker(GuardrailAdapter):
    name = "length_checker"
    display_name = "长度检查"
    description = f"长度限制: {MAX_CHARS} 字符 / {MAX_WORDS} 词"
    group = "Guardrails 基础"
    category = "input"
    order = 50
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        char_count = len(text)
        word_count = len(text.split())
        passed = char_count <= MAX_CHARS and word_count <= MAX_WORDS
        latency = (time.time() - start) * 1000

        return GuardrailResult(
            passed=passed,
            reason=f"输入过长: {char_count}字符/{MAX_CHARS}上限" if not passed else "",
            details={
                "char_count": char_count,
                "char_limit": MAX_CHARS,
                "word_count": word_count,
                "word_limit": MAX_WORDS,
            },
            confidence=1.0 if not passed else 0.0,
            latency_ms=round(latency, 2),
        )
