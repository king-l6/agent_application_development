<template>
  <div v-show="active" class="day-content">
    <div class="day-header">
      <span class="date">{{ day.date }}</span>
      <span v-if="day.locked" class="lock-badge">🔒 已锁定</span>
    </div>

    <!-- Progress -->
    <div v-if="day.progress" class="progress-container">
      <div class="progress-header">
        <span>{{ day.progress.label }}</span>
        <span>{{ day.progress.detail }}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: day.progress.percent + '%' }">
          {{ day.progress.text }}
        </div>
      </div>
      <div class="progress-desc">{{ day.progress.desc }}</div>
    </div>

    <!-- Key Point -->
    <div v-if="day.keyPoint" class="key-point">
      <p><strong>{{ day.keyPoint.title }}</strong></p>
      <p v-for="(h, i) in day.keyPoint.highlights" :key="i" style="font-size:1.05rem;text-align:center;padding:12px 0;">
        <span class="highlight">{{ h }}</span>
      </p>
      <p>{{ day.keyPoint.desc }}</p>
    </div>

    <!-- Sections -->
    <SectionCard
      v-for="(section, i) in day.sections"
      :key="i"
      :section="section"
    />

    <div class="footer">{{ day.footer }}</div>
  </div>
</template>

<script setup>
import SectionCard from './SectionCard.vue'

defineProps({
  day: { type: Object, required: true },
  active: { type: Boolean, default: false }
})
</script>
