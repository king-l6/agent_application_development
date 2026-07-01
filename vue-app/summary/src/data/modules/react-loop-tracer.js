// Phase 14 · 01-the-agent-loop —— ReAct 循环轨迹器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 react_loop_tracer.py
// 选一个预置任务，本地跑 ReAct 循环，逐步展示「思考 → 行动 → 观察」轨迹、轮次预算、停止条件。

// ── 工具注册表（要素 2）──────────────────────────────────────────
function _calculator(expr) {
  const allowed = new Set('0123456789+-*/(). ')
  for (const c of String(expr)) {
    if (!allowed.has(c)) return 'error: 表达式含非法字符'
  }
  try {
    // 安全求值：字符已被白名单限定为算术符号，用 Function 构造求值
    const val = Function('"use strict"; return (' + expr + ')')()
    return String(val)
  } catch (e) {
    return `error: ${e.name}: ${e.message}`
  }
}

class _KV {
  constructor() {
    this.store = {}
  }
  get(key) {
    return key in this.store ? this.store[key] : `missing:${key}`
  }
  set(key, value) {
    this.store[key] = value
    return `stored ${key}`
  }
}

// ── 预置任务脚本（模拟“蒙眼助手”的剧本）──────────────────────────
// 每步: [thought, tool, args]；末尾 finish
const PRESETS = {
  '含税总额（120 + 15%）': [
    ['先存下基础价', 'kv_set', { key: 'base', value: '120' }],
    ['算 15% 的税', 'calculator', { expr: '120 * 0.15' }],
    ['把税额存起来', 'kv_set', { key: 'tax', value: '18.0' }],
    ['算含税总额', 'calculator', { expr: '120 + 18.0' }],
    ['回读确认基础价', 'kv_get', { key: 'base' }],
    ['__finish__', '含税总额是 138.0', {}],
  ],
  '带一次报错并自我纠正': [
    ['直接算总额（但表达式写错了）', 'calculator', { expr: '120 + 18 +' }],
    ['上一步报错了，改成正确表达式重算', 'calculator', { expr: '120 + 18' }],
    ['__finish__', '纠正后得到 138', {}],
  ],
  '调用不存在的工具（触发未知工具观察）': [
    ['想用一个没注册的工具', 'send_email', { to: 'a@b.com' }],
    ['发现没这个工具，改用计算器', 'calculator', { expr: '1 + 1' }],
    ['__finish__', '改道后得到 2', {}],
  ],
}

function runReactLoopTracer(inputs) {
  const presetKey = String(inputs.preset || '').trim()
  const script = PRESETS[presetKey]
  if (script === undefined) {
    return { summary: `❌ 未知任务：${presetKey}`, blocks: [] }
  }

  let maxTurns = parseInt(inputs.max_turns, 10)
  if (isNaN(maxTurns)) maxTurns = 10
  if (maxTurns < 1) maxTurns = 1

  // 工具注册表（要素 2）
  const kv = new _KV()
  const tools = {
    calculator: _calculator,
    kv_get: (args) => kv.get(args.key),
    kv_set: (args) => kv.set(args.key, args.value),
  }

  function dispatch(name, args) {
    // 观察格式化器（要素 5）：出错也返回字符串，不抛异常。
    const fn = tools[name]
    if (fn === undefined) {
      return `error: 未知工具 '${name}'`
    }
    try {
      return fn(args)
    } catch (e) {
      return `error: ${e.name}: ${e.message}`
    }
  }

  // ── 循环主体 ──────────────────────────────────────────────
  const traceRows = [] // 给前端看的轨迹表
  const buffer = [] // 消息缓冲区（要素 1）
  buffer.push(['user', '（任务开始）', ''])
  let actionCount = 0
  let stopReason = ''
  let finalAnswer = ''
  let cursor = 0
  let brokeOut = false // 模拟 Python for...else

  for (let step = 0; step < maxTurns; step++) {
    // 轮次预算（要素 4）
    if (cursor >= script.length) {
      stopReason = '脚本耗尽（模型没有更多动作）'
      finalAnswer = '(无最终答案)'
      brokeOut = true
      break
    }
    const [thought, action, args] = script[cursor]
    cursor += 1

    // 停止条件（要素 3）：finish
    if (thought === '__finish__') {
      finalAnswer = action
      stopReason = '模型发出 finish'
      traceRows.push([String(traceRows.length), '🏁 finish', '—', finalAnswer])
      brokeOut = true
      break
    }

    // 思考
    traceRows.push([String(traceRows.length), '💭 thought', '—', thought])
    // 行动 + 观察
    const observation = dispatch(action, args)
    actionCount += 1
    const argStr = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ')
    traceRows.push([
      String(traceRows.length),
      '🔧 action',
      `${action}(${argStr})`,
      `→ ${observation}`,
    ])
    buffer.push(['action', action, observation])
  }
  if (!brokeOut) {
    // for 没 break = 转满 max_turns 还没 finish
    stopReason = `轮次预算耗尽（达到 max_turns=${maxTurns}）`
    finalAnswer = '(预算耗尽，未完成)'
  }

  const isRecovered = traceRows.some((r) => r[3].includes('error:'))

  const blocks = [
    { type: 'keyvalue', label: '运行结果', items: {
      '任务': presetKey,
      '最终答案': finalAnswer,
      '停止原因': stopReason,
      '用了几个 action 回合': actionCount,
      '轮次预算 max_turns': maxTurns,
      '可用工具': Object.keys(tools).sort().join('、'),
    }},
    { type: 'table', label: 'ReAct 轨迹（思考 → 行动 → 观察，逐圈）',
      headers: ['#', '类型', '工具调用', '内容 / 观察'], rows: traceRows },
    { type: 'list', label: 'Agent 循环五要素', ordered: false, items: [
      '1. 消息缓冲区 —— 轨迹不断增长，模型每圈都看着全部历史决策',
      '2. 工具注册表 —— 模型只能调注册过的工具，调错名字会得到 error 观察',
      '3. 停止条件 —— finish / 无工具调用 / 超轮次 / 超 token / 触发护栏',
      '4. 轮次预算 —— max_turns 兜底，防止鬼打墙无限循环',
      '5. 观察格式化器 —— 工具出错也转成字符串喂回，模型据此纠正，绝不崩溃',
    ]},
  ]
  if (isRecovered) {
    blocks.push({ type: 'text', label: '自我纠正',
      content: '注意轨迹里出现了 error 观察，但循环没崩——模型读到报错后改了下一步动作。' +
        '这就是 2026 年 CRITIC 风格的纠错：报错也是一种观察。' })
  }

  return {
    summary: `${presetKey} —— ${stopReason}，最终答案：${finalAnswer}`,
    blocks,
  }
}

export default {
  name: 'react-loop-tracer',
  displayName: 'ReAct 循环轨迹器',
  phase: '14-agent-engineering',
  lesson: '01 Agent 循环',
  order: 10,
  description: '选一个任务，本地跑 ReAct 循环，逐步看「思考→行动→观察」轨迹与停止条件（不调 LLM）',
  inputs: [
    { name: 'preset', label: '选择任务', type: 'select',
      default: Object.keys(PRESETS)[0],
      options: Object.keys(PRESETS),
      help: '每个任务是一段预写的思考/行动脚本，模拟模型逐步决策' },
    { name: 'max_turns', label: '轮次预算 (max_turns)', type: 'number', default: 10,
      help: '循环最多转几圈，防止无限循环（要素 4）' },
  ],
  run: runReactLoopTracer,
}
