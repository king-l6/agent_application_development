<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  fetchCheckpointDbs,
  inspectCheckpoints,
  type CheckpointDb,
  type CheckpointInspectResult,
  type CheckpointMessage,
} from '@/api/guardrails'

const dbs = ref<CheckpointDb[]>([])
const selectedDb = ref('')
const threadFilter = ref('')
const result = ref<CheckpointInspectResult | null>(null)
const loading = ref(false)
const error = ref('')

const roleMeta: Record<string, { label: string; icon: string }> = {
  user: { label: '用户', icon: '👤' },
  assistant: { label: '模型', icon: '🤖' },
  tool: { label: '工具', icon: '🔧' },
  system: { label: '系统', icon: '⚙️' },
}

function metaOf(role: string) {
  return roleMeta[role] || { label: role, icon: '•' }
}

function brief(m: CheckpointMessage | null): string {
  if (!m) return '（起点，还没有消息）'
  if (m.tool_call) return `想调用 ${m.tool_call.name}(${JSON.stringify(m.tool_call.args)})`
  return m.content || '（空）'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await inspectCheckpoints(selectedDb.value, threadFilter.value.trim())
    if (!res.ok) {
      error.value = res.error || '读取失败'
      result.value = null
    } else {
      result.value = res
    }
  } catch (e: any) {
    error.value = e.message
    result.value = null
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const res = await fetchCheckpointDbs()
    dbs.value = res.dbs
    const first = res.dbs.find((d) => d.exists) || res.dbs[0]
    if (first) {
      selectedDb.value = first.key
      await load()
    }
  } catch (e: any) {
    error.value = e.message
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
        <select v-model="selectedDb" @change="load">
          <option v-for="d in dbs" :key="d.key" :value="d.key" :disabled="!d.exists">
            {{ d.label }}{{ d.exists ? '' : '（不存在）' }}
          </option>
        </select>
      </label>
      <label>
        限定 thread_id（可选）
        <input
          v-model="threadFilter"
          placeholder="留空看全部，例如 user-demo-7"
          @keyup.enter="load"
        />
      </label>
      <button class="btn" :disabled="loading" @click="load">
        {{ loading ? '读取中…' : '刷新' }}
      </button>
    </div>

    <div v-if="error" class="ckpt-error">⚠ {{ error }}</div>

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
        🔒 只读打开数据库（mode=ro），仅允许预置库 ——
        看真实数据安全，不会误改也不会读到项目外文件。
        checkpoint 列原本是 msgpack 二进制（直接看是乱码），这里已用
        JsonPlusSerializer 解码。
      </p>
    </div>
  </div>
</template>

<style scoped>
.ckpt-page {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
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
.btn {
  background: var(--accent);
  color: #000;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
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

/* 检查点表：checkpoint_id 列固定宽度，超宽换行，完整显示 */
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
.col-idx { width: 44px; text-align: center; }
.col-thread { width: 130px; word-break: break-all; }
.col-cid {
  width: 240px;           /* 固定宽度 */
}
.col-cid code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--accent);
  white-space: normal;     /* 允许换行 */
  word-break: break-all;   /* 超过宽度就断行，完整显示 */
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

/* 对话回放 */
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
</style>
