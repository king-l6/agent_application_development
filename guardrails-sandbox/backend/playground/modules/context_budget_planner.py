"""Phase 11 / 05-context-engineering —— 上下文预算 & 工具选择

输入一个用户查询和上下文窗口大小，展示：
  - 意图分类（基于关键词）
  - 按意图动态选中的工具及 token 占用
  - 各组件的预算分配与利用率
直接复用 guardrails 的 context_engine adapter 里的逻辑，本地运行，不调 LLM。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list,
)

# 复用 adapter 里已写好的逻辑，避免重复实现
from adapters.context_engine import (
    classify_intent, select_tools, ContextBudget, count_tokens,
)


class ContextBudgetPlanner(PlaygroundModule):
    name = "context_budget_planner"
    display_name = "上下文预算规划"
    description = "输入查询，看意图分类、动态工具选择与 token 预算分配（本地，不调 LLM）"
    phase = "11-llm-engineering"
    lesson = "05-context-engineering"
    order = 50

    input_schema = [
        field_spec("query", "用户查询", type="textarea",
                   placeholder="例如：帮我读取 config.py 文件并修复里面的 bug"),
        field_spec("max_tokens", "上下文窗口", type="number", default=8000,
                   help="模型的 context window 大小"),
        field_spec("system_prompt", "系统提示", type="textarea",
                   default="你是一个有用的编程助手。",
                   placeholder="可改成你自己的系统提示"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        query = (inputs.get("query") or "").strip()
        if not query:
            return ModuleResult(ok=False, error="请输入一个用户查询")

        try:
            max_tokens = int(inputs.get("max_tokens", 8000))
        except (ValueError, TypeError):
            max_tokens = 8000
        system_prompt = (inputs.get("system_prompt") or "你是一个有用的助手。").strip()

        # 意图 + 工具选择
        intents = classify_intent(query)
        tools, tool_tokens = select_tools(query, budget=min(2000, max_tokens // 4))

        # 预算分配
        budget = ContextBudget(max_tokens=max_tokens, gen_reserve=max_tokens // 8)
        budget.allocate("系统提示", system_prompt, max_tokens=500)
        if tools:
            tool_desc = " ".join(t["desc"] for t in tools.values())
            budget.allocate("工具定义", tool_desc, max_tokens=2000)
        budget.allocate("用户查询", query)
        report = budget.report()

        budget_rows = [
            [item["component"], item["tokens"], f"{item['pct']}%"]
            for item in report["items"]
        ]

        tool_items = [
            f"{name} —— {t['desc']}（约 {t['tokens']} token）"
            for name, t in tools.items()
        ] or ["（本次查询未命中任何工具）"]

        return ModuleResult(
            ok=True,
            summary=f"意图 {intents}，选中 {len(tools)} 个工具，利用率 {report['utilization_pct']}%",
            blocks=[
                block_keyvalue({
                    "识别意图": ", ".join(intents),
                    "窗口大小": f"{max_tokens} token",
                    "生成预留": f"{report['gen_reserve']} token",
                    "已用": f"{report['total_used']} token",
                    "剩余": f"{report['remaining']} token",
                    "利用率": f"{report['utilization_pct']}%",
                }, label="预算概览"),
                block_list(tool_items, label="动态选中的工具"),
                block_table(
                    headers=["组件", "Token", "占窗口比"],
                    rows=budget_rows,
                    label="预算分配明细",
                ),
            ],
            latency_ms=(time.time() - start) * 1000,
        )
