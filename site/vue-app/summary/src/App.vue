<template>
  <div class="container">
    <AppHeader />

    <!-- Tabs: Days + Practice -->
    <div class="tabs-wrap">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: currentTab === tab.id }"
          @click="currentTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Day Content -->
    <template v-for="day in days" :key="day.id">
      <DayContent v-if="currentTab === day.id" :day="day" :active="true" />
    </template>

    <!-- Practice View -->
    <PracticeView v-if="currentTab === 'practice'" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { siteData } from './data/content.js'
import AppHeader from './components/AppHeader.vue'
import DayContent from './components/DayContent.vue'
import PracticeView from './components/PracticeView.vue'

const days = siteData.days
const currentTab = ref(days[days.length - 1].id)

const tabs = [
  ...days.map(d => ({ id: d.id, label: d.label })),
  { id: 'practice', label: '实践' }
]
</script>
