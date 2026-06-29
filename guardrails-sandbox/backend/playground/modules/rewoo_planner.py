"""Phase 14 / 02-rewoo-plan-and-execute —— ReWOO 计划器（代码助手场景）

选一个代码助手任务，本地生成 ReWOO 的计划 DAG（Planner）、按依赖顺序执行
拿到证据（Workers），汇总最终答复（Solver），并和 ReAct 的 token 用量对比。
纯模拟、不调 LLM、自包含。

核心对照（docs/zh.md）：
  - ReWOO：先一次性规划整张 DAG，再并行取证据，最后求解。规划不看观察。
  - ReAct：想一步做一步，每步都把全部历史塞回 prompt，token 随步数膨胀。
"""
import re
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)

# 证据引用占位符：#E1 #E2 ...
_REF = re.compile(r"#E\d+")


# ── 预置代码助手任务：每个是一段 ReWOO 计划（id, 工具, 参数, 依赖说明）──
# 参数里的 #E1 表示“用第 1 步的输出”。evidence 是模拟的工具返回。
TASKS = {
    "重命名函数 get_user → fetch_user": {
        "request": "把 get_user 重命名为 fetch_user，所有调用处都改",
        "plan": [
            ("E1", "grep", {"pattern": "def get_user"}, "找函数定义"),
            ("E2", "grep", {"pattern": "get_user("}, "找所有调用点"),
            ("E3", "rename_symbol", {"defs": "#E1", "calls": "#E2", "to": "fetch_user"}, "依赖 E1+E2 做改名"),
            ("E4", "run_tests", {}, "验证没改坏"),
        ],
        "evidence": {
            "E1": "user/service.py:42",
            "E2": "5 处：api.py:8, view.py:15, view.py:31, task.py:77, test_user.py:12",
            "E3": "已改 1 处定义 + 5 处调用 → fetch_user",
            "E4": "测试 23 passed",
        },
        "answer": "已将 get_user 重命名为 fetch_user：1 处定义 + 5 处调用，测试 23 passed ✓",
    },
    "给 utils.py 全部函数加类型注解": {
        "request": "给 utils.py 里所有函数补上类型注解",
        "plan": [
            ("E1", "list_functions", {"file": "utils.py"}, "列出所有函数"),
            ("E2", "infer_types", {"functions": "#E1"}, "依赖 E1 推断每个函数签名类型"),
            ("E3", "apply_annotations", {"edits": "#E2"}, "依赖 E2 写回注解"),
            ("E4", "run_type_check", {}, "mypy 校验"),
        ],
        "evidence": {
            "E1": "8 个函数：load, save, parse, fmt, ...",
            "E2": "推断出 8 个签名，2 个需 Optional",
            "E3": "已为 8 个函数写入注解",
            "E4": "mypy: no issues found",
        },
        "answer": "已为 utils.py 的 8 个函数补全类型注解，mypy 通过 ✓",
    },
    "排查登录接口偶发 500 错误": {
        "request": "登录接口偶发 500，帮我定位原因",
        "plan": [
            ("E1", "grep_logs", {"pattern": "500", "route": "/login"}, "捞出错日志"),
            ("E2", "find_handler", {"route": "/login"}, "找处理函数"),
            ("E3", "static_analyze", {"target": "#E2", "clue": "#E1"}, "依赖 E1+E2 静态分析可疑点"),
        ],
        "evidence": {
            "E1": "12 条 500，集中在 KeyError: 'token'",
            "E2": "auth/views.py:login()",
            "E3": "login() 未判空就取 request['token']，空请求体即崩",
        },
        "answer": "根因：auth/views.py login() 直接取 request['token']，请求体缺 token 时 KeyError→500。建议加判空兜底。",
    },
}


def _resolve(value, evidence):
    """把参数里的 #E1 替换成已得证据；执行前看不到的就保留占位符。"""
    if not isinstance(value, str):
        return value
    return _REF.sub(lambda m: evidence.get(m.group(0)[1:], m.group(0)), value)


