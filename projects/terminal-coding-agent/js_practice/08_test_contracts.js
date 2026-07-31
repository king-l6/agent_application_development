/**
 * 完全体 JS 对照文件（带教学注释）
 *
 * 右开对照：tests/test_contracts.py
 * 左开本文件：逐行看注释里的「含义」和「= py: ...」
 *
 * 本文件不必真的跑通（依赖 contracts.js / fake_agent.js 教学用同名 API）；
 * 目的是对照 Python 测试在学什么。
 */

// import X from "模块" = 从模块引入符号
// = py: from ... import ...  或  import json
import assert from "node:assert/strict"; // 严格断言库：相等失败就抛错
import fs from "node:fs"; // 文件系统：建临时目录、写文件、删除
import os from "node:os"; // 操作系统信息：临时目录根路径 os.tmpdir()
import path from "node:path"; // 路径拼接 path.join
import { describe, it, beforeEach, afterEach } from "node:test";
// describe / it / beforeEach / afterEach = Node 自带测试 API
// = py: unittest.TestCase 里的 class / test_* / setUp / tearDown

import {
  AgentError,
  ErrorCode,
  TaskRequest,
  TaskResult,
  TaskStatus,
} from "./contracts.js"; // 契约类型（教学对照用）
// = py: from terminal_agent.contracts import ...

import { FakeCodingAgent } from "./fake_agent.js";
// = py: from terminal_agent.fake_agent import FakeCodingAgent

