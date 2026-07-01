// Phase 14 · 02-rewoo-plan-and-execute —— ReWOO 计划器（代码助手）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 rewoo_planner.py
// 选一个代码任务，看 ReWOO 先规划后执行的全过程（计划DAG→证据→求解）+ 和 ReAct 的 token 对比。

// 证据引用占位符：#E1 #E2 ...
const _REF = /#E\d+/g

// ── 预置代码助手任务：每个是一段 ReWOO 计划（id, 工具, 参数, 依赖说明）──
// 参数里的 #E1 表示“用第 1 步的输出”。evidence 是模拟的工具返回。
const TASKS = {
  '重命名函数 get_user → fetch_user': {
    request: '把 get_user 重命名为 fetch_user，所有调用处都改',
    plan: [
      ['E1', 'grep', { pattern: 'def get_user' }, '找函数定义'],
      ['E2', 'grep', { pattern: 'get_user(' }, '找所有调用点'],
      ['E3', 'rename_symbol', { defs: '#E1', calls: '#E2', to: 'fetch_user' }, '依赖 E1+E2 做改名'],
      ['E4', 'run_tests', {}, '验证没改坏'],
    ],
    evidence: {
      E1: 'user/service.py:42',
      E2: '5 处：api.py:8, view.py:15, view.py:31, task.py:77, test_user.py:12',
      E3: '已改 1 处定义 + 5 处调用 → fetch_user',
      E4: '测试 23 passed',
    },
    answer: '已将 get_user 重命名为 fetch_user：1 处定义 + 5 处调用，测试 23 passed ✓',
  },
  '给 utils.py 全部函数加类型注解': {
    request: '给 utils.py 里所有函数补上类型注解',
    plan: [
      ['E1', 'list_functions', { file: 'utils.py' }, '列出所有函数'],
      ['E2', 'infer_types', { functions: '#E1' }, '依赖 E1 推断每个函数签名类型'],
      ['E3', 'apply_annotations', { edits: '#E2' }, '依赖 E2 写回注解'],
      ['E4', 'run_type_check', {}, 'mypy 校验'],
    ],
    evidence: {
      E1: '8 个函数：load, save, parse, fmt, ...',
      E2: '推断出 8 个签名，2 个需 Optional',
      E3: '已为 8 个函数写入注解',
      E4: 'mypy: no issues found',
    },
    answer: '已为 utils.py 的 8 个函数补全类型注解，mypy 通过 ✓',
  },
  '排查登录接口偶发 500 错误': {
    request: '登录接口偶发 500，帮我定位原因',
    plan: [
      ['E1', 'grep_logs', { pattern: '500', route: '/login' }, '捞出错日志'],
      ['E2', 'find_handler', { route: '/login' }, '找处理函数'],
      ['E3', 'static_analyze', { target: '#E2', clue: '#E1' }, '依赖 E1+E2 静态分析可疑点'],
    ],
    evidence: {
      E1: "12 条 500，集中在 KeyError: 'token'",
      E2: 'auth/views.py:login()',
      E3: "login() 未判空就取 request['token']，空请求体即崩",
    },
    answer: "根因：auth/views.py login() 直接取 request['token']，请求体缺 token 时 KeyError→500。建议加判空兜底。",
  },
}

function _resolve(value, evidence) {
  // 把参数里的 #E1 替换成已得证据；执行前看不到的就保留占位符。
  if (typeof value !== 'string') return value
  return value.replace(_REF, (m) => {
    const key = m.slice(1)
    return key in evidence ? evidence[key] : m
  })
}

// Python str(dict) 的近似：用于粗略字符计数与占位符查找
function _argsStr(args) {
  return JSON.stringify(args)
}

