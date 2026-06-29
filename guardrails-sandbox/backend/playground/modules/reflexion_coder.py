"""Phase 14 / 03-reflexion-verbal-rl —— Reflexion 自我反思（代码助手场景）

让代码助手写一个函数 → 跑测试 → 失败 → 用「人话」写反思 → 把反思塞回
prompt 重试 → 通过。对比「无记忆」（永远写同一版错代码，卡死）和
「开记忆」（反思一次就纠对）。纯模拟、不调 LLM、自包含。

核心对照（docs/zh.md）：
  - Actor          = 写代码的 LLM（根据 prompt + 历史反思产出实现）
  - Evaluator      = 跑测试的 pytest / CI（pass/fail + 失败详情）
  - SelfReflector  = 失败后让 LLM 用人话总结「为什么错」（不是改分数，是写经验）
  - EpisodicMemory = 把反思攒起来，下次写代码前塞回 prompt
  - 关键：模型参数一个字没变，变的只是 prompt 里多了几条「上次踩的坑」
    —— 这就是 verbal reinforcement learning，用语言强化而非梯度。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# ── 任务：实现 roman_to_int（罗马数字转整数），代码助手每天都在干的活 ──
_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}

_TESTS = [
    ("III", 3),
    ("LVIII", 58),
    ("IX", 9),          # 减法：I 在 X 左边 = 9
    ("IV", 4),          # 减法：I 在 V 左边 = 4
    ("MCMXCIV", 1994),  # 多处减法：CM=900, XC=90, IV=4
]


def _attempt_naive(s: str) -> int:
    """第 1 版：天真地把每个字符的值加起来，没考虑减法规则。"""
    return sum(_VALUES[c] for c in s)


def _attempt_with_subtraction(s: str) -> int:
    """第 2 版：处理减法——当前值小于右边值就减去它。"""
    total = 0
    for i, c in enumerate(s):
        if i + 1 < len(s) and _VALUES[c] < _VALUES[s[i + 1]]:
            total -= _VALUES[c]
        else:
            total += _VALUES[c]
    return total


def _actor(memory):
    """Actor：根据记忆里有没有「减法」教训，决定交出哪一版实现。
    真实世界这一步是 LLM：prompt = 任务 + 历史反思，输出一段代码。"""
    if any("减法" in r for r in memory):
        return "attempt_with_subtraction", _attempt_with_subtraction
    return "attempt_naive", _attempt_naive


def _evaluator(fn):
    """Evaluator：跑测试，返回 (通过?, 第一个失败详情)。"""
    for inp, expected in _TESTS:
        try:
            got = fn(inp)
        except Exception as e:
            return False, {"input": inp, "expected": expected, "got": f"异常 {e}"}
        if got != expected:
            return False, {"input": inp, "expected": expected, "got": got}
    return True, None


def _self_reflector(impl_name, failure):
    """SelfReflector：把失败详情翻译成一条人话经验。"""
    inp = failure["input"]
    if impl_name == "attempt_naive":
        return (
            f"测试 {inp!r} 失败（期望 {failure['expected']}，得到 {failure['got']}）："
            "我只是把每个字符的值相加，忽略了罗马数字的减法规则——"
            "当小的数字出现在大的数字左边时（如 IX、IV、CM），应做减法而不是加法。"
            "下次写之前先判断 当前值 < 右边值。"
        )
    return f"测试 {inp!r} 仍失败：期望 {failure['expected']}，得到 {failure['got']}。需进一步排查。"


class ReflexionCoder(PlaygroundModule):
    name = "reflexion_coder"
    display_name = "Reflexion 自我反思（代码助手）"
    description = "写函数→跑测试→失败→写反思→带反思重试→通过。对比无记忆（卡死）vs 开记忆（反思一次就纠对），看 verbal RL（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "03-reflexion-verbal-rl"
    order = 30

    input_schema = [
        field_spec("use_memory", "情景记忆", type="select", default="开（Reflexion）",
                   options=["开（Reflexion）", "关（Baseline）"],
                   help="关=Baseline：失败信息丢弃，每次从同一 prompt 出发，写出同一版错代码"),
        field_spec("max_trials", "最大尝试次数", type="number", default=4,
                   help="用完仍未通过就停（1-10）"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()

        use_memory = "关" not in str(inputs.get("use_memory", "开"))
        try:
            max_trials = int(inputs.get("max_trials", 4) or 4)
        except (TypeError, ValueError):
            max_trials = 4
        max_trials = max(1, min(max_trials, 10))

        memory = []          # EpisodicMemory
        trial_rows = []      # 每次尝试一行
        reflections = []     # 写入记忆的反思（展示用）
        passed_at = None

        for trial in range(1, max_trials + 1):
            impl_name, fn = _actor(memory)
            ok, failure = _evaluator(fn)

            mem_note = f"记忆里 {len(memory)} 条反思" if use_memory else "无记忆"
            if ok:
                trial_rows.append([trial, impl_name, "5/5 通过 ✓", mem_note])
                passed_at = trial
                break

            fail_str = f"{failure['input']!r} 期望 {failure['expected']}，得 {failure['got']}"
            trial_rows.append([trial, impl_name, f"失败：{fail_str}", mem_note])

            if use_memory:
                reflection = _self_reflector(impl_name, failure)
                memory.append(reflection)
                reflections.append(f"第 {trial} 次后：{reflection}")

        # 任务/结果摘要
        if passed_at:
            result_line = f"第 {passed_at} 次尝试通过 ✓"
        else:
            result_line = f"{max_trials} 次用完仍未通过"

        blocks = [
            block_keyvalue({
                "任务": "实现 roman_to_int(s)：罗马数字转整数",
                "测试集": "III=3, LVIII=58, IX=9, IV=4, MCMXCIV=1994",
                "记忆开关": "开（Reflexion）" if use_memory else "关（Baseline）",
                "结果": result_line,
            }, label="任务"),
            block_table(
                headers=["尝试", "Actor 交出的实现", "Evaluator 跑测试", "记忆状态"],
                rows=trial_rows,
                label="主循环：Actor 写 → Evaluator 测 →（失败）SelfReflector 反思 → 写入 Memory → 重试",
            ),
        ]

        if use_memory:
            if reflections:
                blocks.append(block_list(
                    reflections,
                    label="SelfReflector 写进 EpisodicMemory 的反思（下次塞回 prompt）",
                ))
            blocks.append(block_text(
                "模型参数一个字没改。变的只是 prompt 里多了一条『上次踩的坑』。"
                "这就是 verbal（语言的）reinforcement learning——用人话纠偏，不用梯度重训。"
                "这跟 fine-tuning 的本质区别：反思是即时的、可读的、不用重新训练。",
                label="为什么这是『学习』",
            ))
        else:
            blocks.append(block_text(
                "无记忆时 LLM 是纯函数：同样的 prompt 永远给同样的输出。失败信息丢进垃圾桶，"
                "下次还从零想，又写出同一版傻代码 → 死循环。把记忆打开再跑一次对比。",
                label="为什么卡死",
            ))

        blocks.append(block_list([
            "Actor=写代码的 LLM；Evaluator=pytest/CI；SelfReflector=总结为啥错的 LLM；Memory=攒下的经验",
            "反思要具体可执行（『IX 这类要做减法』），不能是空话（『下次小心点』）",
            "记忆会膨胀：生产里要做衰减/TTL/按相关性召回，不能无脑全塞",
            "Evaluator 必须可靠：评分器有噪声时，反思可能学歪 → 反而更糟",
        ], label="要点"))

        return ModuleResult(
            ok=True,
            summary=f"{'Reflexion 开记忆' if use_memory else 'Baseline 无记忆'} —— {result_line}",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
