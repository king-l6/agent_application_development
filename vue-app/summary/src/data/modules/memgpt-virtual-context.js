// Phase 14 · 07-memory-virtual-context-memgpt —— MemGPT 虚拟上下文（代码助手场景）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 memgpt_virtual_context.py
//
// 代码助手处理超长重构会话：上下文窗口塞不下时，把最旧的文件片段换出到
// "磁盘"（外部归档），需要时再 archival_search 换入。类比 OS 虚拟内存：
//   main context = RAM（提示词窗口，固定大小，始终可见）
//   external     = 磁盘（向量存储，无界，可搜索）
//   记忆工具调用 = 缺页中断

// 外部归档（"磁盘"）：每条带来源引用 citation
const MEMGPT_ARCHIVE = [
  { text: 'auth 模块改动：login() 加了 token 判空兜底', cite: 'auth.py:42', tags: ['auth', 'bug'] },
  { text: '项目用 pytest + ruff，禁用 print 调试', cite: 'CONTRIBUTING.md:8', tags: ['约定'] },
  { text: '早期决策：用户表加索引 idx_email 提升登录查询', cite: 'db/schema.sql:15', tags: ['db', 'auth'] },
]

// external → main 的换入：按 tag/词重叠粗排（模拟向量检索）
function memgptSearch(query) {
  const q = new Set(query)
  let best = null
  let bestScore = -1
  for (const r of MEMGPT_ARCHIVE) {
    const chars = new Set(r.text + r.tags.join(''))
    let overlap = 0
    for (const c of q) if (chars.has(c)) overlap++
    if (overlap > bestScore) {
      bestScore = overlap
      best = r
    }
  }
  return best
}

function runMemgptVirtualContext(inputs) {
  let cap = parseInt(inputs.max_slots)
  if (isNaN(cap)) cap = 3
  cap = Math.max(2, Math.min(cap, 5))
  const query = String(inputs.query != null ? inputs.query : '上次 auth 模块怎么改的')

  // 模拟会话：连续打开新文件，灌入主上下文，超容量就换出
  const opens = ['persona: 代码助手', '打开 main.py', '打开 utils.py', '打开 views.py', '打开 models.py']
  const mainCtx = []
  const evicted = []
  const trace = []
  for (const item of opens) {
    mainCtx.push(item)
    if (mainCtx.length > cap) {
      const out = mainCtx.shift()
      evicted.push(out)
      trace.push([`放入 ${item}`, `超容量 → 换出最旧：${out}`, `主区 ${mainCtx.length}/${cap}`])
    } else {
      trace.push([`放入 ${item}`, '未超容量', `主区 ${mainCtx.length}/${cap}`])
    }
  }

  // 换入：检索归档回答 query
  const hit = memgptSearch(query)

  const blocks = [
    { type: 'keyvalue', label: '场景：超长重构会话', items: {
      '类比': 'main=RAM(窗口) / external=磁盘(归档) / 记忆工具=缺页中断',
      '主上下文容量': `${cap} 段`,
      '用户提问': query,
    }},
    { type: 'table', label: 'page-out：主上下文超容量时，最旧的被驱逐到磁盘',
      headers: ['动作', '换页', '主区占用'], rows: trace },
    { type: 'keyvalue', label: '当前分层状态', items: {
      '主上下文（RAM，可见）': mainCtx.join(' | '),
      '已换出（磁盘）': evicted.join(' | ') || '（无）',
    }},
  ]

  if (hit) {
    blocks.push({ type: 'text', label: 'page-in：检索外部归档，换入主上下文回答',
      content: `archival_memory_search('${query}') → 命中：\n  内容：${hit.text}\n  来源：${hit.cite}（归档时存了 citation，回答可溯源）` })
  }
  blocks.push({ type: 'list', label: '要点', items: [
    'self-editing memory：Agent 用 function call 主动改自己的记忆（core_memory_append/replace、archival_insert/search）',
    'vs 简单 RAG：RAG 只读检索；MemGPT 可读可写、把记忆当 OS 分页主动管理',
    '坑：记忆腐烂（写快于读，过时事实淹没检索→定期整合）、记忆投毒（恶意文本被存成记忆）、引用丢失（归档写入存 citation 才能溯源）',
    '递进：08 Letta 扩成三层+睡眠时整合；09 Mem0 混合存储+冲突检测。核心模式都是 MemGPT',
  ]})

  return {
    summary: `换出 ${evicted.length} 段到磁盘，检索换入回答『${query}』`,
    blocks,
  }
}

export default {
  name: 'memgpt-virtual-context',
  displayName: 'MemGPT 虚拟上下文（代码助手）',
  phase: '14-agent-engineering',
  lesson: '07 虚拟上下文',
  order: 70,
  description: '超长重构会话：上下文塞不下→旧文件片段换出『磁盘』，需要时 archival_search 换入。类比 OS 虚拟内存（不调 LLM）',
  inputs: [
    { name: 'max_slots', label: '主上下文容量（能放几段）', type: 'number', default: 3,
      help: '模拟提示词窗口大小，超了就把最旧的换出到磁盘' },
    { name: 'query', label: '用户提问（触发换入）', type: 'select', default: '上次 auth 模块怎么改的',
      options: ['上次 auth 模块怎么改的', '项目用什么测试工具', '登录查询怎么优化的'],
      help: '从外部归档检索相关记忆换入主上下文' },
  ],
  run: runMemgptVirtualContext,
}
