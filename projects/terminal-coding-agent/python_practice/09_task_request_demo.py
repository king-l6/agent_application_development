from pathlib import Path

from terminal_agent.contracts import TaskRequest


request = TaskRequest(
    task_id="task-001",
    repository=Path("."),
    goal="inspect project files",
)

print(request)
print(request.goal)
