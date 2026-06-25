"""独立的 LangGraph 检查点数据库读取层（供 /api/checkpoints/* 路由用）。

与 playground 的 checkpoint_viewer 模块共享解码思路，但这里返回结构化 JSON
（完整 checkpoint_id、每步消息、完整对话），由前端的独立"数据库"页面自行排版。

安全：只读打开（mode=ro）；只允许 data/ 下的预置库，路径 resolve 后必须
落在 DATA_DIR 内，杜绝目录穿越。
"""
import sqlite3
from pathlib import Path

DATA_DIR = (Path(__file__).resolve().parent / "data").resolve()

# 下拉可选的预置库：key（前端传回） -> 文件名
PRESETS = {
    "demo": "demo_checkpoints.db",
}
PRESET_LABELS = {
    "demo": "课程演示库 (demo_checkpoints.db)",
}


def list_dbs() -> list:
    """列出可用的预置库及其存在状态。"""
    out = []
    for key, fname in PRESETS.items():
        path = (DATA_DIR / fname).resolve()
        out.append({
            "key": key,
            "label": PRESET_LABELS.get(key, fname),
            "filename": fname,
            "exists": path.exists(),
        })
    return out


def _resolve_db(preset_key: str) -> Path:
    fname = PRESETS.get(preset_key)
    if fname is None:
        raise ValueError(f"未知的库：{preset_key}")
    path = (DATA_DIR / fname).resolve()
    # 目录穿越防护
    if DATA_DIR != path.parent and DATA_DIR not in path.parents:
        raise ValueError("非法路径")
    if not path.exists():
        raise FileNotFoundError(f"找不到检查点库：{fname}")
    return path


def _msg_to_dict(m) -> dict:
    """把一条 LangChain 消息压成前端好渲染的字典。"""
    kind = m.__class__.__name__
    role = {
        "HumanMessage": "user",
        "AIMessage": "assistant",
        "ToolMessage": "tool",
        "SystemMessage": "system",
    }.get(kind, kind)

    tcs = getattr(m, "tool_calls", None) or []
    tool_call = None
    if tcs:
        tc = tcs[0]
        tool_call = {"name": tc.get("name"), "args": tc.get("args")}

    content = m.content
    if not isinstance(content, str):
        content = str(content)

    return {
        "kind": kind,
        "role": role,
        "content": content,
        "tool_call": tool_call,
    }


def _decode_messages(serde, ctype, blob):
    try:
        state = serde.loads_typed((ctype, blob))
    except Exception:
        return None
    return state.get("channel_values", {}).get("messages", []) or []


def inspect(preset_key: str, thread_id: str = "") -> dict:
    """读取并解码一个检查点库，返回结构化结果。"""
    db_path = _resolve_db(preset_key)  # 可能抛 ValueError/FileNotFoundError

    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
    serde = JsonPlusSerializer()

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "checkpoints" not in tables:
            raise ValueError(f"不是 LangGraph 检查点库（缺 checkpoints 表，只有 {tables}）")

        # 所有 thread（用于前端下拉）
        all_threads = [r[0] for r in cur.execute(
            "SELECT DISTINCT thread_id FROM checkpoints ORDER BY thread_id").fetchall()]

        sql = "SELECT thread_id, checkpoint_id, type, checkpoint FROM checkpoints"
        params = ()
        if thread_id:
            sql += " WHERE thread_id = ?"
            params = (thread_id,)
        sql += " ORDER BY checkpoint_id"
        rows = cur.execute(sql, params).fetchall()
    finally:
        conn.close()

    steps = []
    for i, (tid, cid, ctype, blob) in enumerate(rows):
        msgs = _decode_messages(serde, ctype, blob)
        if msgs is None:
            decoded = {"error": "解码失败"}
            last = None
            count = None
        else:
            decoded = [_msg_to_dict(m) for m in msgs]
            last = decoded[-1] if decoded else None
            count = len(decoded)
        steps.append({
            "index": i,
            "thread_id": tid,
            "checkpoint_id": cid,         # 完整，不截断
            "message_count": count,
            "last_message": last,
            "messages": decoded,          # 该步累积的全部消息
        })

    # 完整对话 = 最后一步累积的全部消息
    full_conversation = steps[-1]["messages"] if steps else []

    return {
        "ok": True,
        "db_filename": db_path.name,
        "tables": tables,
        "all_threads": all_threads,
        "thread_filter": thread_id,
        "checkpoint_count": len(steps),
        "steps": steps,
        "full_conversation": full_conversation,
    }
