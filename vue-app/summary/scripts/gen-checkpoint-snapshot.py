#!/usr/bin/env python3
"""预生成 LangGraph 检查点库的解码快照，供笔记实验台"数据库"页离线渲染。

背景：sandbox 的检查点查看器靠后端实时读 SQLite + JsonPlusSerializer 解码，
而学习笔记是纯静态部署（GitHub Pages），没有后端。这里在构建前把 demo 库
一次性解码成静态 JS 数据模块，前端 import 即用，零 fetch、零后端。

用法（需项目根 venv，含 langgraph）：
    ../../../venv/bin/python scripts/gen-checkpoint-snapshot.py

输出：src/data/checkpointSnapshot.generated.js
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VUE_APP = HERE.parent
REPO_ROOT = VUE_APP.parents[2]  # site/vue-app/summary -> repo root
BACKEND = REPO_ROOT / "guardrails-sandbox" / "backend"
OUT = VUE_APP / "src" / "data" / "checkpointSnapshot.generated.js"

# 让后端的 playground.checkpoint_db 可被 import
sys.path.insert(0, str(BACKEND))


def main():
    from playground import checkpoint_db as c

    dbs = c.list_dbs()
    snapshots = {}
    for db in dbs:
        if not db["exists"]:
            continue
        try:
            snapshots[db["key"]] = c.inspect(db["key"], "")
        except Exception as e:  # noqa: BLE001
            snapshots[db["key"]] = {"ok": False, "error": str(e)}

    payload = {
        "dbs": dbs,
        "snapshots": snapshots,
    }

    body = json.dumps(payload, ensure_ascii=False, indent=2)
    header = (
        "// 自动生成，勿手改。由 scripts/gen-checkpoint-snapshot.py 预解码 LangGraph\n"
        "// 检查点库产出。真实 msgpack 二进制已用 JsonPlusSerializer 解码为可读对话。\n"
        "// 重新生成：../../../venv/bin/python scripts/gen-checkpoint-snapshot.py\n"
    )
    OUT.write_text(f"{header}export const checkpointSnapshot = {body}\n", encoding="utf-8")
    total = sum(s.get("checkpoint_count", 0) for s in snapshots.values() if s.get("ok"))
    print(f"✅ 写出 {OUT.relative_to(VUE_APP)}：{len(snapshots)} 个库，{total} 个检查点")


if __name__ == "__main__":
    main()
