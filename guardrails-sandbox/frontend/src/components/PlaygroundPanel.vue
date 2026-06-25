<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { PlaygroundGroup, PlaygroundModuleMeta, ModuleResult } from '@/types'
import { fetchPlaygroundModules, runPlaygroundModule } from '@/api/guardrails'

const groups = ref<PlaygroundGroup[]>([])
const activeModule = ref<PlaygroundModuleMeta | null>(null)
const formValues = ref<Record<string, any>>({})
const result = ref<ModuleResult | null>(null)
const loading = ref(false)
const error = ref('')

async function loadModules() {
  try {
    const data = await fetchPlaygroundModules()
    groups.value = data.groups
  } catch (e: any) {
    error.value = e.message
  }
}

function selectModule(mod: PlaygroundModuleMeta) {
  activeModule.value = mod
  result.value = null
  error.value = ''
  formValues.value = {}
  for (const f of mod.input_schema) {
    formValues.value[f.name] = f.default
  }
}

async function run() {
  if (!activeModule.value) return
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const res = await runPlaygroundModule(activeModule.value.name, formValues.value)
    if (res.ok) {
      result.value = res
    } else {
      error.value = res.error || '执行失败'
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const scorePct = (b: any) => Math.min(100, Math.max(0, (b.value / (b.max || 1)) * 100))

// 从 placeholder 的「例如：xxx」中抽出示例文本（多示例取第一个）
function extractExample(placeholder?: string): string {
  if (!placeholder) return ''
  const m = placeholder.match(/例如[：:]\s*(.+)$/s)
  if (!m) return ''
  const ex = m[1].trim()
  // 多个示例用「  /  」分隔，取第一个
  return ex.split(/\s{2,}\/\s{2,}|\s+\/\s+/)[0].trim()
}

function hasExample(f: any): boolean {
  const v = formValues.value[f.name]
  return (v === '' || v == null) && !!extractExample(f.placeholder)
}

// 空字段按 Tab 填入示例；非空则保留 Tab 的默认切换行为
function onFieldTab(e: KeyboardEvent, f: any) {
  if (e.key !== 'Tab' || e.shiftKey) return
  const v = formValues.value[f.name]
  if (v !== '' && v != null) return
  const ex = extractExample(f.placeholder)
  if (!ex) return
  e.preventDefault()
  formValues.value[f.name] = f.type === 'number' ? (Number(ex) || ex) : ex
}

// 表单是否有可运行的内容（至少一个字段非空）
function hasAnyInput(): boolean {
  if (!activeModule.value) return false
  return activeModule.value.input_schema.some((f) => {
    const v = formValues.value[f.name]
    return v !== '' && v != null
  })
}

// 回车运行：单行输入框直接 Enter；多行 textarea 用 Cmd/Ctrl+Enter（Enter 仍换行）
function onFieldEnter(e: KeyboardEvent, isTextarea: boolean) {
  if (e.key !== 'Enter' || e.isComposing) return
  if (isTextarea && !(e.metaKey || e.ctrlKey)) return  // textarea 普通 Enter 留作换行
  if (loading.value || !hasAnyInput()) return
  e.preventDefault()
  run()
}


// keyvalue 的 items 可能是对象，统一成 [k,v][] 方便渲染
function kvEntries(items: any): [string, any][] {
  if (!items) return []
  if (Array.isArray(items)) return items.map((v, i) => [String(i), v])
  return Object.entries(items)
}

onMounted(loadModules)
</script>

<template>
  <div class="pg-panel">
    <!-- 左侧：按 phase 分组的模块导航 -->
    <aside class="pg-nav">
      <div v-for="g in groups" :key="g.phase" class="nav-group">
        <div class="nav-group-title">{{ g.icon }} {{ g.label }}</div>
        <div
          v-for="m in g.modules"
          :key="m.name"
          :class="['nav-item', { active: activeModule?.name === m.name }]"
          @click="selectModule(m)"
        >
          <div class="nav-item-name">{{ m.display_name }}</div>
          <div class="nav-item-lesson">{{ m.lesson }}</div>
        </div>
      </div>
    </aside>

    <!-- 右侧：表单 + 结果 -->
    <section class="pg-main">
      <div v-if="!activeModule" class="empty-state">
        <div class="empty-icon">🧪</div>
        <p>从左侧选一个课程模块开始测试</p>
      </div>

      <template v-else>
        <div class="module-head">
          <div>
            <div class="module-title">{{ activeModule.display_name }}</div>
            <div class="module-desc">{{ activeModule.description }}</div>
          </div>
          <button class="btn-run" :disabled="loading" @click="run" title="单行输入框按 Enter 运行；多行文本框按 Cmd/Ctrl+Enter 运行">
            {{ loading ? '运行中...' : '▶ 运行' }}
          </button>
        </div>

        <!-- schema 驱动表单 -->
        <div class="form-body">
          <div v-for="f in activeModule.input_schema" :key="f.name" class="form-field">
            <label>
              {{ f.label }}
              <span v-if="f.help" class="field-help">{{ f.help }}</span>
              <span v-if="hasExample(f)" class="field-tab-hint">按 Tab 填入示例</span>
            </label>
            <textarea
              v-if="f.type === 'textarea'"
              v-model="formValues[f.name]"
              :placeholder="f.placeholder"
              rows="3"
              @keydown="onFieldTab($event, f); onFieldEnter($event, true)"
            />
            <select v-else-if="f.type === 'select'" v-model="formValues[f.name]">
              <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input
              v-else-if="f.type === 'number'"
              v-model.number="formValues[f.name]"
              type="number"
              :placeholder="f.placeholder"
              @keydown="onFieldTab($event, f); onFieldEnter($event, false)"
            />
            <input
              v-else
              v-model="formValues[f.name]"
              type="text"
              :placeholder="f.placeholder"
              @keydown="onFieldTab($event, f); onFieldEnter($event, false)"
            />
          </div>
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <!-- 通用结果渲染器 -->
        <div v-if="result" class="result-area">
          <div class="result-summary">
            {{ result.summary }}
            <span class="latency">{{ result.latency_ms }} ms</span>
          </div>

          <div v-for="(b, i) in result.blocks" :key="i" class="block">
            <div v-if="b.label" class="block-label">{{ b.label }}</div>

            <!-- text -->
            <pre v-if="b.type === 'text'" class="block-text">{{ b.content }}</pre>

            <!-- score -->
            <div v-else-if="b.type === 'score'" class="block-score">
              <div class="score-row">
                <span class="score-num">{{ b.value }}</span>
                <span v-if="b.hint" class="score-hint">{{ b.hint }}</span>
              </div>
              <div class="score-bar"><div class="score-fill" :style="{ width: scorePct(b) + '%' }" /></div>
            </div>

            <!-- table -->
            <table v-else-if="b.type === 'table'" class="block-table">
              <thead><tr><th v-for="(h, hi) in b.headers" :key="hi">{{ h }}</th></tr></thead>
              <tbody>
                <tr v-for="(row, ri) in b.rows" :key="ri">
                  <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                </tr>
              </tbody>
            </table>

            <!-- keyvalue -->
            <div v-else-if="b.type === 'keyvalue'" class="block-kv">
              <div v-for="([k, v]) in kvEntries(b.items)" :key="k" class="kv-row">
                <span class="kv-key">{{ k }}</span>
                <span class="kv-val">{{ v }}</span>
              </div>
            </div>

            <!-- list -->
            <component v-else-if="b.type === 'list'" :is="b.ordered ? 'ol' : 'ul'" class="block-list">
              <li v-for="(item, li) in b.items" :key="li">{{ item }}</li>
            </component>

            <!-- json -->
            <pre v-else-if="b.type === 'json'" class="block-text">{{ JSON.stringify(b.data, null, 2) }}</pre>
          </div>
        </div>

        <div v-if="loading" class="loading"><div class="spinner" />运行模块...</div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.pg-panel { display: flex; height: 100%; overflow: hidden; }

.pg-nav {
  width: 220px; flex-shrink: 0; border-right: 1px solid var(--border);
  overflow-y: auto; padding: 12px 8px;
}
.nav-group { margin-bottom: 16px; }
.nav-group-title {
  font-size: 11px; color: var(--text-muted); font-weight: 600;
  padding: 4px 8px; text-transform: uppercase; letter-spacing: 0.5px;
}
.nav-item {
  padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer;
  transition: background 0.15s; margin-bottom: 2px;
}
.nav-item:hover { background: var(--surface-hover); }
.nav-item.active { background: rgba(56, 189, 248, 0.12); }
.nav-item-name { font-size: 13px; color: var(--text); font-weight: 500; }
.nav-item-lesson { font-size: 10px; color: var(--text-muted); margin-top: 1px; }

.pg-main { flex: 1; overflow-y: auto; padding: 20px 24px; }

.module-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 16px; gap: 16px;
}
.module-title { font-size: 16px; font-weight: 600; }
.module-desc { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

.btn-run {
  padding: 7px 18px; border: none; border-radius: var(--radius);
  background: var(--accent); color: #000; font-size: 13px; font-weight: 500;
  cursor: pointer; flex-shrink: 0;
}
.btn-run:hover:not(:disabled) { opacity: 0.85; }
.btn-run:disabled { opacity: 0.4; cursor: not-allowed; }

.form-body {
  display: flex; flex-direction: column; gap: 12px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px; margin-bottom: 16px;
}
.form-field { display: flex; flex-direction: column; gap: 4px; }
.form-field label { font-size: 12px; color: var(--text-dim); font-weight: 500; }
.field-help { color: var(--text-muted); font-weight: 400; margin-left: 8px; font-size: 11px; }
.field-tab-hint {
  margin-left: 8px; font-size: 10px; font-weight: 400; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 3px; padding: 0 5px;
  opacity: 0.7;
}
.form-field input, .form-field textarea, .form-field select {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg); color: var(--text); font-size: 13px;
  font-family: inherit; outline: none; resize: vertical;
}
.form-field input:focus, .form-field textarea:focus, .form-field select:focus {
  border-color: var(--accent);
}

.result-area {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px;
}
.result-summary {
  font-size: 14px; font-weight: 600; color: var(--green);
  padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.latency { font-size: 11px; color: var(--text-muted); font-weight: 400; }

.block { margin-bottom: 16px; }
.block:last-child { margin-bottom: 0; }
.block-label {
  font-size: 11px; color: var(--text-muted); font-weight: 600;
  margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;
}

.block-text {
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', monospace; color: var(--text);
  background: var(--bg); padding: 10px 12px; border-radius: var(--radius-sm);
}

.block-score .score-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.score-num { font-size: 24px; font-weight: 700; color: var(--accent); }
.score-hint { font-size: 12px; color: var(--text-dim); }
.score-bar { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.score-fill { height: 100%; background: var(--accent); transition: width 0.4s; }

.block-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.block-table th, .block-table td {
  padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--border);
}
.block-table th { color: var(--text-dim); font-weight: 600; }
.block-table td { color: var(--text); }

.block-kv .kv-row {
  display: flex; justify-content: space-between; padding: 6px 0;
  border-bottom: 1px solid var(--border); font-size: 13px;
}
.block-kv .kv-row:last-child { border-bottom: none; }
.kv-key { color: var(--text-dim); }
.kv-val { color: var(--text); font-weight: 500; }

.block-list { padding-left: 20px; font-size: 13px; color: var(--text); }
.block-list li { padding: 3px 0; line-height: 1.5; }

.error-msg {
  background: var(--red-bg); border: 1px solid var(--red); border-radius: var(--radius);
  padding: 10px 12px; font-size: 13px; color: var(--text); margin-bottom: 16px;
}

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted);
}
.empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.5; }

.loading { display: flex; align-items: center; gap: 8px; color: var(--text-dim); font-size: 13px; padding: 12px 0; }
.spinner {
  width: 14px; height: 14px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
