// Phase 14 · 09-hybrid-memory-mem0 —— Mem0 混合记忆（代码助手场景）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 mem0_hybrid.py
//
// 代码助手记住开发者上下文，用三路混合存储：
//   - 向量：语义相似（"我喜欢怎么写测试" → 召回偏好）
//   - KV：精确事实查找（语言、CI 工具）
//   - 图：关系推理（哪些 repo 依赖某个库）
// 检索时融合评分 = w_rel·相关性 + w_imp·重要性 + w_rec·时效性。
// 开发者改了偏好时，冲突检测把旧边软删除(valid=False)而非物理删除，支持时间查询。

// 融合权重（对齐课程 main.py）
const W_REL = 0.6, W_IMP = 0.2, W_REC = 0.2

// token 重叠相似度（按字符），当嵌入替身
function mem0Overlap(a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  const union = new Set([...sa, ...sb]).size
  return union ? inter / union : 0.0
}

function runMem0Hybrid(inputs) {
  const query = String(inputs.query != null ? inputs.query : '我平时喜欢怎么写测试')
  const flip = String(inputs.flip_pref != null ? inputs.flip_pref : '改').startsWith('改')

  // 向量库：语义记忆（带 importance）
  const vector = [
    { text: '喜欢用 pytest 写单元测试', imp: 0.7, rec: 0.9 },
    { text: '注释写得简洁，避免啰嗦', imp: 0.4, rec: 0.6 },
    { text: '缩进偏好：用 tabs', imp: 0.5, rec: 0.3 },
  ]
  // KV 库：精确事实
  const kv = [
    [['project', 'language'], 'Rust'],
    [['project', 'ci'], 'GitHub Actions'],
    [['project', 'indent'], 'tabs'],
  ]
  // 图库：关系（subject, relation, obj, valid）
  const graph = [
    ['api-repo', 'depends_on', 'serde', true],
    ['web-repo', 'depends_on', 'serde', true],
    ['cli-repo', 'depends_on', 'clap', true],
    ['dev:ava', 'owns', 'api-repo', true],
  ]

  const log = []
  if (flip) {
    // 冲突检测：缩进偏好 tabs → spaces，软删除旧事实
    for (const v of vector) {
      if (v.text.includes('tabs')) v.valid = false
    }
    vector.push({ text: '缩进偏好：改用 spaces', imp: 0.5, rec: 1.0 })
    // 图里也加一条 indent 边演示软删除
    graph.push(['dev:ava', 'prefers_indent', 'tabs', false])   // 旧，已失效
    graph.push(['dev:ava', 'prefers_indent', 'spaces', true])  // 新
    // KV indent → spaces
    for (const item of kv) {
      if (item[0][0] === 'project' && item[0][1] === 'indent') item[1] = 'spaces'
    }
    log.push('冲突检测：偏好 tabs→spaces，旧事实 valid=False 软删除（非物理删除，可时间查询）')
  }

  const blocks = [{ type: 'keyvalue', label: 'Mem0 混合记忆', items: {
    '三路存储': '向量(语义) + KV(精确事实) + 图(关系)',
    '融合公式': `score = ${W_REL}·相关性 + ${W_IMP}·重要性 + ${W_REC}·时效性`,
    '检索查询': query,
  }}]

  if (query.includes('测试') || query.includes('怎么写')) {
    // 向量路为主：融合评分
    const scored = []
    for (const v of vector) {
      const valid = v.valid !== undefined ? v.valid : true
      const rel = mem0Overlap(query, v.text)
      const score = W_REL * rel + W_IMP * v.imp + W_REC * v.rec
      scored.push([score, v, valid])
    }
    scored.sort((x, y) => y[0] - x[0])
    const rows = scored.map(([score, v, valid]) => [v.text, score.toFixed(3), valid ? 'VALID' : 'INVALID（旧）'])
    blocks.push({ type: 'table', label: '向量路召回 + 融合评分排序（语义相似最擅长）',
      headers: ['语义记忆', '融合分', '状态'], rows })
  } else if (query.includes('语言') || query.includes('CI')) {
    const rows = kv.map(([k, val]) => [`${k[0]}.${k[1]}`, val])
    blocks.push({ type: 'table', label: 'KV 路精确查找（O(1)，事实型查询最擅长）',
      headers: ['KV 键', '值'], rows })
  } else {  // 关系查询
    const rows = graph.filter(e => e[1] === 'depends_on' && e[2] === 'serde')
      .map(e => [e[0], e[1], e[2], e[3] ? 'VALID' : 'INVALID（旧）'])
    blocks.push({ type: 'table', label: "图路关系推理（'哪些 repo 依赖 serde' 这类最擅长）",
      headers: ['主体', '关系', '客体', '状态'], rows })
  }

  if (log.length) {
    blocks.push({ type: 'list', label: '冲突检测 / 软删除', items: log })
    // 展示时间查询：valid_only=False 能看到历史
    const hist = graph.filter(e => e[1] === 'prefers_indent')
      .map(e => [e[0], e[1], e[2], e[3] ? 'VALID' : 'INVALID'])
    if (hist.length) {
      blocks.push({ type: 'table', label: '时间查询：软删除让历史可追溯（旧值标 INVALID 不删）',
        headers: ['主体', '关系', '客体', '状态'], rows: hist })
    }
  }

  blocks.push({ type: 'list', label: '要点', items: [
    '向量擅长语义相似、KV 擅长精确事实、图擅长关系推理——单一存储对另两类查询必然无能为力',
    '融合评分是加权求和(非层级)：聊天重时效、合规重重要性、检索重相关性，权重按产品调',
    "冲突失效=软删除(valid=False)：支持'三月时住哪'这类时间查询，绝不物理删除",
    "vs MemGPT(07)/记忆块(08)：那俩解决'上下文放不下'(换页/块编辑)，Mem0 解决'多类查询用一套接口'",
    '坑：冲突检测靠 subject+relation 精确匹配，提取器噪声会让图爆炸；嵌入漂移需定期重嵌',
  ]})

  return {
    summary: `查询『${query}』${flip ? '（已模拟改偏好+软删除）' : ''}`,
    blocks,
  }
}

export default {
  name: 'mem0-hybrid',
  displayName: 'Mem0 混合记忆（代码助手）',
  phase: '14-agent-engineering',
  lesson: '09 混合记忆',
  order: 90,
  description: '记开发者上下文：向量(语义)+KV(精确事实)+图(关系) 三路存储，融合评分检索。改偏好时冲突检测软删除旧边（不调 LLM）',
  inputs: [
    { name: 'query', label: '检索查询', type: 'select', default: '我平时喜欢怎么写测试',
      options: ['我平时喜欢怎么写测试', '这个项目用什么语言和 CI', '哪些 repo 依赖 serde 库'],
      help: '三类查询分别考验向量/KV/图三路存储' },
    { name: 'flip_pref', label: '模拟改偏好（触发冲突失效）', type: 'select', default: '改：tabs → spaces',
      options: ['改：tabs → spaces', '不改'],
      help: '改偏好时图里旧边 valid=False 软删除，支持时间查询' },
  ],
  run: runMem0Hybrid,
}
