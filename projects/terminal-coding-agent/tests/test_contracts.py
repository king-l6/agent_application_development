"""T0 Terminal Coding Agent 骨架的契约测试。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from terminal_agent.contracts import AgentError, ErrorCode, TaskRequest, TaskResult, TaskStatus
from terminal_agent.fake_agent import FakeCodingAgent


class FakeCodingAgentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repository = Path(self.temp_dir.name)
        self.agent = FakeCodingAgent()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_valid_task_completes_deterministically(self) -> None:
        request = TaskRequest(
            task_id="task-001",
            repository=self.repository,
            goal="Inspect the repository",
        )

        first = self.agent.run(request)
        second = self.agent.run(request)

        self.assertEqual(first, second)
        self.assertEqual(TaskStatus.COMPLETED, first.status)
        self.assertEqual("task-001", first.task_id)
        self.assertIsNone(first.error)

    def test_blank_task_id_returns_structured_error(self) -> None:
        result = self.agent.run(
            TaskRequest(task_id="   ", repository=self.repository, goal="Inspect files")
        )

        self.assertEqual(TaskStatus.FAILED, result.status)
        self.assertEqual(ErrorCode.INVALID_REQUEST, result.error.code)
        self.assertFalse(result.error.retryable)

    def test_blank_goal_returns_structured_error(self) -> None:
        result = self.agent.run(
            TaskRequest(task_id="task-002", repository=self.repository, goal="\n\t")
        )

        self.assertEqual(TaskStatus.FAILED, result.status)
        self.assertIn("goal", result.error.message)

    def test_missing_repository_returns_structured_error(self) -> None:
        missing = self.repository / "missing"

        result = self.agent.run(
            TaskRequest(task_id="task-003", repository=missing, goal="Inspect files")
        )

        self.assertEqual(TaskStatus.FAILED, result.status)
        self.assertEqual(str(missing), result.error.details["repository"])

    def test_repository_must_be_a_directory(self) -> None:
        file_path = self.repository / "README.md"
        file_path.write_text("demo", encoding="utf-8")

        result = self.agent.run(
            TaskRequest(task_id="task-004", repository=file_path, goal="Inspect files")
        )

        self.assertEqual(TaskStatus.FAILED, result.status)
        self.assertIn("directory", result.error.message)

    def test_completed_result_cannot_contain_an_error(self) -> None:
        error = AgentError(code=ErrorCode.INTERNAL_ERROR, message="unexpected")

        with self.assertRaises(ValueError):
            TaskResult(
                task_id="task-005",
                status=TaskStatus.COMPLETED,
                summary="done",
                error=error,
            )

    def test_failed_result_requires_an_error(self) -> None:
        with self.assertRaises(ValueError):
            TaskResult(
                task_id="task-006",
                status=TaskStatus.FAILED,
                summary="failed",
            )

    def test_result_is_json_serializable(self) -> None:
        result = self.agent.run(
            TaskRequest(task_id="task-007", repository=self.repository, goal="Inspect files")
        )

        encoded = json.dumps(result.to_dict())

        self.assertIn('"status": "completed"', encoded)


if __name__ == "__main__":
    unittest.main()
