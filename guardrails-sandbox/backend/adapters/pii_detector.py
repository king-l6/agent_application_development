"""Layer 4: PII 检测——识别输入中的个人信息"""
import re
import time
import hashlib
from .base import GuardrailAdapter, GuardrailResult

PII_PATTERNS = [
    ("手机号", r"(?<!\d)1[3-9]\d{9}(?!\d)", 0.90),
    ("邮箱", r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", 0.95),
    ("身份证", r"(?<!\d)\d{17}[\dXx](?!\d)", 0.98),
    ("信用卡", r"(?<!\d)(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})(?!\d)", 0.95),
    ("IP 地址", r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)", 0.60),
]

# 不拦截而是"警告"的类型（IP 地址误报太多）
WARNING_ONLY = {"IP 地址"}


class PiiDetector(GuardrailAdapter):
    name = "pii_detector"
    display_name = "PII 检测"
    description = "检测输入中的个人信息（手机号、邮箱、身份证、信用卡）"
    group = "Guardrails 基础"
    category = "input"
    order = 40
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        found = []

        for pii_type, pattern, confidence in PII_PATTERNS:
            matches = re.findall(pattern, text)
            for m in matches:
                found.append({
                    "type": pii_type,
                    "value_hash": hashlib.sha256(m.encode()).hexdigest()[:8],
                    "confidence": confidence,
                })

        has_blocking_pii = any(
            f["type"] not in WARNING_ONLY for f in found
        )
        max_conf = max((f["confidence"] for f in found), default=0.0)
        latency = (time.time() - start) * 1000

        return GuardrailResult(
            passed=not has_blocking_pii,
            reason=f"检测到个人信息: {', '.join(set(f['type'] for f in found))}" if found else "",
            details={"detected": found, "count": len(found)},
            confidence=max_conf,
            latency_ms=round(latency, 2),
        )
