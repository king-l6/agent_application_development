<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface McpToolInfo {
  name: string
  description: string
  inputSchema: {
    properties?: Record<string, { title: string; type: string; default?: any; description?: string }>
    required?: string[]
  }
}

const tools = ref<McpToolInfo[]>([])
const loading = ref(false)
const result = ref<string | null>(null)
const error = ref('')
const activeTool = ref<string | null>(null)
const formValues = ref<Record<string, any>>({})

// 工具中英文名称映射
const TOOL_LABELS: Record<string, string> = {
  search_lessons: '搜索课程',
  get_phase_summary: '阶段概要',
  calculate_cost: '成本估算',
}

const TOOL_DESCS: Record<string, string> = {
  search_lessons: '在 AI Engineering 课程中搜索相关内容',
  get_phase_summary: '获取某个阶段的概要信息和课程列表',
  calculate_cost: '估算 LLM API 调用的月度成本',
}

async function loadTools() {
  try {
    const res = await fetch('/api/mcp/tools')
    const data = await res.json()
    if (data.ok) {
      tools.value = data.tools
    } else {
      error.value = data.error
    }
  } catch (e: any) {
    error.value = e.message
  }
}

function selectTool(tool: McpToolInfo) {
  activeTool.value = tool.name
  result.value = null
  error.value = ''
  // Initialize form values with defaults
  formValues.value = {}
  if (tool.inputSchema.properties) {
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      formValues.value[key] = prop.default ?? ''
    }
  }
}

async function callTool() {
  if (!activeTool.value) return
  loading.value = true
  error.value = ''
  result.value = null

  try {
    const res = await fetch('/api/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: activeTool.value,
        arguments: formValues.value,
      }),
    })
    const data = await res.json()
    if (data.ok) {
      result.value = data.result
    } else {
      error.value = data.error
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(loadTools)
</script>

<template>
  <div class="mcp-panel">
    <!-- Tool Selector -->
    <div class="tool-selector">
      <div
        v-for="t in tools"
        :key="t.name"
        :class="['tool-card', { active: activeTool === t.name }]"
        @click="selectTool(t)"
      >
        <div class="tool-name">{{ TOOL_LABELS[t.name] || t.name }}</div>
        <div class="tool-desc">{{ TOOL_DESCS[t.name] || t.description }}</div>
      </div>
    </div>

    <!-- Tool Form -->
    <div v-if="activeTool" class="tool-form">
      <div class="form-header">
        <span class="form-title">{{ TOOL_LABELS[activeTool] || activeTool }}</span>
        <button class="btn-call" :disabled="loading" @click="callTool">
          {{ loading ? '调用中...' : '▶ 调用' }}
        </button>
      </div>

      <div class="form-body">
        <div
          v-for="(prop, key) in tools.find(t => t.name === activeTool)?.inputSchema?.properties"
          :key="key"
          class="form-field"
        >
          <label>{{ prop.title || key }}</label>
          <input
            v-if="prop.type === 'string'"
            v-model="formValues[key]"
            :placeholder="prop.title || key"
            type="text"
          />
          <input
            v-else
            v-model.number="formValues[key]"
            :placeholder="prop.title || key"
            type="number"
          />
        </div>
      </div>
    </div>

    <!-- Result -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      调用 MCP Server...
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="result" class="result-box">
      <div class="result-header">📤 返回结果</div>
      <pre class="result-content">{{ result }}</pre>
    </div>

    <div v-if="!activeTool && !loading" class="empty-state">
      <div class="empty-icon">🔌</div>
      <p>选择一个 MCP 工具开始测试</p>
    </div>
  </div>
</template>

<style scoped>
.mcp-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
}

.tool-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tool-card {
  flex: 1;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.15s;
}

.tool-card:hover {
  border-color: var(--accent-dim);
}

.tool-card.active {
  border-color: var(--accent);
  background: rgba(56, 189, 248, 0.08);
}

.tool-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.tool-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.tool-form {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 12px;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.form-title {
  font-size: 13px;
  font-weight: 600;
}

.btn-call {
  padding: 5px 14px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: #000;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-call:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-call:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.form-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.form-field label {
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 500;
}

.form-field input {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.form-field input:focus {
  border-color: var(--accent);
}

.result-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.result-header {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  color: var(--green);
}

.result-content {
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  max-height: 400px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  font-size: 13px;
  padding: 12px 0;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-msg {
  background: var(--red-bg);
  border: 1px solid var(--red);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  margin-bottom: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 13px;
}
</style>
