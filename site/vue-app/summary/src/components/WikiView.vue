<template>
  <div class="wiki-panel">
    <!-- 左侧：可折叠分类树 -->
    <aside class="wiki-nav">
      <div class="wiki-search">
        <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input v-model="q" type="text" placeholder="搜索文档…" />
        <button v-if="q" class="search-clear" @click="q = ''" title="清空">×</button>
      </div>
      <div class="tree-root">
        <WikiTreeNode
          v-for="node in filteredTree"
          :key="node.id"
          :node="node"
          :active-id="activeDocId"
          :expanded="expanded"
          :depth="0"
          @select="selectDoc"
          @toggle="toggleNode"
        />
        <p v-if="!filteredTree.length" class="no-result">没有匹配的文档</p>
      </div>
    </aside>

    <!-- 右侧：正文 -->
    <section class="wiki-main" ref="mainRef">
      <div v-if="!activeDoc" class="empty-state">
        <div class="empty-icon">📚</div>
        <p>从左侧选一篇文档开始阅读</p>
      </div>
      <template v-else>
        <article class="wiki-doc" v-html="renderedHtml" @click="onDocClick"></article>
        <!-- 引用文件清单：移到文末，折叠式卡片 -->
        <aside v-if="citeHtml" class="wiki-cite">
          <div class="cite-head">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h10l6 6v10a0 0 0 0 1 0 0H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M14 4v6h6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
            本文引用的文件
          </div>
          <div class="cite-body" v-html="citeHtml" @click="onExternalClick"></div>
        </aside>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, h, defineComponent } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import mermaid from 'mermaid'
import { wikiTree, wikiDocs } from '../data/wiki.generated.js'

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })

// ---- 递归树节点组件（可折叠）----
const WikiTreeNode = defineComponent({
  name: 'WikiTreeNode',
  props: {
    node: { type: Object, required: true },
    activeId: { type: String, default: null },
    expanded: { type: Object, required: true },
    depth: { type: Number, default: 0 },
  },
  emits: ['select', 'toggle'],
  setup(props, { emit }) {
    return () => {
      const n = props.node
      const hasChildren = n.children && n.children.length > 0
      const isOpen = props.expanded[n.id]
      const isActive = props.activeId === n.docId && n.docId
      const isTop = props.depth === 0

      const rowChildren = []
      // 展开箭头（仅有子节点时显示，用旋转动画）
      if (hasChildren) {
        rowChildren.push(h('span', {
          class: ['caret', { open: isOpen }],
          onClick: (e) => { e.stopPropagation(); emit('toggle', n.id) },
        }, svgCaret()))
      } else {
        rowChildren.push(h('span', { class: 'caret placeholder' }))
      }
      rowChildren.push(h('span', { class: 'node-title' }, n.title))

      const row = h('div', {
        class: ['tree-row', {
          active: isActive,
          'is-top': isTop,
          'is-group': hasChildren,
          'has-doc': !!n.docId,
        }],
        style: isTop ? undefined : { paddingLeft: (10 + props.depth * 14) + 'px' },
        onClick: () => {
          if (n.docId) emit('select', n.docId)
          else if (hasChildren) emit('toggle', n.id)
        },
      }, rowChildren)

      const kids = (hasChildren && isOpen)
        ? h('div', { class: 'tree-children' }, n.children.map(c =>
            h(WikiTreeNode, {
              node: c, activeId: props.activeId, expanded: props.expanded, depth: props.depth + 1,
              onSelect: (id) => emit('select', id),
              onToggle: (id) => emit('toggle', id),
            })))
        : null

      return h('div', { class: ['tree-node', { 'top-node': isTop }] }, [row, kids])
    }
  }
})