class RewooPlanner(PlaygroundModule):
    name = "rewoo_planner"
    display_name = "ReWOO 计划器（代码助手）"
    description = "选一个代码任务，看 ReWOO 先规划后执行的全过程（计划DAG→证据→求解）+ 和 ReAct 的 token 对比（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "02-rewoo-plan-and-execute"
    order = 20

    input_schema = [
        field_spec("task", "选择代码任务", type="select",
                   default=list(TASKS.keys())[0],
                   options=list(TASKS.keys()),
                   help="每个任务对应一段 ReWOO 计划，本地模拟执行"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()

        task_key = (inputs.get("task") or "").strip()
        task = TASKS.get(task_key)
        if task is None:
            return ModuleResult(ok=False, error=f"未知任务：{task_key}")

        request = task["request"]
        plan = task["plan"]
        evidence = task["evidence"]

        # 1. Planner：计划 DAG（占位符未替换的原始计划）
        plan_rows = []
        for sid, tool, args, note in plan:
            arg_str = ", ".join(f"{k}={v}" for k, v in args.items()) or "（无参数）"
            refs = _REF.findall(str(args))
            dep = "、".join(refs) if refs else "—"
            plan_rows.append([sid, f"{tool}({arg_str})", dep, note])

        # 2. Workers：按计划执行，#E1 替换成真实证据
        worker_rows = []
        for sid, tool, args, _note in plan:
            bound = {k: _resolve(v, evidence) for k, v in args.items()}
            bound_str = ", ".join(f"{k}={v}" for k, v in bound.items()) or "（无参数）"
            worker_rows.append([sid, f"{tool}({bound_str})", f"→ {evidence.get(sid, '?')}"])

        # 3. Solver：最终答复
        answer = task["answer"]

        # 4. token 对比（粗略字符数，模拟论文的 shape）
        # ReWOO：规划提示 + 每步小提示（无历史）+ 求解一次
        rewoo_chars = len(request)
        rewoo_chars += sum(len(t) + len(str(a)) for _, t, a, _ in plan)   # planner
        rewoo_chars += sum(len(str(a)) + len(evidence.get(s, ""))          # workers
                           for s, _, a, _ in plan)
        rewoo_chars += len(request) + len(answer)                          # solver
        # ReAct：每步都重复带 request + 之前全部历史
        react_chars = 0
        history = 0
        for s, t, a, _ in plan:
            react_chars += len(request) + history + len(t) + len(str(a))
            history += len(t) + len(str(a)) + len(evidence.get(s, "")) + 40
        react_chars += len(request) + history
        ratio = react_chars / max(rewoo_chars, 1)

        blocks = [
            block_keyvalue({
                "用户需求": request,
                "最终答复": answer,
                "计划步数": len(plan),
            }, label="任务"),
            block_table(
                headers=["步", "工具调用（计划时）", "依赖", "这步干嘛"],
                rows=plan_rows,
                label="1. Planner：一次性规划整张 DAG（#E1 是占位符，规划时不看结果）",
            ),
            block_table(
                headers=["步", "工具调用（执行时，占位符已替换）", "证据"],
                rows=worker_rows,
                label="2. Workers：按依赖顺序执行，#E1 换成真实证据",
            ),
            block_text(answer, label="3. Solver：汇总证据成最终答复"),
            block_keyvalue({
                "ReAct 字符数": react_chars,
                "ReWOO 字符数": rewoo_chars,
                "ReWOO 省了": f"{ratio:.2f}x（步骤越多省越多，论文 HotpotQA 测到 ~5x）",
            }, label="token 对比（ReWOO 不把历史塞回 prompt）"),
            block_list([
                "ReWOO = 先规划后执行，把『想』和『做』解耦",
                "Planner 不看观察 → 可以用小模型(7B)规划、大模型执行（规划器蒸馏）",
                "失败定位是按节点的：哪个 E 出错一目了然，不用从历史里重推",
                "代价是死板：计划一次定死，执行中发现意外改不了 → 那就用 Plan-and-Execute（带重规划）",
            ], label="要点"),
        ]

        return ModuleResult(
            ok=True,
            summary=f"{task_key} —— {len(plan)} 步计划，ReWOO 比 ReAct 省 {ratio:.2f}x token",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
