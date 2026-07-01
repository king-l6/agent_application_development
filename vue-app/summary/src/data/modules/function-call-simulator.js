// Phase 11 · 09-function-calling —— 工具调用模拟器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 function_call_simulator.py
// 输入一句自然语言请求，本地决定该调用哪个工具、生成 tool_call 参数、真实执行并返回结果。
// 路由用关键词而非 LLM，所以本地可跑、不烧 API。

const WEATHER_DB = {
  'tokyo': { temp_c: 18, condition: 'cloudy', humidity: 72 },
  '东京': { temp_c: 18, condition: 'cloudy', humidity: 72 },
  'new york': { temp_c: 22, condition: 'sunny', humidity: 45 },
  '纽约': { temp_c: 22, condition: 'sunny', humidity: 45 },
  'london': { temp_c: 12, condition: 'rainy', humidity: 88 },
  '伦敦': { temp_c: 12, condition: 'rainy', humidity: 88 },
}

function calculator(expression) {
  const allowed = new Set('0123456789+-*/.() '.split(''))
  if (![...expression].every(c => allowed.has(c))) {
    return { error: `表达式含非法字符: ${expression}` }
  }
  try {
    // 只允许算术字符，安全求值
    const result = Function(`"use strict"; return (${expression})`)()
    return { result: Math.round(parseFloat(result) * 10000) / 10000, expression }
  } catch (e) {
    return { error: String(e.message || e) }
  }
}

function getWeather(city) {
  const key = (city + '').toLowerCase().trim()
  if (!(key in WEATHER_DB)) {
    return { error: `未收录城市「${city}」`, '可用': Object.keys(WEATHER_DB) }
  }
  const data = { ...WEATHER_DB[key] }
  data.city = city
  return data
}

// 关键词路由：返回 [tool_name, arguments] 或 [null, null]
function route(query) {
  const q = query.toLowerCase()

  // 计算器：抓数学表达式
  const mathExpr = query.match(/[-+]?[\d.]+\s*[-+*/]\s*[\d.][\d.+\-*/() ]*/)
  if (mathExpr || ['计算', '算一下', '等于', 'calculate'].some(w => q.includes(w))) {
    const expr = mathExpr ? mathExpr[0].trim() : ''
    if (expr) {
      return ['calculator', { expression: expr }]
    }
  }

  // 天气
  if (['天气', '气温', 'weather', 'temperature'].some(w => q.includes(w))) {
    for (const city of Object.keys(WEATHER_DB)) {
      if (q.includes(city)) {
        return ['get_weather', { city }]
      }
    }
    return ['get_weather', { city: '(未识别到城市)' }]
  }

  return [null, null]
}

const TOOL_FUNCS = { calculator: (a) => calculator(a.expression), get_weather: (a) => getWeather(a.city) }

function runFunctionCallSimulator(inputs) {
  const query = ((inputs.query || '') + '').trim()
  if (!query) {
    return { summary: '❌ 请输入一句请求', blocks: [] }
  }

  const [tool, args] = route(query)
  if (tool === null) {
    return {
      summary: '模型判断：无需调用工具，直接回答即可',
      blocks: [{ type: 'text', label: '无工具调用', content:
        '这句话没有触发任何已注册工具（calculator / get_weather）。\n' +
        '真实场景下模型会直接用自身知识回答。\n' +
        '试试：『计算 (15+27)*3』或『伦敦天气怎么样』。' }],
    }
  }

  // 模拟 tool_call 协议结构
  const toolCall = {
    type: 'function',
    function: { name: tool, arguments: args },
  }
  const result = TOOL_FUNCS[tool](args)

  return {
    summary: `模型决定调用工具：${tool}`,
    blocks: [
      { type: 'keyvalue', label: '1 模型的决策', items: {
        '选中工具': tool,
        '传入参数': JSON.stringify(args),
      }},
      { type: 'json', label: '2 发出的 tool_call（OpenAI 格式）', data: toolCall },
      { type: 'json', label: '3 工具执行结果（回填给模型）', data: result },
    ],
  }
}

export default {
  name: 'function-call-simulator',
  displayName: '工具调用模拟',
  phase: '11-llm-engineering',
  lesson: '09 函数调用',
  order: 90,
  description: '输入请求，看模型如何决定调用哪个工具、生成参数并执行（本地路由，不调 LLM）',
  inputs: [
    { name: 'query', label: '用户请求', type: 'textarea', default: '',
      placeholder: '例如：帮我算一下 (15 + 27) * 3  /  东京今天天气怎么样？' },
  ],
  run: runFunctionCallSimulator,
}