// 内联 SVG 箭头（比字符更清晰、可平滑旋转）
function svgCaret() {
  return h('svg', { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none' }, [
    h('path', { d: 'M9 6l6 6-6 6', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
  ])
}

// ---- 状态 ----
const q = ref('')
const expanded = ref({})           // { [nodeId]: true }
const activeDocId = ref(null)

// 默认选中第一篇有正文的文档，并展开其根
function firstDoc(nodes) {
  for (const n of nodes) {
    if (n.docId) return n.docId
    const r = firstDoc(n.children || [])
    if (r) return r
  }
  return null
}
activeDocId.value = firstDoc(wikiTree)
// 默认展开所有根节点
for (const r of wikiTree) expanded.value[r.id] = true

function toggleNode(id) {
  expanded.value[id] = !expanded.value[id]
}
function selectDoc(id) {
  activeDocId.value = id
}

const activeDoc = computed(() => activeDocId.value ? wikiDocs[activeDocId.value] : null)

// ---- 搜索过滤：保留标题命中的节点及其祖先 ----
const filteredTree = computed(() => {
  const kw = q.value.trim().toLowerCase()
  if (!kw) return wikiTree
  function filter(nodes) {
    const out = []
    for (const n of nodes) {
      const kids = filter(n.children || [])
      if (n.title.toLowerCase().includes(kw) || kids.length) {
        out.push({ ...n, children: kids })
      }
    }
    return out
  }
  return filter(wikiTree)
})
// 搜索时自动展开命中路径
watch(q, (kw) => {
  if (!kw.trim()) return
  function expand(nodes) {
    for (const n of nodes) { expanded.value[n.id] = true; expand(n.children || []) }
  }
  expand(filteredTree.value)
})

// ---- markdown 渲染 ----
// marked v14 移除了 setOptions({highlight})，改用自定义 renderer.code 做高亮。
// mermaid 块在 preprocessMermaid 已抽走，这里只处理普通代码块。
// 生成标题锚点 id。marked 里的「目录」链接形如 [引言](#引言)，target 就是标题原文，
// 所以 id 用「原文去空格」而非常见的英文 slug，才能让中文锚点对上。
function headingId(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')      // 去内联标签
    .trim()
    .replace(/\s+/g, '-')         // 空白转连字符（对应 marked 目录里 [x](#x) 的写法）
}

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  let html
  if (lang && hljs.getLanguage(lang)) {
    try { html = hljs.highlight(text, { language: lang }).value } catch { html = escapeHtml(text) }
  } else {
    try { html = hljs.highlightAuto(text).value } catch { html = escapeHtml(text) }
  }
  const cls = lang ? ` class="language-${lang}"` : ''
  return `<pre><code${cls}>${html}</code></pre>`
}
renderer.heading = ({ tokens, depth }) => {
  const inner = renderer.parser.parseInline(tokens)
  const raw = tokens.map(t => t.raw || t.text || '').join('')
  const id = headingId(raw)
  return `<h${depth} id="${id}">${inner}</h${depth}>\n`
}
marked.setOptions({ gfm: true, breaks: false, renderer })

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 把 ```mermaid 块替换成占位 div，渲染后再交给 mermaid
function preprocessMermaid(md) {
  let i = 0
  const blocks = []
  const replaced = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const id = `mermaid-${i++}`
    blocks.push({ id, code })
    return `<div class="mermaid-holder" data-id="${id}"></div>`
  })
  return { replaced, blocks }
}

// 抽出 <cite>...</cite>「本文档引用的文件」块。它在原文里紧跟标题、很占地方，
// 移到文末更符合阅读习惯（对齐 Qoder：引用清单放最后）。
function extractCite(md) {
  const m = md.match(/<cite>([\s\S]*?)<\/cite>/i)
  if (!m) return { body: md, cite: '' }
  const body = md.replace(m[0], '').replace(/\n{3,}/g, '\n\n')
  // 去掉块内那句「**本文档引用的文件**」标题——我们自己渲染带图标的卡片头
  const cite = m[1].replace(/\*\*本文档引用的文件\*\*/g, '').trim()
  return { body, cite }
}

const renderedHtml = ref('')
const citeHtml = ref('')
let currentBlocks = []

watch(activeDoc, (doc) => {
  if (!doc) { renderedHtml.value = ''; citeHtml.value = ''; return }
  const { body, cite } = extractCite(doc.markdown)
  const { replaced, blocks } = preprocessMermaid(body)
  currentBlocks = blocks
  renderedHtml.value = marked.parse(replaced)
  citeHtml.value = cite ? marked.parse(cite) : ''
  nextTick(renderMermaidAndScroll)
}, { immediate: true })

const mainRef = ref(null)

async function renderMermaidAndScroll() {
  const root = mainRef.value
  if (!root) return
  // 渲染 mermaid 占位块（限定在当前正文内查找，避免全局撞 id）
  for (const b of currentBlocks) {
    const holder = root.querySelector(`.mermaid-holder[data-id="${b.id}"]`)
    if (!holder) continue
    try {
      const { svg } = await mermaid.render(`svg-${b.id}-${Date.now()}`, b.code)
      holder.innerHTML = svg
    } catch (e) {
      holder.innerHTML = `<pre class="mermaid-error">mermaid 渲染失败：\n${(e && e.message) || e}</pre>`
    }
  }
  // 切换文档后滚回顶部
  root.scrollTop = 0
}

// 拦截正文内的锚点点击（如目录里的 [引言](#引言)）。
// 正文在自带滚动条的容器里，默认的 hash 跳转不生效，需手动滚到目标标题。
function onDocClick(e) {
  const a = e.target.closest('a')
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (!href.startsWith('#')) {               // 外链（GitHub 源文件等）新标签打开
    if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener' }
    return
  }
  e.preventDefault()
  const id = decodeURIComponent(href.slice(1))
  const root = mainRef.value
  if (!root) return
  // id 可能因编码差异对不上，做一次兜底：先精确查，再按标题文本模糊找
  let target = root.querySelector(`[id="${CSS.escape(id)}"]`)
  if (!target) {
    const heads = root.querySelectorAll('h1,h2,h3,h4,h5,h6')
    target = Array.from(heads).find(h => h.textContent.trim() === id)
  }
  if (target) {
    const top = target.offsetTop - root.offsetTop - 8
    root.scrollTo({ top, behavior: 'smooth' })
  }
}

// 引用清单里的 GitHub 链接：强制新标签打开
function onExternalClick(e) {
  const a = e.target.closest('a')
  if (a && /^https?:/.test(a.getAttribute('href') || '')) {
    a.target = '_blank'; a.rel = 'noopener'
  }
}
</script>

<style scoped>
.wiki-panel {
  display: grid;
  grid-template-columns: 272px 1fr;
  gap: 20px;
  align-items: start;
}

/* ===== 左侧导航 ===== */
.wiki-nav {
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 12px 10px;
}
/* 细滚动条 */
.wiki-nav::-webkit-scrollbar { width: 8px; }
.wiki-nav::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 4px; }
.wiki-nav::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* 搜索框 */
.wiki-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.wiki-search .search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}
.wiki-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 30px 8px 32px;
  border: 1px solid var(--card-border);
  border-radius: 9px;
  font-size: 0.85rem;
  background: var(--bg);
  color: var(--text);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.wiki-search input:focus {
  outline: none;
  border-color: #9ca3af;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.04);
}
.search-clear {
  position: absolute;
  right: 8px;
  width: 18px;
  height: 18px;
  border: none;
  background: var(--card-border);
  color: var(--text-secondary);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-clear:hover { background: var(--text-muted); color: #fff; }

.tree-root { display: flex; flex-direction: column; gap: 2px; }
.no-result { color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px 0; }

/* 顶级节点之间留出呼吸间距 */
.top-node { margin-bottom: 2px; }
.top-node + .top-node { margin-top: 4px; }

.tree-children { display: flex; flex-direction: column; gap: 1px; margin-top: 1px; }

/* 通用条目行 —— 中性灰调，克制无花哨 */
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.86rem;
  color: #4b5563;
  line-height: 1.5;
  transition: background 0.12s, color 0.12s;
  position: relative;
}
.tree-row:hover { background: #f1f3f5; color: #111827; }

/* 顶级分类：稍大字重、深色，像分区标题 */
.tree-row.is-top {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1f2937;
  padding: 7px 10px;
}

/* 子分组（中间层）：半粗体深色 */
.tree-row.is-group:not(.is-top) > .node-title { font-weight: 500; color: #374151; }

/* 选中态：浅灰整条圆角底 + 深色文字（对齐 Qoder），不用任何强调色 */
.tree-row.active,
.tree-row.active:hover {
  background: #eceef1;
  color: #111827;
  font-weight: 600;
}
.tree-row.active > .node-title { color: #111827; }

/* 展开箭头：默认朝右，展开旋转 90° 朝下 */
.caret {
  width: 16px;
  height: 16px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  user-select: none;
  transition: transform 0.18s ease, color 0.12s;
  border-radius: 4px;
}
.caret:hover { color: #4b5563; background: rgba(0,0,0,0.05); }
.caret.open { transform: rotate(90deg); }
.caret.placeholder { visibility: hidden; }

.node-title {
  word-break: break-word;
  flex: 1;
}

/* ===== 右侧正文 ===== */
.wiki-main {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 32px 44px;
  min-height: 400px;
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  box-shadow: var(--shadow);
}
.wiki-main::-webkit-scrollbar { width: 10px; }
.wiki-main::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 5px; }
.wiki-main::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
/* 正文限宽，长文更易读 */
.wiki-doc { max-width: 860px; }
/* 标题带锚点定位偏移，点目录跳转不被顶部遮住 */
.wiki-doc :deep(h1),
.wiki-doc :deep(h2),
.wiki-doc :deep(h3),
.wiki-doc :deep(h4) { scroll-margin-top: 12px; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  padding: 80px 0;
}
.empty-icon { font-size: 3rem; margin-bottom: 12px; }

/* markdown 正文排版 */
.wiki-doc :deep(h1) { font-size: 1.7rem; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--card-border); }
.wiki-doc :deep(h2) { font-size: 1.35rem; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--card-border); }
.wiki-doc :deep(h3) { font-size: 1.12rem; margin: 22px 0 10px; }
.wiki-doc :deep(h4) { font-size: 1rem; margin: 18px 0 8px; }
.wiki-doc :deep(p) { line-height: 1.75; margin: 10px 0; color: var(--text); }
.wiki-doc :deep(ul), .wiki-doc :deep(ol) { padding-left: 24px; line-height: 1.75; }
.wiki-doc :deep(li) { margin: 4px 0; }
.wiki-doc :deep(a) { color: var(--accent); text-decoration: none; }
.wiki-doc :deep(a:hover) { text-decoration: underline; }
.wiki-doc :deep(blockquote) {
  border-left: 4px solid var(--accent);
  background: var(--accent-light);
  margin: 12px 0;
  padding: 8px 16px;
  color: var(--text-secondary);
  border-radius: 0 6px 6px 0;
}
.wiki-doc :deep(code) {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.wiki-doc :deep(pre) {
  background: var(--code-bg);
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 14px 0;
  border: 1px solid var(--card-border);
}
.wiki-doc :deep(pre code) { background: none; padding: 0; font-size: 0.82rem; line-height: 1.6; }
.wiki-doc :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 14px 0;
  font-size: 0.88rem;
}
.wiki-doc :deep(th), .wiki-doc :deep(td) {
  border: 1px solid var(--card-border);
  padding: 8px 12px;
  text-align: left;
}
.wiki-doc :deep(th) { background: var(--bg); font-weight: 600; }
.wiki-doc :deep(.mermaid-holder) {
  display: flex;
  justify-content: center;
  margin: 18px 0;
  overflow-x: auto;
}
.wiki-doc :deep(.mermaid-holder svg) { max-width: 100%; height: auto; }
.wiki-doc :deep(.mermaid-error) {
  color: var(--bad);
  background: #fef2f2;
  border: 1px solid #fecaca;
}
.wiki-doc :deep(img) { max-width: 100%; height: auto; }
/* 文末「本文引用的文件」卡片 */
.wiki-cite {
  max-width: 860px;
  margin: 40px 0 8px;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  background: var(--bg);
  overflow: hidden;
}
.cite-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  background: #f1f3f5;
  border-bottom: 1px solid var(--card-border);
}
.cite-head svg { color: var(--text-secondary); }
.cite-body { padding: 10px 18px; }
.wiki-cite :deep(ul) { margin: 0; padding-left: 20px; }
.wiki-cite :deep(li) { margin: 4px 0; font-size: 0.84rem; }
.wiki-cite :deep(p) { margin: 4px 0; }
/* 引用清单里的文件链接：等宽字体 + 链接色，可点跳 GitHub */
.wiki-cite :deep(a) {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: #059669;
  text-decoration: none;
  word-break: break-all;
}
.wiki-cite :deep(a:hover) { text-decoration: underline; }

@media (max-width: 820px) {
  .wiki-panel { grid-template-columns: 1fr; }
  .wiki-nav { position: static; max-height: 320px; }
  .wiki-main { max-height: none; }
}
</style>
