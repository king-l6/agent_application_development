"""把 demo_checkpoints.db 摊开看：每一步检查点里到底存了什么对话内容。

用法：
    python view_db.py
"""
import sqlite3
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

DB = "demo_checkpoints.db"

conn = sqlite3.connect(DB)
cur = conn.cursor()
serde = JsonPlusSerializer()

print("=" * 64)
print(f"  打开数据库文件：{DB}")
print("=" * 64)

# 1) 有哪些表
tables = [r[0] for r in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"\n表：{tables}\n")

# 2) 把 checkpoints 表每一行的 state 解出来
rows = cur.execute(
    "SELECT thread_id, checkpoint_id, type, checkpoint "
    "FROM checkpoints ORDER BY checkpoint_id"
).fetchall()

print(f"checkpoints 表共 {len(rows)} 行 —— 每行 = 对话的一步存档：\n")
for i, (tid, cid, ctype, blob) in enumerate(rows):
    print(f"┌─ 第 {i} 步  thread={tid}")
    print(f"│  checkpoint_id = {cid}")
    try:
        state = serde.loads_typed((ctype, blob))
        msgs = state.get("channel_values", {}).get("messages", [])
        if not msgs:
            print("│  （还没有消息，这是起点）")
        for m in msgs:
            kind = m.__class__.__name__
            content = m.content if isinstance(m.content, str) else str(m.content)[:90]
            tcs = getattr(m, "tool_calls", None) or []
            tc = f"  →调用 {tcs[0]['name']}({tcs[0]['args']})" if tcs else ""
            print(f"│    [{kind}] {content}{tc}")
    except Exception as e:
        print(f"│  (解码失败: {e})")
    print("└─")

conn.close()
print("\n💡 这些就是落库的'每一步'。生产环境换成 Postgres，按 thread_id 一查")
print("   就是某个用户的完整轨迹。")
