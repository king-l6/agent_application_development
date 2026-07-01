<template>
  <div class="playground-view">
    <!-- 实验选择 -->
    <div class="experiment-tabs">
      <button
        v-for="exp in experiments"
        :key="exp.id"
        class="exp-btn"
        :class="{ active: currentExp?.id === exp.id }"
        @click="selectExperiment(exp.id)"
      >
        {{ exp.title }}
      </button>
    </div>

    <div v-if="currentExp" class="pg-main">
      <!-- 左：输入表单 -->
      <div class="input-panel">
        <div class="panel-header">🎛 输入参数</div>
        <div class="pg-desc">
          <span class="pg-tag">{{ currentExp.phase }} · {{ currentExp.lesson }}</span>
          <p>{{ currentExp.description }}</p>
        </div>
        <div class="form-body">
          <div v-for="f in currentExp.inputs" :key="f.name" class="form-row">
            <label>{{ f.label }}</label>
            <select v-if="f.type === 'select'" v-model="form[f.name]">
              <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
            </select>
            <input
              v-else-if="f.type === 'number'"
              type="number" step="0.05" v-model="form[f.name]"
            />
            <input v-else type="text" v-model="form[f.name]" />
            <p v-if="f.help" class="form-help">{{ f.help }}</p>
          </div>
          <button class="run-btn" @click="runExp">▶ 运行</button>
        </div>
      </div>

      <!-- 右：结果块 -->
      <div class="result-panel">
        <div class="panel-header">📊 运行结果</div>
        <div v-if="result" class="result-body">
          <div class="result-summary">{{ result.summary }}</div>
          <div v-for="(b, i) in result.blocks" :key="i" class="block">
            <div v-if="b.label" class="block-label">{{ b.label }}</div>

            <!-- keyvalue -->
            <div v-if="b.type === 'keyvalue'" class="kv">
              <div v-for="(v, k) in b.items" :key="k" class="kv-row">
                <span class="kv-key">{{ k }}</span>
                <span class="kv-val">{{ v }}</span>
              </div>
            </div>

            <!-- table -->
            <table v-else-if="b.type === 'table'" class="pg-table">
              <thead>
                <tr><th v-for="(h, j) in b.headers" :key="j">{{ h }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, r) in b.rows" :key="r">
                  <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
                </tr>
              </tbody>
            </table>

            <!-- list -->
            <ul v-else-if="b.type === 'list'" class="pg-list">
              <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
            </ul>

            <!-- score -->
            <div v-else-if="b.type === 'score'" class="score">
              <div class="score-bar">
                <div class="score-fill" :style="{ width: (b.value / (b.max || 1) * 100) + '%' }"></div>
              </div>
              <div class="score-num">{{ b.value }}<span v-if="b.hint"> · {{ b.hint }}</span></div>
            </div>

            <!-- text -->
            <p v-else-if="b.type === 'text'" class="pg-text">{{ b.content }}</p>
          </div>
        </div>
        <div v-else class="empty-state">调好参数，点「运行」看结果 👈</div>
      </div>
    </div>

    <div v-else class="empty-state">选择一个实验开始 👆</div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { playgroundExperiments } from '../data/playground.js'

const experiments = playgroundExperiments
const currentExp = ref(null)
const form = reactive({})
const result = ref(null)

function selectExperiment(id) {
  currentExp.value = experiments.find(e => e.id === id)
  // 初始化表单默认值
  Object.keys(form).forEach(k => delete form[k])
  for (const f of currentExp.value.inputs) form[f.name] = f.default
  result.value = currentExp.value.run({ ...form })  // 选中即先跑一次默认
}

function runExp() {
  if (!currentExp.value) return
  result.value = currentExp.value.run({ ...form })
}
</script>

<style scoped>
.playground-view { animation: fadeUp 0.35s ease; }

