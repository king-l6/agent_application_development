"""Phase 11-01 Prompt Engineering → PromptLeak 适配器

检测 LLM 输出中是否泄露了系统提示词。
系统提示是核心资产，泄露后攻击者可针对性构造注入。

核心思想：输出中如果出现了系统提示里的独特词组（如公司名、产品名、
特定操作步骤），说明模型可能被诱导吐出了系统提示。
"""
import time
import re
from .base import GuardrailAdapter, GuardrailResult


class PromptLeakDetector(GuardrailAdapter):
    name = "prompt_leak"
    display_name = "Prompt 泄露检测"
    description = "检测 LLM 输出是否泄露了系统提示中的敏感短语"
    group = "Prompt 工程"
    category = "output"
    order = 60
    enabled = True

    # 系统提示中的敏感短语（仅用于演示，应在 pipeline 初始化时传入真实系统提示）
    # 这些短语如果出现在输出中，说明系统提示被泄露了
    SENSITIVE_PHRASES = [
        "你是", "你的任务是", "你必须", "你是一个",
        "system prompt", "system instruction", "你的系统",
        "internal", "confidential",
    ]

    def __init__(self):
        self._system_prompt = ""
        self._system_keywords = set()

    def set_system_prompt(self, prompt: str):
        """外部注入真实系统提示，提取关键词"""
        self._system_prompt = prompt
        # 提取系统提示中的独特词汇（去掉停用词）
        stop_words = {"一个", "是", "的", "了", "在", "有", "不",
                      "为", "所", "以", "被", "让", "给", "和", "或"}
        words = set(re.findall(r'[\w一-鿿]+', prompt.lower()))
        self._system_keywords = words - stop_words

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        ctx = context or {}

        # 如果外部注入了系统提示，优先使用
        if ctx.get("system_prompt") and not self._system_prompt:
            self.set_system_prompt(ctx["system_prompt"])

        text_lower = text.lower()
        leaks = []

        # 检测 1：精确敏感短语
        for phrase in self.SENSITIVE_PHRASES:
            if phrase.lower() in text_lower:
                leaks.append({"type": "敏感短语", "match": phrase})

        # 检测 2：系统提示关键词密度（如果设置了系统提示）
        if self._system_keywords:
            matched_kw = {kw for kw in self._system_keywords if kw in text_lower}
            if len(matched_kw) >= 3:  # 3 个以上关键词同时出现
                leaks.append({
                    "type": "关键词聚集",
                    "match": list(matched_kw)[:5],
                    "keyword_count": len(matched_kw),
                })

        # 检测 3：元指令泄漏标志
        meta_flags = [
            "忽略之前的指令", "ignore previous", "forget everything",
            "you are a", "your task is", "你必须", "你的任务是",
        ]
        for flag in meta_flags:
            if flag in text_lower:
                leaks.append({"type": "元指令泄漏", "match": flag})

        latency = (time.time() - start) * 1000
        has_leak = len(leaks) > 0
        max_conf = min(0.6 + len(leaks) * 0.15, 0.95) if has_leak else 0.0

        return GuardrailResult(
            passed=not has_leak,
            reason=f"检测到系统提示泄露" if has_leak else "",
            details={
                "leaks": leaks,
                "leak_count": len(leaks),
                "system_keywords_loaded": len(self._system_keywords) > 0,
            },
            confidence=round(max_conf, 2),
            latency_ms=round(latency, 2),
        )
