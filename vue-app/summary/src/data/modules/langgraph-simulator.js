// Phase 11 · 16-langgraph-state-machines —— ReAct 状态图模拟器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 langgraph_simulator.py
// 输入一个任务描述，本地模拟一个 LangGraph ReAct 图怎么跑：判断是否 Agent 形状、
// 画出四节点拓扑、模拟一次执行的检查点序列 + 工具中断点。本地运行，不调 LLM。

// 暗示"需要工具/多步骤/分支"的信号词 → 任务呈 Agent 形状
const TOOL_HINTS = [
  ['计算|算一下|多少|加减乘除|求和|\\d+\\s*[\\+\\-\\*/]', 'calculator（算术）'],
  ['查询|搜索|查一下|检索|search|lookup|地址|总部', 'web_lookup（检索）'],
  ['删除|退款|下单|支付|修改|写入|发送', '副作用工具（需人工审批）'],
]
const BRANCH_HINTS = ['如果', '否则', '判断', '分支', '重试', '循环', 'then', 'if']

function runLangGraphSimulator(inputs) {
  const task = ((inputs.task || '') + '').trim()
  if (!task) {
    return { summary: '❌ 请输入一个任务描述', blocks: [] }
  }
  const interrupt = (inputs.interrupt_before_tools || '是') === '是'

  // 1. 检测会用到哪些工具
  const matchedTools = []
  for (const [pattern, label] of TOOL_HINTS) {
    if (new RegExp(pattern, 'i').test(task)) {
      matchedTools.push(label)
    }
  }
  const hasBranch = BRANCH_HINTS.some(kw => task.toLowerCase().includes(kw))

  // 2. 是否 Agent 形状（需要工具 or 有分支 → 值得画成图）
  const signals = matchedTools.length + (hasBranch ? 1 : 0)
  const isAgentShaped = signals >= 1
  const score = Math.min(signals / 2, 1.0)

  let verdict
  if (isAgentShaped) {
    verdict = `Agent 形状（命中 ${matchedTools.length} 类工具` + (hasBranch ? '，含条件分支' : '') + '）→ 适合画成 StateGraph'
  } else {
    verdict = '单步问答，一次 LLM 调用即可，不必上图'
  }

  // 3. 模拟检查点序列
  const checkpoints = [
    { '#': 0, '节点': '__start__', '最后消息': '—', '下一步': 'agent' },
    { '#': 1, '节点': 'agent', '最后消息': '👤 用户任务', '下一步': 'agent' },
  ]
  if (matchedTools.length) {
    checkpoints.push({ '#': 2, '节点': 'agent', '最后消息': '🤖 模型想调工具', '下一步': 'tools' })
    if (interrupt) {
      checkpoints.push({ '#': 3, '节点': '__interrupt__', '最后消息': '⏸ 暂停等审批', '下一步': 'tools' })
    }
    checkpoints.push({ '#': checkpoints.length, '节点': 'tools', '最后消息': '🔧 工具结果', '下一步': 'agent' })
    checkpoints.push({ '#': checkpoints.length, '节点': 'agent', '最后消息': '🤖 最终答案', '下一步': '（结束）' })
  } else {
    checkpoints.push({ '#': 2, '节点': 'agent', '最后消息': '🤖 直接回答', '下一步': '（结束）' })
  }

  const cpRows = checkpoints.map(c => [String(c['#']), c['节点'], c['最后消息'], c['下一步']])

  const blocks = [
    { type: 'score', label: 'Agent 形状度', value: Math.round(score * 10000) / 10000, max: 1.0, hint: verdict },
    { type: 'keyvalue', label: '任务分析', items: {
      '判定': isAgentShaped ? '🟢 Agent 形状' : '⚪ 非 Agent 形状',
      '可能用到的工具': matchedTools.length ? matchedTools.join('、') : '无',
      '含条件分支': hasBranch ? '是' : '否',
      '工具前中断': interrupt ? '开启（副作用前暂停审批）' : '关闭',
    }},
    { type: 'text', label: '四节点 ReAct 图拓扑', content:
      'agent ──(有 tool_calls?)──> tools ──> agent\n' +
      '  └──(没有)──> END' },
    { type: 'table', label: '模拟检查点序列（每步自动存档）',
      headers: ['#', '节点', '最后消息', '下一步'], rows: cpRows },
    { type: 'list', label: 'LangGraph 四大超能力', ordered: true, items: [
      '检查点 — 每次节点转换落盘，用 thread_id 可从断点恢复',
      "中断 — interrupt_before=['tools'] 在副作用前暂停等人工批准",
      "流式 — stream(mode='updates') 实时推送每个节点更新",
      '时光回溯 — get_state_history() 拿历史，从任意检查点分叉重放',
    ]},
    { type: 'text', label: '⚠️ reducer 提醒', content:
      'messages 字段必须标 Annotated[list, add_messages]，否则新消息会覆盖而非追加——LangGraph 头号坑。' },
  ]

  return {
    summary: `${isAgentShaped ? '🟢 Agent 形状' : '⚪ 非 Agent 形状'} —— ${verdict}`,
    blocks,
  }
}

export default {
  name: 'langgraph-simulator',
  displayName: 'ReAct 状态图模拟',
  phase: '11-llm-engineering',
  lesson: '16 LangGraph 状态机',
  order: 160,
  description: '输入一个任务，模拟 LangGraph ReAct 图的节点/边/检查点/中断（本地，不调 LLM）',
  inputs: [
    { name: 'task', label: '任务描述', type: 'textarea', default: '',
      placeholder: '例如：请用 calculator 计算 (17*23+100)，如果结果超过 400 就提醒我' },
    { name: 'interrupt_before_tools', label: '工具执行前人工审批', type: 'select',
      default: '是', options: ['是', '否'],
      help: "开启后，图会在执行工具前暂停（interrupt_before=['tools']），等人工批准" },
  ],
  run: runLangGraphSimulator,
}
