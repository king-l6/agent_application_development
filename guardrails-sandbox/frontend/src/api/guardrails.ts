import type {
  GuardrailsData,
  ChatResponse,
  CompareResponse,
  BenchmarkResult,
  BlockHistoryItem,
  PlaygroundGroup,
  ModuleResult,
} from '@/types'

const BASE = '/api'
const TIMEOUT_MS = 60_000  // 聊天请求超时 60 秒

async function request<T>(url: string, options?: RequestInit, timeout?: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout ?? TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`)
    }
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('请求超时，请检查后端服务是否正常')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export function fetchGuardrails(): Promise<GuardrailsData> {
  return request<GuardrailsData>('/guardrails')
}

export function toggleAdapter(name: string): Promise<{ name: string; enabled: boolean }> {
  return request('/guardrails/toggle', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function sendChat(params: {
  message: string
  history?: { role: string; content: string }[]
  system_prompt?: string
  user_id?: string
  tier?: string
}): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: params.message,
      history: params.history || [],
      system_prompt: params.system_prompt || '你是一个友好的AI助手。请清楚简洁地回答用户的问题。',
      user_id: params.user_id || 'default',
      tier: params.tier || 'free',
    }),
  })
}

export function sendCompare(params: {
  message: string
  history?: { role: string; content: string }[]
  system_prompt?: string
}): Promise<CompareResponse> {
  return request<CompareResponse>('/chat/compare', {
    method: 'POST',
    body: JSON.stringify({
      message: params.message,
      history: params.history || [],
      system_prompt: params.system_prompt || '你是一个友好的AI助手。请清楚简洁地回答用户的问题。',
    }),
  })
}

export function fetchBlockHistory(): Promise<{ history: BlockHistoryItem[] }> {
  return request('/guardrails/block-history')
}

export function clearBlockHistory(): Promise<{ ok: boolean }> {
  return request('/guardrails/clear-history', { method: 'POST' })
}

export function resetStats(): Promise<{ ok: boolean }> {
  return request('/chat/reset-stats', { method: 'POST' })
}

export function runBenchmark(category?: string): Promise<BenchmarkResult> {
  return request<BenchmarkResult>('/benchmark', {
    method: 'POST',
    body: category ? JSON.stringify({ category }) : undefined,
  })
}

// ──── 课程实验台（Playground）────────────────────────────────────

export function fetchPlaygroundModules(): Promise<{ groups: PlaygroundGroup[] }> {
  return request('/playground/modules')
}

export function runPlaygroundModule(
  name: string,
  inputs: Record<string, any>,
): Promise<ModuleResult> {
  return request<ModuleResult>('/playground/run', {
    method: 'POST',
    body: JSON.stringify({ name, inputs }),
  })
}

// ──── 检查点数据库查看器（独立页面）──────────────────────────────

export interface CheckpointDb {
  key: string
  label: string
  filename: string
  exists: boolean
}

export interface CheckpointMessage {
  kind: string
  role: string
  content: string
  tool_call: { name: string; args: any } | null
}

export interface CheckpointStep {
  index: number
  thread_id: string
  checkpoint_id: string
  message_count: number | null
  last_message: CheckpointMessage | null
  messages: CheckpointMessage[]
}

export interface CheckpointInspectResult {
  ok: boolean
  error?: string
  db_filename?: string
  tables?: string[]
  all_threads?: string[]
  thread_filter?: string
  checkpoint_count?: number
  steps?: CheckpointStep[]
  full_conversation?: CheckpointMessage[]
}

export function fetchCheckpointDbs(): Promise<{ dbs: CheckpointDb[] }> {
  return request('/checkpoints/dbs')
}

export function inspectCheckpoints(
  preset: string,
  thread_id = '',
): Promise<CheckpointInspectResult> {
  return request<CheckpointInspectResult>('/checkpoints/inspect', {
    method: 'POST',
    body: JSON.stringify({ preset, thread_id }),
  })
}
