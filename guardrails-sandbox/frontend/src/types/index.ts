export interface AdapterInfo {
  name: string
  display_name: string
  description: string
  group: string
  category: string
  order: number
  enabled: boolean
}

export interface AdapterStats {
  blocked: number
  passed: number
  enabled?: boolean
}

export interface TreeAdapterNode {
  name: string
  display_name: string
  description: string
  enabled: boolean
  order: number
  category: string
  stats: { blocked: number; passed: number }
}

export interface TreeCategoryNode {
  key: string
  label: string
  type: 'category'
  children: TreeAdapterNode[]
}

export interface TreeGroupNode {
  key: string
  label: string
  type: 'group'
  children: TreeCategoryNode[]
}

export type TreeNode = TreeGroupNode | TreeCategoryNode | TreeAdapterNode

export interface Stats {
  total: number
  blocked: number
  passed: number
  block_rate_pct: number
  by_layer: Record<string, AdapterStats>
}

export interface BlockHistoryItem {
  timestamp: string
  input: string
  adapter: string
  stage: string
  reason: string
  confidence: number
  details: Record<string, any>
}

export interface GuardrailLog {
  name: string
  description: string
  passed: boolean
  confidence: number
  latency_ms: number
  reason: string
  details: Record<string, any>
}

export interface ChatResponse {
  response: string
  blocked: boolean
  block_stage: string | null
  block_reason: string | null
  block_detail: Record<string, any> | null
  guardrail_logs: GuardrailLog[]
  total_latency_ms: number
  llm_latency_ms: number | null
}

export interface CompareResponse {
  without_guardrails: ChatResponse
  with_guardrails: ChatResponse
}

export interface GuardrailsData {
  guardrails: AdapterInfo[]
  stats: Stats
  tree: TreeGroupNode[]
  block_history: BlockHistoryItem[]
}

export interface BenchmarkResult {
  [key: string]: any
}

export interface AdapterGroup {
  group: string
  categories: {
    category: string
    adapters: AdapterInfo[]
  }[]
}

// ──── 课程实验台（Playground）────────────────────────────────────

export interface PlaygroundField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select'
  default: any
  placeholder?: string
  help?: string
  options?: string[]
}

export interface PlaygroundModuleMeta {
  name: string
  display_name: string
  description: string
  phase: string
  lesson: string
  order: number
  input_schema: PlaygroundField[]
}

export interface PlaygroundGroup {
  phase: string
  label: string
  icon: string
  modules: PlaygroundModuleMeta[]
}

export interface RenderBlock {
  type: 'text' | 'score' | 'table' | 'json' | 'keyvalue' | 'list'
  label?: string
  // text
  content?: string
  // score
  value?: number
  max?: number
  hint?: string
  // table
  headers?: string[]
  rows?: any[][]
  // json
  data?: any
  // keyvalue
  items?: Record<string, any> | any[]
  // list
  ordered?: boolean
}

export interface ModuleResult {
  ok: boolean
  summary: string
  blocks: RenderBlock[]
  latency_ms: number
  error: string
}
