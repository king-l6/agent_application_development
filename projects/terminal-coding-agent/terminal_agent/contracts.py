"""Agent Harness 使用的稳定输入、输出和错误契约。"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class TaskStatus(str, Enum):
    """调用方能够看到的任务生命周期结果。"""

    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class ErrorCode(str, Enum):
    """Harness 对外提供的机器可读错误分类。"""

    INVALID_REQUEST = "invalid_request"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class AgentError:
    """结构化错误，使调用方不需要解析错误文本。"""

    code: ErrorCode
    message: str
    retryable: bool = False
    details: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code.value,
            "message": self.message,
            "retryable": self.retryable,
            "details": dict(self.details),
        }


@dataclass(frozen=True)
class TaskRequest:
    """启动一次编码任务所需的最小信息。"""

    task_id: str
    repository: Path
    goal: str


@dataclass(frozen=True)
class TaskResult:
    """所有任务结果统一使用的返回结构。"""

    task_id: str
    status: TaskStatus
    summary: str
    error: AgentError | None = None

    def __post_init__(self) -> None:
        if self.status is TaskStatus.FAILED and self.error is None:
            raise ValueError("failed results require an error")
        if self.status is not TaskStatus.FAILED and self.error is not None:
            raise ValueError("only failed results may contain an error")

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "summary": self.summary,
            "error": self.error.to_dict() if self.error else None,
        }


def validate_request(request: TaskRequest) -> AgentError | None:
    """任务无法启动时返回结构化错误，否则返回 None。"""

    if not request.task_id.strip():
        return AgentError(
            code=ErrorCode.INVALID_REQUEST,
            message="task_id must not be blank",
        )
    if not request.goal.strip():
        return AgentError(
            code=ErrorCode.INVALID_REQUEST,
            message="goal must not be blank",
        )
    if not request.repository.exists():
        return AgentError(
            code=ErrorCode.INVALID_REQUEST,
            message="repository does not exist",
            details={"repository": str(request.repository)},
        )
    if not request.repository.is_dir():
        return AgentError(
            code=ErrorCode.INVALID_REQUEST,
            message="repository must be a directory",
            details={"repository": str(request.repository)},
        )
    return None
