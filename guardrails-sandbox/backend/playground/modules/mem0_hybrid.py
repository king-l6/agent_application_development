"""Phase 14 / 09-hybrid-memory-mem0 —— Mem0 混合记忆（代码助手场景）

代码助手记住开发者上下文，用三路混合存储：
  - 向量：语义相似（"我喜欢怎么写测试" → 召回偏好）
  - KV：精确事实查找（语言、CI 工具）
  - 图：关系推理（哪些 repo 依赖某个库）
检索时融合评分 = w_rel·相关性 + w_imp·重要性 + w_rec·时效性。
开发者改了偏好时，冲突检测把旧边软删除(valid=False)而非物理删除，支持时间查询。
纯模拟、不调 LLM、自包含。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)

# 融合权重（对齐课程 main.py）
W_REL, W_IMP, W_REC = 0.6, 0.2, 0.2


def _overlap(a, b):
    """token 重叠相似度，当嵌入替身。"""
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb) if (sa | sb) else 0.0


class Mem0Hybrid(PlaygroundModule):
    name = "mem0_hybrid"
    display_name = "Mem0 混合记忆（代码助手）"
    description = "记开发者上下文：向量(语义)+KV(精确事实)+图(关系) 三路存储，融合评分检索。改偏好时冲突检测软删除旧边（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "09-hybrid-memory-mem0"
    order = 90

    input_schema = [
        field_spec("query", "检索查询", type="select", default="我平时喜欢怎么写测试",
                   options=["我平时喜欢怎么写测试", "这个项目用什么语言和 CI", "哪些 repo 依赖 serde 库"],
                   help="三类查询分别考验向量/KV/图三路存储"),
        field_spec("flip_pref", "模拟改偏好（触发冲突失效）", type="select", default="改：tabs → spaces",
                   options=["改：tabs → spaces", "不改"],
                   help="改偏好时图里旧边 valid=False 软删除，支持时间查询"),
    ]

    def run(self, inputs):
        start = time.time()
        query = str(inputs.get("query", "我平时喜欢怎么写测试"))
        flip = str(inputs.get("flip_pref", "改")).startswith("改")

        # 向量库：语义记忆（带 importance）
        vector = [
            {"text": "喜欢用 pytest 写单元测试", "imp": 0.7, "rec": 0.9},
            {"text": "注释写得简洁，避免啰嗦", "imp": 0.4, "rec": 0.6},
            {"text": "缩进偏好：用 tabs", "imp": 0.5, "rec": 0.3},
        ]
        # KV 库：精确事实
        kv = {
            ("project", "language"): "Rust",
            ("project", "ci"): "GitHub Actions",
            ("project", "indent"): "tabs",
        }
        # 图库：关系（subject, relation, obj, valid）
        graph = [
            ["api-repo", "depends_on", "serde", True],
            ["web-repo", "depends_on", "serde", True],
            ["cli-repo", "depends_on", "clap", True],
            ["dev:ava", "owns", "api-repo", True],
        ]

        log = []
        if flip:
            # 冲突检测：缩进偏好 tabs → spaces，软删除旧事实
            for v in vector:
                if "tabs" in v["text"]:
                    v["valid"] = False
            vector.append({"text": "缩进偏好：改用 spaces", "imp": 0.5, "rec": 1.0})
            # 图里也加一条 indent 边演示软删除
            graph.append(["dev:ava", "prefers_indent", "tabs", False])   # 旧，已失效
            graph.append(["dev:ava", "prefers_indent", "spaces", True])  # 新
            kv[("project", "indent")] = "spaces"
            log.append("冲突检测：偏好 tabs→spaces，旧事实 valid=False 软删除（非物理删除，可时间查询）")

        # 路由：根据 query 决定哪一路为主，但都做融合评分
        now = 1.0
        blocks = [block_keyvalue({
            "三路存储": "向量(语义) + KV(精确事实) + 图(关系)",
            "融合公式": f"score = {W_REL}·相关性 + {W_IMP}·重要性 + {W_REC}·时效性",
            "检索查询": query,
        }, label="Mem0 混合记忆")]

        if "测试" in query or "怎么写" in query:
            # 向量路为主：融合评分
            rows = []
            scored = []
            for v in vector:
                valid = v.get("valid", True)
                rel = _overlap(query, v["text"])
                score = W_REL * rel + W_IMP * v["imp"] + W_REC * v["rec"]
                scored.append((score, v, valid))
            scored.sort(key=lambda x: x[0], reverse=True)
            for score, v, valid in scored:
                rows.append([v["text"], f"{score:.3f}", "VALID" if valid else "INVALID（旧）"])
            blocks.append(block_table(["语义记忆", "融合分", "状态"], rows,
                                      label="向量路召回 + 融合评分排序（语义相似最擅长）"))
        elif "语言" in query or "CI" in query:
            rows = [[f"{k[0]}.{k[1]}", val] for k, val in kv.items()]
            blocks.append(block_table(["KV 键", "值"], rows,
                                      label="KV 路精确查找（O(1)，事实型查询最擅长）"))
        else:  # 关系查询
            rows = [[e[0], e[1], e[2], "VALID" if e[3] else "INVALID（旧）"] for e in graph if e[1] == "depends_on" and e[2] == "serde"]
            blocks.append(block_table(["主体", "关系", "客体", "状态"], rows,
                                      label="图路关系推理（'哪些 repo 依赖 serde' 这类最擅长）"))

        if log:
            blocks.append(block_list(log, label="冲突检测 / 软删除"))
            # 展示时间查询：valid_only=False 能看到历史
            hist = [[e[0], e[1], e[2], "VALID" if e[3] else "INVALID"] for e in graph if e[1] == "prefers_indent"]
            if hist:
                blocks.append(block_table(["主体", "关系", "客体", "状态"], hist,
                                          label="时间查询：软删除让历史可追溯（旧值标 INVALID 不删）"))

        blocks.append(block_list([
            "向量擅长语义相似、KV 擅长精确事实、图擅长关系推理——单一存储对另两类查询必然无能为力",
            "融合评分是加权求和(非层级)：聊天重时效、合规重重要性、检索重相关性，权重按产品调",
            "冲突失效=软删除(valid=False)：支持'三月时住哪'这类时间查询，绝不物理删除",
            "vs MemGPT(07)/记忆块(08)：那俩解决'上下文放不下'(换页/块编辑)，Mem0 解决'多类查询用一套接口'",
            "坑：冲突检测靠 subject+relation 精确匹配，提取器噪声会让图爆炸；嵌入漂移需定期重嵌",
        ], label="要点"))

        return ModuleResult(ok=True, summary=f"查询『{query}』{'（已模拟改偏好+软删除）' if flip else ''}", blocks=blocks, latency_ms=(time.time()-start)*1000)
