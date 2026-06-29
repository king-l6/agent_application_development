"""Phase 14 / 07-memory-virtual-context-memgpt —— MemGPT 虚拟上下文（代码助手场景）

代码助手处理超长重构会话：上下文窗口塞不下时，把最旧的文件片段换出到
"磁盘"（外部归档），需要时再 archival_search 换入。类比 OS 虚拟内存：
  main context = RAM（提示词窗口，固定大小，始终可见）
  external     = 磁盘（向量存储，无界，可搜索）
  记忆工具调用 = 缺页中断
纯模拟、不调 LLM、自包含。
"""
import time

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)


# 外部归档（"磁盘"）：每条带来源引用 citation
ARCHIVE = [
    {"text": "auth 模块改动：login() 加了 token 判空兜底", "cite": "auth.py:42", "tags": ["auth", "bug"]},
    {"text": "项目用 pytest + ruff，禁用 print 调试", "cite": "CONTRIBUTING.md:8", "tags": ["约定"]},
    {"text": "早期决策：用户表加索引 idx_email 提升登录查询", "cite": "db/schema.sql:15", "tags": ["db", "auth"]},
]


def _search(query):
    """external → main 的换入：按 tag/词重叠粗排（模拟向量检索）。"""
    q = set(query)
    ranked = sorted(ARCHIVE, key=lambda r: len(q & set(r["text"] + "".join(r["tags"]))), reverse=True)
    return ranked[0] if ranked else None


class MemgptVirtualContext(PlaygroundModule):
    name = "memgpt_virtual_context"
    display_name = "MemGPT 虚拟上下文（代码助手）"
    description = "超长重构会话：上下文塞不下→旧文件片段换出『磁盘』，需要时 archival_search 换入。类比 OS 虚拟内存（不调 LLM）"
    phase = "14-agent-engineering"
    lesson = "07-memory-virtual-context-memgpt"
    order = 70

    input_schema = [
        field_spec("max_slots", "主上下文容量（能放几段）", type="number", default=3,
                   help="模拟提示词窗口大小，超了就把最旧的换出到磁盘"),
        field_spec("query", "用户提问（触发换入）", type="select",
                   default="上次 auth 模块怎么改的",
                   options=["上次 auth 模块怎么改的", "项目用什么测试工具", "登录查询怎么优化的"],
                   help="从外部归档检索相关记忆换入主上下文"),
    ]

    def run(self, inputs):
        start = time.time()
        try:
            cap = int(inputs.get("max_slots", 3) or 3)
        except (TypeError, ValueError):
            cap = 3
        cap = max(2, min(cap, 5))
        query = str(inputs.get("query", "上次 auth 模块怎么改的"))

        # 模拟会话：连续打开新文件，灌入主上下文，超容量就换出
        opens = ["persona: 代码助手", "打开 main.py", "打开 utils.py", "打开 views.py", "打开 models.py"]
        main_ctx, evicted, trace = [], [], []
        for item in opens:
            main_ctx.append(item)
            if len(main_ctx) > cap:
                out = main_ctx.pop(0)
                evicted.append(out)
                trace.append([f"放入 {item}", f"超容量 → 换出最旧：{out}", f"主区 {len(main_ctx)}/{cap}"])
            else:
                trace.append([f"放入 {item}", "未超容量", f"主区 {len(main_ctx)}/{cap}"])

        # 换入：检索归档回答 query
        hit = _search(query)

        blocks = [
            block_keyvalue({
                "类比": "main=RAM(窗口) / external=磁盘(归档) / 记忆工具=缺页中断",
                "主上下文容量": f"{cap} 段",
                "用户提问": query,
            }, label="场景：超长重构会话"),
            block_table(["动作", "换页", "主区占用"], trace,
                        label="page-out：主上下文超容量时，最旧的被驱逐到磁盘"),
            block_keyvalue({
                "主上下文（RAM，可见）": " | ".join(main_ctx),
                "已换出（磁盘）": " | ".join(evicted) or "（无）",
            }, label="当前分层状态"),
        ]

        if hit:
            blocks.append(block_text(
                f"archival_memory_search({query!r}) → 命中：\n"
                f"  内容：{hit['text']}\n  来源：{hit['cite']}（归档时存了 citation，回答可溯源）",
                label="page-in：检索外部归档，换入主上下文回答"))
        blocks.append(block_list([
            "self-editing memory：Agent 用 function call 主动改自己的记忆（core_memory_append/replace、archival_insert/search）",
            "vs 简单 RAG：RAG 只读检索；MemGPT 可读可写、把记忆当 OS 分页主动管理",
            "坑：记忆腐烂（写快于读，过时事实淹没检索→定期整合）、记忆投毒（恶意文本被存成记忆）、引用丢失（归档写入存 citation 才能溯源）",
            "递进：08 Letta 扩成三层+睡眠时整合；09 Mem0 混合存储+冲突检测。核心模式都是 MemGPT",
        ], label="要点"))

        return ModuleResult(ok=True, summary=f"换出 {len(evicted)} 段到磁盘，检索换入回答『{query}』", blocks=blocks, latency_ms=(time.time()-start)*1000)
