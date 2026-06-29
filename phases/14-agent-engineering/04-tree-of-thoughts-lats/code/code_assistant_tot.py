"""代码助手版 Tree of Thoughts —— 真实场景演示。

任务：修一个有 bug 的 `parse_duration(s)`，把 "1h30m"、"45m"、"2h" 这类
时长字符串解析成总秒数。当前实现有 bug，跑测试会挂。

对比两种修法策略：
  - CoT（思维链）：一条道走到黑。第一步猜错了根因，后面全错，回不了头。
  - ToT（思维树）：同时提 3 个假设当作 3 个分支，每个分支真跑测试打分，
    按分数回溯、选最优的那条路。

价值函数不靠模型拍脑袋——直接跑测试，通过几个用例就是几分。
这正是代码助手该有的样子：测试就是免费的、可靠的裁判。

纯标准库、不调 LLM。每个「候选修法」用一个真实现模拟，
让你看清「多分支 + 测试打分 + 回溯」到底是怎么把对的那条路捞出来的。
"""

# ──────────────────────────────────────────────────────────────
# 测试集 —— 这就是价值函数的「标准答案」
# ──────────────────────────────────────────────────────────────
TESTS = [
    ("2h", 7200),
    ("45m", 2700),
    ("1h30m", 5400),
    ("90m", 5400),
    ("1h", 3600),
]


# ──────────────────────────────────────────────────────────────
# 有 bug 的原始实现：只处理了 "Xh" 或 "Xm" 单独出现，
# 遇到 "1h30m" 这种混合的就只取了第一个，而且 h/m 都当成了分钟。
# ──────────────────────────────────────────────────────────────
def parse_duration_buggy(s: str) -> int:
    num = int("".join(c for c in s if c.isdigit()))
    return num * 60   # bug：不管 h 还是 m 一律按分钟，且没拆开 h+m


# ──────────────────────────────────────────────────────────────
# 三个候选修法 = 树的三个分支（代码助手提出的 3 个假设）
# ──────────────────────────────────────────────────────────────
def fix_A_hours_only(s: str) -> int:
    """假设A：『单位搞错了，全按小时算』。改对了 h，但 m 也被当成 h。"""
    num = int("".join(c for c in s if c.isdigit()))
    return num * 3600


def fix_B_first_unit(s: str) -> int:
    """假设B：『要看单位字母』。看第一个单位决定，但没处理 h+m 混合。"""
    digits = int("".join(c for c in s if c.isdigit()))
    if "h" in s:
        return digits * 3600   # "1h30m" → 130*3600，错；"2h"→对
    return digits * 60         # "45m"/"90m" → 对


import re

def fix_C_regex_each_unit(s: str) -> int:
    """假设C：『按 (数字+单位) 逐段解析，h*3600 + m*60 累加』。正解。"""
    total = 0
    for num, unit in re.findall(r"(\d+)([hm])", s):
        total += int(num) * (3600 if unit == "h" else 60)
    return total


CANDIDATES = {
    "buggy(原始)": parse_duration_buggy,
    "A:全按小时": fix_A_hours_only,
    "B:看首个单位": fix_B_first_unit,
    "C:正则逐段累加": fix_C_regex_each_unit,
}


# ──────────────────────────────────────────────────────────────
# 价值函数 = 跑测试，通过几个用例就是几分（满分 = len(TESTS)）
# 这就是 ToT 的「自我评估」，但用真实测试代替模型的主观打分
# ──────────────────────────────────────────────────────────────
def score(fn) -> tuple[int, list]:
    passed = 0
    detail = []
    for inp, expected in TESTS:
        try:
            got = fn(inp)
        except Exception as e:
            got = f"异常{e}"
        ok = (got == expected)
        passed += ok
        detail.append((inp, expected, got, ok))
    return passed, detail


# ──────────────────────────────────────────────────────────────
# 策略一：CoT —— 一条道走到黑
# 模型一上来猜「单位搞错了，全按小时」（假设A），就顺着它一路改，不回头
# ──────────────────────────────────────────────────────────────
def run_cot():
    print("=" * 64)
    print("  策略一：CoT 思维链 —— 一条路走到黑，不回溯")
    print("=" * 64)
    chosen = "A:全按小时"
    print(f"  第一步直觉：『500 大概是单位搞错了，全按小时算』→ 选 {chosen}")
    s, detail = score(CANDIDATES[chosen])
    for inp, exp, got, ok in detail:
        print(f"    {inp:<8} 期望 {exp:<5} 得到 {str(got):<6} {'✓' if ok else '✗'}")
    print(f"  得分 {s}/{len(TESTS)} —— 不对，但 CoT 没有『退回去换条路』的机制，卡在这。")
    return s


# ──────────────────────────────────────────────────────────────
# 策略二：ToT —— 同时展开 3 个假设，各自跑测试打分，回溯选最优
# ──────────────────────────────────────────────────────────────
def run_tot():
    print("\n" + "=" * 64)
    print("  策略二：ToT 思维树 —— 同时探 3 个假设，按测试分回溯")
    print("=" * 64)
    branches = ["A:全按小时", "B:看首个单位", "C:正则逐段累加"]
    print(f"  根节点：修 parse_duration 的 bug")
    print(f"  扩展出 {len(branches)} 个分支（3 个候选修法），各自跑测试打分：\n")

    scored = []
    for name in branches:
        s, detail = score(CANDIDATES[name])
        scored.append((s, name, detail))
        bar = "█" * s + "·" * (len(TESTS) - s)
        print(f"    分支 {name:<14} 评分 [{bar}] {s}/{len(TESTS)}")

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_name, best_detail = scored[0]
    print(f"\n  回溯：剪掉低分分支，选评分最高的 → {best_name}")
    for inp, exp, got, ok in best_detail:
        print(f"    {inp:<8} 期望 {exp:<5} 得到 {str(got):<6} {'✓' if ok else '✗'}")
    print(f"  得分 {best_score}/{len(TESTS)} —— {'全过 ✓ 任务完成' if best_score==len(TESTS) else '仍需继续搜索'}")
    return best_score


if __name__ == "__main__":
    print("任务：修复 parse_duration(s) —— '2h'→7200, '1h30m'→5400, '45m'→2700 ...\n")
    cot = run_cot()
    tot = run_tot()

    print("\n" + "=" * 64)
    print("  对比")
    print("=" * 64)
    print(f"  CoT（一条路）：{cot}/{len(TESTS)} —— 第一步猜错就卡死，回不了头")
    print(f"  ToT（树搜索）：{tot}/{len(TESTS)} —— 同时探多条，测试当裁判，回溯捞出正解")
    print("\n  关键：ToT 不比模型更聪明，它只是『不把鸡蛋放一个篮子』+ 用测试客观打分。")
    print("  代价：跑了 3 倍的候选 = 3 倍 token。所以只在难题上掏出来用。")
