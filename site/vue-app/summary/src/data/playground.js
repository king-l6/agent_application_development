// 纯前端版课程实验台。每个实验自带 run(inputs) 纯函数（对应原 Python playground 模块），
// 返回一组渲染块(block)，由 PlaygroundView.vue 统一渲染。不依赖任何后端。
//
// block 类型：keyvalue / table / list / text / score
//   { type:'keyvalue', label, items:{k:v} }
//   { type:'table',    label, headers:[], rows:[[]] }
//   { type:'list',     label, items:[] }
//   { type:'text',     label, content }
//   { type:'score',    label, value, max, hint }
//
// input 字段：{ name, label, type:'number'|'select'|'text', default, options?, help? }

// ── 第12课：置信度阈值路由（客服分流）──────────────────────────
const CONFIDENCE_MESSAGES = [
  ['我要退款！！！订单还没发就不想要了', '退款', 0.96],
  ['这个 App 一打开就闪退，安卓 14', 'bug报告', 0.93],
  ['你们企业版怎么收费，能开发票吗', '销售', 0.91],
  ['怎么修改收货地址', '一级支持', 0.88],
  ['密码忘了登不进去', '一级支持', 0.84],
  ['那个……之前那个事儿到底咋整啊', '一级支持', 0.41],
  ['钱', '退款', 0.38],
  ['？？？', '一级支持', 0.22],
  ['我想把上次买的会员退了顺便问下新套餐', '退款', 0.55],
  ['系统是不是又崩了我朋友也进不去', 'bug报告', 0.79],
]

function runConfidenceRouter(inputs) {
  let threshold = parseFloat(inputs.threshold)
  if (isNaN(threshold)) threshold = 0.7
  threshold = Math.max(0, Math.min(threshold, 1))

  const rows = []
  let auto = 0, human = 0
  const dist = {}
  for (const [msg, cat, conf] of CONFIDENCE_MESSAGES) {
    let decision, mark
    if (conf >= threshold) {
      decision = `自动 → ${cat}队列`; mark = '✓ 自动'; auto++
      dist[cat] = (dist[cat] || 0) + 1
    } else {
      decision = '转人工（没把握）'; mark = '⚠ 人工'; human++
    }
    const short = msg.length <= 20 ? msg : msg.slice(0, 20) + '…'
    rows.push([short, cat, conf.toFixed(2), mark, decision])
  }
  const total = CONFIDENCE_MESSAGES.length
  const autoRate = auto / total
  const distRows = Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, String(n)])

  const blocks = [
    { type: 'keyvalue', label: '路由结果（当前阈值）', items: {
      '当前阈值': threshold.toFixed(2),
      '消息总数': total,
      '自动处理': `${auto} 条（${Math.round(autoRate * 100)}%）`,
      '转人工': `${human} 条（${Math.round(human / total * 100)}%）`,
      '省人工程度': autoRate >= 0.7 ? '高（机器多担待）' : autoRate >= 0.4 ? '中' : '低（大量转人工）',
    }},
    { type: 'table', label: '逐条路由（置信度 ≥ 阈值才自动，否则转人工）',
      headers: ['消息', '分类器判类别', '置信度', '决策', '去向'], rows },
    distRows.length
      ? { type: 'table', label: '自动处理的按类别分发', headers: ['自动分发队列', '条数'], rows: distRows }
      : { type: 'text', label: '自动分发', content: '（当前阈值下无消息自动处理，全转人工）' },
    { type: 'list', label: '要点', items: [
      "置信度 = 分类器'我有多确定'的分数(0~1)；阈值 = 你划的线，低于线就别自动、交人工",
      '阈值越高→转人工越多(准但贵慢)；越低→自动越多(省但错的多)。按“分错的代价”定',
      '一级客服分错代价低→阈值可低(0.6~0.7)；退款/账户安全分错代价高→调高(0.9)',
      "坑：LLM 会'自信地错'(高置信但答错)，置信度更信 embedding+小分类模型，而非 LLM 自报",
      '生产分类分层：规则匹配→小分类模型(主力)→LLM(兜底)→低于阈值升人工',
    ]},
    { type: 'text', label: '怎么玩',
      content: '试试把阈值从 0.3 拖到 0.95：低阈值几乎全自动(但含糊消息也被硬分)，高阈值只放行最确定的、其余全转人工。这就是练习题1的权衡——没有万能数字，看业务错误代价。' },
  ]
  return {
    summary: `阈值 ${threshold.toFixed(2)}：${auto} 条自动（${Math.round(autoRate * 100)}%）、${human} 条转人工（${Math.round(human / total * 100)}%）`,
    blocks,
  }
}

// ── 实验注册表 ────────────────────────────────────────────────
export const playgroundExperiments = [
  {
    id: 'confidence-router',
    title: '置信度阈值路由（客服分流）',
    phase: 'Phase 14 · Agent 工程',
    lesson: '12 工作流模式',
    description: '路由模式落地：分类器给每条消息判类别+置信度，低于阈值转人工。调阈值看自动率/人工率权衡（练习题1）。',
    inputs: [
      { name: 'threshold', label: '置信度阈值 (0~1)', type: 'number', default: 0.7,
        help: '低于此值＝分类器没把握→转人工。一级客服可低(0.6~0.7)，高风险业务调高(0.9)' },
    ],
    run: runConfidenceRouter,
  },
]
