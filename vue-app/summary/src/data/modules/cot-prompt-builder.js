// Phase 11 · 02-few-shot-cot —— CoT Prompt 构造器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 cot_prompt_builder.py

// 取自课程 GSM8K_EXAMPLES 的精简示例
const FEW_SHOT_EXAMPLES = [
  {
    q: '一只鸭子每天下 16 个蛋，主人早餐吃 3 个、做松饼用 4 个，其余每个卖 2 元，每天卖蛋赚多少？',
    r: '每天 16 个蛋，吃掉和用掉 3+4=7 个，剩 16-7=9 个，每个 2 元，共 9*2=18 元。',
    a: '18',
  },
  {
    q: '做一件袍子要 2 卷蓝布和一半的白布，一共要几卷布？',
    r: '蓝布 2 卷，白布是其一半即 1 卷，合计 2+1=3 卷。',
    a: '3',
  },
]

function runCotPromptBuilder(inputs) {
  const q = (inputs.question || '').trim()
  if (!q) {
    return { summary: '❌ 请输入一道题目', blocks: [] }
  }

  // 1. Zero-shot
  const zero = `Q: ${q}\nA:`

  // 2. Zero-shot CoT —— 加一句魔法提示
  const zeroCot = `Q: ${q}\nA: 让我们一步一步思考。`

  // 3. Few-shot CoT —— 拼示例
  const fewParts = FEW_SHOT_EXAMPLES.map(
    (ex) => `Q: ${ex.q}\nA: ${ex.r} 答案是 ${ex.a}。`
  )
  const few = fewParts.join('\n\n') + `\n\nQ: ${q}\nA:`

  return {
    summary: '已生成 3 种提示词，token 与准确率随复杂度递增',
    blocks: [
      { type: 'text', label: '① Zero-shot（最省 token，难题易错）', content: zero },
      { type: 'text', label: '② Zero-shot-CoT（加一句「一步步思考」，几乎零成本提升）', content: zeroCot },
      { type: 'text', label: '③ Few-shot-CoT（给范例，最稳，但 token 最多）', content: few },
      { type: 'table', label: '技巧对比',
        headers: ['方法', 'Token 成本', '推理质量', '适用场景'],
        rows: [
          ['Zero-shot', '最低', '简单题够用', '明确、单步的任务'],
          ['Zero-shot-CoT', '低', '明显提升', '多步推理但不想给例子'],
          ['Few-shot-CoT', '高', '最稳定', '复杂题/要固定输出风格'],
          ['Self-Consistency', '很高(采样多次)', '再提升一截', '对准确率要求极高'],
        ] },
    ],
  }
}

export default {
  name: 'cot-prompt-builder',
  displayName: 'CoT 提示构造',
  phase: '11-llm-engineering',
  lesson: '02 少样本与思维链',
  order: 20,
  description: '输入一道题，对比 Zero-shot / Zero-shot-CoT / Few-shot-CoT 三种提示词的拼法（本地构造，不调 LLM）',
  inputs: [
    { name: 'question', label: '题目', type: 'textarea',
      placeholder: '例如：小明有 12 个苹果，分给 3 个朋友，每人分到几个？' },
  ],
  run: runCotPromptBuilder,
}
