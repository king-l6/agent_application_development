import { chapters, courseGroups, courseMeta } from './course-data.js'

const main = document.querySelector('#course-main')
const nav = document.querySelector('#course-nav')
const menuButton = document.querySelector('#mobile-menu')
const sidebar = document.querySelector('#course-sidebar')
const scrim = document.querySelector('#sidebar-scrim')
const backToTop = document.querySelector('#back-to-top')

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderTable(headers, rows) {
  const wrap = element('div', 'course-table-wrap')
  const table = element('table', 'course-table')
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')

  headers.forEach((header) => headRow.append(element('th', '', header)))
  thead.append(headRow)

  const tbody = document.createElement('tbody')
  rows.forEach((row) => {
    const tr = document.createElement('tr')
    row.forEach((cell) => tr.append(element('td', '', cell)))
    tbody.append(tr)
  })

  table.append(thead, tbody)
  wrap.append(table)
  return wrap
}

function renderCodePanel(label, code) {
  const panel = element('div', 'code-panel')
  const head = element('div', 'code-panel-head')
  const copy = element('button', 'copy-code', '复制')
  copy.type = 'button'
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code)
      copy.textContent = '已复制'
      window.setTimeout(() => { copy.textContent = '复制' }, 1200)
    } catch {
      copy.textContent = '复制失败'
    }
  })

  head.append(element('span', '', label), copy)
  const pre = document.createElement('pre')
  pre.append(element('code', '', code))
  panel.append(head, pre)
  return panel
}

function renderBlock(block) {
  if (block.type === 'text') {
    const fragment = document.createDocumentFragment()
    block.paragraphs.forEach((paragraph) => fragment.append(element('p', '', paragraph)))
    return fragment
  }

  if (block.type === 'list') {
    const list = document.createElement(block.ordered ? 'ol' : 'ul')
    block.items.forEach((item) => list.append(element('li', '', item)))
    return list
  }

  if (block.type === 'table') {
    return renderTable(block.headers, block.rows)
  }

  if (block.type === 'code') {
    return renderCodePanel(block.label, block.code)
  }

  if (block.type === 'compare') {
    const compare = element('div', 'code-compare')
    compare.append(
      renderCodePanel(block.left.label, block.left.code),
      renderCodePanel(block.right.label, block.right.code)
    )
    return compare
  }

  if (block.type === 'callout') {
    const callout = element('div', `callout ${block.tone || ''}`.trim())
    callout.append(element('strong', '', block.title), document.createTextNode(block.text))
    return callout
  }

  return document.createDocumentFragment()
}

function renderHero() {
  const hero = element('header', 'course-hero')
  hero.id = 'course-overview'
  hero.append(
    element('p', 'eyebrow', 'Project curriculum · P0 → T15'),
    element('h1', '', courseMeta.title),
    element('p', 'hero-lede', courseMeta.lede)
  )

  const stats = element('div', 'hero-stats')
  courseMeta.stats.forEach(([value, label]) => {
    const stat = element('div', 'hero-stat')
    stat.append(element('strong', '', value), element('span', '', label))
    stats.append(stat)
  })

  const note = element('div', 'hero-note')
  note.append(
    element('strong', '', '当前学习位置'),
    document.createTextNode('P0 已完成；T0.1–T0.3 已完成。下一节是 T0.4：用 __post_init__ 保证 TaskResult 的状态一致性。')
  )

  const mapSection = element('section', 'lesson-section')
  mapSection.style.marginLeft = '0'
  mapSection.append(
    element('h3', '', '课程路线'),
    element('p', '', '主线顺序保持稳定。每个阶段先学习原理，再完成代码、测试和一段可以直接用于面试的解释。'),
    renderTable(['阶段', '学习内容', '阶段产出', '时间'], courseMeta.stages)
  )

  hero.append(stats, note, mapSection)
  return hero
}

function renderOutcomes(chapter) {
  const box = element('section', 'learning-outcomes')
  box.append(element('h3', '', '学完这一章，你应该能够'))
  const list = document.createElement('ul')
  chapter.outcomes.forEach((item) => list.append(element('li', '', item)))
  box.append(list)
  return box
}

function renderPractice(chapter) {
  const practice = element('section', 'practice-block')
  const task = document.createElement('div')
  task.append(element('p', 'eyebrow', 'Build it'), element('h3', '', chapter.practice.title))
  const steps = document.createElement('ol')
  chapter.practice.steps.forEach((step) => steps.append(element('li', '', step)))
  task.append(steps)

  const acceptance = element('div', 'acceptance')
  acceptance.append(element('h4', '', '验收标准'))
  const checks = document.createElement('ul')
  chapter.practice.acceptance.forEach((item) => checks.append(element('li', '', item)))
  acceptance.append(checks)

  practice.append(task, acceptance)
  return practice
}

