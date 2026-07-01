// Phase 11 · 05-context-engineering —— 上下文预算 & 工具选择
// 纯前端 run(inputs) → { summary, blocks }，对应后端 context_budget_planner.py
// 内联移植了 adapters/context_engine.py 的 classify_intent / select_tools / ContextBudget / count_tokens

function countTokens(text) {
  if (!text) return 0
  return Math.floor(text.split(/\s+/).filter(Boolean).length * 1.3)
}

// 工具注册表（演示用，模拟真实 Agent 的工具集）
const TOOL_REGISTRY = {
  read_file: { desc: '读取文件内容', tokens: 120, intents: ['code', 'files'] },
  write_file: { desc: '将内容写入文件', tokens: 150, intents: ['code', 'files'] },
  search_code: { desc: '在代码库中搜索模式', tokens: 130, intents: ['code'] },
  run_command: { desc: '执行 shell 命令', tokens: 140, intents: ['code', 'system'] },
  web_search: { desc: '在网络上搜索信息', tokens: 140, intents: ['research'] },
  query_db: { desc: '在数据库上运行 SQL', tokens: 170, intents: ['code', 'data'] },
  send_email: { desc: '发送邮件消息', tokens: 200, intents: ['email'] },
  list_emails: { desc: '列出最近的邮件', tokens: 160, intents: ['email'] },
  create_event: { desc: '创建新的日历事件', tokens: 180, intents: ['calendar'] },
  generate_chart: { desc: '从数据生成图表', tokens: 190, intents: ['data', 'viz'] },
}

// 基于关键词的意图分类
function classifyIntent(query) {
  const intentKw = {
    code: ['代码', '函数', '错误', '文件', '实现', '重构', '调试', 'bug', 'fix', 'write', 'code'],
    calendar: ['会议', '日程', '日历', '预约', 'meeting', 'schedule'],
    email: ['邮件', '发送', '收件箱', 'email', 'send', 'inbox'],
    research: ['搜索', '查找', '什么', '如何', '解释', 'search', 'find', 'what', 'how'],
    data: ['数据', '查询', '数据库', '图表', 'sql', 'data', 'query', 'chart'],
  }
  const q = query.toLowerCase()
  const scores = {}
  for (const [intent, keywords] of Object.entries(intentKw)) {
    const score = keywords.filter((kw) => q.includes(kw)).length
    if (score > 0) scores[intent] = score
  }
  if (Object.keys(scores).length === 0) return ['code']
  const maxS = Math.max(...Object.values(scores))
  return Object.entries(scores).filter(([, v]) => v >= maxS * 0.5).map(([k]) => k)
}

// 根据查询意图动态选择工具
function selectTools(query, budget = 2000) {
  const intents = classifyIntent(query)
  const selected = {}
  let total = 0
  for (const [name, tool] of Object.entries(TOOL_REGISTRY)) {
    if (tool.intents.some((i) => intents.includes(i))) {
      if (total + tool.tokens <= budget) {
        selected[name] = tool
        total += tool.tokens
      }
    }
  }
  return [selected, total]
}

// 上下文预算管理器——跟踪每个组件的 Token 使用
class ContextBudget {
  constructor(maxTokens = 128000, genReserve = 4000) {
    this.maxTokens = maxTokens
    this.genReserve = genReserve
    this.available = maxTokens - genReserve
    this.allocations = new Map()
  }

  allocate(component, content, maxTokens = null) {
    let tokens = countTokens(content)
    if (maxTokens && tokens > maxTokens) {
      const words = content.split(/\s+/).filter(Boolean)
      const target = Math.floor(maxTokens / 1.3)
      content = words.slice(0, target).join(' ')
      tokens = countTokens(content)
    }
    const used = [...this.allocations.values()].reduce((a, b) => a + b, 0)
    if (used + tokens > this.available) {
      const allowed = this.available - used
      if (allowed <= 0) return [null, 0]
      const words = content.split(/\s+/).filter(Boolean)
      const target = Math.floor(allowed / 1.3)
      content = words.slice(0, target).join(' ')
      tokens = countTokens(content)
    }
    this.allocations.set(component, tokens)
    return [content, tokens]
  }

