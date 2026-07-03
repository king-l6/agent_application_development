# test_graph.py — graph.py 单元测试
# 覆盖 StateGraph 核心功能、三种拓扑辅助函数、30 节点上限校验

import sys
import os
import unittest

# 确保测试能找到上层模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from state import END, START, State, Update, PausedAtNode
from graph import (
    StateGraph,
    build_support_graph,
    build_swarm_graph,
    build_supervisor_graph,
    build_hierarchical_graph,
    classify,
    handle_refund,
    handle_bug,
    handle_sales,
    send,
    human_gate,
    classify_router,
)


# ---------------------------------------------------------------------------
# 辅助工具
# ---------------------------------------------------------------------------

def _make_state(**overrides) -> State:
    """构造默认初始状态，可用 overrides 覆盖任意字段。"""
    base: State = {
        "messages": [],
        "ticket_type": "",
        "form_data": {},
        "approved": False,
        "response": "",
        "retry_count": 0,
    }
    base.update(overrides)
    return base


def _noop(state: State) -> Update:
    return {}


def _append_tag(tag: str):
    """返回一个把 tag 追加到 messages 的节点函数，用于追踪执行顺序。"""
    def fn(state: State) -> Update:
        return {
            "messages": state["messages"] + [{"role": "system", "content": tag}]
        }
    return fn


# ---------------------------------------------------------------------------
# StateGraph 基础测试
# ---------------------------------------------------------------------------

class TestStateGraphBasics(unittest.TestCase):

    def test_add_node_and_get(self):
        g = StateGraph()
        g.add_node("a", _noop)
        self.assertIn("a", g.nodes)
        self.assertIs(g.get_node_fn("a"), _noop)

    def test_add_duplicate_node_raises(self):
        g = StateGraph()
        g.add_node("a", _noop)
        with self.assertRaises(ValueError):
            g.add_node("a", _noop)

    def test_reserved_sentinel_as_node_raises(self):
        g = StateGraph()
        with self.assertRaises(ValueError):
            g.add_node(START, _noop)
        with self.assertRaises(ValueError):
            g.add_node(END, _noop)

    def test_set_entry(self):
        g = StateGraph()
        g.add_node("a", _noop)
        g.set_entry("a")
        self.assertEqual(g._entry, "a")
        self.assertEqual(g._edges[START], "a")

    def test_set_entry_unregistered_raises(self):
        g = StateGraph()
        with self.assertRaises(ValueError):
            g.set_entry("nonexistent")

    def test_add_edge(self):
        g = StateGraph()
        g.add_node("a", _noop)
        g.add_node("b", _noop)
        g.add_edge("a", "b")
        self.assertEqual(g._edges["a"], "b")

    def test_add_edge_unregistered_src_raises(self):
        g = StateGraph()
        g.add_node("b", _noop)
        with self.assertRaises(ValueError):
            g.add_edge("a", "b")

    def test_add_edge_unregistered_dst_raises(self):
        g = StateGraph()
        g.add_node("a", _noop)
        with self.assertRaises(ValueError):
            g.add_edge("a", "b")

    def test_next_node_fixed_edge(self):
        g = StateGraph()
        g.add_node("a", _noop)
        g.add_node("b", _noop)
        g.add_edge("a", "b")
        self.assertEqual(g.next_node("a", _make_state()), "b")

    def test_next_node_no_edge_returns_end(self):
        g = StateGraph()
        g.add_node("a", _noop)
        self.assertEqual(g.next_node("a", _make_state()), END)

    def test_next_node_conditional_edge(self):
        g = StateGraph()
        g.add_node("a", _noop)
        g.add_node("b", _noop)
        g.add_node("c", _noop)
        g.add_conditional_edges("a", lambda s: "go_b", {"go_b": "b", "go_c": "c"})
        self.assertEqual(g.next_node("a", _make_state()), "b")

    def test_conditional_edge_bad_router_raises(self):
        g = StateGraph()
        g.add_node("a", _noop)
        g.add_node("b", _noop)
        g.add_conditional_edges("a", lambda s: "unknown", {"known": "b"})
        with self.assertRaises(ValueError):
            g.next_node("a", _make_state())

    def test_get_node_fn_unregistered_raises(self):
        g = StateGraph()
        with self.assertRaises(KeyError):
            g.get_node_fn("missing")


