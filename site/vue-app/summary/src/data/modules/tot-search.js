// Phase 14 · 04-tree-of-thoughts-lats —— Tree of Thoughts 树搜索（代码助手）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 tot_search.py
// 修 parse_duration 的 bug：对比 CoT 一条路走死 vs ToT 多分支+测试打分+回溯。价值函数=跑测试。

const TESTS = [['2h', 7200], ['45m', 2700], ['1h30m', 5400], ['90m', 5400], ['1h', 3600]]

function _digits(s) {
  return s.replace(/\D/g, '')
}

function _buggy(s) {
  // 原始 bug：不分 h/m 一律按分钟
  const n = parseInt(_digits(s), 10)
  return n * 60
}

function _fixA(s) {
  // 假设A：全按小时
  const n = parseInt(_digits(s), 10)
  return n * 3600
}

function _fixB(s) {
  // 假设B：看首个单位，但没处理 h+m 混合
  const d = parseInt(_digits(s), 10)
  return s.includes('h') ? d * 3600 : d * 60
}

function _fixC(s) {
  // 假设C：正则逐段累加（正解）
  let total = 0
  const re = /(\d+)([hm])/g
  let m
  while ((m = re.exec(s)) !== null) {
    total += parseInt(m[1], 10) * (m[2] === 'h' ? 3600 : 60)
  }
  return total
}

const CANDIDATES = { 'A:全按小时': _fixA, 'B:看首个单位': _fixB, 'C:正则逐段累加': _fixC }

function _score(fn) {
  let passed = 0
  const detail = []
  for (const [inp, exp] of TESTS) {
    let got
    try {
      got = fn(inp)
    } catch (e) {
      got = `异常${e.message}`
    }
    const ok = got === exp
    if (ok) passed += 1
    detail.push([inp, exp, String(got), ok ? '✓' : '✗'])
  }
  return [passed, detail]
}

function runTotSearch(inputs) {
  const isTot = String(inputs.strategy || 'ToT').includes('ToT')

  const taskKv = { type: 'keyvalue', label: '任务', items: {
    '任务': '修复 parse_duration(s)：时长串转秒数',
    '测试集': '2h=7200, 45m=2700, 1h30m=5400, 90m=5400, 1h=3600',
    '原始 bug': '不分 h/m 一律按分钟，且没拆开 h+m',
  }}

  if (!isTot) {
    // CoT：押注假设 A，一条路走死
    const [s, detail] = _score(_fixA)
    const blocks = [
      taskKv,
      { type: 'text', label: 'CoT：一条路走到黑',
        content: '第一步直觉：『大概是单位搞错了，全按小时算』→ 押注假设 A，顺着改不回头。' },
      { type: 'table', label: `假设 A 跑测试：${s}/${TESTS.length}`,
        headers: ['用例', '期望', '得到', ''], rows: detail },
      { type: 'text', label: '结果',
        content: 'CoT 没有『退回去换条路』的机制——第一步错了，后面全错，卡死在 2/5。' },
      { type: 'list', label: '要点', items: [
        '思维链是一条线性路径，第一步选错前提，后续全建立在错误之上',
        '24 点游戏上 GPT-4 CoT 只有 4% 正确率，就是栽在这',
      ]},
    ]
    return { summary: `CoT 一条路走死 —— ${s}/${TESTS.length}，卡住`, blocks }
  }

  // ToT：展开 3 个分支，各自打分，回溯选最优
  const scored = []
  const barRows = []
  for (const name of ['A:全按小时', 'B:看首个单位', 'C:正则逐段累加']) {
    const [s, detail] = _score(CANDIDATES[name])
    scored.push([s, name, detail])
    const bar = '█'.repeat(s) + '·'.repeat(TESTS.length - s)
    barRows.push([name, `${bar} ${s}/${TESTS.length}`])
  }
  scored.sort((a, b) => b[0] - a[0])
  const [bestS, bestName, bestDetail] = scored[0]

  const blocks = [
    taskKv,
    { type: 'text', label: 'ToT：多分支 + 自我评估',
      content: '根节点『修 bug』→ 扩展出 3 个分支（3 个候选修法），每个真跑测试当价值函数打分。' },
    { type: 'table', label: '扩展 + 评估：每个分支跑测试打分',
      headers: ['分支（一个想法）', '评分（跑测试）'], rows: barRows },
    { type: 'text', label: '回溯/剪枝', content: `剪掉低分分支，选评分最高的 → ${bestName}` },
    { type: 'table', label: `最优分支 ${bestName}：${bestS}/${TESTS.length}`,
      headers: ['用例', '期望', '得到', ''], rows: bestDetail },
    { type: 'list', label: '要点', items: [
      '节点=一个想法（候选修法），扩展=展开分支，价值函数=跑测试，回溯=按分剪枝选优',
      'ToT 不是模型更聪明，是『不把鸡蛋放一个篮子』+ 用测试客观打分',
      '代码助手的天然优势：单元测试就是免费可靠的价值函数（LATS 在 HumanEval 冲到 92.7%）',
      '代价：探 N 个分支 = N 倍 token。生产里放开关后面：难题才上搜索，简单任务一条 ReAct 搞定',
    ]},
  ]
  return { summary: `ToT 树搜索 —— 回溯选出 ${bestName}，${bestS}/${TESTS.length} 全过`, blocks }
}

export default {
  name: 'tot-search',
  displayName: 'Tree of Thoughts 树搜索（代码助手）',
  phase: '14-agent-engineering',
  lesson: '04 思维树与 LATS',
  order: 40,
  description: '修 parse_duration 的 bug：对比 CoT 一条路走死 vs ToT 多分支+测试打分+回溯。价值函数=跑测试（不调 LLM）',
  inputs: [
    { name: 'strategy', label: '搜索策略', type: 'select', default: 'ToT 树搜索（多分支+回溯）',
      options: ['ToT 树搜索（多分支+回溯）', 'CoT 思维链（一条路走到黑）'],
      help: 'CoT 第一步猜错根因就卡死；ToT 同时探多个假设、按测试分回溯选最优' },
  ],
  run: runTotSearch,
}
