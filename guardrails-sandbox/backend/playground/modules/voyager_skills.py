"""Phase 14 / 10-skill-libraries-voyager —— Voyager 技能库（代码助手场景）

代码助手把跑通的工具函数固化成「技能」存库，下次遇到同类任务检索复用、
而不是从零写。技能 = 可执行代码 + 描述 + 向量索引 + 依赖。
新技能可以调用已有技能（技能调技能 → 拓扑排序执行）。
失败时把环境反馈折进代码、升版重存（迭代式提示）。
纯模拟、不调 LLM、自包含。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# 技能库（name → 描述/标签/依赖/版本）
SKILLS = {
    "read_csv": {"desc": "读取 CSV 文件成行列表", "tags": ["csv", "io", "解析"], "deps": [], "ver": 1},
    "validate_schema": {"desc": "校验数据是否符合预期 schema", "tags": ["校验", "schema"], "deps": [], "ver": 1},
    "retry_wrapper": {"desc": "给函数加重试，处理瞬时失败/空文件", "tags": ["重试", "健壮性"], "deps": [], "ver": 1},
}


def _overlap(a, b):
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb) if (sa | sb) else 0.0


class VoyagerSkills(PlaygroundModule):
    name = "voyager_skills"
    display_name = "Voyager 技能库（代码助手）"
    description = "把跑通的工具函数固化成技能存库，下次检索复用而非从零写。技能调技能(拓扑执行)、失败折进反馈升版（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "10-skill-libraries-voyager"
    order = 100

    input_schema = [
        field_spec("task", "新任务", type="select", default="解析并校验一个 CSV 文件",
                   options=["解析并校验一个 CSV 文件", "解析一个 TSV 文件"],
                   help="第一个任务组合已有技能成高阶技能；第二个展示复用已有技能（终身学习）"),
        field_spec("simulate_fail", "模拟首次执行失败", type="select", default="是（失败→反馈→升版）",
                   options=["是（失败→反馈→升版）", "否（直接成功）"],
                   help="Voyager 迭代式提示：环境反馈折进代码、技能升版"),
    ]

    def run(self, inputs):
        start = time.time()
        task = str(inputs.get("task", "解析并校验一个 CSV 文件"))
        sim_fail = "是" in str(inputs.get("simulate_fail", "是"))

        import copy
        skills = copy.deepcopy(SKILLS)   # 每次运行用副本，避免跨请求状态泄漏

        blocks = [block_keyvalue({
            "三组件": "自动课程(选下一任务) + 技能库(存可执行代码) + 迭代提示(失败折进反馈)",
            "技能 = ": "可执行代码 + 描述 + 向量索引 + 依赖",
            "新任务": task,
        }, label="Voyager 技能库")]

        # 1. 检索：对任务描述做相似度匹配，召回相关技能
        ranked = sorted(skills.items(), key=lambda kv: _overlap(task, kv[1]["desc"] + " " + " ".join(kv[1]["tags"])), reverse=True)
        retr_rows = [[n, s["desc"], f"v{s['ver']}", f"{_overlap(task, s['desc']+' '+' '.join(s['tags'])):.2f}"] for n, s in ranked]
        blocks.append(block_table(["技能", "描述", "版本", "相似度"], retr_rows,
                                  label="1. 检索：对任务嵌入，查 top-k 相似技能（不从零写）"))

        if "CSV" in task:
            # 2. 组合高阶技能：ingest_csv 依赖 read_csv + validate_schema
            new_skill = "ingest_csv"
            deps = ["read_csv", "validate_schema"]
            blocks.append(block_text(
                f"组合新技能 {new_skill}（依赖 {', '.join(deps)}）—— 技能调技能，执行时按依赖拓扑排序。",
                label="2. 组合：用检索到的原语 + 新逻辑拼出高阶技能"))

            if sim_fail:
                # 3. 执行 v1 失败 → 折进反馈 → 升版 v2
                exec_rows = [
                    ["v1", "read_csv → validate_schema", "❌ 空文件时 read_csv 抛异常"],
                ]
                blocks.append(block_table(["版本", "拓扑执行", "结果"], exec_rows,
                                          label="3. 执行 v1：在环境里真跑（跑通才入库）"))
                deps_v2 = ["retry_wrapper", "read_csv", "validate_schema"]
                exec_rows2 = [
                    ["v2", "retry_wrapper(read_csv) → validate_schema", "✓ 空文件被 retry_wrapper 兜住，通过"],
                ]
                blocks.append(block_table(["版本", "拓扑执行", "结果"], exec_rows2,
                                          label="4. 迭代提示：把'空文件崩'反馈折进代码，加 retry_wrapper 依赖 → 升版 v2"))
                skills[new_skill] = {"desc": "读取并校验 CSV（带重试）", "tags": ["csv", "校验", "io"], "deps": deps_v2, "ver": 2}
                summary = f"组合 {new_skill}：v1 失败→折进反馈→v2 通过，已入库（终身学习）"
                blocks.append(block_keyvalue({
                    f"{new_skill} 入库": "v2（v1 进 history，可追溯）",
                    "依赖（拓扑序）": " → ".join(deps_v2),
                    "技能库大小": f"{len(skills)} 个",
                }, label="入库：成功才存，技能库随时间增长"))
            else:
                skills[new_skill] = {"desc": "读取并校验 CSV", "tags": ["csv", "校验", "io"], "deps": deps, "ver": 1}
                summary = f"组合 {new_skill} 直接通过，已入库"
        else:
            # TSV 任务：复用 validate_schema，只新增分隔符逻辑（体现零重复）
            blocks.append(block_text(
                "解析 TSV 时直接检索复用已有的 validate_schema 技能，只新增分隔符逻辑——"
                "而不是从零重写校验。这就是终身学习：能力随技能库累积，零重复造轮子。",
                label="2. 复用：检索命中 validate_schema，组合新技能 ingest_tsv"))
            skills["ingest_tsv"] = {"desc": "读取并校验 TSV", "tags": ["tsv", "校验"], "deps": ["validate_schema"], "ver": 1}
            summary = "组合 ingest_tsv：复用 validate_schema，只加分隔符逻辑（零重复）"

        blocks.append(block_list([
            "技能 vs 记忆：技能是『可执行代码』(怎么做)，记忆是『事实』(是什么)——记忆让 agent 记得，技能让 agent 会做",
            "动作空间 = 代码（发函数而非原始命令），才能表达时间扩展、可组合的行为",
            "验证：跑通才入库（环境验证 = 带验证器的 Self-Refine/CRITIC，呼应第5课）",
            "vs Reflexion(03)：那存的是经验文本(自然语言反思)，技能库存的是跑通的代码，可直接调用",
            "坑：技能库腐烂(同技能换描述存十遍→写入去重)、组合漂移(父依赖被改→技能版本固定)、检索退化(库过几百→加标签过滤)",
        ], label="要点"))

        return ModuleResult(ok=True, summary=summary, blocks=blocks, latency_ms=(time.time()-start)*1000)
