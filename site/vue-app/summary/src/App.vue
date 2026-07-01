<template>
  <div class="container">
    <!-- 顶层大 tab：学习笔记 / 实验台 -->
    <div class="top-tabs">
      <button
        class="top-tab-btn"
        :class="{ active: topTab === 'notes' }"
        @click="topTab = 'notes'"
      >📖 AI 学习笔记</button>
      <button
        class="top-tab-btn"
        :class="{ active: topTab === 'playground' }"
        @click="topTab = 'playground'"
      >🧪 AI 工程学习实验台</button>
    </div>

    <!-- ===== 学习笔记 ===== -->
    <template v-if="topTab === 'notes'">
      <!-- 笔记内部子 tab：Days + 实践 -->
      <div class="tabs-wrap">
        <div class="tabs">
          <button
            v-for="tab in noteTabs"
            :key="tab.id"
            class="tab-btn"
            :class="{ active: currentTab === tab.id }"
            @click="currentTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <template v-for="day in days" :key="day.id">
        <DayContent v-if="currentTab === day.id" :day="day" :active="true" />
      </template>

      <PracticeView v-if="currentTab === 'practice'" />
    </template>

    <!-- ===== 实验台 ===== -->
    <PlaygroundView v-else-if="topTab === 'playground'" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { siteData } from './data/content.js'
import DayContent from './components/DayContent.vue'
import PracticeView from './components/PracticeView.vue'
import PlaygroundView from './components/PlaygroundView.vue'

const days = siteData.days

// 顶层：notes（学习笔记）/ playground（实验台）
const topTab = ref('notes')

// 笔记内部子 tab
const currentTab = ref(days[days.length - 1].id)
const noteTabs = [
  ...days.map(d => ({ id: d.id, label: d.label })),
  { id: 'practice', label: '实践' }
]
</script>

<style scoped>
.top-tabs {
  display: flex;
  gap: 6px;
  margin: 0 0 10px;
  border-bottom: 2px solid var(--card-border);
}
.top-tab-btn {
  padding: 8px 20px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}
.top-tab-btn:hover { color: var(--accent); }
.top-tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
</style>