.experiment-tabs {
  display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;
}
.exp-btn {
  padding: 2px 8px; border: 1px solid var(--card-border); background: var(--card-bg);
  color: var(--text-secondary); font-size: 0.72rem; font-weight: 500;
  border-radius: 6px; cursor: pointer; transition: all 0.2s;
}
.exp-btn:hover { border-color: var(--accent); color: var(--accent); }
.exp-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

.pg-main {
  display: flex; gap: 0;
  background: var(--card-bg); border: 1px solid var(--card-border);
  border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;
  max-height: calc(100vh - 180px);
}

.panel-header {
  font-size: 0.7rem; font-weight: 600; padding: 6px 12px;
  background: var(--code-bg); border-bottom: 1px solid var(--card-border);
  color: var(--text-secondary); letter-spacing: 0.3px; flex-shrink: 0;
}

/* 左输入 */
.input-panel {
  width: 320px; flex-shrink: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--card-border);
}
.pg-desc { padding: 10px 12px; border-bottom: 1px solid var(--card-border); }
.pg-tag {
  display: inline-block; font-size: 0.68rem; color: var(--accent);
  background: var(--accent-light); padding: 1px 6px; border-radius: 4px; margin-bottom: 4px;
}
.pg-desc p { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; margin: 4px 0 0; }
.form-body { padding: 12px; overflow-y: auto; }
.form-row { margin-bottom: 12px; }
.form-row label {
  display: block; font-size: 0.78rem; color: var(--text); font-weight: 500; margin-bottom: 4px;
}
.form-row select, .form-row input {
  width: 100%; padding: 6px 8px; font-size: 0.82rem;
  border: 1px solid var(--card-border); border-radius: 6px;
  background: var(--card-bg); color: var(--text);
}
.form-help { font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; margin: 3px 0 0; }
.run-btn {
  width: 100%; padding: 8px; background: var(--accent); color: #fff; border: none;
  border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; margin-top: 4px;
}
.run-btn:hover { opacity: 0.9; }

/* 右结果 */
.result-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.result-body { padding: 12px 14px; overflow-y: auto; }
.result-summary {
  font-size: 0.85rem; font-weight: 600; color: var(--accent);
  background: var(--accent-light); padding: 8px 12px; border-radius: 8px; margin-bottom: 14px;
}
.block { margin-bottom: 16px; }
.block-label {
  font-size: 0.76rem; font-weight: 600; color: var(--text); margin-bottom: 6px;
}

.kv { border: 1px solid var(--card-border); border-radius: 8px; overflow: hidden; }
.kv-row {
  display: flex; justify-content: space-between; gap: 12px; padding: 6px 12px;
  font-size: 0.8rem; border-bottom: 1px solid #f1f5f9;
}
.kv-row:last-child { border-bottom: none; }
.kv-key { color: var(--text-secondary); flex-shrink: 0; }
.kv-val { color: var(--text); font-weight: 500; text-align: right; word-break: break-all; }

.pg-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.pg-table th, .pg-table td {
  border: 1px solid var(--card-border); padding: 5px 8px; text-align: left; vertical-align: top;
}
.pg-table th { background: var(--code-bg); color: var(--text-secondary); font-weight: 600; }
.pg-table td { color: var(--text-secondary); word-break: break-word; }

.pg-list { margin: 0; padding-left: 18px; }
.pg-list li { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 4px; }

.pg-text {
  font-size: 0.8rem; color: var(--text-secondary); line-height: 1.6;
  background: var(--accent-light); padding: 8px 12px; border-radius: 8px; margin: 0;
}

.score-bar { height: 10px; background: var(--card-border); border-radius: 5px; overflow: hidden; }
.score-fill { height: 100%; background: var(--accent); }
.score-num { font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; }

.empty-state {
  text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 0.9rem;
  flex: 1;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 700px) {
  .pg-main { flex-direction: column; max-height: none; }
  .input-panel { width: 100%; border-right: none; border-bottom: 1px solid var(--card-border); }
}
</style>
