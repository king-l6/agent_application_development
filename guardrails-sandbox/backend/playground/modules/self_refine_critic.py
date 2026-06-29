"""Phase 14 / 05-self-refine-and-critic —— Self-Refine vs CRITIC（代码助手场景）

让助手写 divide(a, b)。对比两种「生成→批评→修订」循环：
  - Self-Refine：模型给自己打分。对"听起来很自信"的盲区查不出来。
  - CRITIC：把批评这一步换成外部验证器（跑测试 + linter），接地到真实信号。
关键：自我批评会放过自己的幻觉；外部验证能抓出它没察觉的崩溃。
纯模拟、不调 LLM、自包含。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


def _render(handles_zero, has_doc):
    """按已应用的修复，渲染当前代码版本。"""
    sig = "def divide(a: float, b: float) -> float:" if has_doc else "def divide(a, b):"
    body = []
    if has_doc:
        body.append('    """两数相除，b 为 0 时抛 ValueError。"""')
    if handles_zero:
        body.append("    if b == 0:")
        body.append("        raise ValueError('b 不能为 0')")
    body.append("    return a / b")
    return sig + "\n" + "\n".join(body)


def _external_verify(handles_zero, has_doc):
    """外部验证器：跑测试 + linter，返回 (通过?, 批评列表)。"""
    crit = []
    if not handles_zero:
        crit.append("跑测试 divide(1, 0) → ZeroDivisionError，边界 b==0 未处理")
    if not has_doc:
        crit.append("linter：缺类型注解或 docstring")
    return (len(crit) == 0), crit


def _self_critique(handles_zero, has_doc):
    """自我批评：同一个模型给自己打分。盲区——抓不到 divide(1,0) 会崩这种自信的幻觉，
    只会挑表面风格。注意它永远不提 b==0。"""
    crit = []
    if not has_doc:
        crit.append("读着觉得：可以补个 docstring 和类型注解")
    return (len(crit) == 0), crit


class SelfRefineCritic(PlaygroundModule):
    name = "self_refine_critic"
    display_name = "Self-Refine vs CRITIC（代码助手）"
    description = "写 divide(a,b)：对比自我批评（放过崩溃盲区）vs CRITIC 外部验证器（跑测试抓出 b==0 崩溃）。生成→批评→修订循环（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "05-self-refine-and-critic"
    order = 50

    input_schema = [
        field_spec("mode", "批评来源", type="select", default="CRITIC（外部验证器：测试+linter）",
                   options=["CRITIC（外部验证器：测试+linter）", "Self-Refine（模型自我批评）"],
                   help="Self-Refine 模型给自己打分，查不出自信的幻觉；CRITIC 接地到真实测试信号"),
        field_spec("max_iters", "最大迭代轮数", type="number", default=3, help="1-5，每轮加 token 和延迟"),
    ]

    def run(self, inputs):
        start = time.time()
        use_critic = "CRITIC" in str(inputs.get("mode", "CRITIC"))
        try:
            max_iters = int(inputs.get("max_iters", 3) or 3)
        except (TypeError, ValueError):
            max_iters = 3
        max_iters = max(1, min(max_iters, 5))

        verify = _external_verify if use_critic else _self_critique
        handles_zero, has_doc = False, False   # 初版啥都没有
        rows = []
        passed_at = None

        for it in range(1, max_iters + 1):
            ok, crit = verify(handles_zero, has_doc)
            crit_str = "（无意见，认为通过）" if not crit else "；".join(crit)
            rows.append([it, _render(handles_zero, has_doc).splitlines()[0] + " ...", "通过 ✓" if ok else "未过", crit_str])
            if ok:
                passed_at = it
                break
            # refine：只修批评里明确点到的问题
            if any("b==0" in c or "ZeroDivisionError" in c for c in crit):
                handles_zero = True
            if any("docstring" in c or "类型" in c for c in crit):
                has_doc = True

        final_code = _render(handles_zero, has_doc)
        result_line = f"第 {passed_at} 轮『通过』" if passed_at else f"{max_iters} 轮用完仍未通过"

        blocks = [
            block_keyvalue({
                "任务": "写 divide(a, b) 两数相除",
                "批评来源": "CRITIC 外部验证器（跑测试+linter）" if use_critic else "Self-Refine 模型自我批评",
                "结果": result_line,
                "最终是否处理 b==0": "是 ✓" if handles_zero else "否 ✗（崩溃 bug 还在！）",
            }, label="任务"),
            block_table(["轮", "实现版本", "验证", "批评 / 反馈"], rows,
                        label="生成 → 批评 → 修订（带历史）循环"),
            block_text(final_code, label="最终代码"),
        ]

        if use_critic:
            blocks.append(block_text(
                "CRITIC 把『批评』这一步接地到外部真实信号：跑 divide(1,0) 直接崩 → 抓出 b==0 没处理。"
                "这正是自我批评放过的『听起来很自信的幻觉』。代码助手的外部验证器=测试运行器+linter+类型检查。",
                label="为什么 CRITIC 更强"))
        else:
            blocks.append(block_text(
                "注意：Self-Refine『通过』了，但 b==0 崩溃 bug 还在！同一个模型给自己打分，"
                "对 divide(1,0) 会崩这种崩溃型 bug『读着觉得没问题』，只挑到表面风格（docstring）。"
                "这就是自我批评的盲区——把批评换成外部验证器（CRITIC）再跑一次，就能抓出这个崩溃。",
                label="自我批评的盲区（关键）"))

        blocks.append(block_list([
            "Self-Refine=generate/feedback/refine 三角色，纯自我批评，无需工具",
            "CRITIC=把 feedback 换成 verify(task, output, tools)，路由到外部工具验证",
            "vs Reflexion(03)：那是任务失败后写反思记忆下次用；这是单次输出内的打磨微循环",
            "vs ToT(04)：那是多分支横向搜索；这是单条输出纵向反复修订",
            "坑：预算 1-3 轮（每轮加延迟+token）；没真验证器时 CRITIC 退化成 Self-Refine，别白付延迟",
        ], label="要点"))

        return ModuleResult(ok=True, summary=f"{'CRITIC 外部验证' if use_critic else 'Self-Refine 自我批评'} —— {result_line}", blocks=blocks, latency_ms=(time.time()-start)*1000)
