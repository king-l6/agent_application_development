<template>
  <div class="header">
    <h1>{{ siteData.header.title }}</h1>
    <p class="subtitle">{{ siteData.header.subtitle }}</p>
  </div>
</template>

<script setup>
import { siteData } from '../data/content.js'
</script>
