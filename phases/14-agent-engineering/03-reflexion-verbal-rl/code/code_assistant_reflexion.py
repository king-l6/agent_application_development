"""代码助手版 Reflexion —— 真实场景演示。

任务：让 AI 写一个 `roman_to_int(s)`（罗马数字转整数）。
这是代码助手每天都在干的活：你说需求，它写函数，你（或 CI）跑测试。

Reflexion 的四个角色，对应到代码助手就是：
  - Actor          = 写代码的那个 LLM（根据 prompt + 历史反思产出一版实现）
  - Evaluator      = 跑测试的 pytest / 你的测试用例（pass/fail + 失败详情）
  - SelfReflector  = 失败后让 LLM 用「人话」总结这次为什么错（不是改分数，是写经验）
  - EpisodicMemory = 把这些反思攒起来，下次写代码前塞回 prompt

关键点：模型参数一个字没变，变的只是 prompt 里多了几条「上次踩的坑」。
这就是 verbal reinforcement learning —— 用语言强化，不是用梯度。

为了让你能离线跑、结果可复现，这里的 Actor 不调真 LLM，而是用一个
「候选实现库」模拟：它会根据记忆里有没有对应的反思，决定交出哪一版代码。
这恰恰能干净地展示机制：记忆里多一条反思 → 行为就变一次。
"""

# ──────────────────────────────────────────────────────────────
# 测试用例：这就是 Evaluator 手里的「标准答案」
# ──────────────────────────────────────────────────────────────
TESTS = [
    ("III", 3),
    ("LVIII", 58),
    ("IX", 9),       # 减法：I 在 X 左边 = 9
    ("IV", 4),       # 减法：I 在 V 左边 = 4
    ("MCMXCIV", 1994),  # 多处减法：CM=900, XC=90, IV=4
]

VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


# ──────────────────────────────────────────────────────────────
# Actor 的「候选实现库」
# 每一版对应代码助手在不同认知水平下会写出来的代码
# ──────────────────────────────────────────────────────────────
def attempt_naive(s: str) -> int:
    """第 1 版：天真地把每个字符的值加起来。
    没考虑罗马数字的减法规则（小值在大值左边要减）。"""
    return sum(VALUES[c] for c in s)


def attempt_with_subtraction(s: str) -> int:
    """第 2 版：处理减法——如果当前值小于右边的值，就减去它。"""
    total = 0
    for i, c in enumerate(s):
        if i + 1 < len(s) and VALUES[c] < VALUES[s[i + 1]]:
            total -= VALUES[c]
        else:
            total += VALUES[c]
    return total


def actor(memory: list[str]):
    """Actor：根据记忆里的反思，决定交出哪一版实现。

    真实世界里这一步是 LLM：prompt = 任务 + 历史反思，输出一段代码。
    这里用「记忆里是否出现过减法相关的教训」来模拟 LLM 的认知升级。
    """
    learned_subtraction = any("减法" in r for r in memory)
    if learned_subtraction:
        return "attempt_with_subtraction", attempt_with_subtraction
    return "attempt_naive", attempt_naive


# ──────────────────────────────────────────────────────────────
# Evaluator：跑测试，返回 pass/fail + 第一个失败的细节
# ──────────────────────────────────────────────────────────────
def evaluator(fn):
    for inp, expected in TESTS:
        try:
            got = fn(inp)
        except Exception as e:
            return False, {"input": inp, "expected": expected, "got": f"异常 {e}"}
        if got != expected:
            return False, {"input": inp, "expected": expected, "got": got}
    return True, None


# ──────────────────────────────────────────────────────────────
# SelfReflector：把「失败详情」翻译成一条人话经验
# 真实世界里也是 LLM：prompt = 代码 + 失败的测试，输出一句反思
# ──────────────────────────────────────────────────────────────
def self_reflector(impl_name: str, failure: dict) -> str:
    inp = failure["input"]
    # 模拟 LLM 看到 "IX 期望 9 但得到 11" 时写下的反思
    if impl_name == "attempt_naive":
        return (
            f"测试 {inp!r} 失败（期望 {failure['expected']}，得到 {failure['got']}）："
            "我只是把每个字符的值相加，忽略了罗马数字的减法规则——"
            "当小的数字出现在大的数字左边时（如 IX、IV、CM），应该做减法而不是加法。"
            "下次写之前先判断 当前值 < 右边值。"
        )
    return f"测试 {inp!r} 仍然失败：期望 {failure['expected']}，得到 {failure['got']}。需要进一步排查。"


# ──────────────────────────────────────────────────────────────
# 主循环：Actor → Evaluator →（失败）SelfReflector → 写入 Memory → 重试
# ──────────────────────────────────────────────────────────────
def run(use_memory: bool, max_trials: int = 4):
    label = "Reflexion（开记忆）" if use_memory else "Baseline（无记忆）"
    print(f"\n{'='*60}\n  {label}\n{'='*60}")
    memory: list[str] = []

    for trial in range(1, max_trials + 1):
        impl_name, fn = actor(memory)
        passed, failure = evaluator(fn)
        print(f"\n[第 {trial} 次尝试] 交出实现：{impl_name}")

        if passed:
            print("  跑测试：5/5 全部通过 ✅  —— 任务完成")
            return trial

        print(f"  跑测试：失败 ❌  {failure['input']!r} 期望 {failure['expected']}，得到 {failure['got']}")

        if not use_memory:
            print("  无记忆：下次还是从同一个 prompt 出发，会再写出一模一样的代码。")
            continue

        reflection = self_reflector(impl_name, failure)
        memory.append(reflection)
        print(f"  自我反思 → 写入记忆：")
        print(f"    “{reflection}”")
        print(f"  （下次写代码前，这条反思会被塞进 prompt）")

    print(f"\n  {max_trials} 次用完仍未通过。")
    return None


if __name__ == "__main__":
    print("任务：实现 roman_to_int(s)，把罗马数字字符串转成整数")
    print("测试集：III=3, LVIII=58, IX=9, IV=4, MCMXCIV=1994")

    b = run(use_memory=False)
    r = run(use_memory=True)

    print(f"\n{'='*60}\n  对比\n{'='*60}")
    print(f"  Baseline（无记忆）：{'卡住，永远写同一版错代码' if b is None else f'{b} 次通过'}")
    print(f"  Reflexion（开记忆）：{'未通过' if r is None else f'{r} 次通过'}")
    print("\n  差别不在模型，在于失败后有没有把『为什么错』写成语言、再喂回去。")
    print("  这就是代码助手的自我纠错：写→测→败→反思→带着反思重写→过。")