function runRewooPlanner(inputs) {
  const taskKey = String(inputs.task || '').trim()
  const task = TASKS[taskKey]
  if (task === undefined) {
    return { summary: `❌ 未知任务：${taskKey}`, blocks: [] }
  }

  const request = task.request
  const plan = task.plan
  const evidence = task.evidence

  // 1. Planner：计划 DAG（占位符未替换的原始计划）
  const planRows = []
  for (const [sid, tool, args, note] of plan) {
    const argStr = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ') || '（无参数）'
    const refs = _argsStr(args).match(_REF) || []
    const dep = refs.length ? refs.join('、') : '—'
    planRows.push([sid, `${tool}(${argStr})`, dep, note])
  }

  // 2. Workers：按计划执行，#E1 替换成真实证据
  const workerRows = []
  for (const [sid, tool, args] of plan) {
    const bound = {}
    for (const [k, v] of Object.entries(args)) bound[k] = _resolve(v, evidence)
    const boundStr = Object.entries(bound).map(([k, v]) => `${k}=${v}`).join(', ') || '（无参数）'
    workerRows.push([sid, `${tool}(${boundStr})`, `→ ${sid in evidence ? evidence[sid] : '?'}`])
  }

  // 3. Solver：最终答复
  const answer = task.answer

  // 4. token 对比（粗略字符数，模拟论文的 shape）
  // ReWOO：规划提示 + 每步小提示（无历史）+ 求解一次
  let rewooChars = request.length
  for (const [, t, a] of plan) rewooChars += t.length + _argsStr(a).length // planner
  for (const [s, , a] of plan) rewooChars += _argsStr(a).length + (s in evidence ? evidence[s] : '').length // workers
  rewooChars += request.length + answer.length // solver
  // ReAct：每步都重复带 request + 之前全部历史
  let reactChars = 0
  let history = 0
  for (const [s, t, a] of plan) {
    reactChars += request.length + history + t.length + _argsStr(a).length
    history += t.length + _argsStr(a).length + (s in evidence ? evidence[s] : '').length + 40
  }
  reactChars += request.length + history
  const ratio = reactChars / Math.max(rewooChars, 1)

  const blocks = [
    { type: 'keyvalue', label: '任务', items: {
      '用户需求': request,
      '最终答复': answer,
      '计划步数': plan.length,
    }},
    { type: 'table', label: '1. Planner：一次性规划整张 DAG（#E1 是占位符，规划时不看结果）',
      headers: ['步', '工具调用（计划时）', '依赖', '这步干嘛'], rows: planRows },
    { type: 'table', label: '2. Workers：按依赖顺序执行，#E1 换成真实证据',
      headers: ['步', '工具调用（执行时，占位符已替换）', '证据'], rows: workerRows },
    { type: 'text', label: '3. Solver：汇总证据成最终答复', content: answer },
    { type: 'keyvalue', label: 'token 对比（ReWOO 不把历史塞回 prompt）', items: {
      'ReAct 字符数': reactChars,
      'ReWOO 字符数': rewooChars,
      'ReWOO 省了': `${ratio.toFixed(2)}x（步骤越多省越多，论文 HotpotQA 测到 ~5x）`,
    }},
    { type: 'list', label: '要点', items: [
      'ReWOO = 先规划后执行，把『想』和『做』解耦',
      'Planner 不看观察 → 可以用小模型(7B)规划、大模型执行（规划器蒸馏）',
      '失败定位是按节点的：哪个 E 出错一目了然，不用从历史里重推',
      '代价是死板：计划一次定死，执行中发现意外改不了 → 那就用 Plan-and-Execute（带重规划）',
    ]},
  ]

  return {
    summary: `${taskKey} —— ${plan.length} 步计划，ReWOO 比 ReAct 省 ${ratio.toFixed(2)}x token`,
    blocks,
  }
}

export default {
  name: 'rewoo-planner',
  displayName: 'ReWOO 计划器（代码助手）',
  phase: '14-agent-engineering',
  lesson: '02 ReWOO 计划执行',
  order: 20,
  description: '选一个代码任务，看 ReWOO 先规划后执行的全过程（计划DAG→证据→求解）+ 和 ReAct 的 token 对比（不调 LLM）',
  inputs: [
    { name: 'task', label: '选择代码任务', type: 'select',
      default: Object.keys(TASKS)[0],
      options: Object.keys(TASKS),
      help: '每个任务对应一段 ReWOO 计划，本地模拟执行' },
  ],
  run: runRewooPlanner,
}
