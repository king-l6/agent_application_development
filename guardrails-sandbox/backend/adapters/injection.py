"""Layer 2: 提示注入检测——正则匹配已知攻击模式"""
import re
import time
from .base import GuardrailAdapter, GuardrailResult

# 从 guardrails.py 移植 21 个注入模式 + 置信度
INJECTION_PATTERNS = [
    (r"ignore\s+(all\s+)?previous\s+instructions", 0.95),
    (r"ignore\s+(all\s+)?above\s+instructions", 0.95),
    (r"disregard\s+(all\s+)?prior\s+(instructions|context|rules)", 0.95),
    (r"forget\s+(everything|all)\s+(above|before|prior)", 0.90),
    (r"you\s+are\s+now\s+(a|an)\s+unrestricted", 0.95),
    (r"you\s+are\s+now\s+DAN", 0.98),
    (r"jail\s*break", 0.85),
    (r"do\s+anything\s+now", 0.90),
    (r"developer\s+mode\s+(enabled|activated|on)", 0.92),
    (r"override\s+(safety|content)\s+(filter|policy|guidelines)", 0.93),
    (r"print\s+(your|the)\s+(system\s+)?prompt", 0.88),
    (r"repeat\s+(the\s+)?(text|words|instructions)\s+above", 0.85),
    (r"what\s+(are|were)\s+your\s+(initial\s+)?instructions", 0.82),
    (r"reveal\s+(your|the)\s+(system\s+)?(prompt|instructions)", 0.90),
    (r"output\s+(your|the)\s+(system\s+)?(prompt|instructions)", 0.90),
    (r"sudo\s+mode", 0.88),
    (r"\[INST\]", 0.80),
    (r"<\|im_start\|>system", 0.90),
    (r"###\s*(system|instruction)", 0.75),
    (r"act\s+as\s+if\s+(you\s+have\s+)?no\s+(restrictions|limits|rules)", 0.88),
    # 中文注入模式
    (r"忽略(所有|以上|之前).*(指令|规则|指示)", 0.90),
    (r"假装你(没有|不受).*(限制|规则|约束)", 0.88),
    (r"绕过(所有)?(限制|规则|安全)", 0.85),
    (r"你不需要遵守.*(规则|指令|限制)", 0.85),
]

ENCODING_EVASION = [
    (r"\\u00[0-9a-f]{2}", 0.50),
    (r"base64", 0.60),
    (r"rot13", 0.60),
    (r"hex\s*:", 0.60),
    (r"[​-‏ - ]", 0.70),
]


class InjectionDetector(GuardrailAdapter):
    name = "injection_detector"
    display_name = "注入检测"
    description = "正则匹配已知的提示注入攻击模式（DAN、越狱、覆盖指令等）"
    group = "Guardrails 基础"
    category = "input"
    order = 20
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        matches = []

        for pattern, confidence in INJECTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                matches.append({
                    "type": "注入模式",
                    "pattern": pattern,
                    "confidence": confidence,
                })

        # 编码绕过检测
        for pattern, confidence in ENCODING_EVASION:
            if re.search(pattern, text):
                matches.append({
                    "type": "编码绕过",
                    "pattern": pattern,
                    "confidence": confidence,
                })

        max_conf = max((m["confidence"] for m in matches), default=0.0)
        latency = (time.time() - start) * 1000

        return GuardrailResult(
            passed=(max_conf < 0.75),
            reason=f"检测到提示注入攻击" if max_conf >= 0.75 else "",
            details={
                "matches": matches,
                "max_confidence": max_conf,
                "match_count": len(matches),
            },
            confidence=max_conf,
            latency_ms=round(latency, 2),
        )
