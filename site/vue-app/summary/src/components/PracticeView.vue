<template>
  <div class="practice-view">
    <!-- Experiment Selector -->
    <div class="experiment-tabs">
      <button
        v-for="exp in experiments"
        :key="exp.id"
        class="exp-btn"
        :class="{ active: currentExp?.id === exp.id }"
        @click="selectExperiment(exp.id)"
      >
        {{ exp.title }}
      </button>
    </div>

    <!-- Debugger -->
    <div v-if="currentExp" class="debugger">
      <!-- Step indicator -->
      <div class="step-indicator">
        <div
          v-for="(step, i) in currentExp.steps"
          :key="i"
          class="step-dot"
          :class="{
            active: currentStep === i,
            done: currentStep > i
          }"
          @click="goToStep(i)"
        ></div>
        <span class="step-label">{{ currentStep + 1 }} / {{ currentExp.steps.length }}</span>
      </div>

      <!-- Main: Code left, sidebar right -->
      <div class="debugger-main">
        <!-- Left: Code Panel -->
        <div class="code-panel">
          <div class="panel-header">📄 代码</div>
          <pre class="code-block"><code v-for="(line, i) in codeLines" :key="i" :class="{ highlight: isHighlighted(i + 1) }">{{ line }}</code><span class="cursor-line" ref="cursorRef"></span></pre>
        </div>

        <!-- Right: Sidebar (state + params + output + desc + controls) -->
        <div class="right-sidebar">
          <!-- State -->
          <div class="state-panel">
            <div class="panel-header">📊 变量状态</div>
            <div class="state-body">
              <div
                v-for="(v, i) in currentStepData.variables"
                :key="i"
                class="state-row"
              >
                <span class="state-name">{{ v.name }}</span>
                <span class="state-eq">=</span>
                <span class="state-value">{{ v.value }}</span>
              </div>
            </div>
          </div>

          <!-- Parameter Annotations -->
          <div v-if="currentStepData.params?.length" class="params-panel">
            <div class="panel-header">💡 参数说明</div>
            <div class="params-body">
              <div
                v-for="(p, i) in currentStepData.params"
                :key="i"
                class="param-row"
              >
                <span class="param-name">{{ p.name }}</span>
                <span class="param-val">{{ p.value }}</span>
                <span class="param-desc">{{ p.desc }}</span>
              </div>
            </div>
          </div>

          <!-- Output -->
          <div v-if="currentStepData.output" class="sidebar-output">
            <div class="panel-header">📋 输出</div>
            <pre class="output-text">{{ currentStepData.output }}</pre>
          </div>

          <!-- Step Description -->
          <div class="step-desc">
            <strong>{{ currentStepData.name }}</strong>
            <p>{{ currentStepData.description }}</p>
          </div>

          <!-- Controls -->
          <div class="debug-controls">
            <button class="ctrl-btn" :disabled="currentStep === 0" @click="prevStep">◀ 上一步</button>
            <button class="ctrl-btn" :disabled="!hasPrevLoop" @click="skipBackLoop">⏪ 回退</button>
            <button class="ctrl-btn" @click="reset">🔄 重置</button>
            <button class="ctrl-btn" :disabled="!hasNextLoop" @click="skipLoop">⏭ 跳过</button>
            <button class="ctrl-btn primary" :disabled="currentStep === maxStep" @click="nextStep">下一步 ▶</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <p>选择一个实验开始 👆</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { experiments } from '../data/debugSteps.js'

const currentExp = ref(null)
const currentStep = ref(0)

function selectExperiment(id) {
  currentExp.value = experiments.find(e => e.id === id)
  currentStep.value = 0
}

const currentStepData = computed(() => {
  if (!currentExp.value) return { variables: [], output: null, name: '', description: '' }
  return currentExp.value.steps[currentStep.value]
})

const codeLines = computed(() => {
  if (!currentExp.value) return []
  return currentStepData.value.code.split('\n')
})

function isHighlighted(lineNum) {
  const hl = currentStepData.value.highlightLines
  return hl && hl.includes(lineNum)
}

const maxStep = computed(() => {
  return currentExp.value ? currentExp.value.steps.length - 1 : 0
})

const hasNextLoop = computed(() => {
  const step = currentStep.value
  const next = step + 1
  return next <= maxStep.value
})

const hasPrevLoop = computed(() => {
  return currentStep.value > 0
})

