"""演示 FakeCodingAgent 如何把请求校验结果转换成统一任务结果。"""

from pathlib import Path

from terminal_agent import FakeCodingAgent, TaskRequest


agent = FakeCodingAgent()

valid_request = TaskRequest(
    task_id="task-001",
    repository=Path("."),
    goal="Inspect project files",
)
valid_result = agent.run(valid_request)
print("合法请求结果：", valid_result.to_dict())

invalid_request = TaskRequest(
    task_id="   ",
    repository=Path("."),
    goal="Inspect project files",
)
invalid_result = agent.run(invalid_request)
print("非法请求结果：", invalid_result.to_dict())