# ---------------------------------------------------------------------------
# 30 节点上限校验
# ---------------------------------------------------------------------------

class TestNodeLimit(unittest.TestCase):

    def test_30_nodes_allowed(self):
        """恰好 30 个节点应当被允许（不超过上限）。"""
        g = StateGraph()
        for i in range(30):
            g.add_node(f"n{i}", _noop)
        self.assertEqual(len(g.nodes), 30)

    def test_31_nodes_raises(self):
        """第 31 个节点应当抛出 ValueError。"""
        g = StateGraph()
        for i in range(30):
            g.add_node(f"n{i}", _noop)
        with self.assertRaises(ValueError) as ctx:
            g.add_node("overflow", _noop)
        self.assertIn("30", str(ctx.exception))
        self.assertIn("嵌套子图", str(ctx.exception))


# ---------------------------------------------------------------------------
# build_support_graph 测试
# ---------------------------------------------------------------------------

class TestSupportGraph(unittest.TestCase):

    def test_graph_builds(self):
        g = build_support_graph()
        expected_nodes = {"classify", "handle_refund", "handle_bug",
                          "handle_sales", "human_gate", "send"}
        self.assertEqual(set(g.nodes), expected_nodes)

    def test_classify_refund(self):
        state = _make_state(messages=[{"role": "user", "content": "我想退款"}])
        update = classify(state)
        self.assertEqual(update["ticket_type"], "refund")

    def test_classify_bug(self):
        state = _make_state(messages=[{"role": "user", "content": "发现了一个bug"}])
        update = classify(state)
        self.assertEqual(update["ticket_type"], "bug")

    def test_classify_sales(self):
        state = _make_state(messages=[{"role": "user", "content": "我想了解产品"}])
        update = classify(state)
        self.assertEqual(update["ticket_type"], "sales")

    def test_classify_router(self):
        self.assertEqual(classify_router({"ticket_type": "refund"}), "refund")
        self.assertEqual(classify_router({"ticket_type": "bug"}), "bug")
        self.assertEqual(classify_router({}), "sales")

    def test_human_gate_paused_when_not_approved(self):
        state = _make_state(approved=False)
        with self.assertRaises(PausedAtNode):
            human_gate(state)

    def test_human_gate_passes_when_approved(self):
        state = _make_state(approved=True)
        update = human_gate(state)
        self.assertEqual(update, {})

    def test_send_generates_response(self):
        state = _make_state(
            ticket_type="refund",
            form_data={"amount": 99.0},
        )
        update = send(state)
        self.assertIn("99.00", update["response"])

    def test_support_graph_next_node_from_classify(self):
        g = build_support_graph()
        state = _make_state(ticket_type="refund")
        self.assertEqual(g.next_node("classify", state), "handle_refund")


# ---------------------------------------------------------------------------
# build_swarm_graph 测试
# ---------------------------------------------------------------------------

