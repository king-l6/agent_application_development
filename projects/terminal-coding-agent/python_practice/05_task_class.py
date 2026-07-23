from dataclasses import dataclass


@dataclass
class Task:
    name: str
    status: str

    def display(self):
        return f"{self.name}: {self.status}"


task = Task(name="inspect files", status="pending")
print(task.display())
