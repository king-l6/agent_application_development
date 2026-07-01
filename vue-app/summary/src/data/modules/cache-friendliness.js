// Phase 11 · 15-prompt-caching —— 缓存友好度分析
// 纯前端 run(inputs) → { summary, blocks }，对应后端 cache_friendliness.py

// 会破坏前缀缓存的"动态内容"特征：出现在系统提示顶部就每次未命中
const DYNAMIC_PATTERNS = [
  [/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/i, '时间戳 (YYYY-MM-DD HH:MM)'],
  [/\d{2}:\d{2}:\d{2}/i, '时钟时间 (HH:MM:SS)'],
  [/当前时间|current time|now\(\)|datetime\.now|时间戳|timestamp/i, '动态时间字段'],
  [/会话 ?ID|session[_ ]?id|request[_ ]?id|trace[_ ]?id|uuid/i, '随请求变化的 ID'],
  [/随机|random|nonce/i, '随机值'],
]

// 缓存友好布局：稳定的放上面，可变的放下面
const CACHE_FRIENDLY_LAYOUT = [
  ['系统提示', '稳定 → 缓存'],
  ['工具定义', '稳定 → 缓存'],
  ['少样本示例', '稳定 → 缓存'],
  ['检索到的文档', '复用才缓存，否则不缓存'],
  ['对话历史', '缓存到最近一轮'],
  ['当前用户消息', '永远不缓存（每次不同）'],
]

// Anthropic 25% 写入溢价下，不同复用次数的平均成本倍数。
function breakevenTable() {
  const rows = []
  const writeCost = 1.25 // 写入按 1.25x
  const readCost = 0.10 // 读取按 0.10x
  for (const reads of [1, 2, 3, 5, 10]) {
    const total = writeCost + readCost * reads
    const requests = 1 + reads
    const avg = total / requests
    rows.push({
      '复用读取次数': reads,
      '平均成本倍数': Math.round(avg * 1000) / 1000,
      '节省': `${Math.round((1 - avg) * 100)}%`,
    })
  }
  return rows
}

function runCacheFriendliness(inputs) {
  const text = (inputs.text || '').trim()
  if (!text) {
    return { summary: '❌ 请贴入一段系统提示或前缀', blocks: [] }
  }

  // 检测破坏前缀缓存的动态内容
  const breakers = []
  for (const [pattern, label] of DYNAMIC_PATTERNS) {
    if (pattern.test(text)) breakers.push(label)
  }

  const tokenEst = Math.max(1, Math.floor(text.length / 4))
  const meetsMin = tokenEst >= 1024

  // 友好度打分：满足最小块 0.5，无破坏点 0.5
  let score = meetsMin ? 0.5 : (tokenEst / 1024) * 0.5
  score += breakers.length === 0 ? 0.5 : 0.0
  score = Math.round(Math.min(score, 1.0) * 100) / 100

  let verdict
  if (breakers.length) {
    verdict = `发现 ${breakers.length} 个会破坏前缀缓存的动态内容`
  } else if (!meetsMin) {
    verdict = `约 ${tokenEst} token，低于 1024 最小可缓存量，不会被缓存`
  } else {
    verdict = '前缀稳定且足够长，适合缓存'
  }

  const beRows = breakevenTable().map((r) => [
    String(r['复用读取次数']),
    String(r['平均成本倍数']),
    r['节省'],
  ])

  return {
    summary: `缓存友好度 ${Math.round(score * 100)}% —— ${verdict}`,
    blocks: [
      { type: 'score', label: '缓存友好度', value: score, max: 1.0, hint: verdict },
      { type: 'keyvalue', label: '分析结果', items: {
        '估算 token': tokenEst,
        '满足最小块(1024)': meetsMin ? '是' : '否',
        '检测到的破坏点': breakers.length ? breakers.join('、') : '无',
      }},
      { type: 'table', label: '盈亏平衡(Anthropic 25% 写入溢价)',
        headers: ['复用读取次数', '平均成本倍数', '节省'], rows: beRows },
      { type: 'list', label: '缓存友好布局（稳定的放顶部，可变的放底部）', ordered: true,
        items: CACHE_FRIENDLY_LAYOUT.map(([sec, note]) => `${sec} — ${note}`) },
    ],
  }
}

export default {
  name: 'cache-friendliness',
  displayName: '缓存友好度分析',
  phase: '11-llm-engineering',
  lesson: '15 前缀缓存',
  order: 150,
  description: '分析一段前缀对前缀缓存是否友好，检测破坏命中的翻车点（本地，不调 LLM）',
  inputs: [
    { name: 'text', label: '系统提示 / 前缀', type: 'textarea',
      placeholder: '把你打算缓存的系统提示贴进来，例如一大段角色设定 + 工具定义' },
  ],
  run: runCacheFriendliness,
}
