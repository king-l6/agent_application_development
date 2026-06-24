"""Guardrail 管线编排

把注册的 adapter 按 input/output 分类、按 order 排序，
遇到拦截就短路，全通过后返回详细日志。
"""
import time
import json
from typing import Optional
from adapters.base import GuardrailResult


class Pipeline:
    def __init__(self):
        self.adapters = []
        self.stats = {"total": 0, "blocked": 0, "passed": 0, "by_layer": {}}
        self.block_history = []  # 拦截历史，最多保留 50 条

    def register(self, adapter):
        """注册一个 GuardrailAdapter 实例"""
        self.adapters.append(adapter)
        self.stats["by_layer"][adapter.name] = {"blocked": 0, "passed": 0}
        # 按 order 排序
        self.adapters.sort(key=lambda a: (a.order, a.name))

    def get_input_adapters(self):
        return [a for a in self.adapters if a.category == "input" and a.enabled]

    def get_output_adapters(self):
        return [a for a in self.adapters if a.category == "output" and a.enabled]

    def run_input_checks(self, text: str, context: dict = None) -> tuple:
        """运行所有 input adapter，返回 (passed, logs, blocked_detail)"""
        self.stats["total"] += 1
        logs = []
        for adapter in self.get_input_adapters():
            result = adapter.check(text, context)
            log_entry = {
                "name": adapter.name,
                "description": adapter.description,
                "passed": result.passed,
                "confidence": result.confidence,
                "latency_ms": result.latency_ms,
                "reason": result.reason,
                "details": result.details,
            }
            logs.append(log_entry)

            if not result.passed:
                self._record_block(adapter.name)
                self.stats["blocked"] += 1
                if not (context or {}).get("_benchmark"):
                    self._add_block_history(text, adapter.name, result, "input")
                return False, logs, result
            self._record_pass(adapter.name)

        return True, logs, None

    def run_output_checks(self, text: str, input_text: str) -> tuple:
        """运行所有 output adapter，返回 (passed, logs, scrubbed_text, blocked_detail)"""
        logs = []
        context = {"input_text": input_text}

        for adapter in self.get_output_adapters():
            result = adapter.check(text, context)
            log_entry = {
                "name": adapter.name,
                "description": adapter.description,
                "passed": result.passed,
                "confidence": result.confidence,
                "latency_ms": result.latency_ms,
                "reason": result.reason,
                "details": result.details,
            }
            logs.append(log_entry)

            # OutputScrubber 会设置 context["scrubbed_output"]
            if not result.passed:
                self._record_block(adapter.name)
                return False, logs, text, result
            self._record_pass(adapter.name)

        # 如果有脱敏后的文本，使用它
        scrubbed = context.get("scrubbed_output", text)
        return True, logs, scrubbed, None

    def process(self, text: str, context: dict = None) -> dict:
        """
        完整管线：
        1. input checks (短路)
        2. output checks (短路)
        """
        self.stats["total"] += 1
        overall_start = time.time()

        # --- Input checks ---
        input_ok, input_logs, block_detail = self.run_input_checks(text, context)

        if not input_ok:
            self.stats["blocked"] += 1
            return {
                "blocked": True,
                "block_stage": "input",
                "block_reason": block_detail.reason,
                "block_detail": {
                    "confidence": block_detail.confidence,
                    "details": block_detail.details,
                },
                "guardrail_logs": input_logs,
                "total_latency_ms": round((time.time() - overall_start) * 1000, 2),
            }

        # --- LLM call (handled outside) ---
        llm_start = time.time()

        # --- Output checks ---
        output_ok, output_logs, scrubbed_text, block_detail = self.run_output_checks(
            "", context or {}
        )

        # Note: output checks happen on the LLM response, which is passed separately.
        # This is called from main.py after LLM returns.

        return {
            "blocked": False,
            "guardrail_logs": input_logs,
            "total_input_latency_ms": round((time.time() - overall_start) * 1000, 2),
        }

    def process_output(self, input_text: str, output_text: str) -> dict:
        """对 LLM 输出运行 output checks"""
        ok, logs, scrubbed, block_detail = self.run_output_checks(
            output_text, input_text
        )

        if not ok:
            self.stats["blocked"] += 1
            # 从 logs 里找谁拦的
            blocker = next((l for l in logs if not l["passed"]), None)
            if blocker:
                self._add_block_history(
                    input_text, blocker["name"], block_detail, "output"
                )
            return {
                "blocked": True,
                "block_stage": "output",
                "block_reason": block_detail.reason,
                "block_detail": {
                    "confidence": block_detail.confidence,
                    "details": block_detail.details,
                },
                "guardrail_logs": logs,
                "output_text": output_text,
            }

        self.stats["passed"] += 1
        return {
            "blocked": False,
            "guardrail_logs": logs,
            "output_text": scrubbed,
        }

    def _record_block(self, name):
        self.stats["by_layer"][name]["blocked"] += 1

    def _record_pass(self, name):
        self.stats["by_layer"][name]["passed"] += 1

    def get_adapter(self, name: str) -> Optional[object]:
        for a in self.adapters:
            if a.name == name:
                return a
        return None

    def get_all_adapters(self):
        return [
            {
                "name": a.name,
                "display_name": a.display_name,
                "description": a.description,
                "group": a.group,
                "category": a.category,
                "order": a.order,
                "enabled": a.enabled,
            }
            for a in self.adapters
        ]

    def get_tree(self):
        """返回树形结构：group > category > adapter"""
        from collections import defaultdict
        tree = defaultdict(lambda: defaultdict(list))

        for a in self.adapters:
            stats = self.stats["by_layer"].get(a.name, {"blocked": 0, "passed": 0})
            tree[a.group][a.category].append({
                "name": a.name,
                "display_name": a.display_name,
                "description": a.description,
                "enabled": a.enabled,
                "order": a.order,
                "category": a.category,
                "stats": stats,
            })

        # 排序后转为列表
        result = []
        group_icons = {
            "guardrails": "🛡",
            "Guardrails 基础": "🛡",
            "Prompt 工程": "📝",
            "Few-Shot & CoT": "🧮",
            "结构化输出": "📋",
            "RAG": "📚",
            "缓存与成本": "💰",
        }
        category_icons = {"input": "📥", "output": "📤"}

        for group_name in sorted(tree.keys()):
            categories = []
            for cat_name in sorted(tree[group_name].keys()):
                adapters = sorted(tree[group_name][cat_name], key=lambda x: x["order"])
                categories.append({
                    "key": f"{group_name}/{cat_name}",
                    "label": cat_name,
                    "type": "category",
                    "children": adapters,
                })
            result.append({
                "key": group_name,
                "label": group_name,
                "type": "group",
                "children": categories,
            })

        return result

    def toggle_adapter(self, name: str) -> Optional[dict]:
        adapter = self.get_adapter(name)
        if adapter is None:
            return None
        adapter.enabled = not adapter.enabled
        return {
            "name": adapter.name,
            "enabled": adapter.enabled,
        }

    def get_stats(self):
        return {
            "total": self.stats["total"],
            "blocked": self.stats["blocked"],
            "passed": self.stats["passed"],
            "block_rate_pct": round(
                self.stats["blocked"] / max(self.stats["total"], 1) * 100, 1
            ),
            "by_layer": {
                name: {
                    **counts,
                    "enabled": getattr(self.get_adapter(name), "enabled", False),
                }
                for name, counts in self.stats["by_layer"].items()
            },
        }

    def _add_block_history(self, text: str, adapter_name: str, result: GuardrailResult, stage: str):
        """记录拦截历史"""
        import time as t
        self.block_history.insert(0, {
            "timestamp": t.strftime("%H:%M:%S"),
            "input": text[:120],
            "adapter": adapter_name,
            "stage": stage,
            "reason": result.reason,
            "confidence": result.confidence,
            "details": result.details,
        })
        # 最多保留 50 条
        if len(self.block_history) > 50:
            self.block_history.pop()

    def get_block_history(self):
        return self.block_history

    def clear_block_history(self):
        self.block_history.clear()
