"""Exercise 1: low-confidence classify → END, human sets route, resume.
"""
from __future__ import annotations

import copy
import json
import random
from dataclasses import dataclass, field
from typing import Any, Callable

State = dict[str, Any]
Update = dict[str, Any]
NodeFn = Callable[[State], Update]
Router = Callable[[State], str]

START = "__start__"
END = "__end__"


@dataclass
class Edge:
    src: str
    dst: str
    router: Router | None = None


class StateGraph:
    def __init__(self) -> None:
        self.nodes: dict[str, NodeFn] = {}
        self.edges: dict[str, list[Edge]] = {}
        self.entry: str | None = None

    def add_node(self, name: str, fn: NodeFn) -> None:
        self.nodes[name] = fn

    def set_entry(self, name: str) -> None:
        self.entry = name

    def add_edge(self, src: str, dst: str) -> None:
        self.edges.setdefault(src, []).append(Edge(src=src, dst=dst))

    def add_conditional_edges(self, src: str, router: Router,
                              targets: dict[str, str]) -> None:
        for value, dst in targets.items():
            self.edges.setdefault(src, []).append(
                Edge(src=src, dst=dst, router=_make_router(router, value))
            )

    def _next(self, current: str, state: State) -> str | None:
        for edge in self.edges.get(current, []):
            if edge.router is None or edge.router(state):
                return edge.dst
        return None


def _make_router(router: Router, expected: str) -> Router:
    def fn(state: State) -> bool:
        return router(state) == expected
    return fn


class InMemoryCheckpointer:
    def __init__(self) -> None:
        self._store: dict[str, list[tuple[str, State]]] = {}

    def save(self, session_id: str, step_name: str, state: State) -> None:
        self._store.setdefault(session_id, []).append((step_name, copy.deepcopy(state)))

    def load_latest(self, session_id: str) -> tuple[str, State] | None:
        history = self._store.get(session_id, [])
        if not history:
            return None
        return history[-1]

    def history(self, session_id: str) -> list[tuple[str, State]]:
        return list(self._store.get(session_id, []))


class PausedAtNode(Exception):
    def __init__(self, node: str, state: State) -> None:
        super().__init__(node)
        self.node = node
        self.state = state


class Runner:
    def __init__(self, graph: StateGraph,
                 checkpointer: InMemoryCheckpointer) -> None:
        self.graph = graph
        self.checkpointer = checkpointer

    def run(self, session_id: str, initial_state: State,
            resume_from: str | None = None,
            state_override: State | None = None) -> State:
        if state_override is not None:
            state = copy.deepcopy(state_override)
        else:
            state = copy.deepcopy(initial_state)
        current = resume_from or self.graph.entry
        if current is None:
            raise RuntimeError("no entry node set")
        while current is not None and current != END:
            fn = self.graph.nodes.get(current)
            if fn is None:
                raise RuntimeError(f"unknown node {current!r}")
            update = fn(state)
            if update is None:
                update = {}
            state = {**state, **update}
            self.checkpointer.save(session_id, current, state)
            if state.get("_pause_reason"):
                reason = state.pop("_pause_reason")
                raise PausedAtNode(current, state)
            current = self.graph._next(current, state)
        return state


# ── Exercise 1: low-confidence routing ──────────────────────────────────────

random.seed(42)  # deterministic for demo


def _classify(state: State) -> Update:
    """Classify with a confidence score; low confidence → 'uncertain' route."""
    text = state["input"].lower()

    # Simulate confidence: keyword-match strength
    if "refund" in text or "money back" in text:
        route = "refund"
        confidence = 0.92
    elif "crash" in text or "bug" in text or "error" in text:
        route = "bug"
        confidence = 0.88
    elif "pricing" in text or "quote" in text:
        route = "sales"
        confidence = 0.85
    else:
        route = "uncertain"
        confidence = 0.15 + random.random() * 0.30  # 0.15–0.45

    return {
        "route": route,
        "confidence": round(confidence, 3),
        "step": state.get("step", 0) + 1,
    }


def _uncertain(state: State) -> Update:
    """Low-confidence: pause and wait for human to set route."""
    return {
        "_pause_reason": f"low confidence ({state.get('confidence', 0)}); "
                         "please set 'route' to refund/bug/sales and re-run",
        "step": state.get("step", 0) + 1,
    }


def _refund(state: State) -> Update:
    return {"ticket": f"REF-{state.get('input', '')[:12]}",
            "step": state.get("step", 0) + 1}


def _bug(state: State) -> Update:
    return {"ticket": f"BUG-{state.get('input', '')[:12]}",
            "step": state.get("step", 0) + 1}


