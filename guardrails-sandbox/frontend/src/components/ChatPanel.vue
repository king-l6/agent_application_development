<script setup lang="ts">
import { ref } from 'vue'
import type { ChatResponse, AdapterInfo } from '@/types'

const props = defineProps<{
  activeTab: 'normal' | 'compare'
  loading: boolean
  compareLoading: boolean
  chatResponse: ChatResponse | null
  compareResult: { without: ChatResponse; with_: ChatResponse } | null
  guardrails: AdapterInfo[]
  error: string
}>()

const emit = defineEmits<{
  send: [message: string]
  compare: [message: string]
}>()

const input = ref('')
const messages = ref<{ role: string; content: string; blocked?: boolean }[]>([])

const ADAPTER_NAMES: Record<string, { cn: string; en: string; abbr?: string }> = {
  factual_classifier:  { cn: '事实性分类',   en: 'Factual Classifier' },
  rate_limiter:        { cn: '速率限制',     en: 'Rate Limiter' },
  injection_detector:  { cn: '注入检测',     en: 'Injection Detector' },
  semantic_detector:   { cn: '语义检测',     en: 'Semantic Detector' },
  pii_detector:        { cn: 'PII 检测',     en: 'PII Detector', abbr: 'PII' },
  length_checker:      { cn: '长度检查',     en: 'Length Checker' },
  toxicity_filter:     { cn: '毒性过滤',     en: 'Toxicity Filter' },
  topic_classifier:    { cn: '话题分类',     en: 'Topic Classifier' },
  output_scrubber:     { cn: '输出脱敏',     en: 'Output Scrubber' },
  relevance_checker:   { cn: '相关性检查',   en: 'Relevance Checker' },
  cot_judge:           { cn: 'CoT 裁决',     en: 'CoT Judge', abbr: 'CoT' },
  prompt_leak:         { cn: 'Prompt 泄露',  en: 'Prompt Leak Detector' },
  rag_groundedness:    { cn: 'RAG 真实性',   en: 'RAG Groundedness', abbr: 'RAG' },
  format_validator:    { cn: '格式校验',     en: 'Format Validator' },
}

function displayAdapterName(name: string): string {
  const info = ADAPTER_NAMES[name]
  if (!info) return name
  let label = `${info.cn}（${info.en}）`
  if (info.abbr) label += ` ${info.abbr}`
  return label
}

function sendMessage() {
  const text = input.value.trim()
  if (!text || props.loading) return
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  emit('send', text)
}

function sendCompare() {
  const text = input.value.trim()
  if (!text || props.compareLoading) return
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  emit('compare', text)
}

function clearChat() {
  messages.value = []
}

function getLogColor(log: any): string {
  if (log.passed) return '#22c55e'
  return '#ef4444'
}

function getLogBg(log: any): string {
  if (log.passed) return 'rgba(34,197,94,0.08)'
  return 'rgba(239,68,68,0.08)'
}
</script>

