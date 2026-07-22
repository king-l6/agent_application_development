"""Exercise 3: parallel edges with custom reducer in stdlib state graph.

Two nodes run concurrently; their updates are merged via a custom reducer.
Immutable state means each node's update is an isolated diff — no shared
mutable reference to corrupt.
"""
from __future__ import annotations

import copy
import json
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

State = dict[str, Any]
Update = dict[str, Any]
NodeFn = Callable[[State], Update]
Router = Callable[[State], str]
Reducer = Callable[[State, list[Update]], State]

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


class ParallelRunner:
    """Runner that supports parallel fan-out from a node.

    After a node completes, the runner looks for fan-out edges:
    if the state has '_parallel_targets', it runs those nodes concurrently,
    then merges their updates with a reducer.
    """

    def __init__(self, graph: StateGraph,
                 checkpointer: InMemoryCheckpointer,
                 reducer: Reducer | None = None) -> None:
        self.graph = graph
        self.checkpointer = checkpointer
        # Default reducer: simple dict merge (left wins on conflict)
        self.reducer = reducer or (lambda current, updates:
                                   {**current, **{k: v for u in updates for k, v in u.items()}})

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

            # Parallel fan-out support
            parallel_targets = state.get("_parallel_targets")
            if parallel_targets and current != "_parallel_join":
                # Run all targets concurrently
                def run_node(name: str) -> Update:
                    fn = self.graph.nodes.get(name)
                    if fn is None:
                        raise RuntimeError(f"unknown parallel node {name!r}")
                    return fn(state)

                with _ThreadPool(len(parallel_targets)) as pool:
                    updates = pool.map(run_node, parallel_targets)

                # Note which parallel nodes ran (for checkpointing)
                for name in parallel_targets:
                    self.checkpointer.save(session_id, f"parallel:{name}", state)

                # Merge via reducer
                state = self.reducer(state, updates)
                self.checkpointer.save(session_id, "_parallel_join", state)

                # After join, continue from the join node
                current = self.graph._next("_parallel_join", state)
                continue

            if state.get("_pause_reason"):
                reason = state.pop("_pause_reason")
                raise PausedAtNode(current, state)
            current = self.graph._next(current, state)
        return state


# Simple thread pool for demo purposes
class _ThreadPool:
    def __init__(self, n: int):
        self.n = n
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def map(self, fn, args):
        results = [None] * len(args)
        threads = []
        for i, arg in enumerate(args):
            t = threading.Thread(target=lambda idx, a: results.__setitem__(idx, fn(a)), args=(i, arg))
            threads.append(t)
            t.start()
        for t in threads:
            t.join()
        return results


# ─── Demo nodes ─────────────────────────────────────────────────────────────

def _dispatcher(state: State) -> Update:
    """Fan out to parallel analysis nodes."""
    return {
        "_parallel_targets": ["analyze_sentiment", "analyze_entities", "analyze_urgency"],
        "step": state.get("step", 0) + 1,
    }


def _analyze_sentiment(state: State) -> Update:
    time.sleep(0.05)  # simulate work
    text = state.get("input", "")
    positive_words = ["great", "good", "love", "awesome", "happy", "best"]
    negative_words = ["bad", "terrible", "awful", "hate", "worst", "crash", "broken"]
    pos_count = sum(1 for w in positive_words if w in text.lower())
    neg_count = sum(1 for w in negative_words if w in text.lower())
    score = (pos_count - neg_count) / max(pos_count + neg_count, 1)
    return {"sentiment": round(score, 3)}


def _analyze_entities(state: State) -> Update:
    time.sleep(0.03)
    text = state.get("input", "")
    # Simple entity extraction: uppercase words = proper nouns
    entities = [w.strip(".,!?") for w in text.split() if w[0].isupper() and len(w) > 1]
    return {"entities": entities}


def _analyze_urgency(state: State) -> Update:
    time.sleep(0.04)
    text = state.get("input", "")
    urgent_words = ["urgent", "asap", "critical", "immediately", "crash", "blocked", "down"]
    is_urgent = any(w in text.lower() for w in urgent_words)
    return {"urgent": is_urgent}


def _human_gate(state: State) -> Update:
    if not state.get("human_approval"):
        return {"_pause_reason": "awaiting human approval",
                "step": state.get("step", 0) + 1}
    return {"step": state.get("step", 0) + 1}


def _send(state: State) -> Update:
    summary = (
        f"sent | sentiment={state.get('sentiment')} "
        f"entities={state.get('entities')} "
        f"urgent={state.get('urgent')}"
    )
    return {"output": summary, "step": state.get("step", 0) + 1}


# ── Custom reducers ─────────────────────────────────────────────────────────

def merging_reducer(current: State, updates: list[Update]) -> State:
    """Merge all updates into state. If multiple updates set the same key,
    the LAST one wins (since concurrent writes are independent)."""
    result = dict(current)
    for u in updates:
        for k, v in u.items():
            result[k] = v
    return result


