"""Phase 11-03 Structured Outputs → FormatValidator 适配器

验证 LLM 输出的格式是否符合预期。
如果应用要求返回 JSON，但模型返回了纯文本，需要拦截。

核心思想：输出格式错误比内容错误更致命——下游解析会直接崩。
"""
import time
import json
from .base import GuardrailAdapter, GuardrailResult


class FormatValidator(GuardrailAdapter):
    name = "format_validator"
    display_name = "格式校验"
    description = "验证 LLM 输出格式（JSON/Code/文本）是否符合预期"
    group = "结构化输出"
    category = "output"
    order = 55
    enabled = True

    def check(self, text: str, context: dict = None) -> GuardrailResult:
        start = time.time()
        ctx = context or {}
        input_text = ctx.get("input_text", "")
        expected_format = ctx.get("expected_format", "")

        issues = []

        # 检测 1：JSON 格式校验
        if expected_format == "json" or text.strip().startswith("{"):
            try:
                json.loads(text)
            except json.JSONDecodeError as e:
                issues.append({
                    "type": "JSON 解析失败",
                    "detail": str(e),
                    "severity": "error",
                })

        # 检测 2：Markdown 代码块完整性
        if "```" in text:
            code_blocks = text.split("```")
            if len(code_blocks) % 2 == 0:
                issues.append({
                    "type": "Markdown 代码块未闭合",
                    "detail": "代码块数量为奇数",
                    "severity": "warning",
                })

        # 检测 3：对应输入中要求了结构化输出
        if "json" in input_text.lower() and "返回" in input_text.lower():
            try:
                json.loads(text)
            except json.JSONDecodeError:
                issues.append({
                    "type": "期望 JSON 但输出非 JSON",
                    "detail": "用户要求返回 JSON 格式",
                    "severity": "error",
                })

        # 检测 4：空输出检测
        if not text.strip():
            issues.append({
                "type": "空输出",
                "detail": "LLM 返回了空内容",
                "severity": "error",
            })

        latency = (time.time() - start) * 1000
        errors = [i for i in issues if i["severity"] == "error"]
        warnings = [i for i in issues if i["severity"] == "warning"]
        passed = len(errors) == 0

        return GuardrailResult(
            passed=passed,
            reason=f"格式错误: {errors[0]['type']}" if errors else "",
            details={
                "errors": errors,
                "warnings": warnings,
                "total_issues": len(issues),
            },
            confidence=0.95 if errors else (0.5 if warnings else 0.0),
            latency_ms=round(latency, 2),
        )