def _sales(state: State) -> Update:
    return {"ticket": f"SAL-{state.get('input', '')[:12]}",
            "step": state.get("step", 0) + 1}


def _human_gate(state: State) -> Update:
    if not state.get("human_approval"):
        return {"_pause_reason": "awaiting human approval",
                "step": state.get("step", 0) + 1}
    return {"step": state.get("step", 0) + 1}


def _send(state: State) -> Update:
    return {"output": f"sent {state.get('ticket')}",
            "step": state.get("step", 0) + 1}


def build_graph() -> StateGraph:
    graph = StateGraph()
    graph.add_node("classify", _classify)
    graph.add_node("uncertain", _uncertain)
    graph.add_node("refund", _refund)
    graph.add_node("bug", _bug)
    graph.add_node("sales", _sales)
    graph.add_node("human_gate", _human_gate)
    graph.add_node("send", _send)
    graph.set_entry("classify")

    # Route by classify output
    graph.add_conditional_edges(
        "classify",
        router=lambda s: s["route"],
        targets={
            "refund": "refund",
            "bug": "bug",
            "sales": "sales",
            # KEY EXERCISE CHANGE: uncertain → END directly (via pause)
        },
    )
    # Low confidence → pause at uncertain node
    graph.add_edge("refund", "human_gate")
    graph.add_edge("bug", "human_gate")
    graph.add_edge("sales", "human_gate")
    graph.add_edge("human_gate", "send")
    graph.add_edge("send", END)

    # Uncertain: pause so human can set route, then resume
    graph.add_edge("uncertain", END)

    return graph


def case_high_confidence() -> None:
    """User says 'bug crash' — classify high confidence, normal flow."""
    print("─" * 60)
    print("Case 1: high-confidence classify (expect: normal flow)")
    graph = build_graph()
    ckpt = InMemoryCheckpointer()
    runner = Runner(graph, ckpt)
    session = "high-conf"

    initial: State = {
        "input": "the app crashes when I open the editor, please help",
        "step": 0,
        "human_approval": False,
    }

    try:
        runner.run(session, initial)
    except PausedAtNode as p:
        pass  # expected at human_gate

    # Approve
    _, state = ckpt.load_latest(session)
    approved = {**state, "human_approval": True}
    approved.pop("_pause_reason", None)
    ckpt.save(session, "human_gate_approved", approved)

    final = runner.run(session, initial,
                       resume_from="send", state_override=approved)
    print(f"  Initial confidence: {state.get('confidence')}")
    print(f"  Final: {final}")
    for node, snap in ckpt.history(session):
        print(f"    {node}: conf={snap.get('confidence')} ticket={snap.get('ticket')}")


def case_low_confidence_resume() -> None:
    """Ambiguous input — classify low confidence → pause at uncertain.
    Human sets route=refund, resumes → normal flow continues.
    """
    print("─" * 60)
    print("Case 2: low-confidence classify → human sets route → resume")
    graph = build_graph()
    ckpt = InMemoryCheckpointer()
    runner = Runner(graph, ckpt)
    session = "low-conf"

    initial: State = {
        "input": "i need help with my account, something weird is going on",
        "step": 0,
        "human_approval": False,
    }

    try:
        runner.run(session, initial)
    except PausedAtNode as p:
        print(f"  PAUSED at {p.node}")
        print(f"  Reason: {p.state.get('_pause_reason')}")
        print(f"  State at pause: {json.dumps(p.state, default=str)}")

    # Human reads state, decides it's a refund, sets route and approves
    _, paused_state = ckpt.load_latest(session)
    print()
    print("  >>> Human reviews: 'the user wants money back for an account issue'")
    print("  >>> Human sets route='refund', human_approval=True")
    resumed_state = {
        **paused_state,
        "route": "refund",
        "human_approval": True,
    }
    resumed_state.pop("_pause_reason", None)
    ckpt.save(session, "classify_human_override", resumed_state)

    # Resume from refund (the node after classify that handles refund)
    final = runner.run(
        session_id=session,
        initial_state=initial,
        resume_from="refund",
        state_override=resumed_state,
    )
    print(f"  Final: {json.dumps(final, default=str)}")
    for node, snap in ckpt.history(session):
        print(f"    {node}: conf={snap.get('confidence')} route={snap.get('route')} "
              f"ticket={snap.get('ticket')}")


if __name__ == "__main__":
    print("=" * 60)
    print("EXERCISE 1: Low-Confidence Classify + Human Override")
    print("=" * 60)
    case_high_confidence()
    case_low_confidence_resume()
    print()
    print("Done.")
