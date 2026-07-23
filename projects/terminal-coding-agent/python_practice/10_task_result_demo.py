from terminal_agent.contracts import TaskResult, TaskStatus


result = TaskResult(
    task_id="task-001",
    status=TaskStatus.COMPLETED,
    summary="Task accepted for deterministic execution.",
)

print(result)
print(result.to_dict())
