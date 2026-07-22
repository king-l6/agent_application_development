"""Exercise 2: Real SQLite checkpointer with per-step serialization overhead.

Measures:
- Serialization time per checkpoint save
- Storage size per checkpoint
- Cumulative overhead over a multi-step run
"""
from __future__ import annotations

import copy
import json
import os
import sqlite3
import time
import sys
from dataclasses import dataclass, field
from typing import Any, Callable

# Import the graph infrastructure from main
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import (
    State, Update, NodeFn, Router, Edge, StateGraph,
    _make_router, PausedAtNode, Runner,
    _classify, _refund, _bug, _sales, _human_gate, _send, build_graph,
)

STORE: dict[str, list[tuple[str, State]]] = {}


class SqliteCheckpointer:
    """Real SQLite-backed checkpointer with timing instrumentation."""

    def __init__(self, db_path: str = "/tmp/langgraph_ex2_checkpoints.db") -> None:
        self.db_path = db_path
        # Track metrics
        self.save_count = 0
        self.total_serialize_s = 0.0
        self.total_write_s = 0.0
        self.total_bytes = 0
        self.step_timings: list[dict] = []

        # Fresh DB each time
        if os.path.exists(db_path):
            os.remove(db_path)

        self.conn = sqlite3.connect(db_path)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS checkpoints (
                session_id TEXT NOT NULL,
                step_name TEXT NOT NULL,
                step_index INTEGER NOT NULL,
                state_json TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY (session_id, step_index)
            )
        """)
        self.conn.execute("PRAGMA journal_mode=WAL")

    def save(self, session_id: str, step_name: str, state: State) -> None:
        """Save checkpoint and measure timing."""
        t0 = time.perf_counter()
        serialized = json.dumps(state, default=str)
        serialize_time = time.perf_counter() - t0
        byte_size = len(serialized.encode("utf-8"))

        t1 = time.perf_counter()
        self.conn.execute(
            "INSERT OR REPLACE INTO checkpoints (session_id, step_name, step_index, state_json, byte_size, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, step_name, self.save_count, serialized, byte_size, time.time()),
        )
        self.conn.commit()
        write_time = time.perf_counter() - t1

        # Also keep in memory for load_latest / history
        STORE.setdefault(session_id, []).append((step_name, copy.deepcopy(state)))

        self.save_count += 1
        self.total_serialize_s += serialize_time
        self.total_write_s += write_time
        self.total_bytes += byte_size
        self.step_timings.append({
            "step": step_name,
            "index": self.save_count - 1,
            "serialize_s": round(serialize_time, 6),
            "write_s": round(write_time, 6),
            "bytes": byte_size,
        })

    def load_latest(self, session_id: str) -> tuple[str, State] | None:
        history = STORE.get(session_id, [])
        if not history:
            return None
        return history[-1]

    def history(self, session_id: str) -> list[tuple[str, State]]:
        return list(STORE.get(session_id, []))

    def report(self) -> dict:
        """Return aggregate metrics."""
        return {
            "db_path": self.db_path,
            "db_size_bytes": os.path.getsize(self.db_path),
            "checkpoint_count": self.save_count,
            "total_serialize_s": round(self.total_serialize_s, 6),
            "total_write_s": round(self.total_write_s, 6),
            "total_bytes_serialized": self.total_bytes,
            "avg_bytes_per_checkpoint": round(self.total_bytes / max(self.save_count, 1)),
            "avg_serialize_s": round(self.total_serialize_s / max(self.save_count, 1), 6),
            "avg_write_s": round(self.total_write_s / max(self.save_count, 1), 6),
            "checksum": self._checksum(),
            "step_timings": self.step_timings,
        }

    def _checksum(self) -> str:
        import hashlib
        cur = self.conn.execute(
            "SELECT state_json FROM checkpoints ORDER BY step_index"
        )
        rows = cur.fetchall()
        if not rows:
            return "none"
        return hashlib.md5(rows[-1][0].encode()).hexdigest()[:12]

    def close(self) -> None:
        self.conn.close()


def run_scenario(scenario_name: str, input_text: str) -> dict:
    """Run a full lifecycle and return metrics."""
    print(f"\n{'='*60}")
    print(f"Scenario: {scenario_name}")
    print(f"{'='*60}")
    print(f"  Input: {input_text!r}")

    graph = build_graph()
    ckpt = SqliteCheckpointer(f"/tmp/langgraph_ex2_{scenario_name.replace(' ', '_')}.db")
    runner = Runner(graph, ckpt)

    session = "ex2_s001"
    initial: State = {
        "input": input_text,
        "step": 0,
        "human_approval": False,
    }

    # First run → pause at human_gate
    try:
        runner.run(session, initial)
    except PausedAtNode as p:
        print(f"  Paused at {p.node} (after {len(ckpt.step_timings)} checkpoints)")

    # Resume with approval
    _, state = ckpt.load_latest(session)
    approved = {**state, "human_approval": True}
    approved.pop("_pause_reason", None)
    ckpt.save(session, "human_gate_approved", approved)
    runner.run(session, initial, resume_from="send", state_override=approved)
    print(f"  Completed: {len(ckpt.step_timings)} total checkpoints")

    report = ckpt.report()
    print(f"\n  📊 Performance Report")
    print(f"  {'─'*50}")
    print(f"    DB file size:           {report['db_size_bytes']:>6} bytes")
    print(f"    Total checkpoints:      {report['checkpoint_count']}")
    print(f"    Total serialized bytes: {report['total_bytes_serialized']:>6}")
    print(f"    Avg bytes/checkpoint:   {report['avg_bytes_per_checkpoint']:>6}")
    print(f"    Total serialize time:   {report['total_serialize_s']:>6.4f}s")
    print(f"    Total write time:       {report['total_write_s']:>6.4f}s")
    print(f"    Avg serialize/step:     {report['avg_serialize_s']:>6.6f}s")
    print(f"    Avg write/step:         {report['avg_write_s']:>6.6f}s")
    print(f"\n  Per-step breakdown:")
    for t in report["step_timings"]:
        print(f"    step {t['index']:2d}  {t['step']:<22s}  "
              f"serialize={t['serialize_s']:>.6f}s  write={t['write_s']:>.6f}s  "
              f"{t['bytes']:>4d}B")

    ckpt.close()
    return report


def benchmark(state_size: int = 100_000) -> dict:
    """Benchmark overhead with a large state to stress serialization."""
    print(f"\n{'='*60}")
    print(f"Benchmark: Large state ({state_size:,} chars of data)")
    print(f"{'='*60}")

    graph = build_graph()
    ckpt = SqliteCheckpointer("/tmp/langgraph_ex2_benchmark.db")

    big_state: State = {
        "input": "this is a benchmark test",
        "step": 0,
        "human_approval": False,
        "large_payload": "X" * state_size,
    }

    try:
        # Only run classify to measure pure serialize overhead
        for node_name in ["classify", "bug", "human_gate"]:
            fn = graph.nodes[node_name]
            update = fn(big_state)
            big_state = {**big_state, **update}
            ckpt.save("bench", node_name, big_state)
    except PausedAtNode:
        pass

    report = ckpt.report()
    print(f"\n  📊 Benchmark (state payload ~{state_size:,} chars)")
    print(f"  {'─'*50}")
    print(f"    Avg serialize/step:   {report['avg_serialize_s']:>.6f}s")
    print(f"    Avg write/step:       {report['avg_write_s']:>.6f}s")
    print(f"    Avg bytes/checkpoint: {report['avg_bytes_per_checkpoint']:>7,}")
    print(f"    DB file size:         {report['db_size_bytes']:>7,} bytes")
    print(f"    Throughput:           {state_size / report['avg_serialize_s'] / 1_000_000:.1f} MB/s serialize")

    ckpt.close()
    return report


if __name__ == "__main__":
    print("=" * 60)
    print("EXERCISE 2: SQLite Checkpointer — Overhead Measurement")
    print("=" * 60)

    r1 = run_scenario("Bug report", "the CLI crashes on ctrl-c, please fix")
    r2 = run_scenario("Refund request", "i want my money back, this product is terrible")

    # Compare
    print(f"\n{'='*60}")
    print(f"Comparison: two runs")
    print(f"{'='*60}")
    print(f"  Run 1 total write: {r1['total_write_s']:.4f}s")
    print(f"  Run 2 total write: {r2['total_write_s']:.4f}s")
    print(f"  Overhead per step: ~{r1['avg_write_s']*1_000_000:.0f}µs write + "
          f"{r1['avg_serialize_s']*1_000_000:.0f}µs serialize")

    benchmark(500_000)

    # Cleanup
    for f in os.listdir("/tmp"):
        if f.startswith("langgraph_ex2_"):
            os.remove(os.path.join("/tmp", f))

    print("\nDone.")
