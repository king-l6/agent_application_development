/**
 * T1.2 完全体 JS 对照文件（带教学注释）
 *
 * 右开对照：
 *   phases/19-capstone-projects/20-agent-harness-loop-contract/code/main.py
 *   重点看：Budget、PullRequest、_check_budget、_pause、
 *           run()/resume()、以及 requires_tool 时返回 PullRequest 的那段
 *
 * 本节核心：
 *   1) 拉取点 = 循环主动把控制权交还给调用方（不是崩溃）
 *   2) 预算耗尽 = 暂停（paused），不是任务完成（completed）
 */

// ========== Budget：三种上限 ==========
// = py: @dataclass class Budget:

export class Budget {
  /**
   * maxTurns / maxToolCalls / maxWallSeconds = 三类上限
   * turns / toolCalls / startedAt = 当前已用计数
   */
  constructor({
    maxTurns = 8,
    maxToolCalls = 16,
    maxWallSeconds = 30,
  } = {}) {
    this.maxTurns = maxTurns; // = py: max_turns
    this.maxToolCalls = maxToolCalls; // = py: max_tool_calls
    this.maxWallSeconds = maxWallSeconds; // = py: max_wall_seconds
    this.turns = 0; // 已用轮次
    this.toolCalls = 0; // 已用工具调用次数
    this.startedAt = Date.now() / 1000; // 墙钟起点（秒）= py: time.time()
  }

  /** 还剩多少墙钟秒；不会小于 0 */
  // = py: def remaining_seconds(self) -> float:
  remainingSeconds() {
    const used = Date.now() / 1000 - this.startedAt;
    return Math.max(0, this.maxWallSeconds - used);
  }

  /**
   * 若超限，返回超限原因字符串；否则返回 null
   * = py: def exceeded(self) -> str | None:
   */
  exceeded() {
    if (this.turns >= this.maxTurns) return "turns";
    if (this.toolCalls >= this.maxToolCalls) return "tool_calls";
    if (this.remainingSeconds() <= 0) return "wall_clock";
    return null; // = py: None
  }
}

// ========== PullRequest：把控制权交出去时的返回值 ==========
// = py: @dataclass class PullRequest:

export class PullRequest {
  /**
   * reason: 为什么停（如 "tool_call" / "budget_exceeded:turns"）
   * state: 当前状态（等工具时多半是 awaiting_tool；预算暂停会回到 idle）
   * payload: 调用方继续所需的信息（工具名、参数等）
   */
  constructor(reason, state, payload) {
    this.reason = reason;
    this.state = state;
    this.payload = payload;
  }
}

// ========== SessionResult：真正跑完时的返回值 ==========
// = py: @dataclass class SessionResult:

export class SessionResult {
  constructor(state, reason) {
    this.state = state; // 通常 "done"
    this.reason = reason; // 如 "goal_met"
  }
}

/**
 * 极简演示：模拟「需要工具 → 拉取 → resume → 完成」
 * 以及「预算耗尽 → 暂停（不是 completed）」
 *
 * 注意：这不是完整 HarnessLoop，只把本节概念跑通。
 */
export function demoPullPointAndBudget() {
  const log = [];

  // --- 场景 A：工具拉取点 ---
  // 循环执行到需要工具时：不自己瞎编结果，而是 return PullRequest
  let state = "executing";
  const needTool = true;

  if (needTool) {
    state = "awaiting_tool";
    const pull = new PullRequest("tool_call", state, {
      tool: "db.get_user",
      args: { id: 42 },
      step_id: 2,
    });
    log.push({
      scene: "A_tool_pull",
      meaning: "控制权交给调用方；调用方去跑工具，再 resume(payload)",
      pull,
    });

    // 调用方：拿到工具结果后 resume
    // = py: loop.resume({"result": ...})
    const toolPayload = { result: { id: 42, name: "ada" } };
    state = "reflecting"; // resume 后进入反思
    log.push({
      scene: "A_resume",
      meaning: "带着工具结果回来，状态从 awaiting_tool → reflecting",
      toolPayload,
      state,
    });
  }

  // --- 场景 B：预算耗尽是暂停，不是完成 ---
  const budget = new Budget({ maxTurns: 2, maxToolCalls: 99, maxWallSeconds: 999 });
  budget.turns = 2; // 故意用满轮次
  const which = budget.exceeded(); // "turns"

  // 预算超限 → PullRequest（暂停），reason 带 budget_exceeded
  // 不要写成 SessionResult(done) / TaskStatus.COMPLETED
  const pause = new PullRequest(`budget_exceeded:${which}`, "idle", {
    reason: `budget_exceeded:${which}`,
  });
  log.push({
    scene: "B_budget_pause",
    meaning: "预算用尽 = 本次运行必须停；任务未必做完 → paused，不是 completed",
    pause,
    isCompleted: false,
  });

  return log;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(demoPullPointAndBudget(), null, 2));
}
