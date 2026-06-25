"""Minimal LangGraph ReAct agent with a checkpointer, an interrupt, and time-travel.

Runs with an Anthropic API key (`ANTHROPIC_API_KEY`). The agent has two toy
tools (calculator, web_lookup). It:

1. Builds a four-node StateGraph (agent -> tools -> agent) with `add_messages`
   as the reducer for the message list.
2. Compiles with a `MemorySaver` checkpointer and an `interrupt_before` on the
   `tools` node so we pause before any side effect.
3. Runs a two-turn conversation, streaming update events.
4. Pauses before the first tool call, inspects the pending tool_calls, then
   resumes with `Command(resume=True)`.
5. Prints the checkpoint history and demonstrates time-travel by forking from
   an earlier checkpoint.

Install:
    pip install "langgraph>=0.2.50" "langchain-anthropic>=0.3.0"

Run:
    python main.py
"""

from __future__ import annotations

import os

# 关键：本机 shell 里有另一套网关配置（ANTHROPIC_BASE_URL=ai-b23d.bilibili.co，
# 只支持 deepseek、不支持 claude），ChatAnthropic 会自动读取它导致连错网关 401/400。
# 在导入 langchain 之前清掉这些变量，强制使用下面 build_app() 里显式指定的可用网关。
for _k in ("ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"):
    os.environ.pop(_k, None)

from typing import Annotated, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AnyMessage, HumanMessage
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.types import Command


# State ----------------------------------------------------------------------


class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


# Tools ----------------------------------------------------------------------


@tool
def calculator(expression: str) -> str:
    """Evaluate a Python arithmetic expression like '2 + 2 * 3'. Returns the
    result as a string."""
    allowed = set("0123456789+-*/(). ")
    if not set(expression) <= allowed:
        return "ERROR: only digits and + - * / ( ) are allowed"
    try:
        return str(eval(expression, {"__builtins__": {}}, {}))
    except Exception as exc:
        return f"ERROR: {exc!r}"


@tool
def web_lookup(query: str) -> str:
    """Fake web search. Returns canned facts for known queries and 'unknown'
    otherwise. Stand-in for a real retrieval tool."""
    facts = {
        "anthropic headquarters": "Anthropic is headquartered in San Francisco, California.",
        "python release year": "Python was first released in 1991.",
    }
    return facts.get(query.strip().lower(), "unknown")


TOOLS = [calculator, web_lookup]


# Graph ----------------------------------------------------------------------


def build_app() -> tuple:
    """Wire the four-node ReAct graph and return (compiled_app, llm_with_tools)."""
    # 锁定可用网关：llmapi.bilibili.co + personal- key（已验证 claude-opus-4-8 工具调用可用）。
    # 不读任何环境变量，因为本机 shell 的 ANTHROPIC_* 指向另一个不支持 claude 的网关。
    api_key = "personal-6d9fb60eca3d0ca7951af4e2d2f85229"
    base_url = "http://llmapi.bilibili.co"
    llm = ChatAnthropic(
        model="claude-opus-4-8",
        temperature=0,
        api_key=api_key,
        base_url=base_url,
    ).bind_tools(TOOLS)

    def agent_node(state: State) -> dict:
        response = llm.invoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state: State) -> str:
        last = state["messages"][-1]
        return "tools" if getattr(last, "tool_calls", None) else END

    tool_node = ToolNode(TOOLS)

    graph = StateGraph(State)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    app = graph.compile(
        checkpointer=MemorySaver(),
        interrupt_before=["tools"],
    )
    return app, llm


# Driver ---------------------------------------------------------------------


# 节点名 → 中文标签
NODE_LABEL = {"agent": "🤖 模型思考", "tools": "🔧 执行工具", "__start__": "▶ 开始"}
# 消息类型 → 中文标签
MSG_LABEL = {
    "HumanMessage": "👤 用户",
    "AIMessage": "🤖 模型",
    "ToolMessage": "🔧 工具结果",
}


def line(char="─", n=60):
    print(char * n)


def title(text):
    print()
    line("═")
    print(f"  {text}")
    line("═")


def show_message(msg: AnyMessage, indent="    "):
    """美观打印一条消息。"""
    kind = MSG_LABEL.get(msg.__class__.__name__, msg.__class__.__name__)
    # content 可能是 str，也可能是 list（含 tool_use/thinking 块）——列表时不直接打印原始结构
    raw = msg.content
    content = raw.strip() if isinstance(raw, str) else ""
    tool_calls = getattr(msg, "tool_calls", None) or []

    if content:
        print(f"{indent}{kind}：{content[:300]}")
    for tc in tool_calls:
        args = "，".join(f"{k}={v!r}" for k, v in tc["args"].items())
        print(f"{indent}{kind} → 想调用工具：{tc['name']}（{args}）")


