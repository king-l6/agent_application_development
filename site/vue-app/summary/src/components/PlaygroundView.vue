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
          <div class="nav-item-name">{{ m.displayName }}</div>
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
            <div class="module-title">{{ activeModule.displayName }}</div>
            <div class="module-desc">{{ activeModule.description }}</div>
          </div>
          <button class="btn-run" @click="run" title="单行输入框按 Enter 运行">▶ 运行</button>
        </div>

        <!-- schema 驱动表单 -->
        <div class="form-body">
          <div v-for="f in activeModule.inputs" :key="f.name" class="form-field">
            <label>
              {{ f.label }}
              <span v-if="f.help" class="field-help">{{ f.help }}</span>
            </label>
            <textarea
              v-if="f.type === 'textarea'"
              v-model="formValues[f.name]"
              :placeholder="f.placeholder"
              rows="3"
              @keydown="onFieldEnter($event, true)"
            />
            <select v-else-if="f.type === 'select'" v-model="formValues[f.name]">
              <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input
              v-else-if="f.type === 'number'"
              v-model="formValues[f.name]"
              type="number" step="0.05"
              :placeholder="f.placeholder"
              @keydown="onFieldEnter($event, false)"
            />
            <input
              v-else
              v-model="formValues[f.name]"
              type="text"
              :placeholder="f.placeholder"
              @keydown="onFieldEnter($event, false)"
            />
          </div>
        </div>

        <!-- 通用结果渲染器 -->
        <div v-if="result" class="result-area">
          <div class="result-summary">{{ result.summary }}</div>

          <div v-for="(b, i) in result.blocks" :key="i" class="block">
            <div v-if="b.label" class="block-label">{{ b.label }}</div>

            <pre v-if="b.type === 'text'" class="block-text">{{ b.content }}</pre>

            <div v-else-if="b.type === 'score'" class="block-score">
              <div class="score-row">
                <span class="score-num">{{ b.value }}</span>
                <span v-if="b.hint" class="score-hint">{{ b.hint }}</span>
              </div>
              <div class="score-bar"><div class="score-fill" :style="{ width: scorePct(b) + '%' }" /></div>
            </div>

            <table v-else-if="b.type === 'table'" class="block-table">
              <thead><tr><th v-for="(h, hi) in b.headers" :key="hi">{{ h }}</th></tr></thead>
              <tbody>
                <tr v-for="(row, ri) in b.rows" :key="ri">
                  <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                </tr>
              </tbody>
            </table>

            <div v-else-if="b.type === 'keyvalue'" class="block-kv">
              <div v-for="([k, v]) in kvEntries(b.items)" :key="k" class="kv-row">
                <span class="kv-key">{{ k }}</span>
                <span class="kv-val">{{ v }}</span>
              </div>
            </div>

            <component v-else-if="b.type === 'list'" :is="b.ordered ? 'ol' : 'ul'" class="block-list">
              <li v-for="(item, li) in b.items" :key="li">{{ item }}</li>
            </component>

            <pre v-else-if="b.type === 'json'" class="block-text">{{ JSON.stringify(b.data, null, 2) }}</pre>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { playgroundGroups } from '../data/playground.js'

const groups = playgroundGroups
const activeModule = ref(null)
const formValues = reactive({})
const result = ref(null)

function selectModule(mod) {
  activeModule.value = mod
  Object.keys(formValues).forEach(k => delete formValues[k])
  for (const f of mod.inputs) formValues[f.name] = f.default
  result.value = mod.run({ ...formValues })  // 选中即先跑一次默认
}

function run() {
  if (!activeModule.value) return
  result.value = activeModule.value.run({ ...formValues })
}

function onFieldEnter(e, isTextarea) {
  if (e.key !== 'Enter' || e.isComposing) return
  if (isTextarea && !(e.metaKey || e.ctrlKey)) return
  e.preventDefault()
  run()
}

const scorePct = (b) => Math.min(100, Math.max(0, (b.value / (b.max || 1)) * 100))

function kvEntries(items) {
  if (!items) return []
  if (Array.isArray(items)) return items.map((v, i) => [String(i), v])
  return Object.entries(items)
}
</script>

<style scoped>
/* 还原老 sandbox 深色实验台观感（组件内自带深色变量，不受笔记浅色主题影响）*/
.pg-panel {
  --pg-bg: #0f172a;
  --pg-surface: #1e293b;
  --pg-surface-hover: #243450;
  --pg-border: #334155;
  --pg-text: #e2e8f0;
  --pg-text-dim: #94a3b8;
  --pg-text-muted: #64748b;
  --pg-accent: #38bdf8;
  --pg-green: #22c55e;
  display: flex;
  height: calc(100vh - 120px);
  background: var(--pg-bg);
  color: var(--pg-text);
  border-radius: 10px;
  border: 1px solid var(--pg-border);
  overflow: hidden;
  animation: fadeUp 0.35s ease;
}

