// Phase 14 · 05-self-refine-and-critic —— Self-Refine vs CRITIC（代码助手）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 self_refine_critic.py
// 写 divide(a,b)：对比自我批评（放过崩溃盲区）vs CRITIC 外部验证器（跑测试抓出 b==0 崩溃）。

function _render(handlesZero, hasDoc) {
  // 按已应用的修复，渲染当前代码版本。
  const sig = hasDoc ? 'def divide(a: float, b: float) -> float:' : 'def divide(a, b):'
  const body = []
  if (hasDoc) {
    body.push('    """两数相除，b 为 0 时抛 ValueError。"""')
  }
  if (handlesZero) {
    body.push('    if b == 0:')
    body.push("        raise ValueError('b 不能为 0')")
  }
  body.push('    return a / b')
  return sig + '\n' + body.join('\n')
}

function _externalVerify(handlesZero, hasDoc) {
  // 外部验证器：跑测试 + linter，返回 [通过?, 批评列表]。
  const crit = []
  if (!handlesZero) {
    crit.push('跑测试 divide(1, 0) → ZeroDivisionError，边界 b==0 未处理')
  }
  if (!hasDoc) {
    crit.push('linter：缺类型注解或 docstring')
  }
  return [crit.length === 0, crit]
}

function _selfCritique(handlesZero, hasDoc) {
  // 自我批评：同一个模型给自己打分。盲区——抓不到 divide(1,0) 会崩这种自信的幻觉，
  // 只会挑表面风格。注意它永远不提 b==0。
  const crit = []
  if (!hasDoc) {
    crit.push('读着觉得：可以补个 docstring 和类型注解')
  }
  return [crit.length === 0, crit]
}

function runSelfRefineCritic(inputs) {
  const useCritic = String(inputs.mode || 'CRITIC').includes('CRITIC')
  let maxIters = parseInt(inputs.max_iters, 10)
  if (isNaN(maxIters)) maxIters = 3
  maxIters = Math.max(1, Math.min(maxIters, 5))

  const verify = useCritic ? _externalVerify : _selfCritique
  let handlesZero = false
  let hasDoc = false // 初版啥都没有
  const rows = []
  let passedAt = null

  for (let it = 1; it <= maxIters; it++) {
    const [ok, crit] = verify(handlesZero, hasDoc)
    const critStr = crit.length === 0 ? '（无意见，认为通过）' : crit.join('；')
    const firstLine = _render(handlesZero, hasDoc).split('\n')[0]
    rows.push([it, firstLine + ' ...', ok ? '通过 ✓' : '未过', critStr])
    if (ok) {
      passedAt = it
      break
    }
    // refine：只修批评里明确点到的问题
    if (crit.some((c) => c.includes('b==0') || c.includes('ZeroDivisionError'))) {
      handlesZero = true
    }
    if (crit.some((c) => c.includes('docstring') || c.includes('类型'))) {
      hasDoc = true
    }
  }

  const finalCode = _render(handlesZero, hasDoc)
  const resultLine = passedAt ? `第 ${passedAt} 轮『通过』` : `${maxIters} 轮用完仍未通过`

  const blocks = [
    { type: 'keyvalue', label: '任务', items: {
      '任务': '写 divide(a, b) 两数相除',
      '批评来源': useCritic ? 'CRITIC 外部验证器（跑测试+linter）' : 'Self-Refine 模型自我批评',
      '结果': resultLine,
      '最终是否处理 b==0': handlesZero ? '是 ✓' : '否 ✗（崩溃 bug 还在！）',
    }},
    { type: 'table', label: '生成 → 批评 → 修订（带历史）循环',
      headers: ['轮', '实现版本', '验证', '批评 / 反馈'], rows },
    { type: 'text', label: '最终代码', content: finalCode },
  ]

  if (useCritic) {
    blocks.push({ type: 'text', label: '为什么 CRITIC 更强',
      content: 'CRITIC 把『批评』这一步接地到外部真实信号：跑 divide(1,0) 直接崩 → 抓出 b==0 没处理。' +
        '这正是自我批评放过的『听起来很自信的幻觉』。代码助手的外部验证器=测试运行器+linter+类型检查。' })
  } else {
    blocks.push({ type: 'text', label: '自我批评的盲区（关键）',
      content: '注意：Self-Refine『通过』了，但 b==0 崩溃 bug 还在！同一个模型给自己打分，' +
        '对 divide(1,0) 会崩这种崩溃型 bug『读着觉得没问题』，只挑到表面风格（docstring）。' +
        '这就是自我批评的盲区——把批评换成外部验证器（CRITIC）再跑一次，就能抓出这个崩溃。' })
  }

  blocks.push({ type: 'list', label: '要点', items: [
    'Self-Refine=generate/feedback/refine 三角色，纯自我批评，无需工具',
    'CRITIC=把 feedback 换成 verify(task, output, tools)，路由到外部工具验证',
    'vs Reflexion(03)：那是任务失败后写反思记忆下次用；这是单次输出内的打磨微循环',
    'vs ToT(04)：那是多分支横向搜索；这是单条输出纵向反复修订',
    '坑：预算 1-3 轮（每轮加延迟+token）；没真验证器时 CRITIC 退化成 Self-Refine，别白付延迟',
  ]})

  return {
    summary: `${useCritic ? 'CRITIC 外部验证' : 'Self-Refine 自我批评'} —— ${resultLine}`,
    blocks,
  }
}

export default {
  name: 'self-refine-critic',
  displayName: 'Self-Refine vs CRITIC（代码助手）',
  phase: '14-agent-engineering',
  lesson: '05 Self-Refine 与 CRITIC',
  order: 50,
  description: '写 divide(a,b)：对比自我批评（放过崩溃盲区）vs CRITIC 外部验证器（跑测试抓出 b==0 崩溃）。生成→批评→修订循环（不调 LLM）',
  inputs: [
    { name: 'mode', label: '批评来源', type: 'select', default: 'CRITIC（外部验证器：测试+linter）',
      options: ['CRITIC（外部验证器：测试+linter）', 'Self-Refine（模型自我批评）'],
      help: 'Self-Refine 模型给自己打分，查不出自信的幻觉；CRITIC 接地到真实测试信号' },
    { name: 'max_iters', label: '最大迭代轮数', type: 'number', default: 3, help: '1-5，每轮加 token 和延迟' },
  ],
  run: runSelfRefineCritic,
}