  remaining() {
    return this.available - [...this.allocations.values()].reduce((a, b) => a + b, 0)
  }

  utilization() {
    return [...this.allocations.values()].reduce((a, b) => a + b, 0) / this.maxTokens
  }

  report(queryType = '') {
    const totalUsed = [...this.allocations.values()].reduce((a, b) => a + b, 0)
    const items = []
    for (const [comp, tokens] of this.allocations) {
      const pct = Math.round((tokens / Math.max(this.maxTokens, 1)) * 100 * 10) / 10
      items.push({ component: comp, tokens, pct })
    }
    return {
      query_type: queryType,
      max_tokens: this.maxTokens,
      gen_reserve: this.genReserve,
      total_used: totalUsed,
      remaining: this.remaining(),
      utilization_pct: Math.round(this.utilization() * 100 * 10) / 10,
      items,
    }
  }
}

function runContextBudgetPlanner(inputs) {
  const query = (inputs.query || '').trim()
  if (!query) {
    return { summary: '❌ 请输入一个用户查询', blocks: [] }
  }

  let maxTokens = parseInt(inputs.max_tokens, 10)
  if (isNaN(maxTokens)) maxTokens = 8000
  const systemPrompt = (inputs.system_prompt || '你是一个有用的助手。').trim()

  // 意图 + 工具选择
  const intents = classifyIntent(query)
  const [tools] = selectTools(query, Math.min(2000, Math.floor(maxTokens / 4)))

  // 预算分配
  const budget = new ContextBudget(maxTokens, Math.floor(maxTokens / 8))
  budget.allocate('系统提示', systemPrompt, 500)
  const toolNames = Object.keys(tools)
  if (toolNames.length) {
    const toolDesc = Object.values(tools).map((t) => t.desc).join(' ')
    budget.allocate('工具定义', toolDesc, 2000)
  }
  budget.allocate('用户查询', query)
  const report = budget.report()

  const budgetRows = report.items.map((item) => [
    item.component, item.tokens, `${item.pct}%`,
  ])

  const toolItems = toolNames.length
    ? toolNames.map((name) => `${name} —— ${tools[name].desc}（约 ${tools[name].tokens} token）`)
    : ['（本次查询未命中任何工具）']

  return {
    summary: `意图 ${JSON.stringify(intents)}，选中 ${toolNames.length} 个工具，利用率 ${report.utilization_pct}%`,
    blocks: [
      { type: 'keyvalue', label: '预算概览', items: {
        '识别意图': intents.join(', '),
        '窗口大小': `${maxTokens} token`,
        '生成预留': `${report.gen_reserve} token`,
        '已用': `${report.total_used} token`,
        '剩余': `${report.remaining} token`,
        '利用率': `${report.utilization_pct}%`,
      }},
      { type: 'list', label: '动态选中的工具', items: toolItems, ordered: false },
      { type: 'table', label: '预算分配明细',
        headers: ['组件', 'Token', '占窗口比'], rows: budgetRows },
    ],
  }
}

export default {
  name: 'context-budget-planner',
  displayName: '上下文预算规划',
  phase: '11-llm-engineering',
  lesson: '05 上下文工程',
  order: 50,
  description: '输入查询，看意图分类、动态工具选择与 token 预算分配（本地，不调 LLM）',
  inputs: [
    { name: 'query', label: '用户查询', type: 'textarea',
      placeholder: '例如：帮我读取 config.py 文件并修复里面的 bug' },
    { name: 'max_tokens', label: '上下文窗口', type: 'number', default: 8000,
      help: '模型的 context window 大小' },
    { name: 'system_prompt', label: '系统提示', type: 'textarea',
      default: '你是一个有用的编程助手。', placeholder: '可改成你自己的系统提示' },
  ],
  run: runContextBudgetPlanner,
}
