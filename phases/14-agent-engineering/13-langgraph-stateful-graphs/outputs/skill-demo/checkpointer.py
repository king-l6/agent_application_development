# checkpointer.py — 检查点持久化后端
# 来源: phases/14-agent-engineering/13-langgraph-stateful-graphs/outputs/skill-demo
# 提供 Checkpointer 抽象基类、SQLiteCheckpointer（默认）和 InMemoryCheckpointer
# 仅使用 Python stdlib，不依赖 langgraph/langchain 等外部库

from __future__ import annotations

import copy
import json
import sqlite3
from abc import ABC, abstractmethod

from state import State


# ---------------------------------------------------------------------------
# 抽象基类
# ---------------------------------------------------------------------------

class Checkpointer(ABC):
    """检查点后端接口。

    所有实现必须序列化完整状态（不是摘要），
    并在每次 save 时追加历史记录。
    """

    @abstractmethod
    def save(self, session_id: str, node: str, state: State) -> None:
        """将 (session_id, node, state) 持久化为一条检查点记录。"""

    @abstractmethod
    def load_latest(self, session_id: str) -> dict | None:
        """加载 session_id 最近一次检查点。

        返回 {"node": str, "state": State} 或 None（无记录时）。
        """

    @abstractmethod
    def history(self, session_id: str) -> list[dict]:
        """返回 session_id 的全部检查点历史，按时间正序。"""


# ---------------------------------------------------------------------------
# SQLite 实现（默认）
# ---------------------------------------------------------------------------

class SQLiteCheckpointer(Checkpointer):
    """基于 SQLite 的检查点后端。

    - db_path 默认为 ":memory:"（进程内数据库，适合测试）。
    - 生产环境可传入文件路径或 Postgres/Redis 适配（需自行实现）。
    - state 用 json.dumps 序列化为 JSON 字符串存储。
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._create_table()

    def _create_table(self) -> None:
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS checkpoints (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT    NOT NULL,
                node        TEXT    NOT NULL,
                state_json  TEXT    NOT NULL,
                created_at  TEXT    DEFAULT (datetime('now'))
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_session
            ON checkpoints (session_id, id)
        """)
        self._conn.commit()

    def save(self, session_id: str, node: str, state: State) -> None:
        state_json = json.dumps(state, ensure_ascii=False, default=str)
        self._conn.execute(
            "INSERT INTO checkpoints (session_id, node, state_json) VALUES (?, ?, ?)",
            (session_id, node, state_json),
        )
        self._conn.commit()

    def load_latest(self, session_id: str) -> dict | None:
        row = self._conn.execute(
            """
            SELECT node, state_json FROM checkpoints
            WHERE session_id = ?
            ORDER BY id DESC LIMIT 1
            """,
            (session_id,),
        ).fetchone()
        if row is None:
            return None
        return {"node": row[0], "state": json.loads(row[1])}

    def history(self, session_id: str) -> list[dict]:
        rows = self._conn.execute(
            """
            SELECT id, node, state_json, created_at FROM checkpoints
            WHERE session_id = ?
            ORDER BY id ASC
            """,
            (session_id,),
        ).fetchall()
        return [
            {
                "id": r[0],
                "node": r[1],
                "state": json.loads(r[2]),
                "created_at": r[3],
            }
            for r in rows
        ]

    def close(self) -> None:
        self._conn.close()


# ---------------------------------------------------------------------------
# InMemory 实现（开发/测试用）
# ---------------------------------------------------------------------------

class InMemoryCheckpointer(Checkpointer):
    """纯内存检查点，进程退出即丢失。适合单元测试和快速实验。"""

    def __init__(self) -> None:
        # session_id → list of checkpoint dicts
        self._store: dict[str, list[dict]] = {}

    def save(self, session_id: str, node: str, state: State) -> None:
        bucket = self._store.setdefault(session_id, [])
        bucket.append({
            "id": len(bucket) + 1,
            "node": node,
            "state": copy.deepcopy(dict(state)),
            "created_at": "in-memory",
        })

    def load_latest(self, session_id: str) -> dict | None:
        bucket = self._store.get(session_id, [])
        if not bucket:
            return None
        last = bucket[-1]
        return {"node": last["node"], "state": copy.deepcopy(last["state"])}

    def history(self, session_id: str) -> list[dict]:
        return [
            {**cp, "state": copy.deepcopy(cp["state"])}
            for cp in self._store.get(session_id, [])
        ]
