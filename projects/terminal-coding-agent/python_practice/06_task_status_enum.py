from dataclasses import dataclass
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"


@dataclass
class Task:
    name: str
    status: TaskStatus


task = Task(name="inspect files", status=TaskStatus.DONE)
print(task.name)
print(task.status.value)
