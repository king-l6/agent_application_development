// Phase 14 · 08-memory-blocks-sleep-time-compute —— 记忆块 + 睡眠时计算（代码助手场景）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 memory_blocks_sleep.py
//
// 代码助手在会话里学到项目约定/用户偏好，原始 append 进类型化记忆块；
// 块写满或攒了矛盾时，在助手空闲时跑一个"睡眠时 Agent"离线去重、压缩、
// 失效过时事实——置于关键路径外，主轮次延迟不受影响。

// 主轮次里原始 append 进 project 块的事实（故意有重复和矛盾）
const RAW_FACTS = [
  '用 pytest 跑测试',
  '缩进用 4 空格',
  '禁用 print 调试，用 logging',
  '缩进改用 2 空格',          // 矛盾：推翻上面的 4 空格
  '用 pytest 跑测试',          // 重复
  'lint 用 ruff',
]

// 睡眠时计算：去重 + 失效矛盾（后者推翻前者）+ 压缩。返回 [整洁块, 处理日志]
function sleepConsolidate(facts) {
  const log = []
  const seen = {}
  // 去重
  const deduped = []
  for (const f of facts) {
    if (seen[f]) {
      log.push(`去重：丢弃重复『${f}』`)
      continue
    }
    seen[f] = true
    deduped.push(f)
  }
  // 失效矛盾：缩进 2 空格 推翻 4 空格
  const final = []
  for (const f of deduped) {
    if (f.includes('4 空格') && deduped.some(g => g.includes('2 空格'))) {
      log.push('失效：『缩进用 4 空格』被新事实『2 空格』推翻 → 标记 INVALID')
      continue
    }
    final.push(f)
  }
  return [final, log]
}

function runMemoryBlocksSleep(inputs) {
  const runSleep = String(inputs.run_sleep != null ? inputs.run_sleep : '运行').includes('运行（巩固')
  let limit = parseInt(inputs.block_limit)
  if (isNaN(limit)) limit = 60

  const rawValue = RAW_FACTS.join('；')
  const near = rawValue.length >= limit * 0.8

  const blocks = [
    { type: 'keyvalue', label: '类型化记忆块', items: {
      '三个记忆块': 'human(用户偏好) / project(项目约定) / task(当前任务)',
      '本例操作的块': 'project',
      '块字符上限': limit,
    }},
    { type: 'table', label: '主轮次：只管快速写入原始事实，不做整理',
      headers: ['轮', '主 Agent 原始 append（快，关键路径上）'],
      rows: RAW_FACTS.map((f, i) => [i + 1, f]) },
    { type: 'keyvalue', label: '巩固前：原始块（膨胀 + 矛盾）', items: {
      'project 块当前值': rawValue,
      '字符数': `${rawValue.length} / ${limit}（${near ? '接近上限 ⚠' : '未超'}）`,
      '问题': '有重复『用 pytest』、矛盾『4空格 vs 2空格』',
    }},
  ]

  let summary
  if (runSleep) {
    const [final, log] = sleepConsolidate(RAW_FACTS)
    const finalValue = final.join('；')
    blocks.push({ type: 'list', label: '睡眠时 Agent（空闲时离线跑，关键路径外）', items: log })
    blocks.push({ type: 'keyvalue', label: '巩固后：整洁块', items: {
      'project 块巩固后': finalValue,
      '字符数': `${finalValue.length} / ${limit}（已压缩）`,
      '版本': 'v2（带 diff，主 Agent 可见变更）',
    }})
    blocks.push({ type: 'text', label: '为什么移出关键路径',
      content: '关键属性：去重/失效/压缩都在主 Agent 空闲时做，主轮次延迟一点没增加。因为不受延迟约束，睡眠 Agent 可以用更强更慢的模型。' })
    summary = `睡眠时计算：${RAW_FACTS.length}条→${final.length}条（去重+失效矛盾）`
  } else {
    blocks.push({ type: 'text', label: '不巩固的后果',
      content: '不跑睡眠时计算：块会无限膨胀、矛盾事实共存，检索时『4空格』和『2空格』都召回，助手无所适从。把开关切到『运行』看巩固效果。' })
    summary = '未巩固：记忆块膨胀 + 矛盾共存'
  }

  blocks.push({ type: 'list', label: '要点', items: [
    '记忆块=核心层里类型化、持久、LLM 可编辑的片段（label/value/limit/description）',
    '睡眠时计算=空闲时跑第二个 Agent 做去重/摘要/巩固/失效，置于关键路径外',
    'vs MemGPT(07)：那是虚拟上下文换页（控制流），但操作全在关键路径；本课加结构(块)+移出关键路径(睡眠)',
    'vs Reflexion(03)：那是即时自省写经验；睡眠时计算是离线异步巩固长期记忆，互补',
    '坑：块膨胀(写入前接摘要器)、静默漂移(睡眠改了块要版本化+显示diff)、投毒巩固(睡眠接口也要安全审查)',
    '成本权衡：值得用在『会话长、记忆反复矛盾、有明显空闲窗口』的场景',
  ]})

  return { summary, blocks }
}

export default {
  name: 'memory-blocks-sleep',
  displayName: '记忆块 + 睡眠时计算（代码助手）',
  phase: '14-agent-engineering',
  lesson: '08 记忆块+睡眠时计算',
  order: 80,
  description: '会话里学到的项目约定 append 进记忆块（有重复+矛盾）；空闲时睡眠时 Agent 离线去重/压缩/失效过时事实，主轮次延迟不受影响（不调 LLM）',
  inputs: [
    { name: 'run_sleep', label: '运行睡眠时计算', type: 'select', default: '运行（巩固后）',
      options: ['运行（巩固后）', '不运行（看原始膨胀）'],
      help: '对比巩固前后的记忆块；睡眠 Agent 在关键路径外，不影响主轮次延迟' },
    { name: 'block_limit', label: '记忆块字符上限', type: 'number', default: 60,
      help: '块接近上限要摘要压缩' },
  ],
  run: runMemoryBlocksSleep,
}
