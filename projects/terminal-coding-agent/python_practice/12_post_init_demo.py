"""演示 TaskResult 如何在创建时阻止相互矛盾的结果。"""

from terminal_agent.contracts import AgentError, ErrorCode, TaskResult, TaskStatus


agent_error = AgentError(
    code=ErrorCode.INTERNAL_ERROR,
    message="model service is unavailable",
    retryable=True,
)

# 合法：失败状态携带具体错误。
failed_result = TaskResult(
    task_id="task-001",
    status=TaskStatus.FAILED,
    summary="Task failed.",
    error=agent_error,
)
print("合法结果：", failed_result.to_dict())

# 非法：状态是失败，但没有提供错误。
try:
    TaskResult(
        task_id="task-002",
        status=TaskStatus.FAILED,
        summary="Task failed.",
    )
except ValueError as validation_error:
    print("拦截结果：", validation_error)

# 非法：状态是成功，但同时携带错误。
try:
    TaskResult(
        task_id="task-003",
        status=TaskStatus.COMPLETED,
        summary="Task completed.",
        error=agent_error,
    )
except ValueError as validation_error:
    print("拦截结果：", validation_error)
