// Phase 11 · 11-caching-cost —— LLM 成本估算
// 纯前端 run(inputs) → { summary, blocks }，对应后端 cost_estimator.py

const PRICING = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'claude-sonnet': { input: 3.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gemini-pro': { input: 1.25, output: 5.00 },
}

function runCostEstimator(inputs) {
  const model = String(inputs.model || '').toLowerCase()
  if (!(model in PRICING)) {
    return {
      summary: `❌ 不支持的模型，可选：${Object.keys(PRICING).join(', ')}`,
      blocks: [],
    }
  }

  const inputTokens = parseInt(inputs.input_tokens, 10)
  const outputTokens = parseInt(inputs.output_tokens, 10)
  const rpd = parseInt(inputs.requests_per_day, 10)
  const dpm = parseInt(inputs.days_per_month, 10)
  if ([inputTokens, outputTokens, rpd, dpm].some((v) => isNaN(v))) {
    return { summary: '❌ token 数与请求量必须是整数', blocks: [] }
  }

  const p = PRICING[model]
  const perReq = (inputTokens / 1_000_000 * p.input) + (outputTokens / 1_000_000 * p.output)
  const daily = perReq * rpd
  const monthly = daily * dpm
  const yearly = monthly * 12

  const cacheRows = []
  for (const hit of [0, 20, 40, 60, 80]) {
    const eff = monthly * (1 - hit / 100)
    const saved = monthly - eff
    cacheRows.push([`${hit}%`, `$${eff.toFixed(2)}`, `$${saved.toFixed(2)}`])
  }

  return {
    summary: `${model} 月度成本约 $${monthly.toFixed(2)}（年度 $${yearly.toFixed(2)}）`,
    blocks: [
      { type: 'keyvalue', label: '成本汇总', items: {
        '单次成本': `$${perReq.toFixed(6)}`,
        '每日成本': `$${daily.toFixed(2)}`,
        '月度成本': `$${monthly.toFixed(2)}`,
        '年度成本': `$${yearly.toFixed(2)}`,
      }},
      { type: 'table', label: '缓存节省对比',
        headers: ['缓存命中率', '实际月成本', '节省'], rows: cacheRows },
    ],
  }
}

export default {
  name: 'cost-estimator',
  displayName: '成本估算',
  phase: '11-llm-engineering',
  lesson: '11 缓存与成本',
  order: 110,
  description: '估算 LLM API 的月度/年度成本，并对比缓存命中率带来的节省',
  inputs: [
    { name: 'model', label: '模型', type: 'select', default: 'gpt-4o',
      options: ['gpt-4o', 'claude-sonnet', 'gpt-4o-mini', 'gemini-pro'] },
    { name: 'input_tokens', label: '输入 token/次', type: 'number', default: 1000 },
    { name: 'output_tokens', label: '输出 token/次', type: 'number', default: 500 },
    { name: 'requests_per_day', label: '每日请求数', type: 'number', default: 1000 },
    { name: 'days_per_month', label: '每月天数', type: 'number', default: 30 },
  ],
  run: runCostEstimator,
}
