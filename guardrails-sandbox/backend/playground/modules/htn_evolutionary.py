"""Phase 14 / 11-planning-htn-and-evolutionary —— HTN 规划 + 进化搜索

两个 demo 二选一：
  - HTN（分层任务网络）：把大任务按"前提→效果"骨牌式拆成可执行步骤，
    顺序由规则强制保证（跳步会被拦），所以构造上正确。没现成方法时
    回退问 AI，AI 的建议必须通过验证才采纳，问过就缓存下次不再问。
  - 进化搜索（AlphaEvolve 式）：一群随机解 → 打分 → 留最好的 → 变异生
    下一批 → 再筛，自动逼近最优。前提是"能机器自动打分"。

纯模拟、不调 LLM、自包含。
"""
import random
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# ── HTN：操作符（最小动作，带前提和效果）──────────────────────
OPERATORS = {
    "open_editor": (("logged_in",), "editor_open"),
    "write_tests": (("editor_open",), "tests_written"),
    "run_tests": (("tests_written",), "tests_passing"),
    "open_pr": (("tests_passing",), "pr_open"),
}
# 现成方法（菜谱）：大任务怎么拆
METHODS = {
    "发布代码变更": ("open_editor", "write_tests", "run_tests", "open_pr"),
}
# 脚本化"AI"：遇到没菜谱的任务回退问它
LLM_SCRIPTS = {
    "带数据库迁移的新功能": ("open_editor", "write_tests", "run_tests", "open_pr"),
}


def _htn_demo(task):
    """返回 (blocks, summary)。把 HTN 拆解每一步摊成表。"""
    rows = []          # 执行轨迹
    llm_calls = []
    state = {"logged_in"}

    method = METHODS.get(task)
    used_llm = False
    if method is None:
        # 回退问 AI
        suggested = LLM_SCRIPTS.get(task)
        llm_calls.append(task)
        used_llm = True
        if suggested is None:
            return ([block_text(f"AI 也不会拆 '{task}'，规划失败", label="结果")],
                    "规划失败：无方法、AI 也无建议")
        # 验证：每步都得是已知动作
        if not all(s in OPERATORS for s in suggested):
            return ([block_text("AI 建议里有不认识的步骤 → 拒绝（防瞎编）", label="结果")],
                    "规划失败：AI 建议未通过验证")
        method = suggested

    # 按顺序执行，边走边查前提、加效果
    for step in method:
        preconds, effect = OPERATORS[step]
        ok = all(p in state for p in preconds)
        rows.append([
            step,
            "、".join(preconds),
            "✓ 满足" if ok else "✗ 缺前提",
            effect,
            "、".join(sorted(state)),
        ])
        if not ok:
            return ([block_table(["步骤", "前提", "前提检查", "产生效果", "执行前已知事实"], rows,
                                 label="HTN 执行轨迹")],
                    f"规划失败：{step} 前提不满足")
        state.add(effect)

    blocks = [
        block_keyvalue({
            "任务": task,
            "拆解来源": "现成方法（菜谱）" if not used_llm else "AI 回退（已验证+已缓存）",
            "问 AI 次数": len(llm_calls),
            "最终计划": " → ".join(method),
        }, label="HTN 规划结果"),
        block_table(
            ["步骤", "前提", "前提检查", "产生效果", "执行前已知事实"], rows,
            label="执行轨迹（骨牌：上一步的效果 = 下一步的前提）"),
        block_list([
            "任务/方法/操作符/状态：大任务→按方法拆→落到带前提-效果的最小动作",
            "为什么保证正确：每步执行前查前提，跳步/乱序会被拦下（构造上正确）",
            "ChatHTN：没现成方法才问 AI，AI 建议必须过验证才采纳（LLM 当放大器不当主力）",
            "在线方法学习：问过的拆法缓存下来，下次同任务不再问 AI（省 75% 调用）",
            "适合：调度、合规、审批等'绝不能出错'的流程",
        ], label="要点"),
    ]
    src = "现成菜谱" if not used_llm else "AI回退并缓存"
    return blocks, f"HTN 规划成功（{src}）：{' → '.join(method)}"


def _fitness(a, b):
    """打分：a*x+b 与目标 3x+7 的总误差（越小越好，0=完美）。"""
    total = 0.0
    for x in range(-5, 6):
        total += (3 * x + 7 - (a * x + b)) ** 2
    return total


