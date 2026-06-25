"""Phase 11 / 16-langgraph-state-machines —— ReAct 状态图模拟器

输入一个任务描述，本地模拟一个 LangGraph ReAct 图怎么跑：
  - 判断任务是否"Agent 形状"（能否拆成离散节点）
  - 画出四节点 ReAct 图的拓扑
  - 模拟一次执行的检查点序列 + 工具中断点
本地运行，不调 LLM。
"""
import re
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_score, block_keyvalue, block_table, block_list, block_text,
)


# 暗示"需要工具/多步骤/分支"的信号词 → 任务呈 Agent 形状
TOOL_HINTS = {
    "计算|算一下|多少|加减乘除|求和|\\d+\\s*[\\+\\-\\*/]": "calculator（算术）",
    "查询|搜索|查一下|检索|search|lookup|地址|总部": "web_lookup（检索）",
    "删除|退款|下单|支付|修改|写入|发送": "副作用工具（需人工审批）",
}
BRANCH_HINTS = ["如果", "否则", "判断", "分支", "重试", "循环", "then", "if"]


class LangGraphSimulator(PlaygroundModule):
    name = "langgraph_simulator"
    display_name = "ReAct 状态图模拟"
    description = "输入一个任务，模拟 LangGraph ReAct 图的节点/边/检查点/中断（本地，不调 LLM）"
    phase = "11-llm-engineering"
    lesson = "16-langgraph-state-machines"
    order = 160

    input_schema = [
        field_spec("task", "任务描述", type="textarea",
                   placeholder="例如：请用 calculator 计算 (17*23+100)，如果结果超过 400 就提醒我"),
        field_spec("interrupt_before_tools", "工具执行前人工审批", type="select",
                   default="是", options=["是", "否"],
                   help="开启后，图会在执行工具前暂停（interrupt_before=['tools']），等人工批准"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        task = (inputs.get("task") or "").strip()
        if not task:
            return ModuleResult(ok=False, error="请输入一个任务描述")
        interrupt = inputs.get("interrupt_before_tools", "是") == "是"

        # 1. 检测会用到哪些工具
        matched_tools = []
        for pattern, label in TOOL_HINTS.items():
            if re.search(pattern, task, re.IGNORECASE):
                matched_tools.append(label)
        has_branch = any(kw in task.lower() for kw in BRANCH_HINTS)

        # 2. 是否 Agent 形状（需要工具 or 有分支 → 值得画成图）
        signals = len(matched_tools) + (1 if has_branch else 0)
        is_agent_shaped = signals >= 1
        score = min(signals / 2, 1.0)

        if is_agent_shaped:
            verdict = f"Agent 形状（命中 {len(matched_tools)} 类工具" + ("，含条件分支" if has_branch else "") + "）→ 适合画成 StateGraph"
        else:
            verdict = "单步问答，一次 LLM 调用即可，不必上图"

        # 3. 模拟检查点序列
        checkpoints = [
            {"#": 0, "节点": "__start__", "最后消息": "—", "下一步": "agent"},
            {"#": 1, "节点": "agent", "最后消息": "👤 用户任务", "下一步": "agent"},
        ]
        if matched_tools:
            checkpoints.append({"#": 2, "节点": "agent", "最后消息": "🤖 模型想调工具", "下一步": "tools"})
            if interrupt:
                checkpoints.append({"#": 3, "节点": "__interrupt__", "最后消息": "⏸ 暂停等审批", "下一步": "tools"})
            checkpoints.append({"#": len(checkpoints), "节点": "tools", "最后消息": "🔧 工具结果", "下一步": "agent"})
            checkpoints.append({"#": len(checkpoints), "节点": "agent", "最后消息": "🤖 最终答案", "下一步": "（结束）"})
        else:
            checkpoints.append({"#": 2, "节点": "agent", "最后消息": "🤖 直接回答", "下一步": "（结束）"})

        cp_rows = [[str(c["#"]), c["节点"], c["最后消息"], c["下一步"]] for c in checkpoints]

        blocks = [
            block_score(score, "Agent 形状度", max_value=1.0, hint=verdict),
            block_keyvalue({
                "判定": "🟢 Agent 形状" if is_agent_shaped else "⚪ 非 Agent 形状",
                "可能用到的工具": "、".join(matched_tools) if matched_tools else "无",
                "含条件分支": "是" if has_branch else "否",
                "工具前中断": "开启（副作用前暂停审批）" if interrupt else "关闭",
            }, label="任务分析"),
            block_text(
                "agent ──(有 tool_calls?)──> tools ──> agent\n"
                "  └──(没有)──> END",
                label="四节点 ReAct 图拓扑",
            ),
            block_table(
                headers=["#", "节点", "最后消息", "下一步"],
                rows=cp_rows,
                label="模拟检查点序列（每步自动存档）",
            ),
            block_list([
                "检查点 — 每次节点转换落盘，用 thread_id 可从断点恢复",
                "中断 — interrupt_before=['tools'] 在副作用前暂停等人工批准",
                "流式 — stream(mode='updates') 实时推送每个节点更新",
                "时光回溯 — get_state_history() 拿历史，从任意检查点分叉重放",
            ], label="LangGraph 四大超能力", ordered=True),
            block_text(
                "messages 字段必须标 Annotated[list, add_messages]，否则新消息会覆盖而非追加——LangGraph 头号坑。",
                label="⚠️ reducer 提醒",
            ),
        ]

        return ModuleResult(
            ok=True,
            summary=f"{'🟢 Agent 形状' if is_agent_shaped else '⚪ 非 Agent 形状'} —— {verdict}",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