function renderInterview(chapter) {
  const interview = element('section', 'interview-block')
  interview.append(
    element('p', 'interview-label', 'Interview checkpoint'),
    element('h3', '', chapter.interview.question),
    element('p', '', chapter.interview.answer)
  )

  if (chapter.links?.length) {
    const links = element('div', 'reference-links')
    chapter.links.forEach(([label, href]) => {
      const anchor = element('a', '', `${label} ↗`)
      anchor.href = href
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
      links.append(anchor)
    })
    interview.append(links)
  }

  return interview
}

function renderChapter(chapter) {
  const article = element('article', 'course-chapter')
  article.id = chapter.id
  article.dataset.chapter = chapter.id

  const heading = element('div', 'chapter-heading')
  const titleWrap = document.createElement('div')
  const meta = element('div', 'chapter-meta')
  meta.append(
    element('span', `status-badge ${chapter.status}`, chapter.statusLabel),
    element('span', '', `预计 ${chapter.duration}`)
  )
  titleWrap.append(meta, element('h2', '', chapter.title), element('p', 'chapter-summary', chapter.summary))
  heading.append(element('span', 'chapter-code', chapter.code), titleWrap)

  const question = element('div', 'chapter-question')
  question.append(element('strong', '', '核心问题'), element('p', '', chapter.question))

  const localToc = element('ul', 'chapter-toc')
  chapter.sections.forEach((section, index) => {
    const item = document.createElement('li')
    const anchor = element('a', '', `${index + 1}. ${section.title}`)
    anchor.href = `#${chapter.id}-section-${index + 1}`
    item.append(anchor)
    localToc.append(item)
  })

  article.append(heading, question, localToc, renderOutcomes(chapter))

  chapter.sections.forEach((section, index) => {
    const lesson = element('section', 'lesson-section')
    lesson.id = `${chapter.id}-section-${index + 1}`
    lesson.append(element('h3', '', `${index + 1}. ${section.title}`))
    section.blocks.forEach((block) => lesson.append(renderBlock(block)))
    article.append(lesson)
  })

  article.append(renderPractice(chapter), renderInterview(chapter))
  return article
}

function renderNavigation() {
  const overview = element('div', 'nav-group')
  overview.append(element('p', 'nav-group-title', '课程'))
  const overviewLink = element('a', 'nav-link active', '课程总览')
  overviewLink.href = '#course-overview'
  overviewLink.dataset.chapter = 'course-overview'
  overviewLink.dataset.status = 'done'
  overviewLink.prepend(element('span', 'nav-code', '00'))
  overviewLink.append(element('span', 'nav-status'))
  overview.append(overviewLink)
  nav.append(overview)

  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  courseGroups.forEach((group) => {
    const groupNode = element('div', 'nav-group')
    groupNode.append(element('p', 'nav-group-title', group.label))

    group.chapters.forEach((chapterId) => {
      const chapter = byId.get(chapterId)
      const link = element('a', 'nav-link')
      link.href = `#${chapter.id}`
      link.dataset.chapter = chapter.id
      link.dataset.status = chapter.status
      link.append(
        element('span', 'nav-code', chapter.code),
        element('span', '', chapter.title),
        element('span', 'nav-status')
      )
      groupNode.append(link)
    })

    nav.append(groupNode)
  })
}

function closeMenu() {
  sidebar.classList.remove('open')
  menuButton.setAttribute('aria-expanded', 'false')
  scrim.hidden = true
}

function setupNavigation() {
  menuButton.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open')
    menuButton.setAttribute('aria-expanded', String(isOpen))
    scrim.hidden = !isOpen
  })
  scrim.addEventListener('click', closeMenu)
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu()
  })

  const links = [...nav.querySelectorAll('.nav-link')]
  const sections = [document.querySelector('#course-overview'), ...chapters.map(({ id }) => document.querySelector(`#${id}`))]
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
    if (!visible) return

    links.forEach((link) => link.classList.toggle('active', link.dataset.chapter === visible.target.id))
    const active = links.find((link) => link.dataset.chapter === visible.target.id)
    active?.scrollIntoView({ block: 'nearest' })
  }, { rootMargin: '-12% 0px -72% 0px', threshold: 0 })

  sections.forEach((section) => section && observer.observe(section))
}

function setupBackToTop() {
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('visible', window.scrollY > 900)
  }, { passive: true })
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

function restoreInitialAnchor() {
  if (!window.location.hash) return

  window.requestAnimationFrame(() => {
    const target = document.querySelector(window.location.hash)
    if (!target) return

    const previousBehavior = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'auto'
    target.scrollIntoView({ block: 'start' })
    window.requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousBehavior
    })
  })
}

function renderPage() {
  renderNavigation()
  main.append(renderHero())
  chapters.forEach((chapter) => main.append(renderChapter(chapter)))

  const footer = element('footer', 'course-footer')
  footer.append(
    element('strong', '', '完成 T15，不是课程结束，而是你拥有了一个能继续演化的 Agent 工程内核。'),
    document.createTextNode('学习进度以仓库 memory/study_progress.md 为准。')
  )
  main.append(footer)

  setupNavigation()
  setupBackToTop()
  restoreInitialAnchor()
}

renderPage()