def list_append_reducer(current: State, updates: list[Update]) -> State:
    """Special reducer: lists from parallel nodes get APPENDED rather than
    overwritten. Demonstrates the power of custom reducers."""
    result = dict(current)
    for u in updates:
        for k, v in u.items():
            if isinstance(v, list) and k in result and isinstance(result[k], list):
                result[k] = result[k] + v  # append, not replace
            else:
                result[k] = v
    return result


def build_parallel_graph() -> StateGraph:
    graph = StateGraph()
    graph.add_node("dispatcher", _dispatcher)
    graph.add_node("analyze_sentiment", _analyze_sentiment)
    graph.add_node("analyze_entities", _analyze_entities)
    graph.add_node("analyze_urgency", _analyze_urgency)
    graph.add_node("human_gate", _human_gate)
    graph.add_node("send", _send)
    graph.set_entry("dispatcher")

    # Normal edges define fallthrough when no parallel fan-out active
    graph.add_edge("dispatcher", "human_gate")
    graph.add_edge("human_gate", "send")
    graph.add_edge("send", END)

    # Join point after parallel
    graph.add_edge("_parallel_join", "human_gate")

    return graph


def run_demo(use_list_reducer: bool = False) -> None:
    reducer_name = "list_append_reducer" if use_list_reducer else "merging_reducer"
    reducer = list_append_reducer if use_list_reducer else merging_reducer

    print(f"\n{'─'*60}")
    print(f"Demo with reducer: {reducer_name}")
    print(f"{'─'*60}")

    graph = build_parallel_graph()
    ckpt = InMemoryCheckpointer()
    runner = ParallelRunner(graph, ckpt, reducer=reducer)

    session = "ex3_s001"
    initial: State = {
        "input": "URGENT: The Best App just crashed — this is terrible, please fix ASAP!",
        "step": 0,
        "human_approval": False,
    }

    t0 = time.perf_counter()
    try:
        final = runner.run(session, initial)
    except PausedAtNode as p:
        elapsed_parallel = time.perf_counter() - t0
        print(f"  Paused at {p.node}")
        print(f"  State after parallel merge: {json.dumps(p.state, default=str, indent=2)}")
        print(f"  Time to parallel join: {elapsed_parallel:.4f}s")

        # Human approves
        approved = {**p.state, "human_approval": True}
        approved.pop("_pause_reason", None)
        ckpt.save(session, "human_gate_approved", approved)
        t1 = time.perf_counter()
        final = runner.run(session, initial, resume_from="send", state_override=approved)
        total = time.perf_counter() - t0
        print(f"  Resume → final: {json.dumps(final, default=str)}")
        print(f"  Total lifecycle:     {total:.4f}s")

    print(f"\n  Checkpoint history:")
    for node, snap in ckpt.history(session):
        keys = list(snap.keys())
        print(f"    {node:<30s} keys={keys}")


def compare_serial_vs_parallel() -> None:
    """Compare wall-clock time: serial execution vs parallel fan-out."""
    print(f"\n{'='*60}")
    print("Benchmark: Serial vs Parallel fan-out")
    print(f"{'='*60}")

    graph = build_parallel_graph()

    # Serial: run nodes one by one
    state: State = {
        "input": "URGENT: The Best App crashed — terrible, fix ASAP!",
        "step": 0,
    }
    t0 = time.perf_counter()
    _analyze_sentiment(state)
    _analyze_entities(state)
    _analyze_urgency(state)
    serial_time = time.perf_counter() - t0
    print(f"  Serial 3-node time:  {serial_time:.4f}s  "
          f"(sentiment+entities+urgency sequentially)")

    # Parallel: via threads (simulated)
    def run_single(fn):
        return fn(state)

    threads = []
    t0 = time.perf_counter()
    for fn in [_analyze_sentiment, _analyze_entities, _analyze_urgency]:
        t = threading.Thread(target=run_single, args=(fn,))
        threads.append(t)
        t.start()
    for t in threads:
        t.join()
    parallel_time = time.perf_counter() - t0
    speedup = serial_time / parallel_time
    print(f"  Parallel 3-node time: {parallel_time:.4f}s  "
          f"(concurrent, speedup={speedup:.2f}x)")


if __name__ == "__main__":
    print("=" * 60)
    print("EXERCISE 3: Parallel Edges with Custom Reducers")
    print("=" * 60)

    compare_serial_vs_parallel()

    run_demo(use_list_reducer=False)
    run_demo(use_list_reducer=True)

    print(f"\n{'='*60}")
    print("Key insight: immutable state enables safe parallel execution")
    print("because each node receives a snapshot (not a shared reference).")
    print("The reducer owns conflict resolution — not the nodes.")
    print("=" * 60)
