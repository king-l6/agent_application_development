<template>
  <div class="wiki-panel">
    <!-- 左侧：可折叠分类树 -->
    <aside class="wiki-nav">
      <div class="wiki-search">
        <input v-model="q" type="text" placeholder="🔍 搜索文档标题…" />
      </div>
      <ul class="tree-root">
        <WikiTreeNode
          v-for="node in filteredTree"
          :key="node.id"
          :node="node"
          :active-id="activeDocId"
          :expanded="expanded"
          @select="selectDoc"
          @toggle="toggleNode"
        />
      </ul>
    </aside>

    <!-- 右侧：正文 -->
    <section class="wiki-main">
      <div v-if="!activeDoc" class="empty-state">
        <div class="empty-icon">📚</div>
        <p>从左侧选一篇文档开始阅读</p>
      </div>
      <article v-else class="wiki-doc" v-html="renderedHtml"></article>
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
    expanded: { type: Object, required: true }, // reactive Set-like via object map
  },
  emits: ['select', 'toggle'],
  setup(props, { emit }) {
    return () => {
      const n = props.node
      const hasChildren = n.children && n.children.length > 0
      const isOpen = props.expanded[n.id]
      const isActive = props.activeId === n.docId && n.docId
      const rowChildren = []
      if (hasChildren) {
        rowChildren.push(h('span', {
          class: ['caret', { open: isOpen }],
          onClick: (e) => { e.stopPropagation(); emit('toggle', n.id) },
        }, isOpen ? '▾' : '▸'))
      } else {
        rowChildren.push(h('span', { class: 'caret placeholder' }, ''))
      }
      rowChildren.push(h('span', { class: 'node-title' }, n.title))

      const row = h('div', {
        class: ['tree-row', { active: isActive, group: hasChildren }],
        onClick: () => {
          if (n.docId) emit('select', n.docId)
          else if (hasChildren) emit('toggle', n.id)
        },
      }, rowChildren)

      const kids = (hasChildren && isOpen)
        ? h('ul', { class: 'tree-children' }, n.children.map(c =>
            h(WikiTreeNode, {
              node: c, activeId: props.activeId, expanded: props.expanded,
              onSelect: (id) => emit('select', id),
              onToggle: (id) => emit('toggle', id),
            })))
        : null

      return h('li', { class: 'tree-node' }, [row, kids])
    }
  }
})

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

const renderedHtml = ref('')
let currentBlocks = []

watch(activeDoc, (doc) => {
  if (!doc) { renderedHtml.value = ''; return }
  const { replaced, blocks } = preprocessMermaid(doc.markdown)
  currentBlocks = blocks
  renderedHtml.value = marked.parse(replaced)
  nextTick(renderMermaidAndScroll)
}, { immediate: true })

async function renderMermaidAndScroll() {
  // 渲染 mermaid 占位块
  for (const b of currentBlocks) {
    const holder = document.querySelector(`.mermaid-holder[data-id="${b.id}"]`)
    if (!holder) continue
    try {
      const { svg } = await mermaid.render(`svg-${b.id}-${Date.now()}`, b.code)
      holder.innerHTML = svg
    } catch (e) {
      holder.innerHTML = `<pre class="mermaid-error">mermaid 渲染失败：\n${(e && e.message) || e}</pre>`
    }
  }
  // 切换文档后滚回顶部
  const main = document.querySelector('.wiki-main')
  if (main) main.scrollTop = 0
}
</script>

<style scoped>
.wiki-panel {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: start;
}

/* 左侧导航 */
.wiki-nav {
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  padding: 10px;
}
.wiki-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 8px;
  background: var(--bg);
  color: var(--text);
}
.tree-root, .tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tree-children { padding-left: 14px; }
.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.35;
}
.tree-row:hover { background: var(--accent-light); color: var(--accent); }
.tree-row.active { background: var(--accent); color: #fff; }
.tree-row.group > .node-title { font-weight: 600; color: var(--text); }
.tree-row.active.group > .node-title { color: #fff; }
.caret {
  width: 14px;
  flex: none;
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  user-select: none;
}
.caret.placeholder { visibility: hidden; }
.node-title { word-break: break-word; }

/* 右侧正文 */
.wiki-main {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  padding: 24px 32px;
  min-height: 400px;
  max-height: calc(100vh - 90px);
  overflow-y: auto;
}
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
.wiki-doc :deep(cite) {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--bg);
  padding: 8px 12px;
  border-radius: 6px;
  margin: 8px 0 16px;
}

@media (max-width: 820px) {
  .wiki-panel { grid-template-columns: 1fr; }
  .wiki-nav { position: static; max-height: 320px; }
  .wiki-main { max-height: none; }
}
</style>