class TestSwarmGraph(unittest.TestCase):

    def test_swarm_builds_without_error(self):
        """验证 dict(agents.keys()) bug 已修复。"""
        agents = {
            "agent_a": _append_tag("A"),
            "agent_b": _append_tag("B"),
        }
        def router(state):
            return END
        g = build_swarm_graph(agents, router)
        self.assertEqual(set(g.nodes), {"agent_a", "agent_b"})

    def test_swarm_entry_is_first_agent(self):
        agents = {
            "first": _noop,
            "second": _noop,
        }
        g = build_swarm_graph(agents, lambda s: END)
        self.assertEqual(g._entry, "first")

    def test_swarm_conditional_edges_map_correctly(self):
        """验证条件边的 path_map 正确映射（dict bug 修复验证）。"""
        agents = {
            "alpha": _noop,
            "beta": _noop,
            "gamma": _noop,
        }
        def router(state):
            return "beta"
        g = build_swarm_graph(agents, router)
        # alpha 的条件边应能路由到 beta
        result = g.next_node("alpha", _make_state())
        self.assertEqual(result, "beta")

    def test_swarm_router_returning_end(self):
        agents = {
            "only": _noop,
        }
        g = build_swarm_graph(agents, lambda s: END)
        result = g.next_node("only", _make_state())
        self.assertEqual(result, END)


# ---------------------------------------------------------------------------
# build_supervisor_graph 测试
# ---------------------------------------------------------------------------

class TestSupervisorGraph(unittest.TestCase):

    def _make_worker_subgraph(self, tag: str) -> StateGraph:
        """构建一个简单子图：step1 → step2 → END，每个节点追加 tag 消息。"""
        sub = StateGraph()
        sub.add_node(f"{tag}_step1", _append_tag(f"{tag}_s1"))
        sub.add_node(f"{tag}_step2", _append_tag(f"{tag}_s2"))
        sub.set_entry(f"{tag}_step1")
        sub.add_edge(f"{tag}_step1", f"{tag}_step2")
        sub.add_edge(f"{tag}_step2", END)
        return sub

    def test_supervisor_builds_without_error(self):
        workers = {
            "team_a": self._make_worker_subgraph("a"),
            "team_b": self._make_worker_subgraph("b"),
        }
        g = build_supervisor_graph(lambda s: "team_a", workers)
        self.assertEqual(set(g.nodes), {"team_a", "team_b"})

    def test_supervisor_proxy_runs_full_subgraph(self):
        """验证 proxy 执行完整子图，不仅仅是入口节点。"""
        workers = {
            "team_a": self._make_worker_subgraph("a"),
        }
        g = build_supervisor_graph(lambda s: "team_a", workers)
        proxy_fn = g.get_node_fn("team_a")
        state = _make_state()
        update = proxy_fn(state)
        # proxy 应执行 step1 和 step2，消息中应包含两条 tag
        msgs = update.get("messages", [])
        contents = [m["content"] for m in msgs]
        self.assertIn("a_s1", contents)
        self.assertIn("a_s2", contents)

    def test_supervisor_no_entry_raises(self):
        sub = StateGraph()
        sub.add_node("lonely", _noop)
        # 不设置入口
        with self.assertRaises(ValueError):
            build_supervisor_graph(lambda s: "w", {"w": sub})


# ---------------------------------------------------------------------------
# build_hierarchical_graph 测试
# ---------------------------------------------------------------------------

class TestHierarchicalGraph(unittest.TestCase):

    def test_single_layer(self):
        layers = [{"a": _noop, "b": _noop}]
        g = build_hierarchical_graph(layers)
        self.assertEqual(set(g.nodes), {"a", "b"})

    def test_multi_layer_chain(self):
        layers = [
            {"l0_a": _append_tag("l0_a"), "l0_b": _append_tag("l0_b")},
            {"l1_a": _append_tag("l1_a")},
        ]
        g = build_hierarchical_graph(layers)
        # 第一层排序后: l0_a → l0_b，第二层: l1_a
        # l0_b → l1_a（跨层边）
        self.assertEqual(g.next_node("l0_a", _make_state()), "l0_b")
        self.assertEqual(g.next_node("l0_b", _make_state()), "l1_a")
        self.assertEqual(g.next_node("l1_a", _make_state()), END)

    def test_entry_is_first_sorted_node(self):
        layers = [{"z_node": _noop, "a_node": _noop}]
        g = build_hierarchical_graph(layers)
        self.assertEqual(g._entry, "a_node")


if __name__ == "__main__":
    unittest.main()
