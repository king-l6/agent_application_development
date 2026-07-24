import { t0Lessons } from './t0-lessons.js'

const repoBase = 'https://github.com/king-l6/agent_application_development/blob/main/'

export const courseMeta = {
  title: '从契约到 PR，亲手造一个 Coding Agent',
  lede: '这不是框架 API 目录。你会先用 Python 标准库手写 Agent 的控制循环、工具协议、可靠性和安全边界，再接入真实模型、崩溃恢复、Git worktree 与 PR 交付。',
  stats: [
    ['P0–T15', '稳定学习主线'],
    ['约 40h', '含 Python 预备'],
    ['4 个', '阶段验收点'],
    ['1 个', '最终作品项目']
  ],
  stages: [
    ['P0', 'JavaScript 对照 Python', '能阅读、修改和测试 Agent 项目代码', '4–6h'],
    ['T0', '输入、输出、状态与错误契约', '一个确定性退出的 Fake Agent', '1h'],
    ['T1–T4', 'Loop、工具注册、协议、可靠调度', '不依赖模型的工程内核', '6h'],
    ['T5–T7', '计划、验证门、观察预算、沙箱', '可限制、可重规划的执行器', '4.5h'],
    ['T8–T10', '评估、追踪、端到端闭环', '确定性 Coding Agent MVP', '4.5h'],
    ['T11–T13', '真实工具、真实模型、恢复与压缩', '能处理真实仓库的 Agent', '9h'],
    ['T14–T15', 'Worktree、CLI、PR 与最终评测', '可演示的面试作品', '8.5h']
  ]
}

export const courseGroups = [
  { label: '基础与边界', chapters: ['p0', 't0'] },
  { label: '工程内核', chapters: ['t1', 't2', 't3', 't4'] },
  { label: '控制与安全', chapters: ['t5', 't6', 't7'] },
  { label: '质量闭环', chapters: ['t8', 't9', 't10'] },
  { label: '真实 Agent', chapters: ['t11', 't12', 't13'] },
  { label: '生产化交付', chapters: ['t14', 't15'] }
]

