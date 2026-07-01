// Phase 14 · 03-reflexion-verbal-rl —— Reflexion 自我反思（代码助手）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 reflexion_coder.py
// 写函数→跑测试→失败→写反思→带反思重试→通过。对比无记忆（卡死）vs 开记忆（反思一次就纠对）。

// ── 任务：实现 roman_to_int（罗马数字转整数），代码助手每天都在干的活 ──
const _VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

const _TESTS = [
  ['III', 3],
  ['LVIII', 58],
  ['IX', 9], // 减法：I 在 X 左边 = 9
  ['IV', 4], // 减法：I 在 V 左边 = 4
  ['MCMXCIV', 1994], // 多处减法：CM=900, XC=90, IV=4
]

function _attemptNaive(s) {
  // 第 1 版：天真地把每个字符的值加起来，没考虑减法规则。
  let total = 0
  for (const c of s) total += _VALUES[c]
  return total
}

function _attemptWithSubtraction(s) {
  // 第 2 版：处理减法——当前值小于右边值就减去它。
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (i + 1 < s.length && _VALUES[c] < _VALUES[s[i + 1]]) {
      total -= _VALUES[c]
    } else {
      total += _VALUES[c]
    }
  }
  return total
}

function _actor(memory) {
  // Actor：根据记忆里有没有「减法」教训，决定交出哪一版实现。
  // 真实世界这一步是 LLM：prompt = 任务 + 历史反思，输出一段代码。
  if (memory.some((r) => r.includes('减法'))) {
    return ['attempt_with_subtraction', _attemptWithSubtraction]
  }
  return ['attempt_naive', _attemptNaive]
}

function _evaluator(fn) {
  // Evaluator：跑测试，返回 [通过?, 第一个失败详情]。
  for (const [inp, expected] of _TESTS) {
    let got
    try {
      got = fn(inp)
    } catch (e) {
      return [false, { input: inp, expected, got: `异常 ${e.message}` }]
    }
    if (got !== expected) {
      return [false, { input: inp, expected, got }]
    }
  }
  return [true, null]
}

function _selfReflector(implName, failure) {
  // SelfReflector：把失败详情翻译成一条人话经验。
  const inp = failure.input
  if (implName === 'attempt_naive') {
    return (
      `测试 '${inp}' 失败（期望 ${failure.expected}，得到 ${failure.got}）：` +
      '我只是把每个字符的值相加，忽略了罗马数字的减法规则——' +
      '当小的数字出现在大的数字左边时（如 IX、IV、CM），应做减法而不是加法。' +
      '下次写之前先判断 当前值 < 右边值。'
    )
  }
  return `测试 '${inp}' 仍失败：期望 ${failure.expected}，得到 ${failure.got}。需进一步排查。`
}

function runReflexionCoder(inputs) {
  const useMemory = !String(inputs.use_memory || '开').includes('关')
  let maxTrials = parseInt(inputs.max_trials, 10)
  if (isNaN(maxTrials)) maxTrials = 4
  maxTrials = Math.max(1, Math.min(maxTrials, 10))

  const memory = [] // EpisodicMemory
  const trialRows = [] // 每次尝试一行
  const reflections = [] // 写入记忆的反思（展示用）
  let passedAt = null

  for (let trial = 1; trial <= maxTrials; trial++) {
    const [implName, fn] = _actor(memory)
    const [ok, failure] = _evaluator(fn)

    const memNote = useMemory ? `记忆里 ${memory.length} 条反思` : '无记忆'
    if (ok) {
      trialRows.push([trial, implName, '5/5 通过 ✓', memNote])
      passedAt = trial
      break
    }

    const failStr = `'${failure.input}' 期望 ${failure.expected}，得 ${failure.got}`
    trialRows.push([trial, implName, `失败：${failStr}`, memNote])

    if (useMemory) {
      const reflection = _selfReflector(implName, failure)
      memory.push(reflection)
      reflections.push(`第 ${trial} 次后：${reflection}`)
    }
  }

  // 任务/结果摘要
  let resultLine
  if (passedAt) {
    resultLine = `第 ${passedAt} 次尝试通过 ✓`
  } else {
    resultLine = `${maxTrials} 次用完仍未通过`
  }

  const blocks = [
    { type: 'keyvalue', label: '任务', items: {
      '任务': '实现 roman_to_int(s)：罗马数字转整数',
      '测试集': 'III=3, LVIII=58, IX=9, IV=4, MCMXCIV=1994',
      '记忆开关': useMemory ? '开（Reflexion）' : '关（Baseline）',
      '结果': resultLine,
    }},
    { type: 'table', label: '主循环：Actor 写 → Evaluator 测 →（失败）SelfReflector 反思 → 写入 Memory → 重试',
      headers: ['尝试', 'Actor 交出的实现', 'Evaluator 跑测试', '记忆状态'], rows: trialRows },
  ]

  if (useMemory) {
    if (reflections.length) {
      blocks.push({ type: 'list', label: 'SelfReflector 写进 EpisodicMemory 的反思（下次塞回 prompt）',
        items: reflections })
    }
    blocks.push({ type: 'text', label: '为什么这是『学习』',
      content: '模型参数一个字没改。变的只是 prompt 里多了一条『上次踩的坑』。' +
        '这就是 verbal（语言的）reinforcement learning——用人话纠偏，不用梯度重训。' +
        '这跟 fine-tuning 的本质区别：反思是即时的、可读的、不用重新训练。' })
  } else {
    blocks.push({ type: 'text', label: '为什么卡死',
      content: '无记忆时 LLM 是纯函数：同样的 prompt 永远给同样的输出。失败信息丢进垃圾桶，' +
        '下次还从零想，又写出同一版傻代码 → 死循环。把记忆打开再跑一次对比。' })
  }

  blocks.push({ type: 'list', label: '要点', items: [
    'Actor=写代码的 LLM；Evaluator=pytest/CI；SelfReflector=总结为啥错的 LLM；Memory=攒下的经验',
    '反思要具体可执行（『IX 这类要做减法』），不能是空话（『下次小心点』）',
    '记忆会膨胀：生产里要做衰减/TTL/按相关性召回，不能无脑全塞',
    'Evaluator 必须可靠：评分器有噪声时，反思可能学歪 → 反而更糟',
  ]})

  return {
    summary: `${useMemory ? 'Reflexion 开记忆' : 'Baseline 无记忆'} —— ${resultLine}`,
    blocks,
  }
}

export default {
  name: 'reflexion-coder',
  displayName: 'Reflexion 自我反思（代码助手）',
  phase: '14-agent-engineering',
  lesson: '03 Reflexion 语言强化',
  order: 30,
  description: '写函数→跑测试→失败→写反思→带反思重试→通过。对比无记忆（卡死）vs 开记忆（反思一次就纠对），看 verbal RL（不调 LLM）',
  inputs: [
    { name: 'use_memory', label: '情景记忆', type: 'select', default: '开（Reflexion）',
      options: ['开（Reflexion）', '关（Baseline）'],
      help: '关=Baseline：失败信息丢弃，每次从同一 prompt 出发，写出同一版错代码' },
    { name: 'max_trials', label: '最大尝试次数', type: 'number', default: 4,
      help: '用完仍未通过就停（1-10）' },
  ],
  run: runReflexionCoder,
}
