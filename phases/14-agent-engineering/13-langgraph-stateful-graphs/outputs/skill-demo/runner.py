# runner.py — 有状态图的执行引擎
# 来源: phases/14-agent-engineering/13-langgraph-stateful-graphs/outputs/skill-demo
# Runner 负责遍历图、序列化检查点、处理暂停/恢复
# 仅使用 Python stdlib，不依赖 langgraph/langchain 等外部库

from __future__ import annotations

import copy
import uuid

from checkpointer import Checkpointer, SQLiteCheckpointer
from graph import StateGraph, build_support_graph
from state import END, START, PausedAtNode, State


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

class Runner:
    """有状态图执行引擎。

    职责：
    1. 从入口节点开始遍历图，依次执行节点函数。
    2. 每个节点执行后自动调用 checkpointer.save() 持久化完整状态。
    3. 捕获 PausedAtNode 异常，保存检查点后暂停执行。
    4. 支持 resume() 从最近检查点恢复，可携带 state_override。
    """

    def __init__(self, graph: StateGraph, checkpointer: Checkpointer) -> None:
        self._graph = graph
        self._cp = checkpointer

    # -- 核心执行循环 ------------------------------------------------------

    def _execute_from(
        self, start_node: str, state: State, session_id: str
    ) -> dict:
        """从 start_node 开始执行图，返回执行结果。

        返回值:
            {"status": "completed" | "paused",
             "state": State,
             "node": str (暂停时的节点名)}
        """
        current = start_node

        while current != END:
            node_fn = self._graph.get_node_fn(current)

            try:
                update = node_fn(state)
            except PausedAtNode as exc:
                # 节点请求暂停：保存当前状态（未修改）作为检查点
                self._cp.save(session_id, current, state)
                return {
                    "status": "paused",
                    "state": state,
                    "node": exc.node,
                    "reason": exc.reason,
                }

            # 合并更新进状态
            if update:
                state = {**state, **update}

            # 节点执行成功：保存检查点
            self._cp.save(session_id, current, state)

            # 决定下一个节点
            current = self._graph.next_node(current, state)

        return {"status": "completed", "state": state}

    # -- 公开 API ----------------------------------------------------------

    def run(self, state: State, session_id: str | None = None) -> dict:
        """从头执行图。

        Args:
            state: 初始状态。
            session_id: 会话 ID，不提供则自动生成。

        Returns:
            执行结果字典，status 为 "completed" 或 "paused"。
        """
        if session_id is None:
            session_id = uuid.uuid4().hex[:12]

        # 查找入口：优先固定边，其次条件边
        entry = self._graph._edges.get(START)
        if entry is None and START in self._graph._cond_edges:
            # 条件边入口：用当前 state 路由到实际节点
            router_fn, path_map = self._graph._cond_edges[START]
            initial = copy.deepcopy(dict(state))
            key = router_fn(initial)
            if key not in path_map:
                raise RuntimeError(
                    f"入口路由器返回 '{key}'，但 path_map 中只有 {list(path_map.keys())}"
                )
            entry = path_map[key]
        if entry is None:
            raise RuntimeError("图未设置入口节点，请调用 set_entry()")

        # 深拷贝初始状态避免外部修改
        initial = copy.deepcopy(dict(state))
        return self._execute_from(entry, initial, session_id)

    def resume(
        self, session_id: str, state_override: dict | None = None
    ) -> dict:
        """从最近的检查点恢复执行。

        Args:
            session_id: 会话 ID。
            state_override: 恢复时注入的人工决策（如 {"approved": True}）。

        Returns:
            执行结果字典。
        """
        latest = self._cp.load_latest(session_id)
        if latest is None:
            raise RuntimeError(f"会话 '{session_id}' 无检查点记录")

        paused_node = latest["node"]
        state = latest["state"]

        # 注入人工决策
        if state_override:
            state = {**state, **state_override}

        return self._execute_from(paused_node, state, session_id)


# ---------------------------------------------------------------------------
# 演示入口
# ---------------------------------------------------------------------------

def _print_separator(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def _print_messages(state: dict) -> None:
    for msg in state.get("messages", []):
        role = msg.get("role", "?")
        content = msg.get("content", "")
        print(f"  [{role:>9}] {content}")


def main() -> None:
    """演示完整流程：首次运行暂停 → 查看检查点 → 人工批准恢复 → 完成。"""

    # 1. 构建图 + 检查点
    graph = build_support_graph()
    cp = SQLiteCheckpointer(":memory:")
    runner = Runner(graph, cp)

    session = "ticket-001"

    # 2. 初始状态：用户提交了一条退款请求
    initial_state: State = {
        "messages": [
            {"role": "user", "content": "我想退款，订单号 ORD-20260701，金额 99 元"}
        ],
        "ticket_type": "",
        "form_data": {},
        "approved": False,
        "response": "",
        "retry_count": 0,
    }

    # 3. 第一次运行 → 应该在 human_gate 暂停
    _print_separator("第一次运行（预期在 human_gate 暂停）")
    result = runner.run(initial_state, session_id=session)
    print(f"  状态: {result['status']}")
    print(f"  暂停节点: {result.get('node', '-')}")
    print(f"  暂停原因: {result.get('reason', '-')}")
    print(f"  工单类型: {result['state'].get('ticket_type', '-')}")
    print(f"  表单数据: {result['state'].get('form_data', {})}")
    print("\n  消息历史:")
    _print_messages(result["state"])

    # 4. 查看检查点历史
    _print_separator("检查点历史")
    hist = cp.history(session)
    for cp_item in hist:
        print(f"  #{cp_item['id']} 节点={cp_item['node']:<16} 时间={cp_item['created_at']}")
    print(f"\n  共 {len(hist)} 条检查点记录")

    # 5. 人工批准后恢复执行
    _print_separator("人工批准 → 恢复执行")
    result2 = runner.resume(session, state_override={"approved": True})
    print(f"  状态: {result2['status']}")
    print(f"  最终回复: {result2['state'].get('response', '-')}")

    # 6. 最终状态
    _print_separator("最终消息历史")
    _print_messages(result2["state"])

    _print_separator("完整检查点历史")
    hist2 = cp.history(session)
    for cp_item in hist2:
        print(f"  #{cp_item['id']} 节点={cp_item['node']:<16} 时间={cp_item['created_at']}")
    print(f"\n  共 {len(hist2)} 条检查点记录")
    print("\n✓ 演示完成")

    cp.close()


if __name__ == "__main__":
    main()
