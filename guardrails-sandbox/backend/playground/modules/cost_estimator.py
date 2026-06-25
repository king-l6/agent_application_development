"""Phase 11 / 11-caching-cost —— LLM 成本估算

输入模型、token 量、请求频率，输出月度/年度成本，并对比不同缓存命中率的节省。
逻辑与 MCP 的 calculate_cost 工具一致，但结果以表格形式直观展示。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table,
)

PRICING = {
    "gpt-4o":        {"input": 2.50, "output": 10.00},
    "claude-sonnet": {"input": 3.00, "output": 15.00},
    "gpt-4o-mini":   {"input": 0.15, "output": 0.60},
    "gemini-pro":    {"input": 1.25, "output": 5.00},
}


class CostEstimator(PlaygroundModule):
    name = "cost_estimator"
    display_name = "成本估算"
    description = "估算 LLM API 的月度/年度成本，并对比缓存命中率带来的节省"
    phase = "11-llm-engineering"
    lesson = "11-caching-cost"
    order = 110

    input_schema = [
        field_spec("model", "模型", type="select", default="gpt-4o",
                   options=list(PRICING.keys())),
        field_spec("input_tokens", "输入 token/次", type="number", default=1000),
        field_spec("output_tokens", "输出 token/次", type="number", default=500),
        field_spec("requests_per_day", "每日请求数", type="number", default=1000),
        field_spec("days_per_month", "每月天数", type="number", default=30),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        model = str(inputs.get("model", "")).lower()
        if model not in PRICING:
            return ModuleResult(
                ok=False,
                error=f"不支持的模型，可选：{', '.join(PRICING.keys())}",
            )

        try:
            input_tokens = int(inputs.get("input_tokens", 0))
            output_tokens = int(inputs.get("output_tokens", 0))
            rpd = int(inputs.get("requests_per_day", 1000))
            dpm = int(inputs.get("days_per_month", 30))
        except (ValueError, TypeError):
            return ModuleResult(ok=False, error="token 数与请求量必须是整数")

        p = PRICING[model]
        per_req = (input_tokens / 1_000_000 * p["input"]) + (output_tokens / 1_000_000 * p["output"])
        daily = per_req * rpd
        monthly = daily * dpm
        yearly = monthly * 12

        cache_rows = []
        for hit in [0, 20, 40, 60, 80]:
            eff = monthly * (1 - hit / 100)
            saved = monthly - eff
            cache_rows.append([f"{hit}%", f"${eff:.2f}", f"${saved:.2f}"])

        latency = (time.time() - start) * 1000
        return ModuleResult(
            ok=True,
            summary=f"{model} 月度成本约 ${monthly:.2f}（年度 ${yearly:.2f}）",
            blocks=[
                block_keyvalue({
                    "单次成本": f"${per_req:.6f}",
                    "每日成本": f"${daily:.2f}",
                    "月度成本": f"${monthly:.2f}",
                    "年度成本": f"${yearly:.2f}",
                }, label="成本汇总"),
                block_table(
                    headers=["缓存命中率", "实际月成本", "节省"],
                    rows=cache_rows,
                    label="缓存节省对比",
                ),
            ],
            latency_ms=latency,
        )
