"""Phase 14 / 01-the-agent-loop —— ReAct 循环轨迹器

选一个预置任务（或自定义工具脚本），本地跑一遍 ReAct 循环，逐步展示
「思考 → 行动 → 观察」轨迹、轮次预算、停止条件。逻辑对应课程 code/main.py
的 AgentLoop，纯模拟、不调 LLM、自包含。

五要素对照（docs/zh.md）：
  1. 消息缓冲区 = trace 列表（不断增长）
  2. 工具注册表 = TOOLS（名字→可调用）
  3. 停止条件 = finish / 超 max_turns
  4. 轮次预算 = max_turns
  5. 观察格式化器 = dispatch（出错也返回字符串，不崩）
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# ── 工具注册表（要素 2）──────────────────────────────────────────
def _calculator(expr: str) -> str:
    allowed = set("0123456789+-*/(). ")
    if not set(expr).issubset(allowed):
        return "error: 表达式含非法字符"
    try:
        return str(eval(expr, {"__builtins__": {}}, {}))
    except Exception as e:
        return f"error: {type(e).__name__}: {e}"


class _KV:
    def __init__(self):
        self.store = {}

    def get(self, key: str) -> str:
        return self.store.get(key, f"missing:{key}")

    def set(self, key: str, value: str) -> str:
        self.store[key] = value
        return f"stored {key}"


# ── 预置任务脚本（模拟“蒙眼助手”的剧本）──────────────────────────
# 每步: (thought, tool, args)；末尾 finish
PRESETS = {
    "含税总额（120 + 15%）": [
        ("先存下基础价", "kv_set", {"key": "base", "value": "120"}),
        ("算 15% 的税", "calculator", {"expr": "120 * 0.15"}),
        ("把税额存起来", "kv_set", {"key": "tax", "value": "18.0"}),
        ("算含税总额", "calculator", {"expr": "120 + 18.0"}),
        ("回读确认基础价", "kv_get", {"key": "base"}),
        ("__finish__", "含税总额是 138.0", {}),
    ],
    "带一次报错并自我纠正": [
        ("直接算总额（但表达式写错了）", "calculator", {"expr": "120 + 18 +"}),
        ("上一步报错了，改成正确表达式重算", "calculator", {"expr": "120 + 18"}),
        ("__finish__", "纠正后得到 138", {}),
    ],
    "调用不存在的工具（触发未知工具观察）": [
        ("想用一个没注册的工具", "send_email", {"to": "a@b.com"}),
        ("发现没这个工具，改用计算器", "calculator", {"expr": "1 + 1"}),
        ("__finish__", "改道后得到 2", {}),
    ],
}


class ReactLoopTracer(PlaygroundModule):
    name = "react_loop_tracer"
    display_name = "ReAct 循环轨迹器"
    description = "选一个任务，本地跑 ReAct 循环，逐步看「思考→行动→观察」轨迹与停止条件（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "01-the-agent-loop"
    order = 10

    input_schema = [
        field_spec("preset", "选择任务", type="select",
                   default=list(PRESETS.keys())[0],
                   options=list(PRESETS.keys()),
                   help="每个任务是一段预写的思考/行动脚本，模拟模型逐步决策"),
        field_spec("max_turns", "轮次预算 (max_turns)", type="number", default=10,
                   help="循环最多转几圈，防止无限循环（要素 4）"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()

        preset_key = (inputs.get("preset") or "").strip()
        script = PRESETS.get(preset_key)
        if script is None:
            return ModuleResult(ok=False, error=f"未知任务：{preset_key}")

        try:
            max_turns = int(inputs.get("max_turns", 10))
        except (ValueError, TypeError):
            max_turns = 10
        if max_turns < 1:
            max_turns = 1

        # 工具注册表（要素 2）
        kv = _KV()
        tools = {
            "calculator": _calculator,
            "kv_get": kv.get,
            "kv_set": kv.set,
        }

        def dispatch(name, args):
            """观察格式化器（要素 5）：出错也返回字符串，不抛异常。"""
            fn = tools.get(name)
            if fn is None:
                return f"error: 未知工具 {name!r}"
            try:
                return fn(**args)
            except TypeError as e:
                return f"error: 参数不对 {name}: {e}"
            except Exception as e:
                return f"error: {type(e).__name__}: {e}"

        # ── 循环主体 ──────────────────────────────────────────────
        trace_rows = []          # 给前端看的轨迹表
        buffer = []              # 消息缓冲区（要素 1）
        buffer.append(["user", "（任务开始）", ""])
        action_count = 0
        stop_reason = ""
        final_answer = ""
        cursor = 0

        for step in range(max_turns):       # 轮次预算（要素 4）
            if cursor >= len(script):
                stop_reason = "脚本耗尽（模型没有更多动作）"
                final_answer = "(无最终答案)"
                break
            thought, action, args = script[cursor]
            cursor += 1

            # 停止条件（要素 3）：finish
            if thought == "__finish__":
                final_answer = action
                stop_reason = "模型发出 finish"
                trace_rows.append([
                    str(len(trace_rows)), "🏁 finish", "—",
                    final_answer,
                ])
                break

            # 思考
            trace_rows.append([str(len(trace_rows)), "💭 thought", "—", thought])
            # 行动 + 观察
            observation = dispatch(action, args)
            action_count += 1
            arg_str = ", ".join(f"{k}={v}" for k, v in args.items())
            trace_rows.append([
                str(len(trace_rows)),
                "🔧 action",
                f"{action}({arg_str})",
                f"→ {observation}",
            ])
            buffer.append(["action", action, observation])
        else:
            # for 没 break = 转满 max_turns 还没 finish
            stop_reason = f"轮次预算耗尽（达到 max_turns={max_turns}）"
            final_answer = "(预算耗尽，未完成)"

        is_recovered = any("error:" in r[3] for r in trace_rows)

        blocks = [
            block_keyvalue({
                "任务": preset_key,
                "最终答案": final_answer,
                "停止原因": stop_reason,
                "用了几个 action 回合": action_count,
                "轮次预算 max_turns": max_turns,
                "可用工具": "、".join(sorted(tools.keys())),
            }, label="运行结果"),
            block_table(
                headers=["#", "类型", "工具调用", "内容 / 观察"],
                rows=trace_rows,
                label="ReAct 轨迹（思考 → 行动 → 观察，逐圈）",
            ),
            block_list([
                "1. 消息缓冲区 —— 轨迹不断增长，模型每圈都看着全部历史决策",
                "2. 工具注册表 —— 模型只能调注册过的工具，调错名字会得到 error 观察",
                "3. 停止条件 —— finish / 无工具调用 / 超轮次 / 超 token / 触发护栏",
                "4. 轮次预算 —— max_turns 兜底，防止鬼打墙无限循环",
                "5. 观察格式化器 —— 工具出错也转成字符串喂回，模型据此纠正，绝不崩溃",
            ], label="Agent 循环五要素", ordered=False),
        ]
        if is_recovered:
            blocks.append(block_text(
                "注意轨迹里出现了 error 观察，但循环没崩——模型读到报错后改了下一步动作。"
                "这就是 2026 年 CRITIC 风格的纠错：报错也是一种观察。",
                label="自我纠正",
            ))

        return ModuleResult(
            ok=True,
            summary=f"{preset_key} —— {stop_reason}，最终答案：{final_answer}",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
