// Phase 11 · 01-prompt-engineering —— Prompt 结构分析器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 prompt_analyzer.py

// 每个维度：名称 -> (匹配关键词/正则, 说明, 满分权重)
const DIMENSIONS = [
  ['角色设定', [/你是/, /作为/, /扮演/, /you are/, /act as/, /role/],
    '告诉模型它的身份/专长', 1.0],
  ['明确任务', [/请/, /帮我/, /生成/, /分析/, /总结/, /翻译/, /写/, /列出/,
    /summarize/, /translate/, /generate/, /analyze/, /list/],
    '有清晰的动词指令', 1.0],
  ['输出格式', [/格式/, /json/, /markdown/, /表格/, /列表/, /步骤/, /bullet/,
    /format/, /table/, /步/, /分点/],
    '指定了期望的输出结构', 1.0],
  ['约束条件', [/不要/, /必须/, /限制/, /字数/, /不超过/, /至少/, /only/,
    /must/, /don't/, /do not/, /限定/, /控制在/],
    '划定了边界/限制', 1.0],
  ['提供示例', [/例如/, /比如/, /示例/, /样例/, /example/, /e\.g\./, /如下/],
    '给了 few-shot 示例', 1.0],
  ['上下文', [/背景/, /上下文/, /已知/, /context/, /given/, /基于/],
    '提供了任务背景', 1.0],
]

function runPromptAnalyzer(inputs) {
  const prompt = (inputs.prompt || '').trim()
  if (!prompt) {
    return { summary: '❌ 请输入一段提示词', blocks: [] }
  }

  const low = prompt.toLowerCase()
  const rows = []
  let hitCount = 0
  const missing = []
  for (const [name, patterns, desc] of DIMENSIONS) {
    const hit = patterns.some((p) => p.test(low))
    if (hit) {
      hitCount++
    } else {
      missing.push(`${name}：${desc}`)
    }
    rows.push([name, hit ? '✅' : '—', desc])
  }

  const score = hitCount / DIMENSIONS.length
  const charLen = prompt.length

  let verdict
  if (score >= 0.8) {
    verdict = '结构完整，是一条高质量提示'
  } else if (score >= 0.5) {
    verdict = '基本可用，还能更好'
  } else {
    verdict = '过于简单，模型容易自由发挥'
  }

  const blocks = [
    { type: 'score', label: '提示完整度', value: Math.round(score * 10000) / 10000, max: 1.0,
      hint: `${hitCount}/${DIMENSIONS.length} 个要素 · ${verdict}` },
    { type: 'table', label: '要素检查', headers: ['要素', '是否具备', '说明'], rows },
  ]
  if (missing.length) {
    blocks.push({ type: 'list', label: '可以补充的要素', items: missing, ordered: false })
  }

  return {
    summary: `提示完整度 ${Math.round(score * 100)}%（${charLen} 字）—— ${verdict}`,
    blocks,
  }
}

export default {
  name: 'prompt-analyzer',
  displayName: 'Prompt 结构分析',
  phase: '11-llm-engineering',
  lesson: '01 提示工程',
  order: 10,
  description: '分析一段提示词是否具备好提示的要素，给出评分和改进建议（本地分析，不调 LLM）',
  inputs: [
    { name: 'prompt', label: '你的提示词', type: 'textarea',
      placeholder: '例如：你是一位资深 Python 工程师，请帮我把下面的代码重构得更易读，用 markdown 代码块返回，不要改变其行为。' },
  ],
  run: runPromptAnalyzer,
}
