// 纯前端课程实验台聚合器。
// 每个实验是 src/data/modules/<name>.js，default 导出一个模块对象：
//   { name, displayName, phase, lesson, order, description, inputs[], run(inputs) }
// run 返回 { summary, blocks }，block 类型见下。由 PlaygroundView.vue 统一渲染，不依赖后端。
//
// block 类型：keyvalue / table / list / text / score / json
//   { type:'keyvalue', label, items:{k:v} 或 [] }
//   { type:'table',    label, headers:[], rows:[[]] }
//   { type:'list',     label, items:[], ordered? }
//   { type:'text',     label, content }
//   { type:'score',    label, value, max, hint }
//   { type:'json',     label, data }
//
// 新增实验：往 modules/ 丢一个 .js 即可，这里用 import.meta.glob 自动收集、按 phase 分组。

const PHASE_META = {
  '11-llm-engineering': { icon: '📚', label: 'Phase 11 · LLM 工程' },
  '14-agent-engineering': { icon: '🤖', label: 'Phase 14 · Agent 工程' },
}

// eager 收集所有模块（构建期静态分析，产物里就是一堆 import）
const modFiles = import.meta.glob('./modules/*.js', { eager: true })

const allModules = Object.values(modFiles)
  .map((m) => m.default)
  .filter(Boolean)

// 按 phase 分组，组内按 order 升序
const byPhase = {}
for (const mod of allModules) {
  const p = mod.phase || 'misc'
  ;(byPhase[p] ||= []).push(mod)
}

// 保持 PHASE_META 声明顺序在前，未登记的 phase 兜底排后面
const phaseOrder = [
  ...Object.keys(PHASE_META),
  ...Object.keys(byPhase).filter((p) => !(p in PHASE_META)),
]

export const playgroundGroups = phaseOrder
  .filter((p) => byPhase[p]?.length)
  .map((p) => ({
    phase: p,
    icon: PHASE_META[p]?.icon || '🧪',
    label: PHASE_META[p]?.label || p,
    modules: byPhase[p].sort((a, b) => (a.order || 0) - (b.order || 0)),
  }))
