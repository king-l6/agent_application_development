<script setup lang="ts">
import type { BlockHistoryItem } from '@/types'
import { clearBlockHistory } from '@/api/guardrails'

defineProps<{
  history: BlockHistoryItem[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

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

async function handleClear() {
  await clearBlockHistory()
  emit('refresh')
}

function stageIcon(stage: string): string {
  return stage === 'input' ? '📥' : '📤'
}

function adapterColor(name: string): string {
  const input = ['rate_limiter', 'injection', 'semantic', 'pii_detector', 'toxicity', 'topic_classifier', 'factual_classifier', 'cot_judge']
  return input.includes(name) ? 'var(--red)' : 'var(--orange)'
}
</script>

<template>
  <div class="block-history">
    <div class="panel-header">
      <h3>🚫 拦截历史</h3>
      <button class="btn-sm" @click="handleClear">清空</button>
    </div>

    <div v-if="history.length === 0" class="empty">
      <p>暂无拦截记录</p>
    </div>

    <div v-else class="history-list">
      <div
        v-for="(item, i) in history"
        :key="i"
        class="history-item"
      >
        <div class="history-header">
          <span class="history-time">{{ item.timestamp }}</span>
          <span class="history-stage">{{ stageIcon(item.stage) }} {{ item.stage }}</span>
        </div>
        <div class="history-adapter" :style="{ color: adapterColor(item.adapter) }">
          {{ displayAdapterName(item.adapter) }}
        </div>
        <div class="history-input" :title="item.input">
          {{ item.input.slice(0, 80) }}{{ item.input.length > 80 ? '...' : '' }}
        </div>
        <div class="history-reason">{{ item.reason }}</div>
        <div class="history-confidence">
          置信度: {{ item.confidence }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block-history {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.btn-sm {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.btn-sm:hover {
  border-color: var(--red);
  color: var(--red);
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.history-time {
  color: var(--text-muted);
  font-size: 11px;
  font-family: monospace;
}

.history-stage {
  font-size: 11px;
  color: var(--text-dim);
}

.history-adapter {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 2px;
}

.history-input {
  color: var(--text-dim);
  font-size: 11px;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-reason {
  color: var(--text-muted);
  font-size: 11px;
  margin-bottom: 2px;
}

.history-confidence {
  color: var(--text-muted);
  font-size: 10px;
}
</style>
