<script setup>
import { ref, computed } from 'vue'
import { checkpointSnapshot } from '../data/checkpointSnapshot.generated.js'

// 只读静态快照：构建前用后端 JsonPlusSerializer 预解码好，这里零 fetch、零后端
const dbs = checkpointSnapshot.dbs || []
const snapshots = checkpointSnapshot.snapshots || {}

const firstKey = (dbs.find(d => d.exists) || dbs[0])?.key || ''
const selectedDb = ref(firstKey)
const threadFilter = ref('')

const roleMeta = {
  user: { label: '用户', icon: '👤' },
  assistant: { label: '模型', icon: '🤖' },
  tool: { label: '工具', icon: '🔧' },
  system: { label: '系统', icon: '⚙️' },
}
function metaOf(role) {
  return roleMeta[role] || { label: role, icon: '•' }
}
function brief(m) {
  if (!m) return '（起点，还没有消息）'
  if (m.tool_call) return `想调用 ${m.tool_call.name}(${JSON.stringify(m.tool_call.args)})`
  return m.content || '（空）'
}

// 当前库的原始快照
const raw = computed(() => snapshots[selectedDb.value] || null)

// 前端做 thread 过滤（只读，不碰数据库）
const result = computed(() => {
  const r = raw.value
  if (!r || !r.ok) return r
  const tf = threadFilter.value.trim()
  if (!tf) return r
  const steps = (r.steps || []).filter(s => s.thread_id === tf)
    .map((s, i) => ({ ...s, index: i }))
  return {
    ...r,
    steps,
    full_conversation: steps.length ? steps[steps.length - 1].messages : [],
    checkpoint_count: steps.length,
    thread_filter: tf,
  }
})
</script>

<template>
  <div class="ckpt-page">
    <div class="ckpt-header">
      <h2>🗄 检查点数据库查看器</h2>
      <p class="subtitle">
        读取真实 LangGraph SQLite 检查点库，把二进制 state 解码成可读的每一步对话轨迹。
        本地离线的迷你 LangSmith。
      </p>
    </div>

    <div class="ckpt-controls">
      <label>
        检查点库
        <select v-model="selectedDb">
          <option v-for="d in dbs" :key="d.key" :value="d.key" :disabled="!d.exists">
            {{ d.label }}{{ d.exists ? '' : '（不存在）' }}
          </option>
        </select>
      </label>
      <label>
        限定 thread_id（可选）
        <input v-model="threadFilter" placeholder="留空看全部，例如 user-demo-7" />
      </label>
    </div>

    <div v-if="result && !result.ok" class="ckpt-error">⚠ {{ result.error }}</div>

    <div v-if="result && result.ok" class="ckpt-body">
      <!-- 概览 -->
      <section class="card overview">
        <div class="ov-item"><span>数据库文件</span><b>{{ result.db_filename }}</b></div>
        <div class="ov-item"><span>检查点总数</span><b>{{ result.checkpoint_count }}</b></div>
        <div class="ov-item"><span>会话数</span><b>{{ result.all_threads?.length }}</b></div>
        <div class="ov-item">
          <span>thread 列表</span>
          <b>{{ result.all_threads?.join('、') }}</b>
        </div>
        <div class="ov-item full"><span>表</span><b>{{ result.tables?.join(', ') }}</b></div>
      </section>

      <!-- 每一步检查点 -->
      <section class="card">
        <h3>每一步检查点 <small>一行 = 一次节点转换的存档</small></h3>
        <table class="ckpt-table">
          <thead>
            <tr>
              <th class="col-idx">步</th>
              <th class="col-thread">thread_id</th>
              <th class="col-cid">checkpoint_id（完整）</th>
              <th class="col-count">消息数</th>
              <th class="col-last">最后消息（已解码）</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in result.steps" :key="s.checkpoint_id">
              <td class="col-idx">{{ s.index }}</td>
              <td class="col-thread">{{ s.thread_id }}</td>
              <td class="col-cid"><code>{{ s.checkpoint_id }}</code></td>
              <td class="col-count">{{ s.message_count ?? '?' }}</td>
              <td class="col-last">
                <span class="role-chip" :class="s.last_message?.role">
                  {{ metaOf(s.last_message?.role || '').icon }}
                  {{ metaOf(s.last_message?.role || '').label }}
                </span>
                <span class="last-text">{{ brief(s.last_message) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 完整对话回放 -->
      <section class="card">
        <h3>完整对话回放 <small>最后一步里累积的全部消息（已解码）</small></h3>
        <div class="convo">
          <div
            v-for="(m, i) in result.full_conversation"
            :key="i"
            class="msg"
            :class="m.role"
          >
            <div class="msg-role">
              <span class="role-chip" :class="m.role">
                {{ metaOf(m.role).icon }} {{ metaOf(m.role).label }}
              </span>
            </div>
            <div class="msg-content">
              <template v-if="m.tool_call">
                <span class="tool-tag">调用工具</span>
                <code>{{ m.tool_call.name }}({{ JSON.stringify(m.tool_call.args) }})</code>
              </template>
              <template v-else>{{ m.content }}</template>
            </div>
          </div>
        </div>
      </section>

      <p class="ckpt-note">
        🔒 只读静态快照：构建前已用 JsonPlusSerializer 把 msgpack 二进制解码成可读对话
        （原始直接看是乱码）。纯前端离线渲染，不碰任何数据库文件。
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 组件内自带深色变量，还原 sandbox 观感，不受笔记浅色主题影响 */
.ckpt-page {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-hover: #243450;
  --border: #334155;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-muted: #64748b;
  --accent: #38bdf8;
  --green: #22c55e;
  --green-bg: rgba(34, 197, 94, 0.1);
  --red: #ef4444;
  --red-bg: rgba(239, 68, 68, 0.1);
  --orange: #f59e0b;
  --orange-bg: rgba(245, 158, 11, 0.1);
  --radius: 8px;
  --radius-sm: 4px;

  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  border: 1px solid var(--border);
  padding: 20px 28px;
  min-height: calc(100vh - 140px);
  animation: fadeUp 0.35s ease;
}

.ckpt-header h2 {
  font-size: 18px;
  margin-bottom: 6px;
}
.subtitle {
  color: var(--text-dim);
  font-size: 13px;
  max-width: 720px;
}

.ckpt-controls {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin: 18px 0;
  flex-wrap: wrap;
}
.ckpt-controls label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-dim);
}
.ckpt-controls select,
.ckpt-controls input {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 7px 10px;
  font-size: 13px;
  min-width: 260px;
}

