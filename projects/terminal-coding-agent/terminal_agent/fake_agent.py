"""在真实 Harness Loop 完成前使用的确定性 T0 假 Agent。"""

from __future__ import annotations

from .contracts import TaskRequest, TaskResult, TaskStatus, validate_request


class FakeCodingAgent:
    """校验一次任务，并返回不执行真实操作的确定性结果。"""

    def run(self, request: TaskRequest) -> TaskResult:
        error = validate_request(request)
        if error is not None:
            return TaskResult(
                task_id=request.task_id.strip() or "unknown",
                status=TaskStatus.FAILED,
                summary="Task rejected before execution.",
                error=error,
            )

        return TaskResult(
            task_id=request.task_id,
            status=TaskStatus.COMPLETED,
            summary=f"Accepted task {request.task_id} for deterministic execution.",
        )
