#!/usr/bin/env node
/**
 * gen-code-refs.mjs —— 构建前置：把笔记里引用的真实源码读出来，生成映射。
 *
 * 笔记 content.js 里写： { type: 'codeRef', file: 'test_eval_real.py', lines: '1-50', label: '...' }
 * 本脚本扫描所有 codeRef，去仓库读对应源码（可选行范围），生成
 *   src/data/codeRefs.generated.js   导出 { 'file#lines': { code, error, lineCount } }
 * SectionCard 用 file+lines 拼 key 取真实代码。
 *
 * 好处：源码改了，重新 build 就同步，笔记永远不会显示过时代码（不手动复制）。
 *
 * 运行（自动挂在 build/dev 前）：node scripts/gen-code-refs.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_DIR = resolve(__dirname, '..')                 // vue-app/summary
const REPO_ROOT = resolve(APP_DIR, '../../..')            // 仓库根
const CONTENT = join(APP_DIR, 'src/data/content.js')
const OUT = join(APP_DIR, 'src/data/codeRefs.generated.js')

const MAX_LINES = 600   // 单个引用最多注入这么多行，防 bundle 爆炸

// 密钥脱敏：注入页面前把明文密钥替换掉（源文件不动，只改注入的副本）。
// 防止把 api_key / token / 密码 印到公开部署的页面上。
function redactSecrets(code) {
  const rules = [
    // api_key="..." / api_key: '...' / apiKey = "..."
    /((?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"])([^'"]{6,})(['"])/gi,
    // Bearer xxxxx
    /(Bearer\s+)([A-Za-z0-9._\-]{12,})/g,
    // sk- / personal- 之类前缀的长串
    /\b((?:sk|personal|ghp|xox[bap])[-_][A-Za-z0-9]{12,})\b/g,
  ]
  let out = code
  out = out.replace(rules[0], (_, a, _v, c) => `${a}***REDACTED***${c}`)
  out = out.replace(rules[1], (_, a) => `${a}***REDACTED***`)
  out = out.replace(rules[2], '***REDACTED***')
  return out
}

// 1. 读 content.js 源文本，正则抓出所有 codeRef 的 file / lines
const src = readFileSync(CONTENT, 'utf8')
// 匹配形如 { type: 'codeRef', file: 'x.py', lines: '1-50', ... } —— 字段顺序不限
const refRe = /\{[^}]*type:\s*['"]codeRef['"][^}]*\}/g
const fileRe = /file:\s*['"]([^'"]+)['"]/
const linesRe = /lines:\s*['"]([^'"]+)['"]/

const refs = []
for (const m of src.match(refRe) || []) {
  const f = m.match(fileRe)
  if (!f) continue
  const l = m.match(linesRe)
  refs.push({ file: f[1], lines: l ? l[1] : null })
}

// 2. 逐个读源码（支持 lines: "10-50" 行范围，1-based 闭区间）
function sliceLines(text, range) {
  if (!range) return text
  const [a, b] = range.split('-').map((n) => parseInt(n, 10))
  const arr = text.split('\n')
  const start = Math.max(1, a) - 1
  const end = b ? Math.min(arr.length, b) : arr.length
  return arr.slice(start, end).join('\n')
}

const map = {}
let ok = 0
let fail = 0
for (const { file, lines } of refs) {
  const key = lines ? `${file}#${lines}` : file
  if (map[key]) continue
  const abs = join(REPO_ROOT, file)
  if (!existsSync(abs)) {
    map[key] = { code: '', error: `文件不存在：${file}`, lineCount: 0 }
    fail++
    continue
  }
  let code = sliceLines(readFileSync(abs, 'utf8'), lines)
  code = redactSecrets(code)
  let truncated = false
  const all = code.split('\n')
  if (all.length > MAX_LINES) {
    code = all.slice(0, MAX_LINES).join('\n')
    truncated = true
  }
  map[key] = {
    code,
    error: '',
    lineCount: all.length,
    truncated,
  }
  ok++
}

// 3. 写出生成文件
const banner =
  '// 自动生成，请勿手改。源： scripts/gen-code-refs.mjs（每次 build/dev 前重跑）\n' +
  '// 笔记里的 { type: codeRef, file } 在这里取真实源码。改了源码重新 build 即同步。\n'
writeFileSync(OUT, banner + 'export default ' + JSON.stringify(map, null, 2) + '\n', 'utf8')

console.log(`[gen-code-refs] 扫描到 ${refs.length} 个引用，成功 ${ok}，失败 ${fail} → ${OUT.replace(REPO_ROOT + '/', '')}`)
if (fail > 0) {
  console.warn('[gen-code-refs] ⚠ 有引用的文件找不到，页面会显示提示。检查 file 路径是否相对仓库根。')
}