def _evo_demo(generations):
    rng = random.Random(0)
    pop = [(rng.randint(-10, 10), rng.randint(-10, 10)) for _ in range(6)]
    pop = sorted([(a, b, _fitness(a, b)) for a, b in pop], key=lambda t: t[2])

    gen_rows = [["第0代（随机）", f"a={pop[0][0]} b={pop[0][1]}", f"{pop[0][2]:.0f}"]]
    converged_at = None
    for gen in range(1, generations + 1):
        survivors = pop[:3]
        children = []
        for a, b, _ in survivors:
            for _ in range(3):
                da, db = rng.choice((-2, -1, 0, 1, 2)), rng.choice((-2, -1, 0, 1, 2))
                children.append((a + da, b + db, _fitness(a + da, b + db)))
        pop = sorted(survivors + children, key=lambda t: t[2])[:6]
        best = pop[0]
        gen_rows.append([f"第{gen}代", f"a={best[0]} b={best[1]}", f"{best[2]:.0f}"])
        if best[2] == 0 and converged_at is None:
            converged_at = gen
            break

    best = pop[0]
    blocks = [
        block_keyvalue({
            "任务": "找 a,b 使 a*x+b 等于目标 3x+7（答案 a=3 b=7）",
            "打分方式": "算和目标的总误差，越小越好，0=完美（必须能机器自动打分）",
            "收敛代数": f"第 {converged_at} 代找到完美解" if converged_at else f"{generations} 代内最优",
            "最终解": f"a={best[0]} b={best[1]}，误差={best[2]:.0f}",
        }, label="进化搜索结果"),
        block_table(["代", "本代最优", "误差"], gen_rows,
                    label="每代最优误差（一代代往下掉 = 进化）"),
        block_list([
            "循环四步：挑最好的3个 → 各变异生3个孩子 → 爹妈+孩子一起打分 → 留最好的6个",
            "精英保留：爹妈也参与竞争，所以最好成绩只降不升（不退步）",
            "硬前提：必须能机器自动打分。写诗/散文无法自动评分 → 进化搜索用不了",
            "AlphaEvolve 真实战绩：改进 56 年的矩阵乘法、省 Google 0.7% 算力、FlashAttention 提速 32%",
            "vs HTN：HTN 求'对'(一个保证正确的计划)，进化求'最好'(一堆方案挑最优)",
        ], label="要点"),
    ]
    tail = f"第 {converged_at} 代收敛到 a=3 b=7" if converged_at else f"{generations} 代内最优 a={best[0]} b={best[1]}"
    return blocks, f"进化搜索：{tail}"


class HtnEvolutionary(PlaygroundModule):
    name = "htn_evolutionary"
    display_name = "HTN 规划 + 进化搜索"
    description = "两种重型规划法：HTN 按前提-效果骨牌式拆任务(保证正确，适合合规/调度)；进化搜索打分→筛选→变异自动逼近最优(适合有自动评分的优化)。不调 LLM"
    phase = "14-agent-engineering"
    lesson = "11-planning-htn-and-evolutionary"
    order = 110

    input_schema = [
        field_spec("demo", "选择方法", type="select", default="HTN 规划（保证正确）",
                   options=["HTN 规划（保证正确）", "进化搜索（找最优）"],
                   help="HTN 求'对'，进化搜索求'最好'——两种重型规划法"),
        field_spec("htn_task", "HTN 任务", type="select", default="发布代码变更",
                   options=["发布代码变更", "带数据库迁移的新功能"],
                   help="第一个有现成菜谱(不问AI)；第二个没菜谱→回退问AI→验证→缓存"),
        field_spec("generations", "进化代数上限", type="number", default=10,
                   help="进化搜索最多跑几代（通常 6 代左右就收敛）"),
    ]

    def run(self, inputs):
        start = time.time()
        demo = str(inputs.get("demo", "HTN 规划（保证正确）"))

        if "HTN" in demo:
            task = str(inputs.get("htn_task", "发布代码变更"))
            blocks, summary = _htn_demo(task)
        else:
            try:
                gens = int(inputs.get("generations", 10))
            except (ValueError, TypeError):
                gens = 10
            gens = max(1, min(gens, 50))
            blocks, summary = _evo_demo(gens)

        # 两个方法的共同收尾
        blocks.append(block_text(
            "两者都把 AI 当放大器、不当主力，且都比 ReAct 重——非必要先用 ReAct。"
            "HTN：符号层保证正确，AI 只在没方法时补充；进化：确定性打分器选优，AI 只负责变异。",
            label="何时用：默认 ReAct，这俩是特殊场景"))

        return ModuleResult(ok=True, summary=summary, blocks=blocks,
                            latency_ms=(time.time() - start) * 1000)
