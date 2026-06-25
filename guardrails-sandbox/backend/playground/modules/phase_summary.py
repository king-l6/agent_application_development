"""Phase 总览 —— 阶段概要

输入阶段号，列出该阶段所有课程。对应 MCP 的 get_phase_summary，
但归到「课程导航」分组，作为实验台的入口工具。
"""
import time
from pathlib import Path

from playground.base import (
    PlaygroundModule, ModuleResult, field_spec, block_list, block_text,
)

PHASES_BASE = Path(
    "/Users/bilibili/Desktop/ai工程/ai-engineering-from-scratch/phases"
)


class PhaseSummary(PlaygroundModule):
    name = "phase_summary"
    display_name = "阶段概要"
    description = "输入阶段号(0-19)，列出该阶段的全部课程"
    phase = "00-navigation"
    lesson = "phase-summary"
    order = 0

    input_schema = [
        field_spec("phase_number", "阶段号", type="number", default=11,
                   help="0-19"),
    ]

    def run(self, inputs: dict) -> ModuleResult:
        start = time.time()
        try:
            num = int(inputs.get("phase_number", -1))
        except (ValueError, TypeError):
            return ModuleResult(ok=False, error="阶段号必须是整数")

        matches = list(PHASES_BASE.glob(f"{num:02d}-*"))
        if not matches:
            return ModuleResult(ok=False, error=f"未找到阶段 {num}")

        phase_dir = matches[0]
        lessons = sorted(
            d.name for d in phase_dir.iterdir()
            if d.is_dir() and d.name[0].isdigit()
        )

        readme_path = phase_dir / "README.md"
        intro = ""
        if readme_path.exists():
            try:
                intro = readme_path.read_text(encoding="utf-8").split("\n\n")[0][:200]
            except Exception:
                pass

        latency = (time.time() - start) * 1000
        blocks = []
        if intro:
            blocks.append(block_text(intro, label="简介"))
        blocks.append(block_list(lessons, label=f"共 {len(lessons)} 课", ordered=True))

        return ModuleResult(
            ok=True,
            summary=f"{phase_dir.name} —— 共 {len(lessons)} 课",
            blocks=blocks,
            latency_ms=latency,
        )