export const chapters = [
  {
    id: 'p0',
    code: 'P0',
    title: '用 JavaScript 对照补齐 Python',
    duration: '4–6 小时',
    status: 'done',
    statusLabel: '已完成',
    summary: '只学习项目当前会用到的 Python。重点不是重新学习编程，而是把已经掌握的 JavaScript 概念准确映射到 Python 的语法、对象模型和测试方式。',
    question: '怎样在不脱离 Coding Agent 项目的情况下，快速获得足够的 Python 阅读和修改能力？',
    outcomes: [
      '能解释缩进、函数、类、dataclass 和 Enum',
      '能读懂列表、字典、循环和结构化数据',
      '能抛出并捕获自定义异常',
      '能使用 unittest 验证成功和失败路径'
    ],
    sections: [
      {
        title: '先建立正确的语言映射',
        blocks: [
          { type: 'text', paragraphs: [
            'JavaScript 和 Python 的核心编程概念高度重合：变量、条件、函数、对象、异常和测试都存在。真正需要补的是表达方式与运行时约定。',
            'Python 用缩进定义代码块，用 None 表示空值，用 self 明确接收当前对象，并大量使用 dataclass、Enum 和类型标注表达工程契约。类型标注默认不会在运行时替你校验输入，它首先服务于阅读、编辑器和静态检查。'
          ]},
          { type: 'table', headers: ['JavaScript', 'Python', '项目中的用途'], rows: [
            ['null / undefined', 'None', 'TaskResult 没有错误或没有数据'],
            ['class + constructor', 'class + __init__ / dataclass', 'TaskRequest、TaskResult'],
            ['throw / try / catch', 'raise / try / except', '请求校验和工具失败'],
            ['Object', 'dict', 'JSON、错误 details、工具参数'],
            ['Array', 'list', '计划步骤、消息历史、测试结果'],
            ['Object.freeze 思路', '@dataclass(frozen=True)', '不可变任务请求']
          ]}
        ]
      },
      {
        title: '同一个任务请求，两种语言怎么写',
        blocks: [
          { type: 'compare', left: { label: 'JavaScript', code: `class TaskRequest {
  constructor(taskId, repoPath, goal) {
    this.taskId = taskId
    this.repoPath = repoPath
    this.goal = goal
  }
}

const request = new TaskRequest(
  'task-001',
  '.',
  '修复失败的测试'
)` }, right: { label: 'Python', code: `from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class TaskRequest:
    task_id: str
    repo_path: Path
    goal: str

request = TaskRequest(
    task_id="task-001",
    repo_path=Path("."),
    goal="修复失败的测试",
)` }},
          { type: 'callout', tone: 'success', title: '阅读顺序', text: '先找数据有哪些字段，再看对象在哪里创建，最后看这些字段被谁消费。不要一上来纠结装饰器的底层实现。' }
        ]
      },
      {
        title: 'P0.1–P0.8 的学习顺序',
        blocks: [
          { type: 'table', headers: ['小节', '知识点', '直接练习'], rows: [
            ['P0.1', '文件执行、变量、字符串、print', '输出一张任务卡片'],
            ['P0.2', '布尔值、比较、if/else、缩进', '判断任务状态'],
            ['P0.3', '函数、参数、return、f-string', '构建工具调用消息'],
            ['P0.4', '列表、字典、循环', '生成任务计划'],
            ['P0.5', '类、对象、self、dataclass', '定义任务对象'],
            ['P0.6', 'Enum 和受限状态', '定义 TaskStatus'],
            ['P0.7', '异常、raise、try/except、导入', '实现 ValidationError'],
            ['P0.8', 'unittest、断言、异常测试', '覆盖有效与无效输入']
          ]},
          { type: 'callout', tone: 'warning', title: '完成标准', text: 'P0 完成不代表掌握全部 Python，而是遇到 T0 代码时能说清输入、输出、状态变化和失败路径。' }
        ]
      }
    ],
    practice: {
      title: '给任务请求增加 goal 非空校验',
      steps: ['先用 JavaScript 写出等价判断。', '在 Python 中对 goal.strip() 进行检查。', '无效时抛出 ValidationError。', '用 unittest 同时测试有效目标和全空格目标。'],
      acceptance: ['测试命令退出 0。', '错误消息能指出 goal 无效。', '可以解释 raise 与 return 失败结果的区别。']
    },
    interview: {
      question: '你为什么没有先完整学一遍 Python？',
      answer: '我采用项目驱动的最小学习面，只补 Agent 项目当前需要的语法。这样每个语言概念都立刻落到契约、错误处理或测试中，同时通过持续项目迭代补齐深度。'
    },
    links: [
      ['查看 Python 练习目录', `${repoBase}projects/terminal-coding-agent/python_practice/`],
      ['查看学习进度', `${repoBase}memory/study_progress.md`]
    ]
  },
  {
    id: 't0',
    code: 'T0',
    title: '项目契约与最小骨架',
    duration: '1 小时',
    status: 'current',
    statusLabel: '进行中 · T0.6',
    summary: '先定义 Agent 接收什么、返回什么、怎样表达错误和矛盾状态。此时不接模型，也不设计复杂工具，因为后续所有能力都必须建立在稳定契约上。',
    question: '如果输入、输出和失败语义都不稳定，后续模型、工具和恢复机制要依赖什么？',
    outcomes: [
      '定义不可变 TaskRequest',
      '区分 TaskStatus 与 ErrorCode',
      '让 TaskResult 始终可序列化',
      '用不变量阻止矛盾结果'
    ],
    sections: [
      {
        title: '契约是系统各层的共同语言',
        blocks: [
          { type: 'text', paragraphs: [
            '一次编码任务至少需要任务编号、仓库路径和目标。一次结果至少需要状态、消息、数据和可选错误。错误还需要稳定错误码、是否可重试和结构化详情。',
            '这些对象不是为了显得工程化，而是为了让 CLI、Harness、模型适配器、工具层、持久化和评估系统对“成功、失败、暂停”有同一个定义。'
          ]},
          { type: 'table', headers: ['契约', '回答的问题', '典型字段'], rows: [
            ['TaskRequest', 'Agent 收到什么？', 'task_id、repo_path、goal'],
            ['TaskStatus', '任务处于什么状态？', 'completed、failed、paused'],
            ['AgentError', '为什么失败？', 'code、message、retryable、details'],
            ['TaskResult', '对调用方返回什么？', 'status、message、data、error']
          ]}
        ]
      },
      {
        title: '结果对象必须维护不变量',
        blocks: [
          { type: 'code', label: 'Python · 结果一致性', code: `@dataclass(frozen=True)
class TaskResult:
    status: TaskStatus
    message: str
    data: dict[str, object] | None = None
    error: AgentError | None = None

    def __post_init__(self) -> None:
        if self.status is TaskStatus.COMPLETED and self.error:
            raise ValueError("完成结果不能携带错误")

        if self.status is TaskStatus.FAILED and not self.error:
            raise ValueError("失败结果必须携带错误")` },
          { type: 'text', paragraphs: [
            '__post_init__ 会在 dataclass 初始化完成后立即运行。它适合验证跨字段关系：单个字段类型都正确，并不代表多个字段组合起来是合法状态。',
            '这种检查越靠近对象创建位置越好。否则矛盾结果会流入 CLI、JSON、数据库和评估报告，最后在很远的地方才暴露。'
          ]}
        ]
      },
      {
        title: 'T0 内部八个小节',
        blocks: [
          { type: 'table', headers: ['小节', '主题', '验收'], rows: [
            ['T0.1', 'TaskRequest 与 Path', '请求对象不可变'],
            ['T0.2', 'TaskStatus、TaskResult、to_dict', '成功和失败均可 JSON 序列化'],
            ['T0.3', 'ErrorCode 与 AgentError', '错误可分类且标明 retryable'],
            ['T0.4', '__post_init__ 与不变量', '矛盾结果创建时立即失败'],
            ['T0.5', 'validate_request', '非法任务得到结构化错误'],
            ['T0.6', 'FakeCodingAgent', '确定性接受或拒绝任务'],
            ['T0.7', 'argparse、JSON、退出码', '可从终端稳定调用'],
            ['T0.8', '契约测试与数据流复盘', '测试退出 0，能完整讲解']
          ]},
          { type: 'callout', tone: 'success', title: '当前学习位置', text: 'T0.1–T0.5 已完成并整理为完整课程正文。下一步是 T0.6：FakeCodingAgent.run()。' }
        ]
      }
    ],
    lessons: t0Lessons,
    practice: {
      title: '补齐 TaskResult 的不变量测试',
      steps: ['创建 completed + error 的矛盾结果并断言抛错。', '创建 failed + 无 error 的矛盾结果并断言抛错。', '保留 completed 和 failed 的合法构造测试。'],
      acceptance: ['至少覆盖两个非法组合。', '错误在对象创建时发生。', '合法结果仍可执行 to_dict。']
    },
    interview: {
      question: '为什么先冻结契约，再接入模型和工具？',
      answer: '模型和工具都是可替换组件。先冻结请求、结果、状态和错误语义，可以让 Harness 只依赖稳定协议，避免每换供应商或新增工具就重写整个执行链。'
    },
    links: [
      ['查看契约源码', `${repoBase}projects/terminal-coding-agent/terminal_agent/contracts.py`],
      ['查看契约测试', `${repoBase}projects/terminal-coding-agent/tests/test_contracts.py`]
    ]
  },
  {
    id: 't1',
    code: 'T1',
    title: 'Agent Harness Loop',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '手写 Agent 外部的控制循环。模型只负责提出下一步，Harness 负责状态转换、预算、暂停、验证和最终停止。',
    question: '为什么一次模型调用不是 Agent，而一个受控的状态循环才是 Agent 工程的核心？',
    outcomes: ['画出完整状态转移', '区分完成、暂停和失败', '实现轮次与时间预算', '用 Fake Policy 确定性测试循环'],
    sections: [
      {
        title: 'Agent Loop 是显式状态机',
        blocks: [
          { type: 'text', paragraphs: [
            'Agent 不是无限 while 循环。每一轮都要从当前状态生成决策，执行一个动作，记录观察，再通过验证器决定任务是否完成。',
            '状态应该显式存在，而不是散落在聊天历史和局部变量里。显式状态让暂停、恢复、追踪和测试成为可能。'
          ]},
          { type: 'code', label: 'Python · 最小 Harness 伪代码', code: `state = SessionState.initial(request)

while True:
    budgets.check(state)
    decision = policy.decide(state)

    if decision.kind == "pause":
        return TaskResult.paused(state)

    observation = dispatcher.execute(decision.tool_call)
    state = state.record(decision, observation)

    if verifier.is_complete(state):
        return TaskResult.completed(state)` }
        ]
      },
      {
        title: '停止条件比继续条件更重要',
        blocks: [
          { type: 'table', headers: ['终态', '何时发生', '是否可继续'], rows: [
            ['completed', '验证器确认目标已满足', '通常不继续'],
            ['paused', '预算耗尽、需要人工授权或等待外部条件', '可以恢复'],
            ['failed', '永久错误或状态不一致', '需要新任务或人工修复']
          ]},
          { type: 'callout', tone: 'warning', title: '常见错误', text: '不要把达到最大轮次标成 completed。预算耗尽只说明本次运行必须停止，不代表任务已经完成。' }
        ]
      }
    ],
    practice: {
      title: '实现三个确定性运行场景',
      steps: ['Fake Policy 第一次返回完成动作。', 'Fake Policy 持续动作直到轮次预算耗尽。', 'Fake Policy 主动抛出策略错误。'],
      acceptance: ['三条路径状态不同。', '每轮产生生命周期事件。', '测试不调用任何真实模型。']
    },
    interview: { question: '模型和 Harness 的职责边界是什么？', answer: '模型产生候选决策；Harness 校验决策、执行工具、维护预算和状态、运行验证并决定停止。这样模型可以替换，系统控制权仍在确定性代码中。' }
  },
  {
    id: 't2',
    code: 'T2',
    title: '工具注册表与参数校验',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '建立统一 ToolSpec、注册表和 JSON Schema 子集校验器。模型生成的工具名和参数一律视为不可信输入。',
    question: '怎样让模型知道工具怎么用，同时确保错误参数永远到不了执行器？',
    outcomes: ['定义 ToolSpec', '实现重复注册保护', '输出精确字段错误', '拒绝额外字段和错误类型'],
    sections: [
      {
        title: 'ToolSpec 同时服务模型和运行时',
        blocks: [
          { type: 'code', label: 'Python · 工具定义', code: `ToolSpec(
    name="read_file",
    description="读取工作区内的 UTF-8 文本文件",
    schema={
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "start_line": {"type": "integer"},
        },
        "required": ["path"],
        "additionalProperties": False,
    },
    handler=read_file,
)` },
          { type: 'text', paragraphs: ['description 帮模型选择工具，schema 帮模型构造参数，也让运行时可以在副作用发生前拒绝非法输入。处理器只接收已验证参数。'] }
        ]
      },
      {
        title: '校验错误必须指向精确位置',
        blocks: [
          { type: 'table', headers: ['输入问题', '错误路径', '期望行为'], rows: [
            ['缺少 path', '$.path', '拒绝执行'],
            ['start_line 是字符串', '$.start_line', '返回 expected integer'],
            ['出现未知字段 shell', '$.shell', '返回 additional property'],
            ['工具名不存在', '$.tool', '返回 unknown tool']
          ]},
          { type: 'callout', tone: 'danger', title: '不要自动猜参数', text: '执行层不应该擅自把字符串 "10" 转成整数 10。宽松修复会隐藏模型错误，也会让评估结果失真。' }
        ]
      }
    ],
    practice: { title: '注册 search_text 工具', steps: ['定义 query、path、max_results。', '限制 additionalProperties。', '覆盖缺字段、错类型和重复注册。'], acceptance: ['非法参数不调用 handler。', '错误包含 JSON 路径。', '重复工具名有稳定错误码。'] },
    interview: { question: '为什么 Schema 也是安全边界？', answer: '工具参数来自概率模型，不能直接信任。Schema 在执行副作用前限制字段、类型和必填项，把错误挡在执行器外，同时为模型提供稳定的调用说明。' }
  },
  {
    id: 't3',
    code: 'T3',
    title: 'JSON-RPC 2.0 over stdio',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '手写请求、响应、通知和错误映射，让 Harness 与工具进程解耦，并理解 MCP 等协议在底层解决的通信问题。',
    question: '工具不在同一进程时，怎样可靠地关联请求与响应，并防止 stdout 被普通日志污染？',
    outcomes: ['区分请求与通知', '使用 id 关联响应', '映射标准错误', '处理损坏消息后继续服务'],
    sections: [
      {
        title: '协议定义消息，不定义业务工具',
        blocks: [
          { type: 'compare', left: { label: 'Request', code: `{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {"path": "README.md"}
  }
}` }, right: { label: 'Response', code: `{
  "jsonrpc": "2.0",
  "id": 17,
  "result": {
    "ok": true,
    "content": "# Project"
  }
}` }},
          { type: 'text', paragraphs: ['JSON-RPC 负责 method、params、id、result 和 error 的外壳。工具注册表仍然负责 read_file 的参数和处理器，二者不要揉成一层。'] }
        ]
      },
      {
        title: 'stdio 传输的三条纪律',
        blocks: [
          { type: 'list', ordered: true, items: ['stdout 只输出协议消息，普通日志写 stderr。', '通知没有 id，因此服务端不能回响应。', '每行一条完整 JSON，损坏的一行应返回解析错误并继续读取下一行。'] },
          { type: 'callout', tone: 'warning', title: '关联 ID', text: '并发请求返回顺序可能变化。客户端必须按 id 匹配等待者，不能假设第一个响应属于第一个请求。' }
        ]
      }
    ],
    practice: { title: '实现一个自终止 echo 工具进程', steps: ['支持 request 与 notification。', '故意输入一行损坏 JSON。', '随后发送合法请求并得到正确响应。'], acceptance: ['通知无输出。', '损坏消息不终止服务。', '响应 id 与请求一致。'] },
    interview: { question: 'JSON-RPC、MCP 和工具注册表是什么关系？', answer: 'JSON-RPC 是消息协议，stdio 或 HTTP 是传输，工具注册表描述业务能力；MCP 在这些基础上增加能力协商、工具与资源等标准语义。' }
  },
  {
    id: 't4',
    code: 'T4',
    title: '工具调用调度与可靠性',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '把超时、错误归一化、有限重试、幂等和并发限制集中到 Dispatcher，避免每个工具各自发明一套失败行为。',
    question: '工具失败后何时重试、何时停止，以及怎样避免重试造成重复副作用？',
    outcomes: ['分类临时与永久错误', '实现有限退避重试', '用幂等键去重', '区分重试与 DLQ'],
    sections: [
      {
        title: '先分类，再决定是否重试',
        blocks: [
          { type: 'table', headers: ['失败', '是否重试', '原因'], rows: [
            ['网络暂时不可用', '是，有限次数', '环境可能恢复'],
            ['工具参数非法', '否', '相同输入不会自愈'],
            ['路径越界', '否', '安全拒绝不是临时故障'],
            ['测试进程超时', '视策略', '可能需要缩小任务或增加预算'],
            ['结果已写入但响应丢失', '必须先查幂等记录', '盲目重试会重复副作用']
          ]}
        ]
      },
      {
        title: '幂等键保护副作用',
        blocks: [
          { type: 'code', label: 'Python · 调度器核心', code: `def dispatch(call: ToolCall) -> ToolResult:
    cached = idempotency_store.get(call.idempotency_key)
    if cached is not None:
        return cached

    for attempt in retry_policy.attempts():
        result = run_with_timeout(call)
        if result.ok or not result.retryable:
            idempotency_store.put(call.idempotency_key, result)
            return result

    return ToolResult.exhausted(call)` },
          { type: 'callout', tone: 'success', title: 'DLQ 的位置', text: '重试耗尽后可以把失败信封放入 DLQ 等待人工或后续处理。DLQ 不负责自动重试，它保存的是已经需要处置的失败。' }
        ]
      }
    ],
    practice: { title: '验证相同调用只执行一次', steps: ['让处理器第一次成功但模拟响应丢失。', '使用相同幂等键再次调用。', '统计真实处理器执行次数。'], acceptance: ['执行次数等于 1。', '第二次返回已记录结果。', '永久错误不会进入退避循环。'] },
    interview: { question: '重试、幂等和 DLQ 分别解决什么问题？', answer: '重试处理可能自愈的临时失败；幂等避免重试重复副作用；DLQ 保存重试耗尽或无法自动处理的失败，供后续审查和处置。' }
  },
  {
    id: 't5',
    code: 'T5',
    title: 'Plan / Execute / Replan',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '把自然语言目标变成可审计的类型化步骤，执行后根据新观察更新剩余计划，而不是把一开始的计划当作不可修改脚本。',
    question: '计划如何既能指导执行，又能在仓库现实与初始假设不一致时调整？',
    outcomes: ['定义 PlanStep 状态', '维护计划游标', '记录 PlanDiff', '限制重规划次数'],
    sections: [
      {
        title: '计划是执行状态，不是私有思维链',
        blocks: [
          { type: 'code', label: 'Python · 类型化步骤', code: `PlanStep(
    id="step-2",
    action="run_tests",
    arguments={"target": "tests/test_parser.py"},
    status=StepStatus.PENDING,
    success_condition="测试退出码为 0",
)` },
          { type: 'text', paragraphs: ['计划只保存执行需要的信息：动作、参数、状态和成功条件。它不需要记录模型完整推理过程。这样计划可编辑、可持久化、可比较，也更适合人工审批。'] }
        ]
      },
      {
        title: '重规划必须有触发器和预算',
        blocks: [
          { type: 'table', headers: ['观察', '动作'], rows: [
            ['目标文件不存在', '搜索相关符号并替换后续路径'],
            ['测试暴露新依赖', '插入读取依赖文件步骤'],
            ['同一错误重复出现', '停止盲目重试，触发重规划'],
            ['重规划次数耗尽', '暂停并输出当前证据']
          ]},
          { type: 'callout', tone: 'warning', title: '避免计划抖动', text: '每次小观察都重写全部计划会浪费 token 并破坏可追踪性。优先对剩余步骤生成最小 PlanDiff。' }
        ]
      }
    ],
    practice: { title: '处理“目标文件不存在”', steps: ['创建包含错误路径的初始计划。', '让执行器返回 FILE_NOT_FOUND。', '重规划器加入搜索步骤并替换路径。'], acceptance: ['已完成步骤不被重跑。', 'PlanDiff 可读。', '超过重规划预算后暂停。'] },
    interview: { question: '计划和 Chain-of-Thought 有什么区别？', answer: '计划是可审计的外部执行状态，包含步骤、参数和成功条件；Chain-of-Thought 是模型内部推理。生产系统只需要保存足够驱动和解释执行的计划。' }
  },
  {
    id: 't6',
    code: 'T6',
    title: '验证门与观察预算',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '在工具执行前串联白名单、参数、权限和预算检查，并限制返回给模型的观察大小，防止一次调用把上下文耗尽。',
    question: '允许调用某个工具，是否就等于允许它以任意参数、任意次数、返回任意多内容？',
    outcomes: ['设计短路 GateChain', '区分执行权限与观察权限', '累计观察预算', '输出明确拒绝原因'],
    sections: [
      {
        title: '安全门按成本从低到高执行',
        blocks: [
          { type: 'list', ordered: true, items: ['工具是否在允许列表。', '参数是否通过 Schema。', '路径和权限是否允许。', '轮次、时间和成本预算是否充足。', '外部状态是否仍然新鲜。'] },
          { type: 'text', paragraphs: ['任意一个门拒绝后都不应继续执行后面的昂贵检查，更不能触发工具副作用。GateDecision 要记录 gate 名称、允许与否、原因和可恢复建议。'] }
        ]
      },
      {
        title: '模型看到的结果也需要预算',
        blocks: [
          { type: 'table', headers: ['控制面', '例子', '目的'], rows: [
            ['单次输出上限', '最多返回 200 行', '防止单工具撑爆上下文'],
            ['累计观察预算', '会话最多 60k 字符', '控制长期增长'],
            ['摘要策略', '保留失败断言与文件路径', '压缩但不丢决策证据'],
            ['新鲜度', '文件修改后旧读取作废', '避免基于过期观察决策']
          ]},
          { type: 'callout', tone: 'success', title: '三个不同问题', text: '执行前安全门决定“能不能做”；执行后验证器决定“做对没有”；观察预算决定“模型能看到多少”。' }
        ]
      }
    ],
    practice: { title: '实现观察账本', steps: ['记录每次观察的字符数和来源。', '达到上限后拒绝继续读取。', '为测试失败保留关键行摘要。'], acceptance: ['累计值准确。', '超限不再调用工具。', '拒绝结果包含剩余预算。'] },
    interview: { question: '为什么工具结果也属于安全和可靠性范围？', answer: '工具结果可能包含敏感信息、提示注入或巨量输出。除了限制执行权限，还要限制模型的观察权限、大小和新鲜度，避免污染后续决策。' }
  },
  {
    id: 't7',
    code: 'T7',
    title: '沙箱运行器与路径监狱',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '限制文件路径、可执行命令、运行时间、输出大小和 shell 模式，并明确应用层限制与真正系统沙箱之间的边界。',
    question: '怎样阻止模型生成的路径或命令越过任务工作区，同时不假装这已经等于完整沙箱？',
    outcomes: ['正确解析和比较路径', '禁用任意 shell 拼接', '终止超时进程', '解释容器与路径监狱的边界'],
    sections: [
      {
        title: '路径必须先解析，再验证归属',
        blocks: [
          { type: 'code', label: 'Python · 路径监狱核心', code: `def resolve_inside(root: Path, requested: str) -> Path:
    root = root.resolve()
    target = (root / requested).resolve()

    if target != root and root not in target.parents:
        raise PathEscapeError(requested)

    return target` },
          { type: 'text', paragraphs: ['简单检查字符串是否以 root 开头并不安全，../、符号链接和相似路径前缀都会绕过。必须使用规范化后的真实路径关系。'] }
        ]
      },
      {
        title: '分层理解隔离能力',
        blocks: [
          { type: 'table', headers: ['层', '能解决', '不能解决'], rows: [
            ['参数与路径校验', '常见误用、目录越界', '内核漏洞、恶意二进制'],
            ['受限 subprocess', '超时、环境变量、输出', '网络与系统调用隔离'],
            ['Git worktree', 'Git 状态与用户分支隔离', '操作系统权限隔离'],
            ['容器/VM', '进程、文件系统、网络和资源隔离', '错误授权与宿主配置风险']
          ]},
          { type: 'callout', tone: 'danger', title: '禁止字符串 shell', text: '优先使用参数数组执行子进程，并关闭 shell=True。否则 &&、管道、重定向和命令替换会扩大命令能力。' }
        ]
      }
    ],
    practice: { title: '攻击路径监狱', steps: ['测试 ../ 越界。', '测试相似前缀目录。', '测试指向外部的符号链接。', '测试合法子目录。'], acceptance: ['三种越界全部拒绝。', '合法路径可读取。', '错误结果不泄露额外宿主路径。'] },
    interview: { question: '路径校验为什么不等于沙箱？', answer: '路径校验只限制应用通过该接口访问的文件。真正沙箱还要约束进程权限、系统调用、网络、资源和挂载；生产环境通常需要容器或 VM 等更强隔离。' }
  },
  {
    id: 't8',
    code: 'T8',
    title: '固定任务评估框架',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '用固定仓库任务、确定性验证器和结构化报告评估 Agent，拒绝把“模型说完成了”当成成功证据。',
    question: '提示词或模型升级后，怎样知道系统真的变好，而不是只在一次 Demo 中表现更好？',
    outcomes: ['设计 FixtureTask', '编写确定性 Verifier', '理解 pass@1 与 pass@k', '报告通过率、延迟与成本'],
    sections: [
      {
        title: '任务、运行与验证必须分离',
        blocks: [
          { type: 'table', headers: ['对象', '包含什么', '为什么独立'], rows: [
            ['FixtureTask', '初始仓库、任务描述、限制', '保证每次输入一致'],
            ['AgentRun', '修改、工具轨迹、耗时、成本', '记录实际执行'],
            ['Verifier', '测试、文件断言、静态检查', '不相信 Agent 自述'],
            ['EvalReport', '通过率、失败类型、分位延迟', '支持版本比较']
          ]}
        ]
      },
      {
        title: '指标要能回答工程问题',
        blocks: [
          { type: 'code', label: 'JSON · 单次评估结果', code: `{
  "task_id": "fix-parser-001",
  "passed": true,
  "attempts": 1,
  "latency_ms": 8240,
  "tool_calls": 7,
  "input_tokens": 4120,
  "output_tokens": 980,
  "cost_usd": 0.031,
  "failure_code": null
}` },
          { type: 'callout', tone: 'warning', title: '保留集', text: '调提示和逻辑时不要反复查看全部评测任务。保留一部分未参与调试的任务，才能发现对已知样例的过拟合。' }
        ]
      }
    ],
    practice: { title: '设计两个微型修复任务', steps: ['一个修改纯函数。', '一个补充输入校验。', '分别编写不依赖模型的验证器。'], acceptance: ['任务每次从相同初始状态开始。', '验证器可单独运行。', '报告包含失败分类。'] },
    interview: { question: 'Coding Agent 的成功应该怎样定义？', answer: '由任务外部的确定性验证器定义，例如测试、文件断言和静态检查。Agent 的自然语言完成声明只能作为日志，不能作为评测真值。' }
  },
  {
    id: 't9',
    code: 'T9',
    title: 'OpenTelemetry 追踪与指标',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '为会话、模型调用、工具调用和验证决策建立 trace/span，并累计 token、成本、延迟与错误类型。',
    question: '一次 Agent 运行跨越多轮模型和工具，失败时怎样定位究竟是哪一步、哪一层出了问题？',
    outcomes: ['区分日志、trace 与 metric', '建立父子 span', '记录异常和关键事件', '聚合 token、成本和延迟'],
    sections: [
      {
        title: '一次任务对应一棵追踪树',
        blocks: [
          { type: 'code', label: 'Text · Trace 层级', code: `agent.run                     8.24s
├── planner.create_plan       1.02s
├── tool.search               0.08s
├── model.next_action         1.34s
├── tool.read_file            0.02s
├── tool.edit_file            0.04s
└── verifier.run_tests        5.11s  ERROR` },
          { type: 'text', paragraphs: ['Trace 表示一次任务的完整因果链，span 表示其中一个有起止时间的操作，event 记录 span 内部瞬时事件，metric 用于跨大量运行聚合趋势。'] }
        ]
      },
      {
        title: '记录足够诊断的信息，而不是全部内容',
        blocks: [
          { type: 'table', headers: ['Span', '建议字段'], rows: [
            ['模型调用', 'provider、model、token、stop_reason、latency'],
            ['工具调用', 'tool_name、attempt、timeout、result_code'],
            ['验证器', 'verifier_name、exit_code、passed'],
            ['任务根 span', 'task_id、trace_id、final_status、total_cost']
          ]},
          { type: 'callout', tone: 'danger', title: '敏感内容', text: '不要默认把完整 prompt、源码和环境变量写入追踪。先记录哈希、大小、文件引用和经过脱敏的摘要。' }
        ]
      }
    ],
    practice: { title: '给一次工具调用补齐 span', steps: ['创建父子关系。', '记录工具名、耗时和结果码。', '异常时写入 error 状态。'], acceptance: ['每次调用恰好一个 span。', '失败包含异常事件。', '可以按 tool_name 聚合延迟。'] },
    interview: { question: '普通日志为什么不够？', answer: 'Agent 是多轮、跨组件的执行过程。日志是离散事件；trace 用父子关系还原一次任务的因果链；metric 再从大量 trace 中聚合成功率、延迟和成本。' }
  },
  {
    id: 't10',
    code: 'T10',
    title: '确定性端到端 Coding Agent',
    duration: '1.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '把此前的契约、Loop、工具、计划、安全门、评估和追踪连接成第一个完整版本，但仍由确定性策略驱动。',
    question: '在引入真实模型之前，怎样证明整个工程链路能够稳定完成一次代码修改任务？',
    outcomes: ['连接所有主干接口', '完成固定代码修改', '输出 diff 与测试证据', '产生完整 trace'],
    sections: [
      {
        title: '确定性策略是系统集成测试',
        blocks: [
          { type: 'text', paragraphs: [
            '策略可以提前知道固定任务的步骤：搜索目标函数、读取文件、应用已知修改、运行测试。它不聪明，但能稳定触发真实 Harness 的每个环节。',
            '如果这个版本都不能可靠完成任务，接入真实模型只会增加不确定性，让故障更难定位。'
          ]},
          { type: 'list', ordered: true, items: ['加载固定任务仓库。', '生成类型化计划。', '通过 GateChain 调用搜索、读取和编辑。', '运行测试验证目标。', '输出 diff、结果 JSON 和 trace。'] }
        ]
      },
      {
        title: '端到端完成不等于返回一段文字',
        blocks: [
          { type: 'table', headers: ['输出', '用途'], rows: [
            ['patch / diff', '证明具体改了什么'],
            ['test result', '证明修改满足验证器'],
            ['TaskResult', '给 CLI 或上层系统稳定消费'],
            ['trace.jsonl', '解释每一步和失败位置'],
            ['eval report', '与后续真实模型版本比较']
          ]}
        ]
      }
    ],
    practice: { title: '修复一个固定字符串处理函数', steps: ['用 FixtureTask 复制初始仓库。', '由确定性策略完成搜索、编辑和测试。', '收集最终交付包。'], acceptance: ['测试通过。', 'diff 只包含目标修改。', 'trace 可重建完整步骤。'] },
    interview: { question: '为什么真实模型要到 T12 才接入？', answer: '先用确定性策略验证 Harness、工具、安全、验证和追踪，可以把工程错误与模型决策错误分开。接入模型后，新增的不确定性只集中在决策组件。' }
  },
  {
    id: 't11',
    code: 'T11',
    title: '真实编码工具表面',
    duration: '3 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '实现面向真实仓库的读取、编辑、搜索、测试和受限 Git 工具，并把原始 stdout 转换为模型可决策的结构化观察。',
    question: '工具应该返回多少信息，才能既让模型做出下一步，又不把整个仓库和终端输出塞进上下文？',
    outcomes: ['实现五个核心工具', '生成统一 ToolResult', '提供 diff 预览', '截断并摘要大输出'],
    sections: [
      {
        title: '工具粒度影响 Agent 的决策质量',
        blocks: [
          { type: 'table', headers: ['工具', '关键输入', '结构化输出'], rows: [
            ['read_file', 'path、line range', '内容、实际行号、是否截断'],
            ['edit_file', 'path、expected、replacement', 'changed、diff、冲突原因'],
            ['ripgrep', 'query、path、limit', '文件、行号、片段、总命中数'],
            ['run_tests', 'target、timeout', 'exit code、失败摘要、耗时'],
            ['git', '受限子命令', '分支、状态或 diff，不开放任意命令']
          ]}
        ]
      },
      {
        title: '编辑工具要能发现过期上下文',
        blocks: [
          { type: 'code', label: 'JSON · edit_file 结果', code: `{
  "ok": false,
  "code": "STALE_CONTENT",
  "path": "src/parser.py",
  "message": "expected 文本已不存在",
  "current_excerpt": "def parse(value): ...",
  "retryable": true
}` },
          { type: 'text', paragraphs: ['让模型提交 expected + replacement，比只提交行号更安全。文件在读取后发生变化时，工具可以拒绝覆盖并返回当前片段，促使模型重新读取。'] }
        ]
      }
    ],
    practice: { title: '实现带冲突检测的 edit_file', steps: ['限制工作区路径。', '要求 expected 只出现一次。', '生成统一 diff。', '内容过期时返回 STALE_CONTENT。'], acceptance: ['不覆盖意外内容。', '成功结果包含 diff。', '失败结果足够指导下一步。'] },
    interview: { question: '为什么工具不应该直接返回全部 stdout？', answer: '原始输出常含噪声、重复内容和巨量文本。工具应保留模型决策需要的结构化字段、关键片段和截断信息，降低上下文成本并提高错误可诊断性。' }
  },
  {
    id: 't12',
    code: 'T12',
    title: '模型适配器与真实 Tool Calling',
    duration: '3 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '定义与供应商无关的 ModelAdapter，把不同 SDK 的消息、工具调用和停止原因转换成统一 ModelDecision。',
    question: '怎样接入真实模型，又不让整个 Harness 被某个供应商的响应格式绑死？',
    outcomes: ['定义统一 ModelDecision', '保留 tool call ID', '归一化停止原因', '同时支持 Fake 与真实 Adapter'],
    sections: [
      {
        title: 'Adapter 收敛供应商差异',
        blocks: [
          { type: 'code', label: 'Python · 统一决策协议', code: `@dataclass(frozen=True)
class ModelDecision:
    kind: DecisionKind
    message: str | None = None
    tool_calls: tuple[ToolCall, ...] = ()
    stop_reason: str | None = None
    usage: TokenUsage | None = None

class ModelAdapter(Protocol):
    def decide(self, context: ModelContext) -> ModelDecision:
        ...` },
          { type: 'text', paragraphs: ['Harness 只理解 ModelDecision。OpenAI、Anthropic、本地 vLLM 或录制响应的差异全部留在各自 Adapter 内部。'] }
        ]
      },
      {
        title: '完整 Tool Calling 循环',
        blocks: [
          { type: 'list', ordered: true, items: ['把系统约束、当前计划、工具定义和必要观察组成上下文。', '模型返回一个或多个 tool call。', 'Harness 校验并执行工具。', '用原始 call ID 把工具结果还给模型。', '模型继续决策或给出最终消息。'] },
          { type: 'callout', tone: 'warning', title: '模型最终回答不是最终验收', text: '即使模型说“已经修复”，Harness 仍必须运行外部验证器。模型消息是候选结论，不是成功真值。' }
        ]
      }
    ],
    practice: { title: '用录制响应测试 Adapter', steps: ['保存一次真实供应商响应样例。', '转换为统一 ModelDecision。', '覆盖文本、工具调用和 API 错误。'], acceptance: ['测试离线运行。', 'call ID 不丢失。', 'API 错误不会破坏 SessionState。'] },
    interview: { question: '为什么需要 ModelAdapter？', answer: '不同模型供应商在消息、工具调用、流式事件和使用量字段上不同。Adapter 把差异收敛成统一决策协议，使 Harness、评估和恢复逻辑不依赖具体 SDK。' }
  },
  {
    id: 't13',
    code: 'T13',
    title: '持久化、崩溃恢复与上下文压缩',
    duration: '3 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '保存计划、步骤、预算和副作用状态；进程中断后从检查点继续；上下文过长时压缩旧观察而不破坏恢复不变量。',
    question: 'Agent 崩溃后怎样继续同一任务，并保证已经成功的编辑或命令不会重复执行？',
    outcomes: ['区分事件日志与快照', '恢复计划游标和预算', '避免重复副作用', '压缩但保留关键证据'],
    sections: [
      {
        title: '恢复的是执行状态，不只是聊天记录',
        blocks: [
          { type: 'code', label: 'JSON · 检查点最小形状', code: `{
  "session_id": "run-42",
  "plan_version": 3,
  "next_step_id": "step-5",
  "budgets": {"turns_left": 8, "cost_left": 0.42},
  "completed_effects": ["edit:src/parser.py:sha256..."],
  "last_observation_ref": "observations/0017.json",
  "context_summary_ref": "summaries/0002.md"
}` },
          { type: 'text', paragraphs: ['只保存消息历史无法知道计划执行到哪里、预算剩多少、哪些副作用已经完成。恢复点必须覆盖继续执行所需的全部不变量。'] }
        ]
      },
      {
        title: '上下文压缩要保留决策证据',
        blocks: [
          { type: 'table', headers: ['必须保留', '可以压缩'], rows: [
            ['当前目标与约束', '已解决的早期讨论'],
            ['当前计划与游标', '完整成功工具输出'],
            ['未解决错误和失败断言', '重复搜索结果'],
            ['已修改文件和引用', '旧的中间解释'],
            ['预算与已完成副作用', '可从磁盘重新读取的内容']
          ]},
          { type: 'callout', tone: 'success', title: '原文仍要可追溯', text: '摘要用于模型上下文，不等于删除原始观察。原始事件和工具结果应保存在外部存储中，摘要只保存引用。' }
        ]
      }
    ],
    practice: { title: '在每一步后强制崩溃', steps: ['执行一步后写入检查点。', '强制终止进程。', '重新启动并从 next_step 继续。', '统计已完成副作用次数。'], acceptance: ['不会从头开始。', '副作用不重复。', '预算不会重置。'] },
    interview: { question: 'Agent 恢复为什么比恢复聊天记录复杂？', answer: '执行型 Agent 还要恢复计划游标、预算、工具调用关联、已完成副作用和工作区引用。否则恢复后可能重复修改、重复命令或错误地重新计费。' }
  },
  {
    id: 't14',
    code: 'T14',
    title: 'Git Worktree 隔离与正式 CLI',
    duration: '3.5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '每个任务在独立 worktree 与分支中运行，提供 run、status、resume、cancel 和 clean 命令，并安全处理 Ctrl-C 与残留任务。',
    question: '怎样让 Agent 修改真实仓库，又不污染用户当前分支和未提交工作？',
    outcomes: ['创建任务专属 worktree', '定义 CLI 生命周期', '处理取消与孤儿任务', '执行可恢复的安全清理'],
    sections: [
      {
        title: 'Worktree 隔离 Git 状态',
        blocks: [
          { type: 'code', label: 'Bash · 任务工作区生命周期', code: `git worktree add \
  ../.agent-worktrees/task-42 \
  -b agent/task-42 \
  HEAD

# Agent 只在新目录中修改和提交

git worktree remove \
  ../.agent-worktrees/task-42` },
          { type: 'text', paragraphs: ['用户原目录保持不变，Agent 有自己的索引、工作树和分支。Worktree 解决的是 Git 状态隔离，不代表工具获得了操作系统级沙箱。'] }
        ]
      },
      {
        title: 'CLI 是任务生命周期的正式入口',
        blocks: [
          { type: 'table', headers: ['命令', '职责'], rows: [
            ['agent run', '创建会话、分支、worktree 并启动'],
            ['agent status', '读取持久化状态和最近事件'],
            ['agent resume', '在同一 worktree 从检查点继续'],
            ['agent cancel', '请求停止并保留可恢复状态'],
            ['agent clean', '验证目标后移除安全范围内的资源']
          ]},
          { type: 'callout', tone: 'danger', title: '清理必须保守', text: 'clean 只能删除由系统创建且记录在状态库中的明确路径。不能接受任意目录，更不能对仓库根目录做递归删除。' }
        ]
      }
    ],
    practice: { title: '模拟 Ctrl-C 后恢复', steps: ['启动任务并创建 worktree。', '执行一步后发送中断。', '用 status 查看 paused 状态。', '用 resume 继续同一会话。'], acceptance: ['原工作区无修改。', '恢复使用同一分支和 worktree。', 'clean 不删除用户目录。'] },
    interview: { question: 'Worktree 和容器分别隔离什么？', answer: 'Worktree 隔离分支、索引和工作目录，保护用户当前 Git 状态；容器隔离进程、文件系统权限、网络和资源。真实系统通常需要两者配合。' }
  },
  {
    id: 't15',
    code: 'T15',
    title: 'PR 输出、最终评测与作品集',
    duration: '5 小时',
    status: 'upcoming',
    statusLabel: '待学习',
    summary: '把一次 Agent 运行变成可审查的工程交付：分支、diff、测试证据、追踪、评估报告、失败复盘和可选 PR。',
    question: '怎样证明这个项目不仅能跑一次 Demo，而且能交付、评估、解释失败并作为面试作品？',
    outcomes: ['生成标准交付包', '运行保留任务集', '复盘三类失败', '完成 2–3 分钟架构表达'],
    sections: [
      {
        title: '最终交付包必须可独立审查',
        blocks: [
          { type: 'table', headers: ['材料', '回答的问题'], rows: [
            ['代码 diff', '具体修改了什么？'],
            ['测试与验证结果', '为什么认为任务完成？'],
            ['trace 样例', '每一步怎样发生？'],
            ['评估报告', '整体成功率、延迟和成本如何？'],
            ['威胁模型', '哪些边界已经保护，哪些仍是限制？'],
            ['失败复盘', '系统失败时能否解释和改进？']
          ]}
        ]
      },
      {
        title: 'PR 描述不是模型的自我表扬',
        blocks: [
          { type: 'code', label: 'Markdown · PR 摘要结构', code: `## Summary
- 修复解析器对空输入的处理
- 保持现有公开接口不变

## Verification
- python3 -m unittest discover tests -v
- 18 tests passed

## Evidence
- Trace: artifacts/run-42/trace.jsonl
- Eval task: parser-empty-input

## Limits
- 未覆盖非 UTF-8 输入` },
          { type: 'text', paragraphs: ['最终说明只陈述可验证事实：修改、命令、结果、证据和限制。每一项都应能追溯到工具输出或验证器。'] }
        ]
      },
      {
        title: '面试讲解顺序',
        blocks: [
          { type: 'list', ordered: true, items: ['先讲任务输入到验证输出的八步主流程。', '再讲契约、工具、安全、恢复和评估的故障边界。', '最后说明为什么先手写 Harness，再接模型和框架。', '用三个真实失败案例证明系统可诊断。'] },
          { type: 'callout', tone: 'success', title: '毕业信号', text: '能复现成功只是 Demo；能稳定评估、解释失败、隔离运行并交付审查证据，才是完整的 Agent 工程作品。' }
        ]
      }
    ],
    practice: { title: '运行最终保留任务集', steps: ['冻结 Agent 版本和配置。', '运行从未参与调试的任务。', '汇总成功率、P50/P95 延迟、token 和成本。', '挑选三个失败做根因分析。'], acceptance: ['报告可重复生成。', '失败有稳定分类。', 'README 能说明限制。', '2–3 分钟可讲清系统。'] },
    interview: { question: '你怎样判断一个 Coding Agent 达到可生产化水平？', answer: '先看契约、权限、隔离、恢复和验证是否可靠，再看固定任务集上的成功率、延迟与成本。它还必须保留可审计 trace，能解释失败并输出可审查的代码和测试证据。' },
    links: [
      ['查看项目目录', `${repoBase}projects/terminal-coding-agent/`],
      ['查看完整长期计划', `${repoBase}memory/terminal_coding_agent_learning_plan.md`]
    ]
  }
]
