<template>
  <div class="container" :class="{ 'full-width': topTab === 'playground' }">
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
    <template v-else-if="topTab === 'playground'">
      <!-- 实验台内部子 tab：课程实验 / 数据库 -->
      <div class="pg-subtabs">
        <button
          class="pg-subtab-btn"
          :class="{ active: pgTab === 'modules' }"
          @click="pgTab = 'modules'"
        >🧪 课程实验</button>
        <button
          class="pg-subtab-btn"
          :class="{ active: pgTab === 'checkpoints' }"
          @click="pgTab = 'checkpoints'"
        >🗄 数据库</button>
      </div>

      <PlaygroundView v-if="pgTab === 'modules'" />
      <CheckpointDbView v-else-if="pgTab === 'checkpoints'" />
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { siteData } from './data/content.js'
import DayContent from './components/DayContent.vue'
import PracticeView from './components/PracticeView.vue'
import PlaygroundView from './components/PlaygroundView.vue'
import CheckpointDbView from './components/CheckpointDbView.vue'

const days = siteData.days

// 顶层：notes（学习笔记）/ playground（实验台）
const topTab = ref('notes')

// 实验台内部：modules（课程实验）/ checkpoints（数据库）
const pgTab = ref('modules')

// 笔记内部子 tab
const currentTab = ref(days[days.length - 1].id)
const noteTabs = [
  ...days.map(d => ({ id: d.id, label: d.label })),
  { id: 'practice', label: '实践' }
]
</script>

<style scoped>
/* 实验台比笔记宽（要容纳左导航+右内容），但不铺满超宽屏：1200px 居中 */
.container.full-width {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
}

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

/* 实验台内部子 tab */
.pg-subtabs {
  display: flex;
  gap: 4px;
  margin: 0 0 14px;
}
.pg-subtab-btn {
  padding: 6px 16px;
  border: 1px solid var(--card-border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.pg-subtab-btn:hover { color: var(--accent); }
.pg-subtab-btn.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

</style>
