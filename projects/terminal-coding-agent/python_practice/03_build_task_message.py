def build_task_message(task_id, goal):
    return f"Task {task_id}: {goal}"


message = build_task_message("task-001", "inspect project files")
print(message)
