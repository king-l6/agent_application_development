const repoBase = 'https://github.com/king-l6/agent_application_development/blob/main/'

export const t0Lessons = [
  {
    id: 't0-1',
    code: 'T0.1',
    title: 'TaskRequest 输入契约',
    status: 'done',
    statusLabel: '已完成',
    core: '把启动一次编码任务所需的最小信息，组织成一个不可变、可比较的请求对象。',
    targets: [
      { label: '核心代码', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 44, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L44` },
      { label: '演示代码', path: 'projects/terminal-coding-agent/python_practice/09_task_request_demo.py', line: 1, url: `${repoBase}projects/terminal-coding-agent/python_practice/09_task_request_demo.py#L1` }
    ],
    javascript: `class TaskRequest {
  constructor(taskId, repository, goal) {
    this.taskId = taskId;
    this.repository = repository;
    this.goal = goal;
    Object.freeze(this);
  }
}

const request = new TaskRequest(
  "task-001",
  ".",
  "inspect project files",
);`,
    python: `@dataclass(frozen=True)
class TaskRequest:
    """启动一次编码任务所需的最小信息。"""

    task_id: str
    repository: Path
    goal: str


request = TaskRequest(
    task_id="task-001",
    repository=Path("."),
    goal="inspect project files",
)`,
    mapping: {
      headers: ['JavaScript', 'Python', '含义'],
      rows: [
        ['class', 'class', '定义对象类型'],
        ['constructor', 'dataclass 自动生成 __init__', '接收并保存字段'],
        ['this.taskId', 'self.task_id', '当前对象的字段'],
        ['Object.freeze()', '@dataclass(frozen=True)', '创建后禁止重新赋值'],
        ['普通路径字符串', 'Path(".")', '使用路径对象表达文件系统位置'],
        ['camelCase', 'snake_case', '两种语言的常见命名风格']
      ]
    },
    explanations: [
      {
        title: '为什么使用 dataclass',
        blocks: [
          { type: 'text', paragraphs: ['dataclass 会根据字段自动生成初始化、打印和比较逻辑。这里需要的是一个只保存任务数据的对象，不需要手写重复的 __init__。'] },
          { type: 'callout', tone: 'success', title: '它不是普通字典', text: 'TaskRequest 固定了字段名称和类型。调用方不能随意漏字段或把 task_id 拼成另一个名字。' }
        ]
      },
      {
        title: 'frozen=True 是什么意思',
        blocks: [
          { type: 'text', paragraphs: ['请求创建后不能再写 request.goal = "new goal"。这能避免任务执行到一半时，输入契约被某段代码悄悄改掉。'] },
          { type: 'callout', tone: 'warning', title: '浅层不可变', text: 'frozen=True 阻止字段重新赋值，但如果字段内部保存可变列表，列表本身仍可能被修改。当前三个字段都是适合冻结的值。' }
        ]
      },
      {
        title: '为什么 repository 使用 Path',
        blocks: [
          { type: 'text', paragraphs: ['Path 不只是一个字符串。后续可以直接调用 exists()、is_dir()、resolve() 等文件系统方法，路径语义比手写字符串拼接清晰。'] }
        ]
      }
    ],
    run: {
      command: 'python3 -m python_practice.09_task_request_demo',
      result: ['打印完整 TaskRequest 对象。', '可以通过 request.goal 读取目标。', '证明字段创建和访问正常。']
    },
    exercise: {
      prompt: '如果执行 request.goal = "delete files"，你预计会成功，还是抛出 FrozenInstanceError？为什么？',
      answer: '会抛出 FrozenInstanceError，因为 frozen=True 禁止在对象创建后重新给字段赋值。'
    }
  },
  {
    id: 't0-2',
    code: 'T0.2',
    title: 'TaskStatus 与 TaskResult 输出契约',
    status: 'done',
    statusLabel: '已完成',
    core: '定义 Agent 对外返回的状态和值，让成功、失败和暂停都使用同一种可序列化结果结构。',
    targets: [
      { label: '状态代码', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 11, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L11` },
      { label: '结果代码', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 53, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L53` },
      { label: '演示代码', path: 'projects/terminal-coding-agent/python_practice/10_task_result_demo.py', line: 1, url: `${repoBase}projects/terminal-coding-agent/python_practice/10_task_result_demo.py#L1` }
    ],
    javascript: `const TaskStatus = Object.freeze({
  COMPLETED: "completed",
  FAILED: "failed",
  PAUSED: "paused",
});

class TaskResult {
  constructor({ taskId, status, summary, error = null }) {
    this.taskId = taskId;
    this.status = status;
    this.summary = summary;
    this.error = error;
  }

  toObject() {
    return {
      task_id: this.taskId,
      status: this.status,
      summary: this.summary,
      error: this.error ? this.error.toObject() : null,
    };
  }
}`,
    python: `class TaskStatus(str, Enum):
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


@dataclass(frozen=True)
class TaskResult:
    task_id: str
    status: TaskStatus
    summary: str
    error: AgentError | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "summary": self.summary,
            "error": self.error.to_dict() if self.error else None,
        }`,
    mapping: {
      headers: ['JavaScript', 'Python', '含义'],
      rows: [
        ['Object.freeze({...})', 'class TaskStatus(str, Enum)', '定义有限状态集合'],
        ['TaskStatus.COMPLETED', 'TaskStatus.COMPLETED', '使用稳定状态值'],
        ['error = null', 'error: AgentError | None = None', '错误字段可为空'],
        ['toObject()', 'to_dict()', '转换为普通数据'],
        ['this.status', 'self.status', '访问当前结果字段'],
        ['status', 'status.value', '输出字符串而不是 Enum 对象']
      ]
    },
    explanations: [
      {
        title: '为什么状态不能使用任意字符串',
        blocks: [
          { type: 'text', paragraphs: ['如果各处随手写 "done"、"success" 或 "complete"，调用方需要猜含义。Enum 把合法值限制为 completed、failed 和 paused。'] }
        ]
      },
      {
        title: 'AgentError | None 表示什么',
        blocks: [
          { type: 'text', paragraphs: ['竖线表示联合类型：error 要么是 AgentError，要么是 None。成功结果通常没有错误，失败结果需要错误，跨字段关系会在 T0.4 检查。'] }
        ]
      },
      {
        title: '为什么需要 to_dict()',
        blocks: [
          { type: 'text', paragraphs: ['dataclass、Enum 和 Path 等 Python 对象不能保证直接被 JSON 编码。to_dict() 把结果主动转换成字符串、字典和 None 组成的稳定边界格式。'] }
        ]
      }
    ],
    run: {
      command: 'python3 -m python_practice.10_task_result_demo',
      result: ['打印 TaskResult 对象。', '打印 to_dict() 后的普通字典。', 'status 输出为字符串 completed。']
    },
    exercise: {
      prompt: '为什么 to_dict() 中使用 self.status.value，而不是直接放 self.status？',
      answer: 'value 得到稳定字符串，便于 JSON、CLI 和其他语言消费；直接放 Enum 对象会把 Python 内部类型泄漏到边界。'
    }
  },
  {
    id: 't0-3',
    code: 'T0.3',
    title: 'ErrorCode 与 AgentError 结构化错误',
    status: 'done',
    statusLabel: '已完成',
    core: '把错误码、说明、是否可重试和详情组织成稳定数据，让调用方不需要解析自然语言错误文本。',
    targets: [
      { label: '错误代码', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 19, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L19` },
      { label: '错误对象', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 26, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L26` },
      { label: '演示代码', path: 'projects/terminal-coding-agent/python_practice/11_agent_error_demo.py', line: 1, url: `${repoBase}projects/terminal-coding-agent/python_practice/11_agent_error_demo.py#L1` }
    ],
    javascript: `const ErrorCode = Object.freeze({
  INVALID_REQUEST: "invalid_request",
  INTERNAL_ERROR: "internal_error",
});

class AgentError {
  constructor({ code, message, retryable = false, details = {} }) {
    this.code = code;
    this.message = message;
    this.retryable = retryable;
    this.details = details;
  }
}`,
    python: `class ErrorCode(str, Enum):
    INVALID_REQUEST = "invalid_request"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class AgentError:
    code: ErrorCode
    message: str
    retryable: bool = False
    details: dict[str, str] = field(default_factory=dict)`,
    mapping: {
      headers: ['JavaScript', 'Python', '含义'],
      rows: [
        ['retryable = false', 'retryable: bool = False', '默认不允许自动重试'],
        ['details = {}', 'field(default_factory=dict)', '每个对象获得独立字典'],
        ['ErrorCode.INVALID_REQUEST', 'ErrorCode.INVALID_REQUEST', '机器可读错误分类'],
        ['对象字面量', 'dataclass', '稳定错误结构'],
        ['toObject()', 'to_dict()', '转换为边界数据']
      ]
    },
    explanations: [
      {
        title: '错误码和错误消息的职责不同',
        blocks: [
          { type: 'table', headers: ['字段', '给谁使用', '例子'], rows: [
            ['code', '程序分支', 'invalid_request'],
            ['message', '人类阅读', 'goal must not be blank'],
            ['retryable', '调度器', '是否值得自动重试'],
            ['details', '诊断和界面', 'field、repository、service']
          ]}
        ]
      },
      {
        title: '为什么 details 使用 default_factory',
        blocks: [
          { type: 'text', paragraphs: ['Python 的默认可变对象可能被多个实例共享。default_factory=dict 会在每次创建 AgentError 时生成新的字典。'] }
        ]
      },
      {
        title: 'retryable 不等于用户可以原样重试',
        blocks: [
          { type: 'text', paragraphs: ['INVALID_REQUEST 默认不可重试，因为同样请求不会自己变好。临时模型服务错误可以 retryable=True，因为外部服务可能恢复。'] }
        ]
      }
    ],
    run: {
      command: 'python3 -m python_practice.11_agent_error_demo',
      result: ['输出不可重试的 invalid_request。', '输出可重试的 internal_error。', '两类错误具有相同数据结构。']
    },
    exercise: {
      prompt: '“repository 不存在”应该设置 retryable=True 还是 False？',
      answer: '通常是 False。相同路径不会因为立即重试而自动出现，调用方需要先修正请求或创建目录。'
    }
  },
  {
    id: 't0-4',
    code: 'T0.4',
    title: '__post_init__ 保证结果一致性',
    status: 'done',
    statusLabel: '已完成',
    core: '在 TaskResult 创建时检查跨字段不变量，阻止“失败但没有错误”和“成功却携带错误”的矛盾数据。',
    targets: [
      { label: '核心代码', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 62, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L62` },
      { label: '演示代码', path: 'projects/terminal-coding-agent/python_practice/12_post_init_demo.py', line: 1, url: `${repoBase}projects/terminal-coding-agent/python_practice/12_post_init_demo.py#L1` }
    ],
    javascript: `class TaskResult {
  constructor({ taskId, status, summary, error = null }) {
    if (status === TaskStatus.FAILED && error === null) {
      throw new Error("failed results require an error");
    }
    if (status !== TaskStatus.FAILED && error !== null) {
      throw new Error("only failed results may contain an error");
    }

    this.taskId = taskId;
    this.status = status;
    this.summary = summary;
    this.error = error;
  }
}`,
    python: `def __post_init__(self) -> None:
    if self.status is TaskStatus.FAILED and self.error is None:
        raise ValueError("failed results require an error")

    if self.status is not TaskStatus.FAILED and self.error is not None:
        raise ValueError("only failed results may contain an error")`,
    mapping: {
      headers: ['JavaScript', 'Python', '含义'],
      rows: [
        ['constructor 内检查', '__post_init__', '对象初始化后立即检查'],
        ['===', 'is', '比较同一个 Enum 成员'],
        ['!==', 'is not', '判断不是该 Enum 成员'],
        ['error === null', 'error is None', '没有错误对象'],
        ['throw new Error', 'raise ValueError', '拒绝创建矛盾对象'],
        ['无返回值', '-> None', '只负责检查，不返回数据']
      ]
    },
    explanations: [
      {
        title: '__post_init__ 在什么时候运行',
        blocks: [
          { type: 'text', paragraphs: ['dataclass 自动生成的 __init__ 先给字段赋值，随后立刻调用 __post_init__。因此非法对象在创建现场就失败，不会流入 CLI、JSON 或数据库。'] }
        ]
      },
      {
        title: '为什么这里使用 raise',
        blocks: [
          { type: 'text', paragraphs: ['TaskResult 的字段组合由程序内部代码创建。制造出相互矛盾的结果代表开发错误，不是正常业务分支，所以应该立即抛出异常。'] },
          { type: 'callout', tone: 'success', title: '与 T0.5 的区别', text: '内部代码破坏不变量使用 raise；用户请求不合法属于预期输入问题，返回 AgentError。' }
        ]
      },
      {
        title: '两个不变量覆盖哪些状态',
        blocks: [
          { type: 'table', headers: ['状态', 'error', '是否合法'], rows: [
            ['FAILED', 'AgentError', '合法'],
            ['FAILED', 'None', '非法'],
            ['COMPLETED / PAUSED', 'None', '合法'],
            ['COMPLETED / PAUSED', 'AgentError', '非法']
          ]}
        ]
      }
    ],
    run: {
      command: 'python3 -m python_practice.12_post_init_demo',
      result: ['合法失败结果可以创建并输出。', '失败但无错误会抛出 ValueError。', '成功但带错误会抛出 ValueError。']
    },
    exercise: {
      prompt: 'PAUSED 状态可以携带 AgentError 吗？根据当前不变量判断。',
      answer: '不可以。第二个条件规定所有非 FAILED 状态都不能携带 error。以后如果暂停需要原因，应增加独立 pause_reason，而不是滥用错误字段。'
    }
  },
  {
    id: 't0-5',
    code: 'T0.5',
    title: 'validate_request() 请求校验',
    status: 'done',
    statusLabel: '已完成',
    core: 'Agent 开始工作前，先检查请求是否合法。非法请求返回结构化 AgentError，合法请求返回 None。',
    targets: [
      { label: '核心代码', path: 'projects/terminal-coding-agent/terminal_agent/contracts.py', line: 77, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py#L77` },
      { label: '演示代码', path: 'projects/terminal-coding-agent/python_practice/13_validate_request_demo.py', line: 1, url: `${repoBase}projects/terminal-coding-agent/python_practice/13_validate_request_demo.py#L1` }
    ],
    javascript: `function validateRequest(request) {
  if (!request.taskId.trim()) {
    return new AgentError({
      code: ErrorCode.INVALID_REQUEST,
      message: "task_id must not be blank",
    });
  }

  if (!request.goal.trim()) {
    return new AgentError({
      code: ErrorCode.INVALID_REQUEST,
      message: "goal must not be blank",
    });
  }

  if (!fs.existsSync(request.repository)) {
    return new AgentError({
      code: ErrorCode.INVALID_REQUEST,
      message: "repository does not exist",
    });
  }

  if (!fs.statSync(request.repository).isDirectory()) {
    return new AgentError({
      code: ErrorCode.INVALID_REQUEST,
      message: "repository must be a directory",
    });
  }

  return null;
}`,
    python: `def validate_request(request: TaskRequest) -> AgentError | None:
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

    return None`,
    mapping: {
      headers: ['JavaScript', 'Python', '含义'],
      rows: [
        ['function', 'def', '定义函数'],
        ['.trim()', '.strip()', '删除两端空白'],
        ['!value', 'not value', '取反'],
        ['fs.existsSync()', 'Path.exists()', '路径是否存在'],
        ['isDirectory()', 'Path.is_dir()', '路径是否为目录'],
        ['null', 'None', '没有错误'],
        ['A ? B : C', 'B if A else C', '条件表达式']
      ]
    },
    explanations: [
      {
        title: '返回值是什么意思',
        blocks: [
          { type: 'code', label: 'Python · 返回类型', code: 'def validate_request(request: TaskRequest) -> AgentError | None:' },
          { type: 'text', paragraphs: ['它可能返回两种结果：发现问题时返回 AgentError；没有问题时返回 None。合法请求返回 None 不是忘记返回，而是明确表示“校验通过，没有错误”。'] },
          { type: 'compare', left: { label: 'Python', code: 'error.to_dict() if error else None' }, right: { label: 'JavaScript', code: 'error ? error.toObject() : null' } }
        ]
      },
      {
        title: '为什么这里不使用 raise',
        blocks: [
          { type: 'text', paragraphs: ['T0.4 使用 raise ValueError，因为内部程序制造了矛盾数据，属于开发错误。用户传错路径、漏写目标是正常可预期的业务情况，所以这里返回 AgentError。'] },
          { type: 'table', headers: ['情况', '处理方式'], rows: [
            ['内部数据自相矛盾', 'raise ValueError'],
            ['外部请求不合法', 'return AgentError']
          ]},
          { type: 'text', paragraphs: ['后面的 FakeCodingAgent 会把返回的 AgentError 包装成失败的 TaskResult。'] }
        ]
      },
      {
        title: '校验顺序与提前返回',
        blocks: [
          { type: 'text', paragraphs: ['每次执行 return，函数都会立即结束。因此 validate_request() 只返回遇到的第一个错误。'] },
          { type: 'list', ordered: true, items: ['检查 task_id。', '检查 goal。', '检查路径是否存在。', '检查路径是不是目录。', '全部通过，返回 None。'] },
          { type: 'callout', tone: 'warning', title: '为什么先 exists() 再 is_dir()', text: '不存在的路径当然也不是目录，但先检查存在性可以返回更准确的错误消息。' }
        ]
      }
    ],
    run: {
      command: 'python3 -m python_practice.13_validate_request_demo',
      result: ['合法请求返回 None。', '空 task_id 返回 invalid_request。', '空 goal 返回 invalid_request。', '不存在的仓库返回路径详情。', '文件路径被拒绝为“必须是目录”。', '原有 8 个契约测试全部通过。']
    },
    exercise: {
      prompt: '一个请求同时包含 task_id="   " 和 repository=Path("./missing")。validate_request() 会先返回哪个错误？',
      answer: '先返回 task_id 为空。第一个 if 命中后立即 return，后面的 repository 检查不会执行。'
    }
  },
  {
    id: 't0-6',
    code: 'T0.6',
    title: 'FakeCodingAgent.run()',
    status: 'done',
    statusLabel: '已完成 · 当前暂停点',
    core: '把请求校验连接到统一 TaskResult，让合法任务确定性完成、非法任务确定性失败。',
    targets: [
      { label: '核心代码', path: 'projects/terminal-coding-agent/terminal_agent/fake_agent.py', line: 8, url: `${repoBase}projects/terminal-coding-agent/terminal_agent/fake_agent.py#L8` },
      { label: '演示代码', path: 'projects/terminal-coding-agent/python_practice/14_fake_agent_demo.py', line: 1, url: `${repoBase}projects/terminal-coding-agent/python_practice/14_fake_agent_demo.py#L1` }
    ],
    javascript: `class FakeCodingAgent {
  run(request) {
    const error = validateRequest(request);

    if (error !== null) {
      return new TaskResult({
        taskId: request.taskId.trim() || "unknown",
        status: TaskStatus.FAILED,
        summary: "Task rejected before execution.",
        error,
      });
    }

    return new TaskResult({
      taskId: request.taskId,
      status: TaskStatus.COMPLETED,
      summary: \
        \`Accepted task \${request.taskId} for deterministic execution.\`,
    });
  }
}`,
    python: `class FakeCodingAgent:
    """校验一次任务，并返回不执行真实操作的确定性结果。"""

    def run(self, request: TaskRequest) -> TaskResult:
        error = validate_request(request)
        if error is not None:
            return TaskResult(
                task_id=request.task_id.strip() or "unknown",
                status=TaskStatus.FAILED,
                summary="Task rejected before execution.",
                error=error,
            )

        return TaskResult(
            task_id=request.task_id,
            status=TaskStatus.COMPLETED,
            summary=f"Accepted task {request.task_id} for deterministic execution.",
        )`,
    mapping: {
      headers: ['JavaScript', 'Python', '含义'],
      rows: [
        ['run(request)', 'def run(self, request)', '定义对象方法'],
        ['error !== null', 'error is not None', '校验发现错误'],
        ['new TaskResult({...})', 'TaskResult(...)', '创建统一结果对象'],
        ['value || "unknown"', 'value or "unknown"', '前值为空时使用兜底值'],
        ['`Accepted ${id}`', 'f"Accepted {id}"', '把变量放进字符串'],
        ['return', 'return', '立即结束并返回结果']
      ]
    },
    explanations: [
      {
        title: '为什么先调用 validate_request()',
        blocks: [
          { type: 'text', paragraphs: ['FakeCodingAgent 不重复编写 task_id、goal 和路径检查。请求是否合法由 validate_request() 统一负责，Agent 只负责把校验结果转换成 TaskResult。'] },
          { type: 'callout', tone: 'success', title: '职责分离', text: 'validate_request() 回答“请求能不能启动”；FakeCodingAgent.run() 回答“对调用方返回什么结果”。' }
        ]
      },
      {
        title: '错误分支如何包装结果',
        blocks: [
          { type: 'list', ordered: true, items: ['validate_request() 返回 AgentError。', 'if error is not None 进入失败分支。', '创建 status=FAILED 的 TaskResult。', '把原始 AgentError 放进 error 字段。', 'TaskResult.__post_init__ 再确认失败结果确实携带错误。'] },
          { type: 'text', paragraphs: ['这样 CLI 永远只需要处理 TaskResult，不需要有时接收 AgentError、有时接收普通结果。'] }
        ]
      },
      {
        title: 'task_id.strip() or "unknown" 是什么意思',
        blocks: [
          { type: 'compare', left: { label: 'Python', code: 'request.task_id.strip() or "unknown"' }, right: { label: 'JavaScript', code: 'request.taskId.trim() || "unknown"' } },
          { type: 'text', paragraphs: ['如果 task_id 去掉空白后仍是空字符串，or 会返回右边的 "unknown"。失败结果仍然需要一个可追踪任务编号，不能把全空格原样带到日志和 JSON。'] }
        ]
      },
      {
        title: '为什么它叫 FakeCodingAgent',
        blocks: [
          { type: 'text', paragraphs: ['它不调用模型、不读取文件、不修改代码，也没有 Agent Loop。它只用确定性分支验证 T0 的契约能完整连接起来。'] },
          { type: 'callout', tone: 'warning', title: 'COMPLETED 的范围', text: '这里的 completed 只表示 T0 假流程完成，不代表真实编码任务已经执行。T1 会用显式 Harness Loop 替换这个占位实现。' }
        ]
      }
    ],
    run: {
      command: 'python3 -m python_practice.14_fake_agent_demo',
      result: ['合法请求返回 status=completed，error=None。', '空 task_id 先被 validate_request() 拒绝。', '非法请求返回 status=failed。', '失败结果的 task_id 使用 unknown。', 'AgentError 被完整包装进 TaskResult.error。']
    },
    exercise: {
      prompt: '如果 request.task_id="  task-007  " 且 goal、repository 都合法，成功结果中的 task_id 会保留两端空格，还是变成 task-007？',
      answer: '当前成功分支会保留两端空格，因为它使用 request.task_id 原值；只有失败兜底分支调用了 strip()。这说明“校验合法”与“规范化输入”是两个不同问题。'
    }
  },
  {
    id: 't0-7',
    code: 'T0.7',
    title: 'CLI 边界与退出码',
    status: 'current',
    statusLabel: '下一节',
    core: '用 argparse 接收终端参数，把 TaskResult 输出为 JSON，并用退出码表示成功或失败。',
    preview: '完成教学后再写入正文，不提前把提纲当成课程内容。',
    targets: [
      { label: '核心代码', path: 'projects/terminal-coding-agent/main.py', line: 12, url: `${repoBase}projects/terminal-coding-agent/main.py#L12` }
    ]
  },
  {
    id: 't0-8',
    code: 'T0.8',
    title: '契约测试与 T0 验收',
    status: 'upcoming',
    statusLabel: '待学习',
    core: '用八个测试复盘请求、校验、假 Agent、结果不变量和 JSON 序列化的完整数据流。',
    preview: '完成教学后再写入测试逐条解释、运行结果、故障路径和面试复述。',
    targets: [
      { label: '测试代码', path: 'projects/terminal-coding-agent/tests/test_contracts.py', line: 14, url: `${repoBase}projects/terminal-coding-agent/tests/test_contracts.py#L14` }
    ]
  }
]