<template>
  <div class="chat-panel">
    <!-- Messages -->
    <div class="messages" ref="messagesRef">
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">💬</div>
        <p>发送消息以测试 Guardrails 效果</p>
      </div>

      <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
        <div class="msg-label">{{ msg.role === 'user' ? '你' : '助手' }}</div>
        <div class="msg-content">{{ msg.content }}</div>
      </div>

      <!-- Normal mode response -->
      <template v-if="activeTab === 'normal' && chatResponse">
        <div class="divider">
          <span>Guardrails 检测结果</span>
        </div>

        <div v-if="chatResponse.blocked" class="blocked-banner">
          <strong>🛡 已拦截</strong> — {{ chatResponse.block_stage === 'input' ? '输入' : '输出' }} 阶段
          <div class="block-reason">{{ chatResponse.block_reason }}</div>
          <div v-if="chatResponse.block_detail" class="block-detail">
            置信度: {{ chatResponse.block_detail.confidence }}
          </div>
        </div>

        <div v-else :class="['message', 'assistant']">
          <div class="msg-label">助手 (通过检查)</div>
          <div class="msg-content">{{ chatResponse.response }}</div>
        </div>

        <div v-if="chatResponse.guardrail_logs.length > 0" class="logs">
          <div class="logs-title">检测日志 ({{ chatResponse.total_latency_ms }}ms)</div>
          <div
            v-for="(log, li) in chatResponse.guardrail_logs"
            :key="li"
            class="log-item"
            :style="{ borderLeftColor: getLogColor(log), background: getLogBg(log) }"
          >
            <div class="log-header">
              <span class="log-name">{{ displayAdapterName(log.name) }}</span>
              <span :class="['log-status', log.passed ? 'passed' : 'blocked']">
                {{ log.passed ? '✓ 通过' : '✗ 拦截' }}
              </span>
            </div>
            <div class="log-meta">
              置信度: {{ log.confidence }} | {{ log.latency_ms }}ms
            </div>
            <div v-if="log.reason" class="log-reason">{{ log.reason }}</div>
          </div>
        </div>
      </template>

      <!-- Compare mode response -->
      <template v-if="activeTab === 'compare' && compareResult">
        <div class="divider"><span>对比结果</span></div>
        <div class="compare-grid">
          <div class="compare-col">
            <div class="compare-header without">🚫 无 Guardrails</div>
            <div class="compare-body">{{ compareResult.without.response }}</div>
            <div class="compare-meta">
              {{ compareResult.without.total_latency_ms }}ms
            </div>
          </div>
          <div class="compare-col">
            <div class="compare-header with">🛡 有 Guardrails</div>
            <div v-if="compareResult.with_.blocked" class="blocked-banner small">
              🛡 已拦截 — {{ compareResult.with_.block_reason }}
            </div>
            <div v-else class="compare-body">{{ compareResult.with_.response }}</div>
            <div class="compare-meta">
              {{ compareResult.with_.total_latency_ms }}ms |
              {{ compareResult.with_.guardrail_logs.length }} 项检查
            </div>
          </div>
        </div>
      </template>

      <!-- Error -->
      <div v-if="error" class="error-banner">{{ error }}</div>

      <!-- Loading -->
      <div v-if="loading || compareLoading" class="loading">
        <div class="spinner"></div>
        处理中...
      </div>
    </div>

    <!-- Input -->
    <div class="input-area">
      <textarea
        v-model="input"
        :placeholder="activeTab === 'normal' ? '输入消息...' : '输入消息（对比模式）...'"
        rows="3"
        @keydown.enter.exact="($event) => { $event.preventDefault(); activeTab === 'normal' ? sendMessage() : sendCompare() }"
        @keydown.shift.enter="($event) => { /* allow default newline */ }"
      ></textarea>
      <div class="input-actions">
        <span class="input-hint">Enter 发送 / Shift+Enter 换行</span>
        <div class="input-btns">
          <button class="btn-secondary" @click="clearChat">清空</button>
          <button
            v-if="activeTab === 'normal'"
            class="btn-primary"
            :disabled="loading || !input.trim()"
            @click="sendMessage"
          >
            {{ loading ? '发送中...' : '发送' }}
          </button>
          <button
            v-else
            class="btn-primary compare"
            :disabled="compareLoading || !input.trim()"
            @click="sendCompare"
          >
            {{ compareLoading ? '对比中...' : '对比发送' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
}

.message {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: var(--radius);
  max-width: 85%;
}

.message.user {
  background: var(--accent-dim);
  color: #fff;
  margin-left: auto;
}

.message.assistant {
  background: var(--surface);
  border: 1px solid var(--border);
  margin-right: auto;
}

.msg-label {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.7;
}

.msg-content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.divider {
  text-align: center;
  margin: 16px 0;
  position: relative;
}

.divider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--border);
}

.divider span {
  background: var(--bg);
  padding: 0 12px;
  color: var(--text-muted);
  font-size: 12px;
  position: relative;
}

.blocked-banner {
  background: var(--red-bg);
  border: 1px solid var(--red);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.blocked-banner.small {
  font-size: 12px;
  padding: 8px 12px;
}

.block-reason {
  margin-top: 6px;
  color: var(--text-dim);
  font-size: 12px;
}

.block-detail {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
}

.logs {
  margin-top: 12px;
}

.logs-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.log-item {
  padding: 8px 12px;
  margin-bottom: 6px;
  border-radius: var(--radius);
  border-left: 3px solid;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.log-name {
  font-size: 13px;
  font-weight: 500;
}

.log-status {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
}

.log-status.passed {
  color: var(--green);
  background: var(--green-bg);
}

.log-status.blocked {
  color: var(--red);
  background: var(--red-bg);
}

.log-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.log-reason {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
}

.compare-col {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.compare-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.compare-header.without {
  background: rgba(239, 68, 68, 0.1);
  color: var(--red);
}

.compare-header.with {
  background: rgba(34, 197, 94, 0.1);
  color: var(--green);
}

.compare-body {
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.compare-meta {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}

.error-banner {
  background: var(--red-bg);
  border: 1px solid var(--red);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 8px;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  font-size: 13px;
  padding: 8px 0;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.input-area {
  border-top: 1px solid var(--border);
  padding: 12px 16px;
  flex-shrink: 0;
}

.input-area textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.15s;
}

.input-area textarea:focus {
  border-color: var(--accent);
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.input-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.input-btns {
  display: flex;
  gap: 8px;
}

.btn-secondary {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.btn-secondary:hover {
  border-color: var(--text-muted);
  color: var(--text);
}

.btn-primary {
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: #000;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary.compare {
  background: var(--orange);
}
</style>