function nextStep() {
  if (currentStep.value < maxStep.value) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function goToStep(i) {
  if (i >= 0 && i <= maxStep.value) {
    currentStep.value = i
  }
}

function skipLoop() {
  const target = Math.min(currentStep.value + 3, maxStep.value)
  currentStep.value = target
}

function skipBackLoop() {
  const target = Math.max(currentStep.value - 3, 0)
  currentStep.value = target
}

function reset() {
  currentStep.value = 0
}
</script>

<style scoped>
.practice-view {
  animation: fadeUp 0.35s ease;
}

.experiment-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.exp-btn {
  padding: 2px 8px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.exp-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.exp-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* Debugger - constrain height to viewport */
.debugger {
  background: var(--card-bg);
  border-radius: var(--radius);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow);
  overflow: hidden;
  max-height: calc(100vh - 180px);
  display: flex;
  flex-direction: column;
}

/* Step indicator */
.step-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--code-bg);
  border-bottom: 1px solid var(--card-border);
  flex-shrink: 0;
}
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--card-border);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.step-dot.active {
  background: var(--accent);
  transform: scale(1.3);
  box-shadow: 0 0 6px rgba(59,130,246,0.4);
}
.step-dot.done {
  background: #93c5fd;
}
.step-dot:hover {
  transform: scale(1.2);
}
.step-label {
  margin-left: 8px;
  font-size: 0.7rem;
  color: var(--text-muted);
  white-space: nowrap;
}

/* Main area: code left, sidebar right */
.debugger-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Code panel */
.code-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--card-border);
  min-width: 0;
}
.panel-header {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 6px 12px;
  background: var(--code-bg);
  border-bottom: 1px solid var(--card-border);
  color: var(--text-secondary);
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.code-block {
  flex: 1;
  padding: 10px 14px;
  font-size: 0.85rem;
  font-family: "SF Mono", "Fira Code", monospace;
  line-height: 1.7;
  background: #1e293b;
  color: #e2e8f0;
  overflow-y: auto;
  margin: 0;
  overflow-x: auto;
}
.code-block code {
  display: block;
  white-space: pre;
}
.code-block code.highlight {
  background: rgba(59,130,246,0.25);
  border-left: 3px solid var(--accent);
  color: #f8fafc;
  padding-left: 8px;
  border-radius: 0;
}

/* Right sidebar */
.right-sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* State panel */
.state-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.state-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.state-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 12px;
  font-size: 0.8rem;
  border-bottom: 1px solid #f1f5f9;
  font-family: "SF Mono", "Fira Code", monospace;
}
.state-row:last-child {
  border-bottom: none;
}
.state-name {
  color: var(--accent);
  font-weight: 500;
  flex-shrink: 0;
}
.state-eq {
  color: var(--text-muted);
}
.state-value {
  color: var(--text-secondary);
  word-break: break-all;
  font-size: 0.76rem;
}

/* Parameter annotations */
.params-panel {
  border-top: 1px solid var(--card-border);
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}
.params-body {
  padding: 6px 10px;
}
.param-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  padding: 5px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.78rem;
}
.param-row:last-child {
  border-bottom: none;
}
.param-name {
  color: var(--accent);
  font-weight: 600;
  font-family: "SF Mono", "Fira Code", monospace;
  background: var(--accent-light);
  padding: 0 5px;
  border-radius: 3px;
}
.param-val {
  color: var(--note);
  font-weight: 600;
  font-family: "SF Mono", "Fira Code", monospace;
}
.param-desc {
  color: var(--text-muted);
  font-size: 0.74rem;
  width: 100%;
  line-height: 1.4;
  margin-top: 1px;
}

/* Sidebar output */
.sidebar-output {
  border-top: 1px solid var(--card-border);
  flex-shrink: 0;
}
.output-text {
  padding: 10px 14px;
  font-size: 0.82rem;
  font-family: "SF Mono", "Fira Code", monospace;
  background: var(--accent-light);
  color: var(--text);
  line-height: 1.6;
  white-space: pre-wrap;
  margin: 0;
  max-height: 120px;
  overflow-y: auto;
}

/* Step description */
.step-desc {
  padding: 10px 14px;
  border-top: 1px solid var(--card-border);
  flex-shrink: 0;
}
.step-desc strong {
  font-size: 0.88rem;
  color: var(--text);
  display: block;
  margin-bottom: 2px;
}
.step-desc p {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

/* Controls */
.debug-controls {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  border-top: 1px solid var(--card-border);
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: center;
}
.ctrl-btn {
  padding: 6px 10px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}
.ctrl-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ctrl-btn.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.ctrl-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 700px) {
  .debugger-main {
    flex-direction: column;
  }
  .code-panel {
    border-right: none;
    border-bottom: 1px solid var(--card-border);
  }
  .right-sidebar {
    width: 100%;
  }
  .debugger {
    max-height: none;
  }
}
</style>
