<script setup lang="ts">
import { ref } from 'vue'
import type { TreeGroupNode, TreeAdapterNode, Stats, BlockHistoryItem } from '@/types'

defineProps<{
  tree: TreeGroupNode[]
  stats: Stats
  blockHistory: BlockHistoryItem[]
}>()

const emit = defineEmits<{
  toggle: [name: string]
  reset: []
  benchmark: []
}>()

const collapsed = ref<Record<string, boolean>>({})
const hoveredAdapter = ref<TreeAdapterNode | null>(null)
const hoveredGroup = ref<{ label: string; inputCount: number; outputCount: number } | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })

function toggleGroup(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

function isCollapsed(key: string): boolean {
  return collapsed.value[key] === true
}

function onAdapterMouseenter(adapter: TreeAdapterNode, e: MouseEvent) {
  hoveredAdapter.value = adapter
  hoveredGroup.value = null
  tooltipPos.value = { x: e.clientX, y: e.clientY }
}

function onAdapterMouseleave() {
  hoveredAdapter.value = null
}

function onGroupMouseenter(group: TreeGroupNode, e: MouseEvent) {
  const inputCount = group.children
    .filter(c => c.label === 'input')
    .reduce((s, c) => s + c.children.length, 0)
  const outputCount = group.children
    .filter(c => c.label === 'output')
    .reduce((s, c) => s + c.children.length, 0)
  hoveredGroup.value = { label: group.label, inputCount, outputCount }
  hoveredAdapter.value = null
  tooltipPos.value = { x: e.clientX, y: e.clientY }
}

function onGroupMouseleave() {
  hoveredGroup.value = null
}

function adapterIcon(name: string): string {
  const icons: Record<string, string> = {
    rate_limiter: '⏱',
    injection: '💉',
    semantic: '🧠',
    pii_detector: '🔒',
    length_check: '📏',
    toxicity: '☣',
    topic_classifier: '🏷',
    output_scrubber: '🧹',
    relevance: '🎯',
    factual_classifier: '📊',
    cot_judge: '⚖',
    prompt_leak: '📜',
    rag_groundedness: '📚',
    format_validator: '✅',
  }
  return icons[name] || '🛡'
}

function groupIcon(label: string): string {
  const icons: Record<string, string> = {
    'Guardrails 基础': '🛡',
    'Prompt 工程': '📝',
    'Few-Shot & CoT': '🧮',
    '结构化输出': '📋',
    'RAG': '📚',
    '缓存与成本': '💰',
  }
  return icons[label] || '📦'
}

function groupDesc(label: string): string {
  const descs: Record<string, string> = {
    'Guardrails 基础': 'LLM 安全护栏核心层：速率限制、注入检测、语义过滤、PII 检测、长度检查、毒性过滤、话题分类、输出脱敏、相关性检查。覆盖输入到输出的全链路安全防护。',
    'Prompt 工程': '检测 LLM 输出是否泄露了系统提示词中的敏感信息。系统提示是核心资产，泄露后可被利用构造针对性注入攻击。',
    'Few-Shot & CoT': '对模糊匹配结果做 Chain-of-Thought 二次裁决。当检测置信度处于灰色地带（0.60~0.85）时，通过 LLM 推理判断是否为真正攻击，降低误杀率。',
    '结构化输出': '验证 LLM 输出格式是否符合预期（JSON 解析、Markdown 代码块闭合、空输出检测）。格式错误比内容错误更致命——下游解析会直接崩溃。',
    'RAG': '检查 LLM 输出是否基于提供的上下文文档，防止幻觉。提取回答中的事实性断言（含数字、日期、价格的句子），在上下文中验证依据，超过 40% 断言无依据则拦截。',
    '缓存与成本': '区分事实性问题和创意性问题。事实性问题（查订单、问政策）走宽松阈值，创意性问题（写文章、分析）走严格阈值。根据问题类型动态调整后续适配器的拦截标准，优化缓存策略和成本。',
  }
  return descs[label] || ''
}

function adapterDetail(name: string, field: string): string {
  const details: Record<string, Record<string, string>> = {
    rate_limiter: {
      mechanism: '基于滑动窗口的令牌桶算法，按用户 tier（free/pro/enterprise）动态调整 RPM 上限',
      impact: '防止恶意用户耗尽 LLM API 配额，保障服务稳定性',
      scene: '适用于所有需要控制调用频率的场景，是多层防护的第一道门',
    },
    injection_detector: {
      mechanism: '21 条正则规则匹配已知注入模式（DAN 越狱、指令覆盖、系统提示泄露等），每条规则有独立置信度评分',
      impact: '拦截最常见的提示注入攻击，覆盖 OWASP LLM Top 10 中的注入风险',
      scene: '必须部署在所有对外暴露的 LLM 应用入口',
    },
    semantic_detector: {
      mechanism: '用 sentence-transformers 将输入转为 768 维向量，与已知攻击种子向量计算余弦相似度',
      impact: '捕获未见过的攻击变种，补充正则匹配的盲区',
      scene: '与 injection_detector 配合使用，形成精确匹配 + 语义泛化的双层防护',
    },
    pii_detector: {
      mechanism: '正则扫描手机号、邮箱、身份证、信用卡、IP 地址，支持哈希脱敏存储',
      impact: '防止用户隐私数据进入 LLM 上下文，满足合规要求（GDPR/PIPL）',
      scene: '处理用户信息的客服、医疗、金融场景必须启用',
    },
    length_checker: {
      mechanism: '检查字符数（≤10,000）和词数（≤2,000），防止超长输入导致 token 溢出',
      impact: '避免意外的高额 API 费用和上下文窗口溢出',
      scene: '所有场景的基础防护，通常放在靠后的位置作为兜底检查',
    },
    toxicity_filter: {
      mechanism: '暴力/违法/自残/色情/仇恨 5 类正则检测，支持安全上下文豁免（如"如何预防自杀"）',
      impact: '过滤有害内容，确保 LLM 输出符合安全和伦理标准',
      scene: '面向未成年用户或公共场景的必备护栏',
    },
    topic_classifier: {
      mechanism: '关键词白名单匹配 + 黑名单拦截，检查输入是否在允许的 20+ 个话题范围内',
      impact: '将对话控制在业务允许范围内，防止话题漂移',
      scene: '垂直领域应用（如医疗、法律）限制对话范围的核心手段',
    },
    output_scrubber: {
      mechanism: '替换 LLM 输出中的邮箱/手机/身份证/信用卡为 [REDACTED] 标记，不拦截仅脱敏',
      impact: '防止 LLM 意外生成包含真实 PII 的内容',
      scene: '所有 LLM 输出都应经过脱敏，是数据合规的最后一关',
    },
    relevance_checker: {
      mechanism: '计算用户输入与 LLM 输出的非停用词重叠度，阈值 0.05，低于则判为不相关',
      impact: '防止 LLM 跑题或生成与问题无关的内容',
      scene: '问答、客服场景的重要质量保障',
    },
    factual_classifier: {
      mechanism: '关键词匹配判断问题类型（创意性 vs 事实性），将结果注入 context 供下游 adapter 使用',
      impact: '事实性问题走宽松阈值避免误拦，创意性问题走严格阈值防止注入',
      scene: '成本敏感场景的前置分类器，优化缓存命中率和推理成本',
    },
    cot_judge: {
      mechanism: '灰色地带模式（ignore/forget/override 等）触发 LLM Chain-of-Thought 推理，用 deepseek-v4-flash 做二次裁决',
      impact: '大幅降低误杀率，让正常对话通过而拦截真正的攻击',
      scene: '对误报敏感的场景（客服、教育）必须启用',
    },
    prompt_leak: {
      mechanism: '三层检测：①敏感短语精确匹配 ②系统提示关键词聚集检测 ③元指令泄漏标志检测',
      impact: '保护系统提示词这一核心资产不被泄露',
      scene: '含定制系统提示的商用 LLM 应用必须部署',
    },
    rag_groundedness: {
      mechanism: '提取回答中含数字/日期/金额的事实性断言，在提供的上下文文档中验证依据，超 40% 无依据则判定为幻觉',
      impact: '防止 LLM 编造信息，提升 RAG 应用的可信度',
      scene: '知识库问答、文档分析等 RAG 场景的核心护栏',
    },
    format_validator: {
      mechanism: '四项检测：JSON 格式校验、Markdown 代码块完整性检测、输入要求结构化输出验证、空输出检测',
      impact: '确保下游系统能正常解析 LLM 输出，避免集成崩溃',
      scene: '要求结构化输出（JSON/Code）的生产环境必须启用',
    },
  }
  return details[name]?.[field] || ''
}

function adapterCategoryIcon(cat: string): string {
  return cat === 'input' ? '📥' : '📤'
}

function adapterCountText(children: any[]): string {
  const total = children.reduce((s: number, c: any) => s + c.children.length, 0)
  return `${total} 个适配器`
}
</script>

<template>
  <div class="adapter-tree">
    <div class="panel-header">
      <h3>🛡 适配器</h3>
      <button class="btn-sm" @click="emit('reset')">重置</button>
    </div>

    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">总计</span>
      </div>
      <div class="stat-item blocked">
        <span class="stat-value">{{ stats.blocked }}</span>
        <span class="stat-label">拦截</span>
      </div>
      <div class="stat-item passed">
        <span class="stat-value">{{ stats.passed }}</span>
        <span class="stat-label">通过</span>
      </div>
      <div class="stat-item rate">
        <span class="stat-value">{{ stats.block_rate_pct }}%</span>
        <span class="stat-label">拦截率</span>
      </div>
    </div>

    <div class="tree-container">
      <template v-for="group in tree" :key="group.key">
        <div class="tree-group">
          <div
            class="tree-group-label"
            @click="toggleGroup(group.key)"
            @mouseenter="onGroupMouseenter(group, $event)"
            @mouseleave="onGroupMouseleave"
            @mousemove="hoveredGroup && (tooltipPos = { x: $event.clientX, y: $event.clientY })"
          >
            <span class="group-arrow">{{ isCollapsed(group.key) ? '▶' : '▼' }}</span>
            {{ groupIcon(group.label) }} {{ group.label }}
            <span class="group-count">{{ adapterCountText(group.children) }}</span>
          </div>

          <div v-show="!isCollapsed(group.key)" class="group-body">
            <template v-for="cat in group.children" :key="cat.key">
              <div class="tree-category">
                <div class="tree-category-label">
                  {{ cat.label === 'input' ? '📥 输入检查' : '📤 输出检查' }}
                </div>
                <div
                  v-for="adapter in cat.children"
                  :key="adapter.name"
                  class="tree-item"
                  @mouseenter="onAdapterMouseenter(adapter, $event)"
                  @mouseleave="onAdapterMouseleave"
                  @mousemove="tooltipPos = { x: $event.clientX, y: $event.clientY }"
                >
                  <div class="tree-item-info">
                    <span class="tree-item-icon">{{ adapterIcon(adapter.name) }}</span>
                    <span class="tree-item-name">{{ adapter.display_name }}</span>
                  </div>
                  <label class="switch" @click.stop>
                    <input
                      type="checkbox"
                      :checked="adapter.enabled"
                      @change="emit('toggle', adapter.name)"
                    />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <div class="actions">
      <button class="btn-primary" @click="emit('benchmark')">运行基准测试</button>
    </div>

    <!-- 一级目录悬浮提示 -->
    <Teleport to="body">
      <div
        v-if="hoveredGroup"
        class="tooltip group-tooltip"
        :style="{ left: tooltipPos.x + 16 + 'px', top: tooltipPos.y - 10 + 'px' }"
      >
        <div class="tooltip-header">
          <span class="tooltip-icon">{{ groupIcon(hoveredGroup.label) }}</span>
          <span class="tooltip-name">{{ hoveredGroup.label }}</span>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-desc">{{ groupDesc(hoveredGroup.label) }}</div>
          <div class="tooltip-meta">
            <span class="meta-tag cat">📥 输入 {{ hoveredGroup.inputCount }} 个</span>
            <span class="meta-tag cat">📤 输出 {{ hoveredGroup.outputCount }} 个</span>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 适配器悬浮提示（增强版） -->
    <Teleport to="body">
      <div
        v-if="hoveredAdapter"
        class="tooltip adapter-tooltip"
        :style="{ left: tooltipPos.x + 16 + 'px', top: tooltipPos.y - 10 + 'px' }"
      >
        <div class="tooltip-header">
          <span class="tooltip-icon">{{ adapterIcon(hoveredAdapter.name) }}</span>
          <span class="tooltip-name">{{ hoveredAdapter.display_name }}</span>
        </div>

        <div class="tooltip-body">
          <!-- 基础信息 -->
          <div class="tooltip-desc">{{ hoveredAdapter.description }}</div>

          <!-- 标签 -->
          <div class="tooltip-meta">
            <span class="meta-tag" :class="hoveredAdapter.enabled ? 'on' : 'off'">
              {{ hoveredAdapter.enabled ? '✓ 已开启' : '✗ 已关闭' }}
            </span>
            <span class="meta-tag cat">
              {{ adapterCategoryIcon(hoveredAdapter.category) }}
              {{ hoveredAdapter.category === 'input' ? '输入检查' : '输出检查' }}
            </span>
            <span class="meta-tag order">顺序 #{{ hoveredAdapter.order }}</span>
          </div>

          <!-- 实现机制 -->
          <div class="tooltip-section">
            <div class="section-label">⚙ 实现机制</div>
            <div class="section-text">{{ adapterDetail(hoveredAdapter.name, 'mechanism') }}</div>
          </div>

          <!-- 业务影响 -->
          <div class="tooltip-section">
            <div class="section-label">🎯 业务影响</div>
            <div class="section-text">{{ adapterDetail(hoveredAdapter.name, 'impact') }}</div>
          </div>

          <!-- 适用场景 -->
          <div class="tooltip-section">
            <div class="section-label">📌 适用场景</div>
            <div class="section-text">{{ adapterDetail(hoveredAdapter.name, 'scene') }}</div>
          </div>

          <!-- 统计 -->
          <div class="tooltip-stats">
            <div class="tooltip-stat">
              <span class="stat-num" style="color: #22c55e">{{ hoveredAdapter.stats.passed }}</span>
              <span class="stat-lbl">通过</span>
            </div>
            <div class="tooltip-stat">
              <span class="stat-num" style="color: #ef4444">{{ hoveredAdapter.stats.blocked }}</span>
              <span class="stat-lbl">拦截</span>
            </div>
            <div class="tooltip-stat">
              <span class="stat-num" style="color: #94a3b8">
                {{ hoveredAdapter.stats.passed + hoveredAdapter.stats.blocked }}
              </span>
              <span class="stat-lbl">总计</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.adapter-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.btn-sm {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.btn-sm:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.stats-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.stat-item {
  flex: 1;
  padding: 8px 4px;
  text-align: center;
  border-right: 1px solid var(--border);
}

.stat-item:last-child {
  border-right: none;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}

.stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

.stat-item.blocked .stat-value { color: var(--red); }
.stat-item.passed .stat-value { color: var(--green); }
.stat-item.rate .stat-value { color: var(--accent); }

.tree-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-group {
  margin-bottom: 2px;
}

.tree-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
  border-bottom: 1px solid var(--border);
  margin: 4px 0 0;
}

.tree-group-label:hover {
  background: var(--surface-hover);
}

.group-arrow {
  font-size: 10px;
  color: var(--text-muted);
  width: 12px;
  flex-shrink: 0;
}

.group-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.group-body {
  padding: 2px 0;
}

.tree-category {
  margin-bottom: 1px;
}

.tree-category-label {
  padding: 4px 16px 2px 28px;
  font-size: 12px;
  color: var(--text-dim);
}

.tree-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 16px 5px 36px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.tree-item:hover {
  background: var(--surface-hover);
}

.tree-item-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tree-item-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tree-item-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 9px;
  cursor: pointer;
  transition: 0.25s;
}

