<template>
  <div class="section" :class="{ 'accent-border': section.accentBorder }">
    <h2>
      <span class="emoji">{{ section.emoji }}</span>
      {{ section.title }}
      <span v-if="section.tag" class="tag">{{ section.tag }}</span>
    </h2>

    <template v-for="(block, i) in section.blocks" :key="i">
      <!-- Text -->
      <p v-if="block.type === 'text'" :class="block.style || ''" v-html="block.text"></p>

      <!-- Subtitle -->
      <p v-if="block.type === 'subtitle'" class="section-subtitle">{{ block.text }}</p>

      <!-- List -->
      <ul v-if="block.type === 'list'">
        <li v-for="(item, j) in block.items" :key="j" v-html="item"></li>
      </ul>

      <!-- Code -->
      <div v-if="block.type === 'code'" class="code" v-html="block.code"></div>

      <!-- Code reference: 自动注入的真实源码，可折叠 -->
      <div v-if="block.type === 'codeRef'" class="code-ref">
        <button class="code-ref-head" @click="toggle(i)">
          <span class="code-ref-arrow">{{ expanded[i] ? '▼' : '▶' }}</span>
          <span class="code-ref-file">{{ block.file }}</span>
          <span v-if="resolveRef(block).lineCount" class="code-ref-meta">{{ resolveRef(block).lineCount }} 行</span>
          <span v-if="block.label" class="code-ref-label">— {{ block.label }}</span>
        </button>
        <div v-show="expanded[i]" class="code-ref-body">
          <p v-if="resolveRef(block).error" class="code-ref-error">{{ resolveRef(block).error }}</p>
          <template v-else>
            <pre class="code-ref-pre"><code>{{ resolveRef(block).code }}</code></pre>
            <p v-if="resolveRef(block).truncated" class="code-ref-trunc">… 仅显示前若干行，完整源码见仓库 {{ block.file }}</p>
          </template>
        </div>
      </div>

      <!-- Table -->
      <div v-if="block.type === 'table'" class="table-wrap">
        <table>
          <tr>
            <th v-for="(h, j) in block.headers" :key="j" v-html="h"></th>
          </tr>
          <tr v-for="(row, j) in block.rows" :key="j">
            <td v-for="(cell, k) in row" :key="k" v-html="cell"></td>
          </tr>
        </table>
      </div>

      <!-- Flow -->
      <div v-if="block.type === 'flow'" class="flow">
        <div v-for="(step, j) in block.steps" :key="j" class="flow-step">
          <span class="label">{{ step.label }}</span><br>
          <span class="desc">{{ step.desc }}</span>
        </div>
      </div>

      <!-- Q&A -->
      <div v-if="block.type === 'qa'">
        <div v-for="(item, j) in block.items" :key="j" class="qa-item">
          <p class="qa-q"><strong>Q: {{ item.q }}</strong></p>
          <p class="qa-a">{{ item.a }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import codeRefs from '../data/codeRefs.generated.js'

defineProps({
  section: { type: Object, required: true }
})

// 记录每个 codeRef 块的展开状态（按 block 索引）
const expanded = ref({})
function toggle(i) {
  expanded.value[i] = !expanded.value[i]
}

// 按 file(+lines) 拼 key，从生成的映射里取真实源码
function resolveRef(block) {
  const key = block.lines ? `${block.file}#${block.lines}` : block.file
  return codeRefs[key] || { code: '', error: `未找到源码：${block.file}（重新 build 试试）`, lineCount: 0 }
}
</script>
