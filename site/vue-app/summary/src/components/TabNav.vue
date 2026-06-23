<template>
  <div class="tabs-wrap">
    <div class="tabs">
      <button
        v-for="day in days"
        :key="day.id"
        class="tab-btn"
        :class="{ active: activeDay === day.id }"
        @click="$emit('switch', day.id)"
      >
        {{ day.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  days: { type: Array, required: true },
  activeDay: { type: Number, required: true }
})

defineEmits(['switch'])
</script>
