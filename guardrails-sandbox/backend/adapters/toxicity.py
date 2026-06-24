"""Layer 6: 毒性过滤——检测有害内容（暴力、违法、自残、色情、仇恨）"""
import re
import time
from .base import GuardrailAdapter, GuardrailResult

TOXIC_PATTERNS = {
    "暴力": (r"\b(kill|murder|attack|weapon|bomb|shoot|stab|explode|assault|torture|slit|gouge|disembowel)\b|怎么(制作|制造|做)(武器|炸弹|炸药)|(武器|炸弹|炸药).*(怎么|如何|怎样).*(制作|制造|做)", 0.90),
    "违法活动": (r"\b(hack|crack|steal|forge|counterfeit|launder|traffick|smuggle)\b|(如何|可以|想要|怎么|怎样).*(制作|合成|弄).*(炸弹|毒品|冰毒|可卡因)|(制作|合成)(炸弹|毒品|冰毒|可卡因)(的|的.*方法|教学|教程)?|偷(别人|数据|账号|钱)", 0.95),
    "自残": (r"\b(suicide|self-harm|how to (commit )?suicide|lethal dose)\b|结束生命|自杀|伤害自己", 0.98),
    "仇恨言论": (r"\b(hate\s+all|inferior\s+race|subhuman|degenerate)\b", 0.90),
    "色情": (r"\b(explicit\s+sexual|pornograph|nude\s+image)\b|裸(体|照|图|聊)|色情", 0.85),
}

# 这些虽然是敏感话题，但可以是正当讨论（比如"自杀预防"）
SAFE_CONTEXT_PREFIXES = [
    "如何预防", "怎么帮助", "什么是", "如何识别",
    "预防", "帮助", "防止",
    "prevent", "help", "treatment", "support",
]


class ToxicityFilter(GuardrailAdapter):
    name = "toxicity_filter"
    display_name = "毒性过滤"
    description = "过滤暴力、违法、自残、仇恨、色情内容"
    group = "Guardrails 基础"
    category = "input"
    order = 60
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        text_lower = text.lower()

        # 安全上下文豁免
        is_safe_context = any(
            text_lower.startswith(p) for p in SAFE_CONTEXT_PREFIXES
        )
        if is_safe_context:
            latency = (time.time() - start) * 1000
            return GuardrailResult(
                passed=True,
                reason="",
                details={"safe_context": True},
                confidence=0.0,
                latency_ms=round(latency, 2),
            )

        flagged = []
        for category, (pattern, confidence) in TOXIC_PATTERNS.items():
            if re.search(pattern, text_lower):
                flagged.append({"category": category, "confidence": confidence})

        max_conf = max((f["confidence"] for f in flagged), default=0.0)
        latency = (time.time() - start) * 1000

        return GuardrailResult(
            passed=max_conf < 0.80,
            reason=f"检测到有害内容: {', '.join(f['category'] for f in flagged)}" if flagged else "",
            details={"flagged": flagged, "safe_context": False},
            confidence=max_conf,
            latency_ms=round(latency, 2),
        )
