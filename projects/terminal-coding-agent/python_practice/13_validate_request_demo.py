"""演示 validate_request 如何检查任务请求并返回结构化错误。"""

from pathlib import Path

from terminal_agent.contracts import TaskRequest, validate_request


def show_validation(label: str, request: TaskRequest) -> None:
    """打印一次请求校验的结果。"""

    error = validate_request(request)
    printable_result = error.to_dict() if error else None
    print(f"{label}：{printable_result}")


show_validation(
    "合法请求",
    TaskRequest(
        task_id="task-001",
        repository=Path("."),
        goal="Inspect project files",
    ),
)

show_validation(
    "任务编号为空",
    TaskRequest(task_id="   ", repository=Path("."), goal="Inspect files"),
)

show_validation(
    "任务目标为空",
    TaskRequest(task_id="task-002", repository=Path("."), goal="\n\t"),
)

show_validation(
    "仓库不存在",
    TaskRequest(
        task_id="task-003",
        repository=Path("./__missing_repository_for_demo__"),
        goal="Inspect files",
    ),
)

show_validation(
    "仓库路径是文件",
    TaskRequest(
        task_id="task-004",
        repository=Path(__file__),
        goal="Inspect files",
    ),
)
