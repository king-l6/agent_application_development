"""演示：把 LangGraph 的检查点存进真实的 SQLite 文件，证明"每一步都落库"。

用法（分两次跑，中间程序完全退出，内存清空）：
    RUN=1 python sqlite_checkpoint_demo.py   # 跑 agent，把检查点写进 demo_checkpoints.db
    RUN=2 python sqlite_checkpoint_demo.py   # 重启后只读 .db 文件，把存的每一步查出来

第 2 次能读到第 1 次的状态 —— 这就是"存数据库"和"存内存"的区别。
"""
from __future__ import annotations

import os
import sqlite3
import sqlite3 as _sq

# 走 B 站内部网关（与课程 main.py 同一套清理逻辑）
for _k in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"):
    os.environ.pop(_k, None)

from typing import Annotated, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AnyMessage, HumanMessage
from langchain_core.tools import tool
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

DB_PATH = "demo_checkpoints.db"
THREAD_ID = "user-demo-7"


class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


@tool
def calculator(expression: str) -> str:
    """计算一个算术表达式，如 '2 + 2 * 3'。"""
    allowed = set("0123456789+-*/(). ")
    if not set(expression) <= allowed:
        return "ERROR: 只允许数字和 + - * / ( )"
    try:
        return str(eval(expression, {"__builtins__": {}}, {}))
    except Exception as exc:
        return f"ERROR: {exc!r}"


TOOLS = [calculator]


def build_app(checkpointer):
    api_key = os.environ.get("LLM_API_KEY") or "personal-6d9fb60eca3d0ca7951af4e2d2f85229"
    base_url = os.environ.get("LLM_BASE_URL") or "http://llmapi.bilibili.co"
    llm = ChatAnthropic(model="claude-opus-4-8", temperature=0,
                        api_key=api_key, base_url=base_url).bind_tools(TOOLS)

    def agent_node(state: State) -> dict:
        return {"messages": [llm.invoke(state["messages"])]}

    def should_continue(state: State) -> str:
        last = state["messages"][-1]
        return "tools" if getattr(last, "tool_calls", None) else END

    g = StateGraph(State)
    g.add_node("agent", agent_node)
    g.add_node("tools", ToolNode(TOOLS))
    g.set_entry_point("agent")
    g.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    g.add_edge("tools", "agent")
    return g.compile(checkpointer=checkpointer)


def run1():
    print("=" * 60)
    print("  第 1 次运行：跑 agent，把每一步检查点写进 SQLite 文件")
    print("=" * 60)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"  （清掉旧的 {DB_PATH}，从零开始）\n")

    # SqliteSaver 用一个真实的 .db 文件
    with SqliteSaver.from_conn_string(DB_PATH) as saver:
        app = build_app(saver)
        config = {"configurable": {"thread_id": THREAD_ID}}
        for event in app.stream(
            {"messages": [HumanMessage("请计算 (17 * 23 + 100)")]},
            config, stream_mode="updates",
        ):
            for node, update in event.items():
                msgs = update.get("messages", []) if isinstance(update, dict) else []
                for m in msgs:
                    tc = getattr(m, "tool_calls", None) or []
                    extra = f" -> {tc[0]['name']}({tc[0]['args']})" if tc else ""
                    content = m.content if isinstance(m.content, str) else str(m.content)[:80]
                    print(f"  <<{node}>> {content}{extra}")

    print(f"\n  ✅ 程序即将退出，内存清空。但检查点已经躺在 {DB_PATH} 里了。")
    print("     现在跑：RUN=2 python sqlite_checkpoint_demo.py")


def run2():
    print("=" * 60)
    print("  第 2 次运行：程序是全新进程，内存里啥都没有")
    print("  只打开 .db 文件，看 LangGraph 当时存了什么")
    print("=" * 60)
    if not os.path.exists(DB_PATH):
        print(f"  ❌ 找不到 {DB_PATH}，请先跑 RUN=1")
        return

    # ① 用 LangGraph 的 API 读回历史 —— 证明状态能跨重启恢复
    print("\n【A】用 LangGraph API 读回检查点历史（跨进程恢复）：")
    with SqliteSaver.from_conn_string(DB_PATH) as saver:
        app = build_app(saver)
        config = {"configurable": {"thread_id": THREAD_ID}}
        history = list(app.get_state_history(config))
        print(f"     共 {len(history)} 个检查点（从新到旧）：")
        for i, snap in enumerate(history):
            msgs = snap.values.get("messages", [])
            last = msgs[-1].__class__.__name__ if msgs else "—"
            print(f"       #{i}  最后消息：{last:<14} 下一步：{snap.next or '（结束）'}")

    # ② 直接用裸 SQL 看底层表 —— 证明这就是数据库里的行，不是日志
    print("\n【B】直接用裸 SQL 查这个 .db 文件，看真实落库的表和行：")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print(f"     文件里的表：{tables}")
    for t in tables:
        n = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"       表 {t}: {n} 行")
    # checkpoints 表的关键列
    if "checkpoints" in tables:
        print("\n     checkpoints 表里每一行（一行 = 一个存档的步骤）：")
        cols = [d[1] for d in cur.execute("PRAGMA table_info(checkpoints)").fetchall()]
        print(f"       列：{cols}")
        rows = cur.execute(
            "SELECT thread_id, checkpoint_id FROM checkpoints ORDER BY checkpoint_id"
        ).fetchall()
        for tid, cid in rows:
            print(f"       thread={tid}  checkpoint_id={cid}")
    conn.close()
    print("\n  💡 这些行就是'每一步'。生产环境把 SQLite 换成 Postgres，")
    print("     就成了能查每个用户每一步的线上数据库。")


if __name__ == "__main__":
    which = os.environ.get("RUN", "1")
    (run1 if which == "1" else run2)()