.slider::before {
  content: '';
  position: absolute;
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background: var(--text);
  border-radius: 50%;
  transition: 0.25s;
}

.switch input:checked + .slider {
  background: var(--accent-dim);
}

.switch input:checked + .slider::before {
  transform: translateX(14px);
  background: #fff;
}

.actions {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.btn-primary {
  width: 100%;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: #000;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover {
  opacity: 0.85;
}
</style>

<style>
.tooltip {
  position: fixed;
  z-index: 9999;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  min-width: 260px;
  max-width: 360px;
  pointer-events: none;
  animation: tooltip-fade-in 0.15s ease-out;
}

@keyframes tooltip-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  border-bottom: 1px solid #334155;
}

.tooltip-icon {
  font-size: 18px;
}

.tooltip-name {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
}

.tooltip-body {
  padding: 8px 14px 12px;
}

.tooltip-desc {
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
  margin-bottom: 8px;
}

.tooltip-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.meta-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #0f172a;
  color: #94a3b8;
  border: 1px solid #334155;
}

.meta-tag.on {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.3);
}

.meta-tag.off {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
}

.meta-tag.cat {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.meta-tag.order {
  color: #a78bfa;
  border-color: rgba(167, 139, 250, 0.3);
}

.tooltip-section {
  margin-bottom: 6px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 2px;
}

.section-text {
  font-size: 11px;
  line-height: 1.5;
  color: #cbd5e1;
  padding-left: 4px;
}

.tooltip-stats {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #334155;
}

.tooltip-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tooltip-stat .stat-num {
  font-size: 15px;
  font-weight: 700;
}

.tooltip-stat .stat-lbl {
  font-size: 11px;
  color: #64748b;
}

.group-tooltip {
  min-width: 280px;
  max-width: 380px;
}
</style>
