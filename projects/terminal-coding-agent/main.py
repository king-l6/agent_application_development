"""从命令行运行确定性的 T0 Terminal Coding Agent。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from terminal_agent import FakeCodingAgent, TaskRequest, TaskStatus


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="terminal-coding-agent")
    parser.add_argument("repository", type=Path, help="本地代码仓库目录")
    parser.add_argument("goal", help="需要执行的编码任务")
    parser.add_argument("--task-id", default="local-task", help="稳定的任务标识")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    request = TaskRequest(
        task_id=args.task_id,
        repository=args.repository,
        goal=args.goal,
    )
    result = FakeCodingAgent().run(request)
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    return 0 if result.status is TaskStatus.COMPLETED else 2


if __name__ == "__main__":
    raise SystemExit(main())
