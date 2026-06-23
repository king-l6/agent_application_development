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
defineProps({
  section: { type: Object, required: true }
})
</script>
