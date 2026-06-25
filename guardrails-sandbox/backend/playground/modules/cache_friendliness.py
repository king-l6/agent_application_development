"""Phase 11 / 15-prompt-caching —— 缓存友好度分析

贴入一段系统提示/前缀，本地分析它对前缀缓存是否友好：
  - 检测会破坏前缀匹配的动态内容（时间戳、会话 ID、随机值）
  - 估算 token 是否达到最小可缓存块
  - 给出盈亏平衡表与缓存友好布局建议
复用 guardrails 的 prompt_cache_planner adapter 逻辑，本地运行，不调 LLM。
"""
import re
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_score, block_keyvalue, block_table, block_list,
)

from adapters.prompt_cache_planner import (
    DYNAMIC_PATTERNS, CACHE_FRIENDLY_LAYOUT, breakeven_table,
)


class CacheFriendliness(PlaygroundModule):
    name = "cache_friendliness"
    display_name = "缓存友好度分析"
    description = "分析一段前缀对前缀缓存是否友好，检测破坏命中的翻车点（本地，不调 LLM）"
    phase = "11-llm-engineering"
    lesson = "15-prompt-caching"
    order = 150

    input_schema = [
        field_spec("text", "系统提示 / 前缀", type="textarea",
                   placeholder="把你打算缓存的系统提示贴进来，例如一大段角色设定 + 工具定义"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        text = (inputs.get("text") or "").strip()
        if not text:
            return ModuleResult(ok=False, error="请贴入一段系统提示或前缀")

        # 检测破坏前缀缓存的动态内容
        breakers = []
        for pattern, label in DYNAMIC_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                breakers.append(label)

        token_est = max(1, len(text) // 4)
        meets_min = token_est >= 1024

        # 友好度打分：满足最小块 0.5，无破坏点 0.5
        score = (0.5 if meets_min else token_est / 1024 * 0.5)
        score += (0.5 if not breakers else 0.0)
        score = round(min(score, 1.0), 2)

        if breakers:
            verdict = f"发现 {len(breakers)} 个会破坏前缀缓存的动态内容"
        elif not meets_min:
            verdict = f"约 {token_est} token，低于 1024 最小可缓存量，不会被缓存"
        else:
            verdict = "前缀稳定且足够长，适合缓存"

        be_rows = [
            [str(r["复用读取次数"]), str(r["平均成本倍数"]), r["节省"]]
            for r in breakeven_table()
        ]

        return ModuleResult(
            ok=True,
            summary=f"缓存友好度 {score:.0%} —— {verdict}",
            blocks=[
                block_score(score, "缓存友好度", max_value=1.0, hint=verdict),
                block_keyvalue({
                    "估算 token": token_est,
                    "满足最小块(1024)": "是" if meets_min else "否",
                    "检测到的破坏点": "、".join(breakers) if breakers else "无",
                }, label="分析结果"),
                block_table(
                    headers=["复用读取次数", "平均成本倍数", "节省"],
                    rows=be_rows,
                    label="盈亏平衡(Anthropic 25% 写入溢价)",
                ),
                block_list(
                    [f"{sec} — {note}" for sec, note in CACHE_FRIENDLY_LAYOUT],
                    label="缓存友好布局（稳定的放顶部，可变的放底部）",
                    ordered=True,
                ),
            ],
            latency_ms=(time.time() - start) * 1000,
        )
