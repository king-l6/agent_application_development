# tests/test_all.py — 客服工单处理系统的完整单元测试
# 来源: phases/14-agent-engineering/13-langgraph-stateful-graphs/outputs/skill-demo
# 使用 unittest 标准库，运行方式: python3 -m unittest discover tests -v
# 仅使用 Python stdlib，不依赖外部测试框架

import os
import sys
import json
import sqlite3
import tempfile
import unittest

# 确保能导入 skill-demo 目录下的模块（它们使用绝对导入）
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from state import State, Update, START, END, PausedAtNode, NodeFn, Router
from graph import (
    StateGraph,
    build_support_graph,
    build_supervisor_graph,
    build_swarm_graph,
    build_hierarchical_graph,
    classify,
    handle_refund,
    human_gate,
    send,
    classify_router,
)
from checkpointer import Checkpointer, InMemoryCheckpointer, SQLiteCheckpointer
from runner import Runner


# ===========================================================================
# State 相关测试
# ===========================================================================

class TestState(unittest.TestCase):
    """State TypedDict 和 PausedAtNode 异常测试。"""

    def test_state_fields(self):
        """State TypedDict 应包含所有预期字段。"""
        annotations = State.__annotations__
        expected = {"messages", "ticket_type", "form_data", "approved", "response", "retry_count"}
        self.assertEqual(set(annotations.keys()), expected)

    def test_state_type_hints(self):
        """State 字段类型提示应正确。"""
        from typing import get_type_hints
        hints = get_type_hints(State)
        self.assertEqual(hints["messages"], list[dict])
        self.assertEqual(hints["ticket_type"], str)
        self.assertEqual(hints["approved"], bool)

    def test_update_fields_optional(self):
        """Update 所有字段应为可选（total=False）。"""
        # total=False 意味着 __total__ 为 False
        self.assertFalse(Update.__total__)

    def test_paused_at_node_basic(self):
        """PausedAtNode 异常应能正确抛出和捕获。"""
        with self.assertRaises(PausedAtNode) as ctx:
            raise PausedAtNode("human_gate", reason="等待审批")
        self.assertEqual(ctx.exception.node, "human_gate")
        self.assertEqual(ctx.exception.reason, "等待审批")
        self.assertIn("human_gate", str(ctx.exception))

    def test_paused_at_node_default_reason(self):
        """PausedAtNode 不提供 reason 时应使用默认空字符串。"""
        exc = PausedAtNode("some_node")
        self.assertEqual(exc.reason, "")
        self.assertEqual(exc.node, "some_node")

    def test_start_end_constants(self):
        """START 和 END 哨兵常量值应正确。"""
        self.assertEqual(START, "__START__")
        self.assertEqual(END, "__END__")


# ===========================================================================
# Graph 相关测试
# ===========================================================================

