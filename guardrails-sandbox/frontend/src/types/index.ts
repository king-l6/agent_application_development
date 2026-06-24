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
