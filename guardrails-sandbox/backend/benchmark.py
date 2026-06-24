"""基准测试引擎

对每个用例调用 pipeline.run_input_checks()（不调 LLM），
对比实际结果和预期结果，计算 TPR/FPR/准确率等指标。
"""
import time
from test_cases import ALL_CASES, CATEGORY_MAP, ATTACK_CASES, BENIGN_CASES


class BenchmarkRunner:
    def __init__(self):
        self.results = []

    def run_all(self, pipeline) -> dict:
        """运行全部测试用例"""
        self.results = []
        for tc in ALL_CASES:
            self._run_single(pipeline, tc)
        return self._build_report()

    def run_category(self, pipeline, category: str) -> dict:
        """运行指定类别的测试用例"""
        self.results = []
        cases = CATEGORY_MAP.get(category, [])
        for tc in cases:
            self._run_single(pipeline, tc)
        return self._build_report()

    def _run_single(self, pipeline, tc):
        """对单个用例执行 input checks"""
        # 保存 pipeline 状态（包括速率限制器的内部窗口）
        saved_states = {}
        saved_rate_windows = None
        for a in pipeline.adapters:
            saved_states[a.name] = a.enabled
            a.enabled = True
            if a.name == "rate_limiter":
                from collections import deque
                saved_rate_windows = {
                    k: deque(v) for k, v in a.windows.items()
                }
        saved_stats = {
            "total": pipeline.stats["total"],
            "blocked": pipeline.stats["blocked"],
            "passed": pipeline.stats["passed"],
        }

        passed, logs, block_detail = pipeline.run_input_checks(
            tc.input, {"user_id": "bench", "tier": "enterprise", "_benchmark": True}
        )

        # 恢复状态
        for a in pipeline.adapters:
            a.enabled = saved_states[a.name]
            if a.name == "rate_limiter" and saved_rate_windows is not None:
                a.windows.clear()
                a.windows.update(saved_rate_windows)
        pipeline.stats["total"] = saved_stats["total"]
        pipeline.stats["blocked"] = saved_stats["blocked"]
        pipeline.stats["passed"] = saved_stats["passed"]

        # 找谁拦的
        blocked_by = None
        if not passed and block_detail:
            # 从 logs 里找第一个没通过的 adapter
            for log in logs:
                if not log["passed"]:
                    blocked_by = log["name"]
                    break

        self.results.append({
            "input": tc.input[:80],
            "category": tc.category,
            "expected_pass": tc.expected_pass,
            "actual_pass": passed,
            "correct": passed == tc.expected_pass,
            "blocked_by": blocked_by,
            "latency_ms": sum(l.get("latency_ms", 0) for l in logs),
            "details": logs,
        })

    def _build_report(self) -> dict:
        """构建完整报告"""
        if not self.results:
            return {"summary": {}, "by_category": {}, "by_layer": {}, "details": []}

        total = len(self.results)
        correct = sum(1 for r in self.results if r["correct"])
        actual_passed = sum(1 for r in self.results if r["actual_pass"])
        actual_blocked = total - actual_passed

        # 按类别统计
        by_category = {}
        for tc in ALL_CASES:
            cat = tc.category
            if cat not in by_category:
                by_category[cat] = {
                    "total": 0, "passed": 0, "blocked": 0,
                    "correct": 0, "accuracy": 0.0,
                }
        for r in self.results:
            cat = r["category"]
            by_category[cat]["total"] += 1
            by_category[cat]["passed"] += 1 if r["actual_pass"] else 0
            by_category[cat]["blocked"] += 0 if r["actual_pass"] else 1
            by_category[cat]["correct"] += 1 if r["correct"] else 0
        for cat, stats in by_category.items():
            stats["accuracy"] = round(
                stats["correct"] / max(stats["total"], 1), 4
            )

        # 按拦截层统计
        by_layer = {}
        for r in self.results:
            layer = r["blocked_by"] or "none"
            if layer not in by_layer:
                by_layer[layer] = {"blocked": 0, "correct": 0, "total": 0}
            by_layer[layer]["total"] += 1
            if not r["actual_pass"]:
                by_layer[layer]["blocked"] += 1
            if r["correct"]:
                by_layer[layer]["correct"] += 1

        # TPR/FPR 计算
        # TP: 攻击用例被正确拦截
        # FN: 攻击用例被错误放行
        # FP: 正常用例被错误拦截
        # TN: 正常用例被正确放行
        tp = sum(1 for r in self.results
                 if not r["expected_pass"] and not r["actual_pass"])
        fn = sum(1 for r in self.results
                 if not r["expected_pass"] and r["actual_pass"])
        fp = sum(1 for r in self.results
                 if r["expected_pass"] and not r["actual_pass"])
        tn = sum(1 for r in self.results
                 if r["expected_pass"] and r["actual_pass"])

        tpr = round(tp / max(tp + fn, 1), 4)  # 攻击拦截率
        fpr = round(fp / max(fp + tn, 1), 4)  # 误拦率
        precision = round(tp / max(tp + fp, 1), 4)  # 精确率
        f1 = round(
            2 * (precision * tpr) / max(precision + tpr, 0.0001), 4
        ) if (precision + tpr) > 0 else 0.0

        avg_latency = round(
            sum(r["latency_ms"] for r in self.results) / max(total, 1), 2
        )

        summary = {
            "total": total,
            "correct": correct,
            "passed": actual_passed,
            "blocked": actual_blocked,
            "accuracy": round(correct / max(total, 1), 4),
            "avg_latency_ms": avg_latency,
            "tp": tp, "fn": fn, "fp": fp, "tn": tn,
            "tpr": tpr,
            "fpr": fpr,
            "precision": precision,
            "f1_score": f1,
        }

        return {
            "summary": summary,
            "by_category": by_category,
            "by_layer": by_layer,
            "details": self.results,
        }