class TestStateGraph(unittest.TestCase):
    """StateGraph 构建与查询测试。"""

    def _make_simple_graph(self):
        """构建一个简单测试图: A → B → END"""
        g = StateGraph()
        g.add_node("A", lambda s: {"response": "from A"})
        g.add_node("B", lambda s: {"response": "from B"})
        g.set_entry("A")
        g.add_edge("A", "B")
        g.add_edge("B", END)
        return g

    def test_add_node_and_get_fn(self):
        """add_node 注册后可通过 get_node_fn 获取。"""
        g = StateGraph()
        fn = lambda s: {}
        g.add_node("test", fn)
        self.assertIs(g.get_node_fn("test"), fn)

    def test_add_node_duplicate_raises(self):
        """重复注册同名节点应抛出 ValueError。"""
        g = StateGraph()
        g.add_node("A", lambda s: {})
        with self.assertRaises(ValueError) as ctx:
            g.add_node("A", lambda s: {})
        self.assertIn("已存在", str(ctx.exception))

    def test_add_node_reserved_names(self):
        """不能使用 START/END 作为节点名。"""
        g = StateGraph()
        with self.assertRaises(ValueError):
            g.add_node(START, lambda s: {})
        with self.assertRaises(ValueError):
            g.add_node(END, lambda s: {})

    def test_add_edge_fixed(self):
        """固定边应正确存储。"""
        g = self._make_simple_graph()
        self.assertEqual(g._edges["A"], "B")
        self.assertEqual(g._edges["B"], END)

    def test_add_edge_nonexistent_src_raises(self):
        """添加不存在的源节点的边应报错。"""
        g = StateGraph()
        g.add_node("B", lambda s: {})
        with self.assertRaises(ValueError) as ctx:
            g.add_edge("A", "B")
        self.assertIn("未注册", str(ctx.exception))

    def test_add_edge_nonexistent_dst_raises(self):
        """添加不存在的目标节点的边应报错。"""
        g = StateGraph()
        g.add_node("A", lambda s: {})
        with self.assertRaises(ValueError) as ctx:
            g.add_edge("A", "C")
        self.assertIn("未注册", str(ctx.exception))

    def test_add_edge_sentinels_allowed(self):
        """START/END 哨兵应允许作为边的源或目标。"""
        g = StateGraph()
        g.add_node("A", lambda s: {})
        g.add_edge(START, "A")  # START → A
        g.add_edge("A", END)    # A → END
        self.assertEqual(g._edges[START], "A")
        self.assertEqual(g._edges["A"], END)

    def test_add_conditional_edges(self):
        """条件边应正确存储路由函数和路径映射。"""
        g = StateGraph()
        g.add_node("router", lambda s: {})
        g.add_node("left", lambda s: {})
        g.add_node("right", lambda s: {})
        router_fn = lambda s: "left"
        g.add_conditional_edges("router", router_fn, {"left": "left", "right": "right"})
        self.assertIn("router", g._cond_edges)

    def test_add_conditional_edges_nonexistent_target_raises(self):
        """条件边目标节点不存在时应报错。"""
        g = StateGraph()
        g.add_node("router", lambda s: {})
        with self.assertRaises(ValueError) as ctx:
            g.add_conditional_edges("router", lambda s: "x", {"x": "missing"})
        self.assertIn("未注册", str(ctx.exception))

    def test_set_entry(self):
        """set_entry 应设置入口并创建 START 固定边。"""
        g = StateGraph()
        g.add_node("first", lambda s: {})
        g.set_entry("first")
        self.assertEqual(g._entry, "first")
        self.assertEqual(g._edges[START], "first")

    def test_set_entry_nonexistent_raises(self):
        """set_entry 指向不存在的节点应报错。"""
        g = StateGraph()
        with self.assertRaises(ValueError):
            g.set_entry("missing")

    def test_next_node_fixed_edge(self):
        """next_node 对固定边应返回正确目标。"""
        g = self._make_simple_graph()
        state: State = {
            "messages": [], "ticket_type": "", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        self.assertEqual(g.next_node("A", state), "B")
        self.assertEqual(g.next_node("B", state), END)

    def test_next_node_conditional_edge(self):
        """next_node 对条件边应根据 state 返回正确目标。"""
        g = StateGraph()
        g.add_node("classify", lambda s: {})
        g.add_node("refund_handler", lambda s: {})
        g.add_node("bug_handler", lambda s: {})
        g.add_conditional_edges(
            "classify",
            lambda s: s.get("ticket_type", "bug"),
            {"refund": "refund_handler", "bug": "bug_handler"},
        )
        state_refund: State = {
            "messages": [], "ticket_type": "refund", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        state_bug: State = {
            "messages": [], "ticket_type": "bug", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        self.assertEqual(g.next_node("classify", state_refund), "refund_handler")
        self.assertEqual(g.next_node("classify", state_bug), "bug_handler")

    def test_next_node_no_edges_returns_end(self):
        """没有出边的节点，next_node 应返回 END。"""
        g = StateGraph()
        g.add_node("lonely", lambda s: {})
        state: State = {
            "messages": [], "ticket_type": "", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        self.assertEqual(g.next_node("lonely", state), END)

    def test_next_node_conditional_invalid_key_raises(self):
        """条件边路由器返回不在 path_map 中的值应报错。"""
        g = StateGraph()
        g.add_node("router", lambda s: {})
        g.add_node("target", lambda s: {})
        g.add_conditional_edges("router", lambda s: "unknown", {"known": "target"})
        state: State = {
            "messages": [], "ticket_type": "", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        with self.assertRaises(ValueError) as ctx:
            g.next_node("router", state)
        self.assertIn("unknown", str(ctx.exception))

    def test_nodes_property(self):
        """nodes 属性应返回所有已注册节点名。"""
        g = self._make_simple_graph()
        self.assertEqual(sorted(g.nodes), ["A", "B"])

    def test_get_node_fn_missing_raises(self):
        """获取不存在的节点函数应抛出 KeyError。"""
        g = StateGraph()
        with self.assertRaises(KeyError):
            g.get_node_fn("nonexistent")


# ===========================================================================
# Checkpointer 相关测试
# ===========================================================================

class TestInMemoryCheckpointer(unittest.TestCase):
    """InMemoryCheckpointer 测试。"""

    def _make_state(self, **overrides) -> State:
        base: State = {
            "messages": [], "ticket_type": "", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        base.update(overrides)
        return base

    def test_save_and_load_latest(self):
        """save 后 load_latest 应返回正确状态。"""
        cp = InMemoryCheckpointer()
        state = self._make_state(response="hello")
        cp.save("s1", "node_a", state)
        result = cp.load_latest("s1")
        self.assertIsNotNone(result)
        self.assertEqual(result["node"], "node_a")
        self.assertEqual(result["state"]["response"], "hello")

    def test_load_latest_returns_most_recent(self):
        """多次 save 后 load_latest 应返回最后一次。"""
        cp = InMemoryCheckpointer()
        cp.save("s1", "first", self._make_state(response="v1"))
        cp.save("s1", "second", self._make_state(response="v2"))
        result = cp.load_latest("s1")
        self.assertEqual(result["node"], "second")
        self.assertEqual(result["state"]["response"], "v2")

    def test_history_returns_all(self):
        """history 应返回完整历史记录。"""
        cp = InMemoryCheckpointer()
        cp.save("s1", "a", self._make_state())
        cp.save("s1", "b", self._make_state())
        cp.save("s1", "c", self._make_state())
        hist = cp.history("s1")
        self.assertEqual(len(hist), 3)
        self.assertEqual([h["node"] for h in hist], ["a", "b", "c"])

    def test_load_latest_nonexistent_returns_none(self):
        """不存在的 session 应返回 None。"""
        cp = InMemoryCheckpointer()
        self.assertIsNone(cp.load_latest("no-such-session"))

    def test_history_nonexistent_returns_empty(self):
        """不存在的 session 的 history 应返回空列表。"""
        cp = InMemoryCheckpointer()
        self.assertEqual(cp.history("no-such-session"), [])

    def test_save_deep_copy(self):
        """save 应深拷贝状态，后续修改不影响已保存的检查点。"""
        cp = InMemoryCheckpointer()
        state = self._make_state(messages=[{"role": "user", "content": "hi"}])
        cp.save("s1", "node", state)
        state["messages"].append({"role": "assistant", "content": "hello"})
        loaded = cp.load_latest("s1")
        self.assertEqual(len(loaded["state"]["messages"]), 1)


class TestSQLiteCheckpointer(unittest.TestCase):
    """SQLiteCheckpointer 测试。"""

    def _make_state(self, **overrides) -> State:
        base: State = {
            "messages": [], "ticket_type": "", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        base.update(overrides)
        return base

    def test_save_and_load_latest(self):
        """save 后 load_latest 应返回正确状态。"""
        cp = SQLiteCheckpointer(":memory:")
        state = self._make_state(ticket_type="refund")
        cp.save("s1", "classify", state)
        result = cp.load_latest("s1")
        self.assertIsNotNone(result)
        self.assertEqual(result["node"], "classify")
        self.assertEqual(result["state"]["ticket_type"], "refund")
        cp.close()

    def test_history_returns_all(self):
        """history 应返回完整历史记录。"""
        cp = SQLiteCheckpointer(":memory:")
        cp.save("s1", "a", self._make_state())
        cp.save("s1", "b", self._make_state())
        hist = cp.history("s1")
        self.assertEqual(len(hist), 2)
        self.assertEqual(hist[0]["node"], "a")
        self.assertEqual(hist[1]["node"], "b")
        cp.close()

    def test_load_latest_nonexistent_returns_none(self):
        """不存在的 session 应返回 None。"""
        cp = SQLiteCheckpointer(":memory:")
        self.assertIsNone(cp.load_latest("no-such"))
        cp.close()

    def test_persistence_to_file(self):
        """持久化到文件后重新加载应能恢复数据。"""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        try:
            # 写入数据
            cp1 = SQLiteCheckpointer(db_path)
            cp1.save("s1", "node_x", self._make_state(response="persisted"))
            cp1.close()

            # 重新打开并读取
            cp2 = SQLiteCheckpointer(db_path)
            result = cp2.load_latest("s1")
            self.assertIsNotNone(result)
            self.assertEqual(result["node"], "node_x")
            self.assertEqual(result["state"]["response"], "persisted")
            cp2.close()
        finally:
            os.unlink(db_path)

    def test_auto_create_table(self):
        """SQLiteCheckpointer 初始化时应自动创建表。"""
        cp = SQLiteCheckpointer(":memory:")
        # 直接查询表是否存在
        row = cp._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'"
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[0], "checkpoints")
        cp.close()

    def test_json_serialization(self):
        """state 应通过 json.dumps/json.loads 正确序列化。"""
        cp = SQLiteCheckpointer(":memory:")
        state = self._make_state(
            messages=[{"role": "user", "content": "你好"}],
            form_data={"amount": 99.5, "nested": {"key": "val"}},
        )
        cp.save("s1", "test", state)

        # 直接从数据库读取原始 JSON 验证
        row = cp._conn.execute(
            "SELECT state_json FROM checkpoints WHERE session_id = ?", ("s1",)
        ).fetchone()
        parsed = json.loads(row[0])
        self.assertEqual(parsed["messages"][0]["content"], "你好")
        self.assertEqual(parsed["form_data"]["amount"], 99.5)
        cp.close()


# ===========================================================================
# Runner 相关测试
# ===========================================================================

class TestRunner(unittest.TestCase):
    """Runner 执行引擎测试。"""

    def _make_initial_state(self, content: str = "我想退款") -> State:
        return {
            "messages": [{"role": "user", "content": content}],
            "ticket_type": "",
            "form_data": {},
            "approved": False,
            "response": "",
            "retry_count": 0,
        }

    def test_full_flow_no_pause(self):
        """正常流程：approved=True 时从头到 END 完整执行。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("我想退款")
        state["approved"] = True  # 预批准，不会暂停

        result = runner.run(state, session_id="full-001")
        self.assertEqual(result["status"], "completed")
        self.assertIn("response", result["state"])
        self.assertTrue(len(result["state"]["response"]) > 0)
        # 验证工单分类正确
        self.assertEqual(result["state"]["ticket_type"], "refund")

    def test_full_flow_bug(self):
        """Bug 类型工单完整流程。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("发现一个bug，系统崩溃了")
        state["approved"] = True

        result = runner.run(state, session_id="bug-001")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["state"]["ticket_type"], "bug")

    def test_full_flow_sales(self):
        """Sales 类型工单完整流程。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("想了解企业方案")
        state["approved"] = True

        result = runner.run(state, session_id="sales-001")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["state"]["ticket_type"], "sales")

    def test_pause_and_resume(self):
        """暂停恢复：在 human_gate 暂停 → resume 后继续到 END。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("我想退款")
        # 第一次运行 → 应在 human_gate 暂停
        result = runner.run(state, session_id="pause-001")
        self.assertEqual(result["status"], "paused")
        self.assertEqual(result["node"], "human_gate")

        # 恢复执行
        result2 = runner.resume("pause-001", state_override={"approved": True})
        self.assertEqual(result2["status"], "completed")
        self.assertTrue(len(result2["state"]["response"]) > 0)

    def test_resume_state_override(self):
        """resume 时 state_override 应正确注入状态。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("我想退款")
        runner.run(state, session_id="override-001")

        # 用 override 注入 approved=True 和自定义 retry_count
        result = runner.resume(
            "override-001",
            state_override={"approved": True, "retry_count": 5},
        )
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["state"]["retry_count"], 5)

    def test_resume_nonexistent_session_raises(self):
        """不存在的 session resume 应报错。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        with self.assertRaises(RuntimeError) as ctx:
            runner.resume("no-such-session")
        self.assertIn("无检查点记录", str(ctx.exception))

    def test_run_auto_generates_session_id(self):
        """不提供 session_id 时应自动生成。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("我想退款")
        state["approved"] = True
        result = runner.run(state)  # 不传 session_id
        self.assertEqual(result["status"], "completed")

    def test_run_no_entry_raises(self):
        """图未设置入口时 run 应报错。"""
        g = StateGraph()
        g.add_node("lonely", lambda s: {})
        cp = InMemoryCheckpointer()
        runner = Runner(g, cp)

        state = self._make_initial_state()
        with self.assertRaises(RuntimeError) as ctx:
            runner.run(state)
        self.assertIn("入口", str(ctx.exception))

    def test_checkpoint_history_after_full_run(self):
        """完整运行后应有多个检查点记录。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("我想退款")
        state["approved"] = True
        runner.run(state, session_id="hist-001")

        hist = cp.history("hist-001")
        # 至少应有: classify, handle_refund, human_gate, send = 4 个检查点
        self.assertGreaterEqual(len(hist), 4)
        node_names = [h["node"] for h in hist]
        self.assertIn("classify", node_names)
        self.assertIn("send", node_names)

    def test_run_deep_copies_initial_state(self):
        """run 应深拷贝初始状态，外部修改不影响执行。"""
        graph = build_support_graph()
        cp = InMemoryCheckpointer()
        runner = Runner(graph, cp)

        state = self._make_initial_state("我想退款")
        state["approved"] = True
        result = runner.run(state, session_id="copy-001")

        # 修改原始 state 不应影响结果
        state["messages"].append({"role": "user", "content": "extra"})
        # 结果中的 messages 不应包含 extra
        self.assertNotIn(
            "extra",
            [m.get("content", "") for m in result["state"]["messages"]],
        )


# ===========================================================================
# 拓扑辅助函数测试
# ===========================================================================

class TestTopologyHelpers(unittest.TestCase):
    """三种拓扑辅助函数的基本测试。"""

    def test_build_hierarchical_graph(self):
        """层次化图应按层级串联节点。"""
        def step_a(s):
            return {"response": s.get("response", "") + "A"}

        def step_b(s):
            return {"response": s.get("response", "") + "B"}

        def step_c(s):
            return {"response": s.get("response", "") + "C"}

        g = build_hierarchical_graph([
            {"step_a": step_a},
            {"step_b": step_b, "step_c": step_c},
        ])

        self.assertIn("step_a", g.nodes)
        self.assertIn("step_b", g.nodes)
        self.assertIn("step_c", g.nodes)

        # 执行验证
        cp = InMemoryCheckpointer()
        runner = Runner(g, cp)
        state: State = {
            "messages": [], "ticket_type": "", "form_data": {},
            "approved": False, "response": "", "retry_count": 0,
        }
        result = runner.run(state, session_id="hier-001")
        self.assertEqual(result["status"], "completed")
        # step_a → step_b → step_c（同层按字典序），response 应为 "ABC"
        self.assertEqual(result["state"]["response"], "ABC")

    def test_build_support_graph_runs(self):
        """build_support_graph 构建的图应能正常运行。"""
        g = build_support_graph()
        self.assertIn("classify", g.nodes)
        self.assertIn("send", g.nodes)
        self.assertEqual(g._edges[START], "classify")


# ===========================================================================
# 入口
# ===========================================================================

if __name__ == "__main__":
    unittest.main()
