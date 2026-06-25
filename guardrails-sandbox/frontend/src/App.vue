<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { GuardrailsData, ChatResponse } from '@/types'
import { fetchGuardrails, toggleAdapter, sendChat, sendCompare, resetStats, runBenchmark } from '@/api/guardrails'
import AdapterTree from '@/components/AdapterTree.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import BlockHistory from '@/components/BlockHistory.vue'
import McpPanel from '@/components/McpPanel.vue'
import PlaygroundPanel from '@/components/PlaygroundPanel.vue'

const data = ref<GuardrailsData>({
  guardrails: [],
  stats: { total: 0, blocked: 0, passed: 0, block_rate_pct: 0, by_layer: {} },
  tree: [],
  block_history: [],
})

const chatResponse = ref<ChatResponse | null>(null)
const compareResult = ref<{ without: ChatResponse; with_: ChatResponse } | null>(null)
const loading = ref(false)
const compareLoading = ref(false)
const error = ref('')
const activeTab = ref<'normal' | 'compare' | 'mcp' | 'playground'>('normal')

async function loadData() {
  try {
    data.value = await fetchGuardrails()
  } catch (e: any) {
    error.value = e.message
  }
}

async function handleSend(message: string) {
  loading.value = true
  error.value = ''
  chatResponse.value = null
  compareResult.value = null
  try {
    const res = await sendChat({ message })
    chatResponse.value = res
    await loadData()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function handleCompare(message: string) {
  compareLoading.value = true
  error.value = ''
  chatResponse.value = null
  compareResult.value = null
  try {
    const res = await sendCompare({ message })
    compareResult.value = { without: res.without_guardrails, with_: res.with_guardrails }
    await loadData()
  } catch (e: any) {
    error.value = e.message
  } finally {
    compareLoading.value = false
  }
}

async function handleToggle(name: string) {
  await toggleAdapter(name)
  await loadData()
}

async function handleReset() {
  await resetStats()
  await loadData()
}

async function handleBenchmark() {
  await runBenchmark()
  await loadData()
}

onMounted(loadData)
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>🧪 AI 工程学习实验台</h1>
      <div class="header-tabs">
        <button
          :class="['tab-btn', { active: activeTab === 'normal' }]"
          @click="activeTab = 'normal'"
        >普通模式</button>
        <button
          :class="['tab-btn', { active: activeTab === 'compare' }]"
          @click="activeTab = 'compare'"
        >对比模式</button>
        <button
          :class="['tab-btn', { active: activeTab === 'mcp' }]"
          @click="activeTab = 'mcp'"
        >🔌 MCP 工具</button>
        <button
          :class="['tab-btn', { active: activeTab === 'playground' }]"
          @click="activeTab = 'playground'"
        >🧪 课程实验</button>
      </div>
    </header>

    <div class="app-body">
      <!-- 课程实验台自带左右布局，占满整行 -->
      <main v-if="activeTab === 'playground'" class="panel-full">
        <PlaygroundPanel />
      </main>

      <template v-else>
        <aside class="panel-left">
          <AdapterTree
            :tree="data.tree"
            :stats="data.stats"
            :block-history="data.block_history"
            @toggle="handleToggle"
            @reset="handleReset"
            @benchmark="handleBenchmark"
          />
        </aside>

        <main class="panel-center">
          <McpPanel v-if="activeTab === 'mcp'" />
          <ChatPanel
            v-else
            :active-tab="activeTab"
            :loading="loading"
            :compare-loading="compareLoading"
            :chat-response="chatResponse"
            :compare-result="compareResult"
            :guardrails="data.guardrails"
            :error="error"
            @send="handleSend"
            @compare="handleCompare"
          />
        </main>

        <aside class="panel-right">
          <BlockHistory
            :history="data.block_history"
            @refresh="loadData"
          />
        </aside>
      </template>
    </div>
  </div>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-hover: #243450;
  --border: #334155;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-muted: #64748b;
  --accent: #38bdf8;
  --accent-dim: #0ea5e9;
  --green: #22c55e;
  --green-bg: rgba(34, 197, 94, 0.1);
  --red: #ef4444;
  --red-bg: rgba(239, 68, 68, 0.1);
  --orange: #f59e0b;
  --orange-bg: rgba(245, 158, 11, 0.1);
  --radius: 8px;
  --radius-sm: 4px;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

#app {
  height: 100%;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.app-header h1 {
  font-size: 18px;
  font-weight: 600;
}

.header-tabs {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 3px;
}

.tab-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--accent);
  color: #000;
  font-weight: 500;
}

.tab-btn:hover:not(.active) {
  color: var(--text);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.panel-left {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.panel-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-full {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-right {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  overflow-y: auto;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
</style>
