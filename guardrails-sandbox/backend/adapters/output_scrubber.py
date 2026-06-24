"""输出层: PII 脱敏——替换输出中的个人信息为 [REDACTED]"""
import re
import time
import hashlib
from .base import GuardrailAdapter, GuardrailResult

SCRUB_PATTERNS = [
    ("email", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "[EMAIL REDACTED]"),
    ("ssn", r"\b\d{3}-\d{2}-\d{4}\b", "[SSN REDACTED]"),
    ("credit_card", r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b", "[CARD REDACTED]"),
    ("phone", r"\b1[3-9]\d{9}\b", "[PHONE REDACTED]"),
    ("id_card", r"\b\d{17}[\dXx]\b", "[ID REDACTED]"),
]


class OutputScrubber(GuardrailAdapter):
    name = "output_scrubber"
    display_name = "输出脱敏"
    description = "替换 LLM 输出中的 PII（手机、邮箱、身份证、信用卡）为 [REDACTED]"
    group = "Guardrails 基础"
    category = "output"
    order = 10
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        """注意：这个 check 是允许通过的，但会修改 context['scrubbed_output']"""
        start = time.time()
        scrubbed = text
        replacements = []

        for pii_type, pattern, replacement in SCRUB_PATTERNS:
            matches = re.findall(pattern, scrubbed)
            if matches:
                for m in matches:
                    replacements.append({
                        "type": pii_type,
                        "value_hash": hashlib.sha256(m.encode()).hexdigest()[:8],
                    })
            scrubbed = re.sub(pattern, replacement, scrubbed)

        latency = (time.time() - start) * 1000

        if context is not None:
            context["scrubbed_output"] = scrubbed

        return GuardrailResult(
            passed=True,  # 始终放行（脱敏不是拦截）
            reason=f"已脱敏 {len(replacements)} 处 PII" if replacements else "",
            details={
                "replacements": replacements,
                "was_scrubbed": len(replacements) > 0,
            },
            confidence=0.95 if replacements else 0.0,
            latency_ms=round(latency, 2),
        )