.ckpt-error {
  background: var(--red-bg);
  color: var(--red);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 18px;
}
.card h3 {
  font-size: 14px;
  margin-bottom: 12px;
}
.card h3 small {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 12px;
  margin-left: 6px;
}

.overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 24px;
}
.ov-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  border-bottom: 1px dashed var(--border);
  padding-bottom: 6px;
}
.ov-item.full {
  grid-column: 1 / -1;
}
.ov-item span {
  color: var(--text-dim);
}
.ov-item b {
  color: var(--text);
  text-align: right;
  word-break: break-all;
}

.ckpt-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}
.ckpt-table th,
.ckpt-table td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.ckpt-table th {
  background: var(--bg);
  color: var(--text-dim);
  font-weight: 500;
}
/* 覆盖笔记全局的浅色 tr:hover（深色主题下用低调的深色高亮） */
.ckpt-table tbody tr:hover td { background: var(--surface-hover); }
.col-idx { width: 44px; text-align: center; }
.col-thread { width: 130px; word-break: break-all; }
.col-cid { width: 240px; }
.col-cid code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--accent);
  white-space: normal;
  word-break: break-all;
  display: block;
}
.col-count { width: 64px; text-align: center; }
.col-last { word-break: break-word; }

.role-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  margin-right: 6px;
  white-space: nowrap;
  background: var(--surface-hover);
  color: var(--text-dim);
}
.role-chip.user { background: rgba(56, 189, 248, 0.15); color: var(--accent); }
.role-chip.assistant { background: var(--green-bg); color: var(--green); }
.role-chip.tool { background: var(--orange-bg); color: var(--orange); }

.last-text { word-break: break-word; }

.convo {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg);
}
.msg-content {
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
.msg-content code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--orange);
  word-break: break-all;
}
.tool-tag {
  display: inline-block;
  font-size: 11px;
  color: var(--orange);
  margin-right: 6px;
}

.ckpt-note {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
  max-width: 760px;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
