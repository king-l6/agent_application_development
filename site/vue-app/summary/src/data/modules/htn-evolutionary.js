// Phase 14 · 11-planning-htn-and-evolutionary —— HTN 规划 + 进化搜索
// 纯前端 run(inputs) → { summary, blocks }，对应后端 htn_evolutionary.py
//
// 两个 demo 二选一：
//   - HTN（分层任务网络）：把大任务按"前提→效果"骨牌式拆成可执行步骤，
//     顺序由规则强制保证（跳步会被拦），所以构造上正确。没现成方法时
//     回退问 AI，AI 的建议必须通过验证才采纳，问过就缓存下次不再问。
//   - 进化搜索（AlphaEvolve 式）：一群随机解 → 打分 → 留最好的 → 变异生
//     下一批 → 再筛，自动逼近最优。前提是"能机器自动打分"。

// ── Python 兼容随机数（MT19937 + seed=0），保证进化搜索序列与后端逐位一致 ──
class PyRandom {
  constructor(seed) {
    this.mt = new Uint32Array(624)
    this.mti = 625
    this.seedInt(seed)
  }
  initGenrand(s) {
    const mt = this.mt
    mt[0] = s >>> 0
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      const lo = prev & 0xffff, hi = prev >>> 16
      const res = ((((1812433253 * hi) & 0xffff) << 16) + 1812433253 * lo) >>> 0
      mt[i] = (res + i) >>> 0
    }
    this.mti = 624
  }
  initByArray(key) {
    this.initGenrand(19650218)
    const mt = this.mt
    let i = 1, j = 0
    let k = Math.max(624, key.length)
    for (; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      const lo = prev & 0xffff, hi = prev >>> 16
      const mul = ((((1664525 * hi) & 0xffff) << 16) + 1664525 * lo) >>> 0
      mt[i] = (((mt[i] ^ mul) >>> 0) + key[j] + j) >>> 0
      i++; j++
      if (i >= 624) { mt[0] = mt[623]; i = 1 }
      if (j >= key.length) j = 0
    }
    for (k = 623; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      const lo = prev & 0xffff, hi = prev >>> 16
      const mul = ((((1566083941 * hi) & 0xffff) << 16) + 1566083941 * lo) >>> 0
      mt[i] = (((mt[i] ^ mul) >>> 0) - i) >>> 0
      i++
      if (i >= 624) { mt[0] = mt[623]; i = 1 }
    }
    mt[0] = 0x80000000
  }
  seedInt(n) {
    n = Math.abs(n)
    const key = []
    if (n === 0) key.push(0)
    while (n > 0) { key.push(n >>> 0); n = Math.floor(n / 4294967296) }
    this.initByArray(key)
  }
  genrandUint32() {
    const mt = this.mt
    let y
    const UPPER = 0x80000000, LOWER = 0x7fffffff
    if (this.mti >= 624) {
      let kk
      for (kk = 0; kk < 624 - 397; kk++) {
        y = ((mt[kk] & UPPER) | (mt[kk + 1] & LOWER)) >>> 0
        mt[kk] = (mt[kk + 397] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0
      }
      for (; kk < 623; kk++) {
        y = ((mt[kk] & UPPER) | (mt[kk + 1] & LOWER)) >>> 0
        mt[kk] = (mt[kk + (397 - 624)] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0
      }
      y = ((mt[623] & UPPER) | (mt[0] & LOWER)) >>> 0
      mt[623] = (mt[396] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0
      this.mti = 0
    }
    y = mt[this.mti++]
    y ^= y >>> 11
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0
    y ^= y >>> 18
    return y >>> 0
  }
  getrandbits(k) { return this.genrandUint32() >>> (32 - k) }
  randbelow(n) {
    if (n <= 0) return 0
    const k = n.toString(2).length
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }
  randint(a, b) { return a + this.randbelow(b - a + 1) }
  choice(seq) { return seq[this.randbelow(seq.length)] }
}

// ── HTN：操作符（最小动作，带前提和效果）──────────────────────
const OPERATORS = {
  open_editor: [['logged_in'], 'editor_open'],
  write_tests: [['editor_open'], 'tests_written'],
  run_tests: [['tests_written'], 'tests_passing'],
  open_pr: [['tests_passing'], 'pr_open'],
}
// 现成方法（菜谱）：大任务怎么拆
const METHODS = {
  '发布代码变更': ['open_editor', 'write_tests', 'run_tests', 'open_pr'],
}
// 脚本化"AI"：遇到没菜谱的任务回退问它
const LLM_SCRIPTS = {
  '带数据库迁移的新功能': ['open_editor', 'write_tests', 'run_tests', 'open_pr'],
}

// 返回 [blocks, summary]。把 HTN 拆解每一步摊成表
function htnDemo(task) {
  const rows = []          // 执行轨迹
  const llmCalls = []
  const state = new Set(['logged_in'])

  let method = METHODS[task]
  let usedLlm = false
  if (method === undefined) {
    // 回退问 AI
    const suggested = LLM_SCRIPTS[task]
    llmCalls.push(task)
    usedLlm = true
    if (suggested === undefined) {
      return [[{ type: 'text', label: '结果', content: `AI 也不会拆 '${task}'，规划失败` }],
        '规划失败：无方法、AI 也无建议']
    }
    // 验证：每步都得是已知动作
    if (!suggested.every(s => s in OPERATORS)) {
      return [[{ type: 'text', label: '结果', content: 'AI 建议里有不认识的步骤 → 拒绝（防瞎编）' }],
        '规划失败：AI 建议未通过验证']
    }
    method = suggested
  }

  // 按顺序执行，边走边查前提、加效果
  for (const step of method) {
    const [preconds, effect] = OPERATORS[step]
    const ok = preconds.every(p => state.has(p))
    rows.push([
      step,
      preconds.join('、'),
      ok ? '✓ 满足' : '✗ 缺前提',
      effect,
      [...state].sort().join('、'),
    ])
    if (!ok) {
      return [[{ type: 'table', label: 'HTN 执行轨迹',
        headers: ['步骤', '前提', '前提检查', '产生效果', '执行前已知事实'], rows }],
        `规划失败：${step} 前提不满足`]
    }
    state.add(effect)
  }

  const blocks = [
    { type: 'keyvalue', label: 'HTN 规划结果', items: {
      '任务': task,
      '拆解来源': !usedLlm ? '现成方法（菜谱）' : 'AI 回退（已验证+已缓存）',
      '问 AI 次数': llmCalls.length,
      '最终计划': method.join(' → '),
    }},
    { type: 'table', label: '执行轨迹（骨牌：上一步的效果 = 下一步的前提）',
      headers: ['步骤', '前提', '前提检查', '产生效果', '执行前已知事实'], rows },
    { type: 'list', label: '要点', items: [
      '任务/方法/操作符/状态：大任务→按方法拆→落到带前提-效果的最小动作',
      '为什么保证正确：每步执行前查前提，跳步/乱序会被拦下（构造上正确）',
      'ChatHTN：没现成方法才问 AI，AI 建议必须过验证才采纳（LLM 当放大器不当主力）',
      '在线方法学习：问过的拆法缓存下来，下次同任务不再问 AI（省 75% 调用）',
      "适合：调度、合规、审批等'绝不能出错'的流程",
    ]},
  ]
  const src = !usedLlm ? '现成菜谱' : 'AI回退并缓存'
  return [blocks, `HTN 规划成功（${src}）：${method.join(' → ')}`]
}

// 打分：a*x+b 与目标 3x+7 的总误差（越小越好，0=完美）
function fitness(a, b) {
  let total = 0.0
  for (let x = -5; x <= 5; x++) {
    total += (3 * x + 7 - (a * x + b)) ** 2
  }
  return total
}

function evoDemo(generations) {
  const rng = new PyRandom(0)
  let pop = []
  for (let i = 0; i < 6; i++) pop.push([rng.randint(-10, 10), rng.randint(-10, 10)])
  pop = pop.map(([a, b]) => [a, b, fitness(a, b)]).sort((x, y) => x[2] - y[2])

  const genRows = [['第0代（随机）', `a=${pop[0][0]} b=${pop[0][1]}`, `${pop[0][2].toFixed(0)}`]]
  let convergedAt = null
  for (let gen = 1; gen <= generations; gen++) {
    const survivors = pop.slice(0, 3)
    const children = []
    for (const [a, b] of survivors) {
      for (let j = 0; j < 3; j++) {
        const da = rng.choice([-2, -1, 0, 1, 2]), db = rng.choice([-2, -1, 0, 1, 2])
        children.push([a + da, b + db, fitness(a + da, b + db)])
      }
    }
    pop = survivors.concat(children).sort((x, y) => x[2] - y[2]).slice(0, 6)
    const best = pop[0]
    genRows.push([`第${gen}代`, `a=${best[0]} b=${best[1]}`, `${best[2].toFixed(0)}`])
    if (best[2] === 0 && convergedAt === null) {
      convergedAt = gen
      break
    }
  }

  const best = pop[0]
  const blocks = [
    { type: 'keyvalue', label: '进化搜索结果', items: {
      '任务': '找 a,b 使 a*x+b 等于目标 3x+7（答案 a=3 b=7）',
      '打分方式': '算和目标的总误差，越小越好，0=完美（必须能机器自动打分）',
      '收敛代数': convergedAt ? `第 ${convergedAt} 代找到完美解` : `${generations} 代内最优`,
      '最终解': `a=${best[0]} b=${best[1]}，误差=${best[2].toFixed(0)}`,
    }},
    { type: 'table', label: '每代最优误差（一代代往下掉 = 进化）',
      headers: ['代', '本代最优', '误差'], rows: genRows },
    { type: 'list', label: '要点', items: [
      '循环四步：挑最好的3个 → 各变异生3个孩子 → 爹妈+孩子一起打分 → 留最好的6个',
      '精英保留：爹妈也参与竞争，所以最好成绩只降不升（不退步）',
      '硬前提：必须能机器自动打分。写诗/散文无法自动评分 → 进化搜索用不了',
      'AlphaEvolve 真实战绩：改进 56 年的矩阵乘法、省 Google 0.7% 算力、FlashAttention 提速 32%',
      "vs HTN：HTN 求'对'(一个保证正确的计划)，进化求'最好'(一堆方案挑最优)",
    ]},
  ]
  const tail = convergedAt ? `第 ${convergedAt} 代收敛到 a=3 b=7` : `${generations} 代内最优 a=${best[0]} b=${best[1]}`
  return [blocks, `进化搜索：${tail}`]
}

function runHtnEvolutionary(inputs) {
  const demo = String(inputs.demo != null ? inputs.demo : 'HTN 规划（保证正确）')

  let blocks, summary
  if (demo.includes('HTN')) {
    const task = String(inputs.htn_task != null ? inputs.htn_task : '发布代码变更')
    ;[blocks, summary] = htnDemo(task)
  } else {
    let gens = parseInt(inputs.generations)
    if (isNaN(gens)) gens = 10
    gens = Math.max(1, Math.min(gens, 50))
    ;[blocks, summary] = evoDemo(gens)
  }

  // 两个方法的共同收尾
  blocks.push({ type: 'text', label: '何时用：默认 ReAct，这俩是特殊场景',
    content: '两者都把 AI 当放大器、不当主力，且都比 ReAct 重——非必要先用 ReAct。HTN：符号层保证正确，AI 只在没方法时补充；进化：确定性打分器选优，AI 只负责变异。' })

  return { summary, blocks }
}

export default {
  name: 'htn-evolutionary',
  displayName: 'HTN 规划 + 进化搜索',
  phase: '14-agent-engineering',
  lesson: '11 规划(HTN+进化)',
  order: 110,
  description: "两种重型规划法：HTN 按前提-效果骨牌式拆任务(保证正确，适合合规/调度)；进化搜索打分→筛选→变异自动逼近最优(适合有自动评分的优化)。不调 LLM",
  inputs: [
    { name: 'demo', label: '选择方法', type: 'select', default: 'HTN 规划（保证正确）',
      options: ['HTN 规划（保证正确）', '进化搜索（找最优）'],
      help: "HTN 求'对'，进化搜索求'最好'——两种重型规划法" },
    { name: 'htn_task', label: 'HTN 任务', type: 'select', default: '发布代码变更',
      options: ['发布代码变更', '带数据库迁移的新功能'],
      help: '第一个有现成菜谱(不问AI)；第二个没菜谱→回退问AI→验证→缓存' },
    { name: 'generations', label: '进化代数上限', type: 'number', default: 10,
      help: '进化搜索最多跑几代（通常 6 代左右就收敛）' },
  ],
  run: runHtnEvolutionary,
}
