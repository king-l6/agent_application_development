/**
 * UI 文本翻译表 — 站点界面字符串的中英对照
 * 依赖: lang.js (window.__LANG)
 * 加载方式: <script defer>，DOMContentLoaded 时自动执行 translatePage()
 */
(function () {
  var en = {
    'nav.contents': 'Contents',
    'nav.catalog': 'Catalog',
    'nav.roadmap': 'Roadmap',
    'nav.glossary': 'Glossary',
    'nav.about': 'About',
    'nav.notes': '学习笔记',
    'skip.main': 'Skip to content',
    'search.toggle': 'Search (⌘K)',
    'theme.toggle': 'Toggle theme',
    'lang.toggle': 'Switch language',
    'lang.label': '中',
    'lang.label-en': 'EN',
    'lang.label-zh': '中',
    'glossary.title': 'AI Glossary',
    'glossary.subtitle': 'What people say vs what things actually mean',
    'glossary.search': 'Search terms...',
    'glossary.count': 'terms',
    'glossary.empty': 'No terms match your search.',
    'glossary.says': 'What people say',
    'glossary.means': "What it actually means",
    'glossary.why': "Why it's called that",
    'catalog.title': 'Course Catalog',
    'catalog.subtitle': 'Every lesson in the curriculum, searchable and filterable.',
    'catalog.filter-all': 'All',
    'catalog.filter-complete': 'Complete',
    'catalog.filter-in-progress': 'In Progress',
    'catalog.filter-planned': 'Planned',
    'catalog.search': 'Search lessons...',
    'prereqs.title': 'Prerequisites & Roadmap',
    'about.title': 'About',
    'lesson.loading': 'Loading lesson...',
    'lesson.not-found': 'Lesson not found.',
    'lesson.error': 'Failed to load lesson.',
    'lesson.quiz': 'Quiz',
    'lesson.check': 'Check',
    'lesson.retry': 'Retry',
    'lesson.practice': 'Practice Exercises',
    'lesson.sidebar': 'Lessons',
    'lesson.prev': 'Previous',
    'lesson.next': 'Next',
    'lesson.progress': 'Progress',
    'lesson.key-terms': 'Key Terms',
    'footer.disclaimer': 'Built for learning. Not affiliated with any institution.',
  };

  var zh = {
    'nav.contents': '目录',
    'nav.catalog': '课程列表',
    'nav.roadmap': '学习路线',
    'nav.glossary': '术语表',
    'nav.about': '关于',
    'nav.notes': '学习笔记',
    'skip.main': '跳转到内容',
    'search.toggle': '搜索 (⌘K)',
    'theme.toggle': '切换主题',
    'lang.toggle': '切换语言',
    'lang.label': 'EN',
    'lang.label-en': 'EN',
    'lang.label-zh': '中',
    'glossary.title': 'AI 术语表',
    'glossary.subtitle': '人们说的 vs 实际含义',
    'glossary.search': '搜索术语...',
    'glossary.count': '个术语',
    'glossary.empty': '没有匹配的术语。',
    'glossary.says': '人们说的',
    'glossary.means': '实际含义',
    'glossary.why': '为什么叫这个',
    'catalog.title': '课程目录',
    'catalog.subtitle': '全部课程，可搜索和筛选。',
    'catalog.filter-all': '全部',
    'catalog.filter-complete': '已完成',
    'catalog.filter-in-progress': '进行中',
    'catalog.filter-planned': '待学习',
    'catalog.search': '搜索课程...',
    'prereqs.title': '前置知识与学习路线',
    'about.title': '关于',
    'lesson.loading': '正在加载课程...',
    'lesson.not-found': '未找到课程。',
    'lesson.error': '加载课程失败。',
    'lesson.quiz': '测验',
    'lesson.check': '检查答案',
    'lesson.retry': '重试',
    'lesson.practice': '练习',
    'lesson.sidebar': '课程列表',
    'lesson.prev': '上一课',
    'lesson.next': '下一课',
    'lesson.progress': '进度',
    'lesson.key-terms': '关键术语',
    'footer.disclaimer': '为学习而构建。与任何机构无关。',
  };

  window.__I18N = { en: en, zh: zh };

  function t(key) {
    var lang = window.__LANG || 'en';
    var table = window.__I18N[lang] || en;
    return table[key] || key;
  }

  function translatePage() {
    var lang = window.__LANG || 'en';
    // data-i18n → textContent
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      if (key) els[i].textContent = t(key);
    }
    // data-i18n-placeholder → placeholder
    var phs = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < phs.length; j++) {
      var pk = phs[j].getAttribute('data-i18n-placeholder');
      if (pk) phs[j].placeholder = t(pk);
    }
    // Language toggle label
    var langLabel = document.getElementById('langLabel');
    if (langLabel) langLabel.textContent = lang === 'zh' ? 'EN' : '中';
  }

  // 首次加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', translatePage);
  } else {
    translatePage();
  }

  // 语言切换时重新翻译
  document.documentElement.addEventListener('langchange', translatePage);

  window.__t = t;
})();
