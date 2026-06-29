"""Phase 14 / 04-tree-of-thoughts-lats —— Tree of Thoughts 树搜索（代码助手场景）

修一个有 bug 的 parse_duration(s)：把 "1h30m" 这类时长串转成秒数。
对比两种策略：
  - CoT：一条路走到黑，第一步猜错根因就卡死，回不了头。
  - ToT：同时展开多个候选修法（分支），每个真跑测试打分，按分回溯选最优。
价值函数 = 跑测试（过几个用例就是几分），不靠模型主观打分。
纯模拟、不调 LLM、自包含。
"""
import re
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)

TESTS = [("2h", 7200), ("45m", 2700), ("1h30m", 5400), ("90m", 5400), ("1h", 3600)]


def _buggy(s):           # 原始 bug：不分 h/m 一律按分钟
    n = int("".join(c for c in s if c.isdigit()))
    return n * 60


def _fix_a(s):           # 假设A：全按小时
    n = int("".join(c for c in s if c.isdigit()))
    return n * 3600


def _fix_b(s):           # 假设B：看首个单位，但没处理 h+m 混合
    d = int("".join(c for c in s if c.isdigit()))
    return d * 3600 if "h" in s else d * 60


def _fix_c(s):           # 假设C：正则逐段累加（正解）
    return sum(int(num) * (3600 if u == "h" else 60) for num, u in re.findall(r"(\d+)([hm])", s))


CANDIDATES = {"A:全按小时": _fix_a, "B:看首个单位": _fix_b, "C:正则逐段累加": _fix_c}


def _score(fn):
    passed, detail = 0, []
    for inp, exp in TESTS:
        try:
            got = fn(inp)
        except Exception as e:
            got = f"异常{e}"
        ok = got == exp
        passed += ok
        detail.append([inp, exp, str(got), "✓" if ok else "✗"])
    return passed, detail


class TotSearch(PlaygroundModule):
    name = "tot_search"
    display_name = "Tree of Thoughts 树搜索（代码助手）"
    description = "修 parse_duration 的 bug：对比 CoT 一条路走死 vs ToT 多分支+测试打分+回溯。价值函数=跑测试（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "04-tree-of-thoughts-lats"
    order = 40

    input_schema = [
        field_spec("strategy", "搜索策略", type="select", default="ToT 树搜索（多分支+回溯）",
                   options=["ToT 树搜索（多分支+回溯）", "CoT 思维链（一条路走到黑）"],
                   help="CoT 第一步猜错根因就卡死；ToT 同时探多个假设、按测试分回溯选最优"),
    ]

    def run(self, inputs):
        start = time.time()
        is_tot = "ToT" in str(inputs.get("strategy", "ToT"))

        task_kv = block_keyvalue({
            "任务": "修复 parse_duration(s)：时长串转秒数",
            "测试集": "2h=7200, 45m=2700, 1h30m=5400, 90m=5400, 1h=3600",
            "原始 bug": "不分 h/m 一律按分钟，且没拆开 h+m",
        }, label="任务")

        if not is_tot:
            # CoT：押注假设 A，一条路走死
            s, detail = _score(_fix_a)
            blocks = [
                task_kv,
                block_text("第一步直觉：『大概是单位搞错了，全按小时算』→ 押注假设 A，顺着改不回头。", label="CoT：一条路走到黑"),
                block_table(["用例", "期望", "得到", ""], detail, label=f"假设 A 跑测试：{s}/{len(TESTS)}"),
                block_text("CoT 没有『退回去换条路』的机制——第一步错了，后面全错，卡死在 2/5。", label="结果"),
                block_list([
                    "思维链是一条线性路径，第一步选错前提，后续全建立在错误之上",
                    "24 点游戏上 GPT-4 CoT 只有 4% 正确率，就是栽在这",
                ], label="要点"),
            ]
            return ModuleResult(ok=True, summary=f"CoT 一条路走死 —— {s}/{len(TESTS)}，卡住", blocks=blocks, latency_ms=(time.time()-start)*1000)

        # ToT：展开 3 个分支，各自打分，回溯选最优
        scored = []
        bar_rows = []
        for name in ["A:全按小时", "B:看首个单位", "C:正则逐段累加"]:
            s, detail = _score(CANDIDATES[name])
            scored.append((s, name, detail))
            bar = "█" * s + "·" * (len(TESTS) - s)
            bar_rows.append([name, f"{bar} {s}/{len(TESTS)}"])
        scored.sort(key=lambda x: x[0], reverse=True)
        best_s, best_name, best_detail = scored[0]

        blocks = [
            task_kv,
            block_text("根节点『修 bug』→ 扩展出 3 个分支（3 个候选修法），每个真跑测试当价值函数打分。", label="ToT：多分支 + 自我评估"),
            block_table(["分支（一个想法）", "评分（跑测试）"], bar_rows, label="扩展 + 评估：每个分支跑测试打分"),
            block_text(f"剪掉低分分支，选评分最高的 → {best_name}", label="回溯/剪枝"),
            block_table(["用例", "期望", "得到", ""], best_detail, label=f"最优分支 {best_name}：{best_s}/{len(TESTS)}"),
            block_list([
                "节点=一个想法（候选修法），扩展=展开分支，价值函数=跑测试，回溯=按分剪枝选优",
                "ToT 不是模型更聪明，是『不把鸡蛋放一个篮子』+ 用测试客观打分",
                "代码助手的天然优势：单元测试就是免费可靠的价值函数（LATS 在 HumanEval 冲到 92.7%）",
                "代价：探 N 个分支 = N 倍 token。生产里放开关后面：难题才上搜索，简单任务一条 ReAct 搞定",
            ], label="要点"),
        ]
        return ModuleResult(ok=True, summary=f"ToT 树搜索 —— 回溯选出 {best_name}，{best_s}/{len(TESTS)} 全过", blocks=blocks, latency_ms=(time.time()-start)*1000)