.pg-nav {
  width: 230px; flex-shrink: 0; border-right: 1px solid var(--pg-border);
  overflow-y: auto; padding: 12px 8px;
}
.nav-group { margin-bottom: 16px; }
.nav-group-title {
  font-size: 11px; color: var(--pg-text-muted); font-weight: 600;
  padding: 4px 8px; text-transform: uppercase; letter-spacing: 0.5px;
}
.nav-item {
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s; margin-bottom: 2px;
}
.nav-item:hover { background: var(--pg-surface-hover); }
.nav-item.active { background: rgba(56, 189, 248, 0.12); }
.nav-item-name { font-size: 13px; color: var(--pg-text); font-weight: 500; }
.nav-item-lesson { font-size: 10px; color: var(--pg-text-muted); margin-top: 1px; }

.pg-main { flex: 1; overflow-y: auto; padding: 20px 24px; }

.module-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 16px; gap: 16px;
}
.module-title { font-size: 16px; font-weight: 600; color: var(--pg-text); }
.module-desc { font-size: 12px; color: var(--pg-text-dim); margin-top: 4px; line-height: 1.5; }

.btn-run {
  padding: 7px 18px; border: none; border-radius: 8px;
  background: var(--pg-accent); color: #000; font-size: 13px; font-weight: 600;
  cursor: pointer; flex-shrink: 0;
}
.btn-run:hover { opacity: 0.85; }

.form-body {
  display: flex; flex-direction: column; gap: 12px;
  background: var(--pg-surface); border: 1px solid var(--pg-border);
  border-radius: 8px; padding: 16px; margin-bottom: 16px;
}
.form-field { display: flex; flex-direction: column; gap: 4px; }
.form-field label { font-size: 12px; color: var(--pg-text-dim); font-weight: 500; }
.field-help { color: var(--pg-text-muted); font-weight: 400; margin-left: 8px; font-size: 11px; }
.form-field input, .form-field textarea, .form-field select {
  padding: 8px 10px; border: 1px solid var(--pg-border); border-radius: 6px;
  background: var(--pg-bg); color: var(--pg-text); font-size: 13px;
  font-family: inherit; outline: none; resize: vertical;
}
.form-field input:focus, .form-field textarea:focus, .form-field select:focus {
  border-color: var(--pg-accent);
}

.result-area {
  background: var(--pg-surface); border: 1px solid var(--pg-border);
  border-radius: 8px; padding: 16px;
}
.result-summary {
  font-size: 14px; font-weight: 600; color: var(--pg-green);
  padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--pg-border);
}

.block { margin-bottom: 16px; }
.block:last-child { margin-bottom: 0; }
.block-label {
  font-size: 11px; color: var(--pg-text-muted); font-weight: 600;
  margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;
}

.block-text {
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', monospace; color: var(--pg-text);
  background: var(--pg-bg); padding: 10px 12px; border-radius: 6px;
}

.block-score .score-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.score-num { font-size: 24px; font-weight: 700; color: var(--pg-accent); }
.score-hint { font-size: 12px; color: var(--pg-text-dim); }
.score-bar { height: 8px; background: var(--pg-bg); border-radius: 4px; overflow: hidden; }
.score-fill { height: 100%; background: var(--pg-accent); transition: width 0.4s; }

.block-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.block-table th, .block-table td {
  padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--pg-border);
  vertical-align: top;
}
.block-table th { color: var(--pg-text-dim); font-weight: 600; }
.block-table td { color: var(--pg-text); word-break: break-word; }

.block-kv .kv-row {
  display: flex; justify-content: space-between; gap: 12px; padding: 6px 0;
  border-bottom: 1px solid var(--pg-border); font-size: 13px;
}
.block-kv .kv-row:last-child { border-bottom: none; }
.kv-key { color: var(--pg-text-dim); flex-shrink: 0; }
.kv-val { color: var(--pg-text); font-weight: 500; text-align: right; word-break: break-all; }

.block-list { padding-left: 20px; font-size: 13px; color: var(--pg-text); }
.block-list li { padding: 3px 0; line-height: 1.5; }

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--pg-text-muted); width: 100%;
}
.empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.5; }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 700px) {
  .pg-panel { flex-direction: column; height: auto; }
  .pg-nav { width: 100%; border-right: none; border-bottom: 1px solid var(--pg-border); }
}
</style>
