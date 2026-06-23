/**
 * Language manager — 英中双语切换
 * 依赖: 无
 * 加载方式: 在所有页面 <head> 中同步加载（blocking），其他脚本依赖 window.__LANG
 */
(function () {
  var STORAGE_KEY = 'aifs:lang';
  var LANG_EN = 'en';
  var LANG_ZH = 'zh';

  function getParamLang() {
    var m = window.location.search.match(/[?&]lang=(zh|en)\b/i);
    return m ? m[1].toLowerCase() : null;
  }

  function getPreferred() {
    return getParamLang() || localStorage.getItem(STORAGE_KEY) || LANG_EN;
  }

  var lang = getPreferred();
  localStorage.setItem(STORAGE_KEY, lang);
  window.__LANG = lang;

  document.documentElement.setAttribute('lang', lang === LANG_ZH ? 'zh' : 'en');

  window.__LangManager = {
    getLanguage: function () { return window.__LANG; },

    setLanguage: function (l) {
      if (l !== LANG_EN && l !== LANG_ZH) return;
      window.__LANG = l;
      localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.setAttribute('lang', l === LANG_ZH ? 'zh' : 'en');
      document.documentElement.dispatchEvent(new CustomEvent('langchange', { bubbles: true }));
    },

    toggle: function () {
      this.setLanguage(window.__LANG === LANG_ZH ? LANG_EN : LANG_ZH);
    },

    isZh: function () { return window.__LANG === LANG_ZH; },
  };
})();
