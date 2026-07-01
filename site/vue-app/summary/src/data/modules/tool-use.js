// Phase 14 · 06-tool-use-and-function-calling —— 工具调用（代码助手场景）
// 纯前端 run(inputs) → { summary, blocks }，对应后端 tool_use.py
// 代码助手注册 read_file / grep / run_tests 三个工具，模型产出结构化 JSON 调用，
// 运行时校验参数 → 执行 → 把结果（含错误）作为 observation 回灌。
// 核心：校验/执行失败都返回结构化错误字符串，绝不向循环抛异常。纯模拟、不调 LLM。

// 工具目录（喂给模型的 schema）
const CATALOG = {
  read_file: { desc: '读取一个文件的内容。何时用：需要看某个文件源码时',
    required: ['path'], props: { path: 'string' } },
  grep: { desc: '在代码库里按正则搜索。何时用：找符号定义/调用点时',
    required: ['pattern'], props: { pattern: 'string', path: 'string' } },
  run_tests: { desc: '跑测试。何时用：改完代码要验证时',
    required: [], props: { target: 'string' } },
}

// 假文件系统 / 假测试结果
const FS = {
  'src/math.py': 'def add(a,b):\n    return a+b',
  'src/auth.py': "def login(req):\n    return req['token']",
}

function execute(name, args) {
  if (name === 'read_file') {
    return FS[args.path] !== undefined ? FS[args.path] : `error: 文件不存在 ${args.path}`
  }
  if (name === 'grep') {
    const hits = Object.entries(FS)
      .filter(([, c]) => c.includes(args.pattern))
      .map(([p, c]) => `${p}: ${c.split('\n')[0]}`)
    return hits.length ? hits.join('；') : '（无匹配）'
  }
  if (name === 'run_tests') {
    return '测试 12 passed ✓'
  }
  return `error: 未知工具 ${name}`
}

// 校验：未知工具 / 缺必填 / 类型——失败返回错误字符串，不抛异常。
function validate(name, args) {
  const spec = CATALOG[name]
  if (spec === undefined) {
    return `error: 幻觉调用了不存在的工具 '${name}'`
  }
  for (const r of spec.required) {
    if (!(r in args)) {
      return `error: 缺必填参数 '${r}'`
    }
  }
  return null
}

// 模型一轮产出的结构化调用（含一个并行回合 + 三个故意埋的坑）
const PRESET_CALLS = [
  ['u01', 'grep', { pattern: 'def login' }],          // 正常
  ['u02', 'read_file', { path: 'src/auth.py' }],      // 正常（与 u01 并行）
  ['u03', 'read_file', {}],                            // 坑：缺必填 path
  ['u04', 'lint', { path: 'src/auth.py' }],           // 坑：幻觉调不存在的工具
  ['u05', 'run_tests', { target: 'tests/' }],         // 正常
]

// 把 args 对象渲染成类似 Python dict 的字符串
function argsStr(args) {
  const parts = Object.entries(args).map(([k, v]) => `'${k}': '${v}'`)
  return `{${parts.join(', ')}}`
}

function runToolUse(inputs) {
  const showCat = ((inputs.show_catalog || '显示') + '').includes('显示')

  const blocks = [{ type: 'keyvalue', label: '任务', items: {
    '场景': '代码助手『修复测试失败』，一轮发 5 个工具调用',
    '工具数': Object.keys(CATALOG).length,
    '埋的坑': 'u03 缺必填参数、u04 幻觉调不存在工具',
  }}]

  if (showCat) {
    const catRows = Object.entries(CATALOG).map(([n, s]) => [n, s.desc, s.required.join('、') || '（无）'])
    blocks.push({ type: 'table', label: '工具目录（喂给模型的 schema，描述质量决定选不选对）',
      headers: ['工具', '描述（写清何时用）', '必填参数'], rows: catRows })
  }

  // 校验 + 执行 + 回灌
  const rows = []
  for (const [uid, name, args] of PRESET_CALLS) {
    const err = validate(name, args)
    if (err) {
      rows.push([uid, `${name}(${argsStr(args)})`, '拒绝', err])
    } else {
      const obs = execute(name, args)
      rows.push([uid, `${name}(${argsStr(args)})`, '执行 ✓', `→ ${obs}`])
    }
  }
  blocks.push({ type: 'table', label: '校验 → 执行 → 回灌（id 关联结果，错误也转字符串不崩）',
    headers: ['tool_use_id', '调用', '结果', 'observation'], rows })

  blocks.push({ type: 'text', label: '关键', content:
    'u01+u02 是并行回合（互不依赖，各带独立 tool_use_id，按 id 配回结果）。' +
    'u03 缺 path、u04 调不存在的 lint —— 都返回结构化错误而非抛异常崩溃。' +
    '模型读到 error observation 后能改道重试，这就是 ReAct『报错也是观察』在工具层的落地。' })

  blocks.push({ type: 'list', label: '要点', items: [
    '工具声明三要素：name / description（写清『何时用』）/ input_schema（JSON Schema）',
    '永不信任工具调用：类型强转(无歧义才转)、enum、必填、格式都要校验',
    '幻觉调不存在的工具 → 返回描述性错误，不崩溃',
    '并行 vs 串行：只有互相独立才并行，tool_use_id 不能错配',
    'vs ReAct(01)：工具调用就是 Action 这步，本课把它工程化（结构化产出+校验+回灌）',
    '本质=带校验 schema 的结构化输出；工具目录每轮进 context，越多越贵',
  ]})

  return { summary: '5 个调用：3 个执行成功 + 2 个错误转 observation（缺参/幻觉工具）', blocks }
}

export default {
  name: 'tool-use',
  displayName: '工具调用 / Function Calling（代码助手）',
  phase: '14-agent-engineering',
  lesson: '06 工具调用与函数调用',
  order: 60,
  description: '注册 read_file/grep/run_tests，模型产出 JSON 调用→校验→执行→回灌。含并行调用+缺参/幻觉工具三种错误，全部转结构化 observation（不调 LLM）',
  inputs: [
    { name: 'show_catalog', label: '显示工具目录', type: 'select', default: '显示',
      options: ['显示', '隐藏'], help: '工具目录每轮都进 context，工具越多越贵' },
  ],
  run: runToolUse,
}
