"""Phase 11 / 16-langgraph-state-machines —— LangGraph 检查点查看器

读取一个真实的 LangGraph SQLite 检查点库（SqliteSaver 写的 .db），把每一步
二进制 state 解码成人能读的对话轨迹。相当于一个本地、离线的迷你 LangSmith。

与同课的 langgraph_simulator 互补：
  - simulator：输入任务，模拟图会怎么跑（不读真实数据）
  - 本模块：读真实落库的检查点，解码展示每一步存了什么

安全：只读打开；只允许 data/ 预置库，路径经 resolve 后必须落在本模块的
DATA_DIR 内，杜绝目录穿越读到系统文件。
"""
import sqlite3
import time
from pathlib import Path

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec,
    block_keyvalue, block_table, block_list, block_text,
)

# 预置演示库目录（与本文件同级的 ../data）
DATA_DIR = (Path(__file__).resolve().parent.parent / "data").resolve()

# 下拉可选的预置库：显示名 -> 文件名
PRESETS = {
    "课程演示库 (demo_checkpoints.db)": "demo_checkpoints.db",
}


def _decode_messages(serde, ctype, blob):
    """把一行 checkpoint 的二进制 state 解码成消息列表。失败返回 None。"""
    try:
        state = serde.loads_typed((ctype, blob))
    except Exception:
        return None
    return state.get("channel_values", {}).get("messages", []) or []


def _msg_brief(m):
    """把一条消息压成 (类型, 摘要) 两段。"""
    kind = m.__class__.__name__
    label = {
        "HumanMessage": "👤 用户",
        "AIMessage": "🤖 模型",
        "ToolMessage": "🔧 工具",
        "SystemMessage": "⚙️ 系统",
    }.get(kind, kind)

    tcs = getattr(m, "tool_calls", None) or []
    if tcs:
        tc = tcs[0]
        return label, f"想调用 {tc.get('name')}({tc.get('args')})"

    content = m.content
    if not isinstance(content, str):
        content = str(content)
    content = content.strip().replace("\n", " ")
    if len(content) > 80:
        content = content[:80] + "…"
    return label, content or "（空）"


class CheckpointViewer(PlaygroundModule):
    name = "checkpoint_viewer"
    display_name = "检查点查看器（解码数据库）"
    description = "读取真实 LangGraph SQLite 检查点库，把二进制 state 解码成可读的每一步对话轨迹（本地离线的迷你 LangSmith）"
    phase = "11-llm-engineering"
    lesson = "16-langgraph-state-machines"
    order = 161

    input_schema = [
        field_spec("preset", "选择检查点库", type="select",
                   default=list(PRESETS.keys())[0],
                   options=list(PRESETS.keys()),
                   help="预置的演示库，由本课 SqliteSaver 真实写入"),
        field_spec("thread_id", "限定会话 thread_id（可选）", type="text",
                   placeholder="留空看全部，例如 user-demo-7",
                   help="一个 thread_id = 一段对话/一个用户会话"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()

        # 1. 解析并校验预置库路径（只读 + 限定目录）
        preset_key = (inputs.get("preset") or "").strip()
        filename = PRESETS.get(preset_key)
        if filename is None:
            return ModuleResult(ok=False, error=f"未知的库：{preset_key}")

        db_path = (DATA_DIR / filename).resolve()
        # 目录穿越防护：解析后必须仍在 DATA_DIR 内
        if DATA_DIR not in db_path.parents and db_path.parent != DATA_DIR:
            return ModuleResult(ok=False, error="非法路径")
        if not db_path.exists():
            return ModuleResult(ok=False, error=f"找不到检查点库：{filename}（请先跑课程代码生成）")

        thread_filter = (inputs.get("thread_id") or "").strip()

        # 2. 只读打开 SQLite（URI 模式 mode=ro）
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        except Exception as e:
            return ModuleResult(ok=False, error=f"无法打开数据库：{e}")

        try:
            from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
            serde = JsonPlusSerializer()
        except Exception as e:
            conn.close()
            return ModuleResult(ok=False, error=f"缺少 langgraph 序列化器：{e}")

        try:
            cur = conn.cursor()
            tables = [r[0] for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            if "checkpoints" not in tables:
                return ModuleResult(
                    ok=False,
                    error=f"这不是 LangGraph 检查点库（没有 checkpoints 表，只有 {tables}）",
                )

            sql = ("SELECT thread_id, checkpoint_id, type, checkpoint "
                   "FROM checkpoints")
            params = ()
            if thread_filter:
                sql += " WHERE thread_id = ?"
                params = (thread_filter,)
            sql += " ORDER BY checkpoint_id"
            rows = cur.execute(sql, params).fetchall()
        finally:
            conn.close()

        if not rows:
            hint = f"thread_id = {thread_filter}" if thread_filter else "（全部）"
            return ModuleResult(ok=False, error=f"没有检查点记录：{hint}")

        # 3. 逐行解码，构建展示
        threads = {}
        step_rows = []
        for i, (tid, cid, ctype, blob) in enumerate(rows):
            threads.setdefault(tid, 0)
            threads[tid] += 1
            msgs = _decode_messages(serde, ctype, blob)
            if msgs is None:
                last_label, last_brief = "?", "(解码失败)"
                msg_count = "?"
            elif not msgs:
                last_label, last_brief = "—", "（起点，还没有消息）"
                msg_count = 0
            else:
                last_label, last_brief = _msg_brief(msgs[-1])
                msg_count = len(msgs)
            step_rows.append([
                str(i),
                tid,
                str(msg_count),
                f"{last_label} {last_brief}",
                cid[:8] + "…",
            ])

        # 4. 完整对话回放（取最后一步＝消息最全的那一步）
        full_msgs = _decode_messages(serde, rows[-1][2], rows[-1][3]) or []
        convo_rows = []
        for j, m in enumerate(full_msgs):
            label, brief = _msg_brief(m)
            convo_rows.append([str(j), label, brief])

        blocks = [
            block_keyvalue({
                "数据库文件": str(db_path.name),
                "检查点总数": len(rows),
                "会话数 (thread)": len(threads),
                "thread 列表": "、".join(threads.keys()),
                "存储格式": "SqliteSaver · state 列为 msgpack 二进制（已解码）",
            }, label="概览"),
            block_table(
                headers=["步", "thread_id", "消息数", "最后消息", "checkpoint_id"],
                rows=step_rows,
                label="每一步检查点（一行 = 一次节点转换的存档）",
            ),
            block_table(
                headers=["#", "角色", "内容"],
                rows=convo_rows,
                label="完整对话回放（最后一步里累积的全部消息）",
            ),
            block_list([
                "每一步都把『到此为止的完整对话』存了一份快照——所以能从任意步恢复",
                "checkpoint 列是二进制（msgpack），直接看是乱码，必须用 JsonPlusSerializer 解码",
                "thread_id 区分不同会话；生产把 SqliteSaver 换成 PostgresSaver 就是线上库",
                "这就是 LangSmith 的本质：解码检查点 + 可视化，只不过它跑在云端",
            ], label="读懂检查点", ordered=True),
            block_text(
                "本模块只读打开数据库（mode=ro），且只允许 data/ 下的预置库——"
                "看真实数据安全，不会误改也不会读到项目外的文件。",
                label="🔒 安全说明",
            ),
        ]

        return ModuleResult(
            ok=True,
            summary=f"解码 {len(rows)} 个检查点 · {len(threads)} 个会话 · 完整对话 {len(full_msgs)} 条消息",
            blocks=blocks,
            latency_ms=(time.time() - start) * 1000,
        )
