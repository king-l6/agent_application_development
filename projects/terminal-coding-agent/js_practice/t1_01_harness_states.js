/**
 * T1.1 完全体 JS 对照文件（带教学注释）
 *
 * 右开对照（参考实现，本节先只看「状态」相关部分）：
 *   phases/19-capstone-projects/20-agent-harness-loop-contract/code/main.py
 *   重点看：class State、HarnessLoop._transition 的 legal 表
 *
 * 本节目标：搞懂六个状态是什么、谁能转到谁、模型和 Harness 谁干什么。
 * 还不是完整可跑的生产 Harness；先把「地图」看清。
 */

// ========== 1. 六个状态 ==========
// Object.freeze = 冻结对象，防止之后被人改掉枚举值
// = py: class State(str, Enum): ...

export const State = Object.freeze({
  IDLE: "idle", // 空闲：唯一合法入口；暂停后也会回到这里等 resume
  PLANNING: "planning", // 规划：根据目标生成/更新步骤计划
  EXECUTING: "executing", // 执行：按计划推进当前步骤
  AWAITING_TOOL: "awaiting_tool", // 等工具：需要外部工具结果才能继续（拉取点）
  REFLECTING: "reflecting", // 反思：看观察结果，决定继续、重规划或结束
  DONE: "done", // 结束：唯一合法出口（任务完成意义上的终态）
});

/**
 * 合法转移表：从「当前状态」只能跳到集合里的目标状态。
 * 非法转移应直接报错，而不是默默继续——否则状态机就不可信了。
 *
 * = py: HarnessLoop._transition 里的 legal: dict[State, set[State]]
 */
export const LEGAL_TRANSITIONS = Object.freeze({
  [State.IDLE]: Object.freeze([State.PLANNING]),
  // IDLE 只能开始规划

  [State.PLANNING]: Object.freeze([State.EXECUTING, State.IDLE, State.DONE]),
  // 规划完 → 执行；或预算/暂停回 IDLE；或无计划直接 DONE

  [State.EXECUTING]: Object.freeze([
    State.AWAITING_TOOL,
    State.REFLECTING,
    State.IDLE,
  ]),
  // 需要工具 → AWAITING_TOOL；不需要工具做完一步 → REFLECTING；暂停 → IDLE

  [State.AWAITING_TOOL]: Object.freeze([State.REFLECTING, State.IDLE]),
  // 拿到工具结果 → REFLECTING；暂停 → IDLE

  [State.REFLECTING]: Object.freeze([
    State.PLANNING,
    State.EXECUTING,
    State.DONE,
    State.IDLE,
  ]),
  // 重规划 / 下一步 / 目标达成 / 暂停

  [State.DONE]: Object.freeze([]),
  // 终态：不能再转出去
});

/**
 * 尝试状态转移。非法则抛错。
 * = py: def _transition(self, target: State) -> None:
 */
export function transition(current, target) {
  const allowed = LEGAL_TRANSITIONS[current] || [];
  // includes = 数组是否包含某元素
  // = py: if target not in legal[self.state]:
  if (!allowed.includes(target)) {
    // 非法转移：直接失败，避免「状态说一套、行为做一套」
    throw new Error(`illegal transition ${current} -> ${target}`);
  }
  return target; // 返回新状态（教学版；完整 Harness 会写到 this.state）
}

// ========== 2. 最小「伪循环」——只表达控制权，不接真模型/真工具 ==========
/**
 * policy.decide(state) ≈ 以后模型或 Fake Policy 提出「下一步想干什么」
 * harness 决定：允不允许、怎么记状态、何时停止
 *
 * 下面用硬编码步骤演示「循环长什么样」，不是最终实现。
 */
export function demoLoopSketch() {
  let state = State.IDLE;
  const log = [];

  // 1) 启动：IDLE → PLANNING
  state = transition(state, State.PLANNING);
  log.push("session.start → PLANNING");

  // 2) 计划提交：PLANNING → EXECUTING
  state = transition(state, State.EXECUTING);
  log.push("plan.commit → EXECUTING");

  // 3) 某步需要工具：EXECUTING → AWAITING_TOOL（这里会把控制权交还给调用方）
  state = transition(state, State.AWAITING_TOOL);
  log.push("tool.call → AWAITING_TOOL（拉取点：等外部 resume）");

  // 4) 工具结果回来：AWAITING_TOOL → REFLECTING
  state = transition(state, State.REFLECTING);
  log.push("tool.result → REFLECTING");

  // 5) 目标达成：REFLECTING → DONE
  state = transition(state, State.DONE);
  log.push("goal_met → DONE");

  return { state, log };
}

// 直接运行本文件时打印演示（node js_practice/t1_01_harness_states.js）
if (import.meta.url === `file://${process.argv[1]}`) {
  const { state, log } = demoLoopSketch();
  console.log("final state:", state);
  for (const line of log) console.log("-", line);

  // 演示非法转移会被拦住
  try {
    transition(State.DONE, State.PLANNING);
  } catch (err) {
    console.log("caught illegal:", err.message);
  }
}