// describe(名字, 回调) = 定义一组相关测试（一个测试套件）
// = py: class FakeCodingAgentTests(unittest.TestCase):
describe("FakeCodingAgentTests", () => {
  let tempDir; // 临时目录路径字符串
  let repository; // 当作“仓库根目录”的路径
  let agent; // FakeCodingAgent 实例

  // beforeEach(回调) = 每条 it(...) 运行前执行一次（准备环境）
  // = py: def setUp(self) -> None:
  beforeEach(() => {
    // mkdtempSync = 同步创建一个唯一临时目录，返回路径
    // = py: self.temp_dir = tempfile.TemporaryDirectory()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t0-agent-"));

    // 仓库路径先等于临时目录本身
    // = py: self.repository = Path(self.temp_dir.name)
    repository = tempDir;

    // new ClassName() = 创建实例
    // = py: self.agent = FakeCodingAgent()
    agent = new FakeCodingAgent();
  });

  // afterEach(回调) = 每条 it(...) 跑完后执行（清理，避免脏目录）
  // = py: def tearDown(self) -> None: self.temp_dir.cleanup()
  afterEach(() => {
    // rmSync(路径, { recursive: true }) = 递归删除目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // it(名字, 回调) = 定义一条测试用例
  // = py: def test_valid_task_completes_deterministically(self) -> None:
  it("test_valid_task_completes_deterministically", () => {
    // 构造合法请求：有 taskId、仓库目录、非空 goal
    // = py: request = TaskRequest(task_id=..., repository=..., goal=...)
    const request = new TaskRequest(
      "task-001",
      repository,
      "Inspect the repository",
    );

    // 同一请求跑两次：确定性 Agent 应返回完全相同结果
    const first = agent.run(request); // = py: first = self.agent.run(request)
    const second = agent.run(request); // = py: second = self.agent.run(request)

    // assert.deepEqual(a, b) = 深度比较对象字段是否全相等；不等则测试失败
    // = py: self.assertEqual(first, second)  （dataclass 默认可按字段比较）
    assert.deepEqual(first, second);

    // assert.equal(a, b) = 断言 a 与 b 相等（==）；不等则失败
    // 注意：Python 里常写成 self.assertEqual(期望值, 实际值)
    // = py: self.assertEqual(TaskStatus.COMPLETED, first.status)
    assert.equal(first.status, TaskStatus.COMPLETED);

    // = py: self.assertEqual("task-001", first.task_id)
    assert.equal(first.taskId, "task-001");

    // 成功结果不应带错误对象
    // = py: self.assertIsNone(first.error)  （专门断言是 None）
    assert.equal(first.error, null);
  });

  it("test_blank_task_id_returns_structured_error", () => {
    // taskId 全是空格 → 校验应失败，返回结构化错误
    const result = agent.run(
      new TaskRequest("   ", repository, "Inspect files"),
    );
    // = py: result = self.agent.run(TaskRequest(task_id="   ", ...))

    // 状态必须是失败
    // = py: self.assertEqual(TaskStatus.FAILED, result.status)
    assert.equal(result.status, TaskStatus.FAILED);

    // 错误码必须是 invalid_request
    // = py: self.assertEqual(ErrorCode.INVALID_REQUEST, result.error.code)
    assert.equal(result.error.code, ErrorCode.INVALID_REQUEST);

    // assert.equal(x, false) ≈ 断言为假
    // = py: self.assertFalse(result.error.retryable)
    assert.equal(result.error.retryable, false);
  });

  it("test_blank_goal_returns_structured_error", () => {
    // goal 只有换行/制表符 → 也算空白，应失败
    const result = agent.run(
      new TaskRequest("task-002", repository, "\n\t"),
    );

    assert.equal(result.status, TaskStatus.FAILED);

    // assert.match(字符串, 正则) = 断言字符串匹配该模式
    // = py: self.assertIn("goal", result.error.message)  （包含子串）
    assert.match(result.error.message, /goal/);
  });

  it("test_missing_repository_returns_structured_error", () => {
    // path.join(a, b) = 拼路径
    // = py: missing = self.repository / "missing"  （Path 的 / 运算符）
    const missing = path.join(repository, "missing");

    const result = agent.run(
      new TaskRequest("task-003", missing, "Inspect files"),
    );

    assert.equal(result.status, TaskStatus.FAILED);

    // 结构化 details 里应带回仓库路径，方便排查
    // = py: self.assertEqual(str(missing), result.error.details["repository"])
    assert.equal(result.error.details.repository, missing);
  });

  it("test_repository_must_be_a_directory", () => {
    // 先创建一个普通文件，再把它当成 repository 传入 → 应拒绝
    const filePath = path.join(repository, "README.md");
    // writeFileSync = 同步写文件
    // = py: file_path.write_text("demo", encoding="utf-8")
    fs.writeFileSync(filePath, "demo", "utf-8");

    const result = agent.run(
      new TaskRequest("task-004", filePath, "Inspect files"),
    );

    assert.equal(result.status, TaskStatus.FAILED);
    // message 应提到 directory
    // = py: self.assertIn("directory", result.error.message)
    assert.match(result.error.message, /directory/);
  });

  it("test_completed_result_cannot_contain_an_error", () => {
    // 本用例不调用 agent.run()，直接测 TaskResult 构造不变量
    const error = new AgentError({
      code: ErrorCode.INTERNAL_ERROR,
      message: "unexpected",
    });
    // = py: error = AgentError(code=ErrorCode.INTERNAL_ERROR, message="unexpected")

    // assert.throws(函数) = 断言调用该函数时会抛异常；不抛则测试失败
    // = py: with self.assertRaises(ValueError):  （with 块内的代码应抛 ValueError）
    assert.throws(() => {
      // COMPLETED 却塞了 error → 应被拒绝（Python 的 __post_init__）
      new TaskResult({
        taskId: "task-005",
        status: TaskStatus.COMPLETED,
        summary: "done",
        error,
      });
    });
  });

  it("test_failed_result_requires_an_error", () => {
    // FAILED 却没有 error → 也应被拒绝
    assert.throws(() => {
      new TaskResult({
        taskId: "task-006",
        status: TaskStatus.FAILED,
        summary: "failed",
        // 故意不传 error
      });
    });
    // = py: with self.assertRaises(ValueError): TaskResult(..., status=FAILED)  # 无 error
  });

  it("test_result_is_json_serializable", () => {
    const result = agent.run(
      new TaskRequest("task-007", repository, "Inspect files"),
    );

    // JSON.stringify(对象) = 把对象变成 JSON 文本
    // = py: encoded = json.dumps(result.to_dict())
    // toObject() ≈ Python 的 to_dict()：先变成普通可序列化结构
    const encoded = JSON.stringify(result.toObject());

    // 序列化结果里应出现 completed 状态字段（CLI 才打得出稳定 JSON）
    // = py: self.assertIn('"status": "completed"', encoded)
    assert.match(encoded, /"status"\s*:\s*"completed"/);
  });
});
