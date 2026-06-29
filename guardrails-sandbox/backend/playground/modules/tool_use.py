"""Phase 14 / 06-tool-use-and-function-calling —— 工具调用（代码助手场景）

代码助手注册 read_file / grep / run_tests 三个工具，模型产出结构化 JSON
调用，运行时校验参数 → 执行 → 把结果（含错误）作为 observation 回灌。
核心：校验/执行失败都返回结构化错误字符串，绝不向循环抛异常。
纯模拟、不调 LLM、自包含。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# 工具目录（喂给模型的 schema）
CATALOG = {
    "read_file": {"desc": "读取一个文件的内容。何时用：需要看某个文件源码时",
                  "required": ["path"], "props": {"path": "string"}},
    "grep": {"desc": "在代码库里按正则搜索。何时用：找符号定义/调用点时",
             "required": ["pattern"], "props": {"pattern": "string", "path": "string"}},
    "run_tests": {"desc": "跑测试。何时用：改完代码要验证时",
                  "required": [], "props": {"target": "string"}},
}

# 假文件系统 / 假测试结果
_FS = {"src/math.py": "def add(a,b):\n    return a+b", "src/auth.py": "def login(req):\n    return req['token']"}


def _execute(name, args):
    if name == "read_file":
        return _FS.get(args["path"], f"error: 文件不存在 {args['path']}")
    if name == "grep":
        hits = [f"{p}: {c.splitlines()[0]}" for p, c in _FS.items() if args["pattern"] in c]
        return "；".join(hits) if hits else "（无匹配）"
    if name == "run_tests":
        return "测试 12 passed ✓"
    return f"error: 未知工具 {name}"


def _validate(name, args):
    """校验：未知工具 / 缺必填 / 类型——失败返回错误字符串，不抛异常。"""
    spec = CATALOG.get(name)
    if spec is None:
        return f"error: 幻觉调用了不存在的工具 {name!r}"
    for r in spec["required"]:
        if r not in args:
            return f"error: 缺必填参数 {r!r}"
    return None


# 模型一轮产出的结构化调用（含一个并行回合 + 三个故意埋的坑）
PRESET_CALLS = [
    ("u01", "grep", {"pattern": "def login"}),          # 正常
    ("u02", "read_file", {"path": "src/auth.py"}),      # 正常（与 u01 并行）
    ("u03", "read_file", {}),                            # 坑：缺必填 path
    ("u04", "lint", {"path": "src/auth.py"}),           # 坑：幻觉调不存在的工具
    ("u05", "run_tests", {"target": "tests/"}),         # 正常
]


class ToolUse(PlaygroundModule):
    name = "tool_use"
    display_name = "工具调用 / Function Calling（代码助手）"
    description = "注册 read_file/grep/run_tests，模型产出 JSON 调用→校验→执行→回灌。含并行调用+缺参/幻觉工具三种错误，全部转结构化 observation（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "06-tool-use-and-function-calling"
    order = 60

    input_schema = [
        field_spec("show_catalog", "显示工具目录", type="select", default="显示",
                   options=["显示", "隐藏"], help="工具目录每轮都进 context，工具越多越贵"),
    ]

    def run(self, inputs):
        start = time.time()
        show_cat = "显示" in str(inputs.get("show_catalog", "显示"))

        blocks = [block_keyvalue({
            "场景": "代码助手『修复测试失败』，一轮发 5 个工具调用",
            "工具数": len(CATALOG),
            "埋的坑": "u03 缺必填参数、u04 幻觉调不存在工具",
        }, label="任务")]

        if show_cat:
            cat_rows = [[n, s["desc"], "、".join(s["required"]) or "（无）"] for n, s in CATALOG.items()]
            blocks.append(block_table(["工具", "描述（写清何时用）", "必填参数"], cat_rows,
                                      label="工具目录（喂给模型的 schema，描述质量决定选不选对）"))

        # 校验 + 执行 + 回灌
        rows = []
        for uid, name, args in PRESET_CALLS:
            err = _validate(name, args)
            if err:
                rows.append([uid, f"{name}({args})", "拒绝", err])
            else:
                obs = _execute(name, args)
                rows.append([uid, f"{name}({args})", "执行 ✓", f"→ {obs}"])
        blocks.append(block_table(["tool_use_id", "调用", "结果", "observation"], rows,
                                  label="校验 → 执行 → 回灌（id 关联结果，错误也转字符串不崩）"))

        blocks.append(block_text(
            "u01+u02 是并行回合（互不依赖，各带独立 tool_use_id，按 id 配回结果）。"
            "u03 缺 path、u04 调不存在的 lint —— 都返回结构化错误而非抛异常崩溃。"
            "模型读到 error observation 后能改道重试，这就是 ReAct『报错也是观察』在工具层的落地。",
            label="关键"))

        blocks.append(block_list([
            "工具声明三要素：name / description（写清『何时用』）/ input_schema（JSON Schema）",
            "永不信任工具调用：类型强转(无歧义才转)、enum、必填、格式都要校验",
            "幻觉调不存在的工具 → 返回描述性错误，不崩溃",
            "并行 vs 串行：只有互相独立才并行，tool_use_id 不能错配",
            "vs ReAct(01)：工具调用就是 Action 这步，本课把它工程化（结构化产出+校验+回灌）",
            "本质=带校验 schema 的结构化输出；工具目录每轮进 context，越多越贵",
        ], label="要点"))

        return ModuleResult(ok=True, summary=f"5 个调用：3 个执行成功 + 2 个错误转 observation（缺参/幻觉工具）", blocks=blocks, latency_ms=(time.time()-start)*1000)
