tasks = [
    {"name": "inspect files", "status": "done"},
    {"name": "run tests", "status": "pending"},
    {"name": "write fix", "status": "pending"},
]

for task in tasks:
    name = task["name"]
    status = task["status"]
    print(f"{name}: {status}")