def stream_turn(app, payload, config, header):
    """跑一轮并美观打印每个节点的更新。"""
    print(f"\n{header}")
    for event in app.stream(payload, config, stream_mode="updates"):
        for node, update in event.items():
            # 中断事件：值是 tuple（Interrupt 对象），不是 dict，单独处理
            if node == "__interrupt__":
                print("  ┌─ ⏸ 触发中断（执行在进入工具节点前暂停）")
                print("  └─")
                continue
            if not isinstance(update, dict):
                continue
            print(f"  ┌─ 节点 {NODE_LABEL.get(node, node)}")
            for m in update.get("messages", []):
                show_message(m, indent="  │   ")
            print("  └─")


def run() -> None:
    app, _llm = build_app()
    config = {"configurable": {"thread_id": "demo-42"}}

    # ── 第一幕：人工审批中断 ──────────────────────────────────
    # 用算术题，模型必须调 calculator，从而触发 interrupt_before=["tools"]。
    title("第一幕：ReAct 循环 + 人工审批中断")
    print("  问题：请计算 (17 * 23 + 100) 等于多少？")

    user = HumanMessage("请用 calculator 工具计算 (17 * 23 + 100) 等于多少？只能用工具，不要心算。")
    stream_turn(app, {"messages": [user]}, config, "▶ 启动图，模型开始思考……")

    # 此刻已停在 interrupt_before=["tools"]：工具还没执行
    pending = app.get_state(config)
    print("\n  ⏸  执行已暂停（interrupt_before=['tools']）")
    print("     工具尚未运行，等待人工审批。待批准的工具调用：")
    found_tool = False
    for m in pending.values["messages"][-1:]:
        for tc in getattr(m, "tool_calls", []) or []:
            found_tool = True
            args = "，".join(f"{k}={v!r}" for k, v in tc["args"].items())
            print(f"       • {tc['name']}（{args}）")
    if not found_tool:
        print("       （模型这次没调工具，直接回答了）")

    # 人工批准 → 恢复执行
    if found_tool:
        print("\n  ✅ 人工批准 → Command(resume=True) 恢复执行")
        stream_turn(app, Command(resume=True), config, "▶ 工具执行 + 模型给出最终答案……")

    # ── 第二幕：检查点历史 ────────────────────────────────────
    title("第二幕：检查点历史（每一步都自动存档）")
    history = list(app.get_state_history(config))
    print(f"  共 {len(history)} 个检查点快照（从新到旧）：\n")
    for i, snap in enumerate(history):
        last = snap.values["messages"][-1] if snap.values.get("messages") else None
        tag = MSG_LABEL.get(last.__class__.__name__, "—") if last else "—"
        nxt = "（结束）" if not snap.next else " → ".join(snap.next)
        print(f"   #{i}  最后消息：{tag:<10}  下一步：{nxt}")
    print("\n  💡 用相同 thread_id 再次调用即可从任意检查点恢复——这就是检查点的价值。")

    # ── 第三幕：时光回溯 ──────────────────────────────────────
    title("第三幕：时光回溯（回到起点，改问另一个问题）")
    if len(history) >= 1:
        earliest = history[-1].config
        print("  从最早的检查点分叉，改问：100 / 4 等于多少？\n")
        fork = {"messages": [HumanMessage("请用 calculator 工具计算 100 / 4 等于多少？")]}
        stream_turn(app, fork, earliest, "▶ 从历史检查点重新跑一条新分支……")
        # 这条分支同样会停在工具中断处，批准放行
        pend2 = app.get_state(earliest)
        if pend2.next and "tools" in pend2.next:
            print("\n  ✅ 同样停在工具中断处 → 批准放行")
            stream_turn(app, Command(resume=True), earliest, "▶ 执行工具 + 给出答案……")
        print("\n  💡 同一张图、同一份历史，从旧检查点叉出全新执行——调试和回归测试全靠它。")

    title("演示结束 · 你刚刚见证了 LangGraph 的四大超能力")
    print("  ① 检查点  ② 中断（人工审批）  ③ 流式输出  ④ 时光回溯")
    print()


if __name__ == "__main__":
    run()
