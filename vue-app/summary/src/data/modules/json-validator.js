// Phase 11 · 03-structured-outputs —— JSON 校验器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 json_validator.py
// 贴入一段 LLM 输出（应为 JSON），本地校验：能否解析、字段是否齐全、类型是否匹配。

// type(v).__name__ 的前端等价：尽量对应 Python 的类型名
function pyType(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  if (t === 'object') return 'object'
  return t // string | number | boolean
}

function runJsonValidator(inputs) {
  const payload = ((inputs.payload || '') + '').trim()
  if (!payload) {
    return { summary: '❌ 请粘贴一段 JSON 文本', blocks: [] }
  }

  // 容错：去掉常见的 markdown 代码围栏
  let cleaned = payload
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^`+|`+$/g, '')
    if (cleaned.startsWith('json')) {
      cleaned = cleaned.slice(4)
    }
    cleaned = cleaned.trim()
  }

  let data
  try {
    data = JSON.parse(cleaned)
  } catch (e) {
    // JS 的错误没有 lineno/colno，改成显示 error.message
    return {
      summary: `❌ JSON 解析失败：${e.message}`,
      blocks: [{ type: 'keyvalue', label: '解析错误', items: {
        '错误类型': e.name || 'SyntaxError',
        '错误信息': e.message,
        '提示': '检查引号/逗号/括号是否配对，LLM 常漏尾随逗号或多包一层文字',
      }}],
    }
  }

  // 解析成功，统计字段类型
  const typeRows = []
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) {
      typeRows.push([k, pyType(v), (v === null ? 'null' : String(v)).slice(0, 40)])
    }
  }
  const topType = pyType(data)

  // 必填字段检查
  const reqRaw = ((inputs.required_fields || '') + '').trim()
  let missing = []
  if (reqRaw && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const required = reqRaw.replace(/，/g, ',').split(',').map(f => f.trim()).filter(f => f)
    missing = required.filter(f => !(f in data))
  }

  let summary
  if (missing.length) {
    summary = `⚠️ JSON 合法，但缺少必填字段：${missing.join(', ')}`
  } else {
    summary = `✅ 合法 JSON（顶层类型 ${topType}）`
  }

  const blocks = []
  if (typeRows.length) {
    blocks.push({ type: 'table', label: '字段一览', headers: ['字段', '类型', '值(截断)'], rows: typeRows })
  }
  if (missing.length) {
    blocks.push({ type: 'keyvalue', label: '必填校验未通过', items: { '缺失字段': missing.join(', ') } })
  }
  blocks.push({ type: 'json', label: '解析结果', data })

  return { summary, blocks }
}

export default {
  name: 'json-validator',
  displayName: 'JSON 校验',
  phase: '11-llm-engineering',
  lesson: '03 结构化输出',
  order: 30,
  description: '校验一段输出是否为合法 JSON、字段是否齐全、类型是否匹配（本地，不调 LLM）',
  inputs: [
    { name: 'payload', label: 'JSON 文本', type: 'textarea', default: '',
      placeholder: '例如：{"name": "小明", "age": 18, "tags": ["a","b"]}' },
    { name: 'required_fields', label: '必填字段(可选)', type: 'text', default: '',
      placeholder: '逗号分隔，例如：name,age', help: '留空则只校验能否解析' },
  ],
  run: runJsonValidator,
}
