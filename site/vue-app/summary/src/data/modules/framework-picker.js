// Phase 11 · 17-agent-framework-tradeoffs —— Agent 框架推荐器
// 纯前端 run(inputs) → { summary, blocks }，对应后端 framework_picker.py
// 勾选你的问题「长什么形状」，本地用决策树推荐 LangGraph / CrewAI / AutoGen / Agno / 纯 Python。
// 决策逻辑取自课程 main.py 的 recommend()，本地运行，不调 LLM。

// 框架速查（来自课程概念矩阵）
const FRAMEWORK_NOTE = {
  'plain python': '没有框架是最快的框架——2 次以内调用直接手写',
  'langgraph': '状态图：类型化状态 + 检查点 + 中断 + 并行扇出，生产首选',
  'crewai': '组织结构图：角色 + 任务 + 流程，角色驱动流水线最省事',
  'autogen': 'Slack 私信：代理轮流对话，提议者-批评者/师生场景的原生形状',
  'agno': '带工具的盒子：单代理 + 内置会话记忆，设置最薄',
}

function truthy(v) {
  return ['是', 'y', 'yes', 'true', '1', 'on'].includes((v + '').trim().toLowerCase())
}

// 返回 [框架, 理由]。逻辑对应课程 main.py 的 recommend()。
function recommend(p) {
  const hasTypedState = truthy(p.has_typed_state)
  const hasRoles = truthy(p.has_roles)
  const hasDialogue = truthy(p.has_dialogue)
  const hasParallelFanout = truthy(p.has_parallel_fanout)
  const needsResume = truthy(p.needs_resume)
  const needsHumanInterrupt = truthy(p.needs_human_interrupt)
  const needsSessionMemory = truthy(p.needs_session_memory)
  let totalLlmCalls = parseInt(p.total_llm_calls, 10)
  if (isNaN(totalLlmCalls)) totalLlmCalls = 1

  // 最小优先：2 次以内调用且无其它需求 → 不上框架
  if (totalLlmCalls <= 2 && ![
    hasRoles, hasDialogue, needsResume, hasParallelFanout, needsHumanInterrupt,
  ].some(Boolean)) {
    return ['plain python', '两次以内 LLM 调用，无状态/角色/对话/扇出/恢复需求，上框架纯属开销。']
  }

  // 持久状态 / 人工中断 / 时光回溯 / 并行扇出 → LangGraph
  if (needsResume || needsHumanInterrupt || hasParallelFanout) {
    return ['langgraph', '类型化状态、检查点、中断、Send 扇出只有 LangGraph 是一等公民。']
  }

  // 对话形状 → AutoGen
  if (hasDialogue && !hasTypedState) {
    return ['autogen', '提议者-批评者/师生对话是 AutoGen 的原生形状，GroupChat 自动选发言者。']
  }

  // 角色驱动 → CrewAI
  if (hasRoles && !hasTypedState) {
    return ['crewai', '带短线性/层级计划的专家角色，用 CrewAI 表达最廉价。']
  }

  // 单代理 + 会话 → Agno
  if (needsSessionMemory && !hasRoles && !hasDialogue) {
    return ['agno', '单代理 + 工具 + 持久会话记忆，Agno 的存储驱动开箱即用。']
  }

  // 有类型化状态 → LangGraph
  if (hasTypedState) {
    return ['langgraph', '类型化状态是 LangGraph 的核心抽象，把 TypedDict 映射到 StateGraph。']
  }

  // 兜底
  return ['langgraph', '多步代理且未来状态/分支需求不确定时的默认选择。']
}

function runFrameworkPicker(inputs) {
  const [framework, reason] = recommend(inputs)
  const note = FRAMEWORK_NOTE[framework] || ''

  // 把勾选的特征整理出来展示
  const featureLabels = {
    total_llm_calls: 'LLM 调用数',
    has_typed_state: '类型化状态',
    needs_resume: '崩溃恢复',
    needs_human_interrupt: '人工中断',
    has_parallel_fanout: '并行扇出',
    has_roles: '专家角色',
    has_dialogue: '多代理对话',
    needs_session_memory: '会话记忆',
  }
  const picked = {}
  for (const [key, label] of Object.entries(featureLabels)) {
    picked[label] = inputs[key]
  }

  return {
    summary: `推荐：${framework} —— ${reason}`,
    blocks: [
      { type: 'keyvalue', label: '推荐结果', items: {
        '推荐框架': framework.toUpperCase(),
        '一句话理由': reason,
        '框架特点': note,
      }},
      { type: 'keyvalue', label: '你勾选的问题形状', items: picked },
      { type: 'table', label: '四框架速查',
        headers: ['框架', '白板图形', '最适合'],
        rows: [
          ['LangGraph', '状态图', '要恢复/时光回溯/人工审批的工作流'],
          ['CrewAI', '组织结构图', '角色驱动流水线'],
          ['AutoGen', 'Slack 私信', '提议者-批评者/师生对话'],
          ['Agno', '带工具的盒子', '单代理 + 会话记忆'],
          ['纯 Python', '30 行脚本', '≤2 次调用，无框架最快'],
        ] },
      { type: 'list', label: '决策要点', items: [
        '谁分支：开发者→LangGraph / 管理者→CrewAI / 聊天涌现→AutoGen / 工具调用→Agno',
        '要崩溃恢复或时光回溯 → 默认 LangGraph（检查点是一等公民）',
        'LLM 选路由每轮烧 token，高频场景优先显式路由',
        '任务只有两次调用加一个工具 → 写 30 行纯 Python，别上框架',
      ] },
    ],
  }
}

export default {
  name: 'framework-picker',
  displayName: 'Agent 框架推荐',
  phase: '11-llm-engineering',
  lesson: '17 Agent 框架取舍',
  order: 170,
  description: '勾选问题特征，决策树推荐 LangGraph/CrewAI/AutoGen/Agno/纯Python（本地，不调 LLM）',
  inputs: [
    { name: 'total_llm_calls', label: '每次运行的 LLM 调用数', type: 'number', default: 5,
      help: '≤2 且无其它需求 → 建议纯 Python' },
    { name: 'has_typed_state', label: '有类型化/显式状态吗', type: 'select', default: '否', options: ['否', '是'] },
    { name: 'needs_resume', label: '需要崩溃后恢复吗', type: 'select', default: '否', options: ['否', '是'] },
    { name: 'needs_human_interrupt', label: '运行中要人工审批吗', type: 'select', default: '否', options: ['否', '是'] },
    { name: 'has_parallel_fanout', label: '需要并行扇出到多个子任务吗', type: 'select', default: '否', options: ['否', '是'] },
    { name: 'has_roles', label: '有不同分工的专家角色吗', type: 'select', default: '否', options: ['否', '是'] },
    { name: 'has_dialogue', label: '是多代理对话(发言顺序涌现)吗', type: 'select', default: '否', options: ['否', '是'] },
    { name: 'needs_session_memory', label: '需要持久的按用户会话记忆吗', type: 'select', default: '否', options: ['否', '是'] },
  ],
  run: runFrameworkPicker,
}
