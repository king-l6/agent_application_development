"""Terminal Coding Agent 学习项目。"""

from .contracts import AgentError, ErrorCode, TaskRequest, TaskResult, TaskStatus
from .fake_agent import FakeCodingAgent

__all__ = [
    "AgentError",
    "ErrorCode",
    "FakeCodingAgent",
    "TaskRequest",
    "TaskResult",
    "TaskStatus",
]
