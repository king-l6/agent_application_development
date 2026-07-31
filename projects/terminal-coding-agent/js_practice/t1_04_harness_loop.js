/**
 * T1.4 — main.py 中「循环契约」的【完整翻译】（不含 _demo）
 *
 * 对应文件：
 *   phases/19-capstone-projects/20-agent-harness-loop-contract/code/main.py
 * 对应范围：State ~ HarnessLoop._complete（约 20–315 行）
 *
 * 左开本文件，右开 main.py，按类/方法名对齐扫读。
 * T1.1–T1.3 已学过的符号这里仍完整译出，否则 HarnessLoop 无法独立对照。
 */

// ===== State =====
// = py: class State(str, Enum)
export const State = Object.freeze({
  IDLE: "idle",
  PLANNING: "planning",
  EXECUTING: "executing",
  AWAITING_TOOL: "awaiting_tool",
  REFLECTING: "reflecting",
  DONE: "done",
});

// ===== HOOK_TOPICS / EVENT_TYPES（见 T1.3，此处保持完整以便对照）=====
export const HOOK_TOPICS = [
  "before_plan", "after_plan", "before_step", "after_step",
  "before_tool_call", "after_tool_call", "on_error", "on_pause",
  "on_budget_exceeded", "on_complete",
];

export const EVENT_TYPES = [
  "session.start", "plan.draft", "plan.commit", "step.start", "step.end",
  "tool.call", "tool.result", "tool.error", "budget.warn",
  "session.pause", "session.complete",
];

// = py: class HookAbort(Exception)
export class HookAbort extends Error {
  constructor(message) {
    super(String(message));
    this.name = "HookAbort";
  }
}

// = py: @dataclass class Event
export class Event {
  constructor(type, payload, ts) {
    this.type = type;
    this.payload = payload;
    this.ts = ts;
  }
  toDict() {
    return { type: this.type, payload: this.payload, ts: this.ts };
  }
}

// = py: @dataclass class Budget
export class Budget {
  constructor({
    maxTurns = 8,
    maxToolCalls = 16,
    maxWallSeconds = 30.0,
  } = {}) {
    this.maxTurns = maxTurns; // = py: max_turns
    this.maxToolCalls = maxToolCalls;
    this.maxWallSeconds = maxWallSeconds;
    this.turns = 0;
    this.toolCalls = 0;
    this.startedAt = Date.now() / 1000; // = py: time.time()
  }

  remainingSeconds() {
    return Math.max(0.0, this.maxWallSeconds - (Date.now() / 1000 - this.startedAt));
  }

  exceeded() {
    if (this.turns >= this.maxTurns) return "turns";
    if (this.toolCalls >= this.maxToolCalls) return "tool_calls";
    if (this.remainingSeconds() <= 0.0) return "wall_clock";
    return null; // = py: None
  }
}

// = py: @dataclass class Step
export class Step {
  constructor({
    id,
    description,
    requiresTool,
    toolName = null,
    toolArgs = {},
    result = null,
    error = null,
  }) {
    this.id = id;
    this.description = description;
    this.requiresTool = requiresTool; // = py: requires_tool
    this.toolName = toolName; // = py: tool_name
    this.toolArgs = toolArgs; // = py: tool_args
    this.result = result;
    this.error = error;
  }
}

// = py: @dataclass class PullRequest
export class PullRequest {
  constructor(reason, state, payload) {
    this.reason = reason;
    this.state = state;
    this.payload = payload;
  }
}

// = py: @dataclass class SessionResult
export class SessionResult {
  constructor(state, reason, steps, events) {
    this.state = state;
    this.reason = reason;
    this.steps = steps;
    this.events = events;
  }
}

// = py: class HookRegistry
export class HookRegistry {
  constructor() {
    this._subs = Object.fromEntries(HOOK_TOPICS.map((t) => [t, []]));
  }
  on(topic, fn) {
    if (!(topic in this._subs)) {
      throw new Error(`unknown hook topic: ${topic}`); // = py: ValueError
    }
    this._subs[topic].push(fn);
  }
  fire(topic, payload) {
    const results = [];
    for (const fn of this._subs[topic]) results.push(fn(payload));
    return results;
  }
}

// = py: Planner = Callable[[str, list[Step]], list[Step]]
// 规划器：输入 goal + history，输出 Step 列表

// = py: def _default_planner(goal, history) -> list[Step]
export function defaultPlanner(goal, history) {
  if (history.length > 0) return []; // 已有历史则不再给新计划（本课占位逻辑）
  return [
    new Step({
      id: 1,
      description: `interpret goal: ${goal}`,
      requiresTool: false,
    }),
    new Step({
      id: 2,
      description: "fetch user record",
      requiresTool: true,
      toolName: "db.get_user",
      toolArgs: { id: 42 },
    }),
    new Step({
      id: 3,
      description: "summarize and respond",
      requiresTool: true,
      toolName: "format.summary",
      toolArgs: { style: "short" },
    }),
  ];
}

// ===========================================================================
// HarnessLoop  【本节精读重点：每个方法都与 py 一一对应】
// = py: class HarnessLoop
// ===========================================================================
export class HarnessLoop {
  /**
   * = py: def __init__(self, planner=None, budget=None)
   */
  constructor(planner = null, budget = null) {
    this.state = State.IDLE;
    this.hooks = new HookRegistry();
    this.budget = budget || new Budget();
    this._planner = planner || defaultPlanner;
    this._goal = "";
    this._plan = []; // 当前计划步骤
    this._cursor = 0; // 当前步骤下标
    this._events = [];
    this._history = [];
    this._reason = "";
    this._prevState = null; // = py: _prev_state；预算暂停前的状态，便于 resume
  }

  /** = py: @property def events */
  get events() {
    return [...this._events]; // 返回副本，避免外部直接改内部列表
  }

  /** = py: @property def plan */
  get plan() {
    return [...this._plan];
  }

  /** = py: def _emit(self, etype, payload) */
  _emit(etype, payload) {
    if (!EVENT_TYPES.includes(etype)) {
      throw new Error(`unknown event type: ${etype}`);
    }
    this._events.push(new Event(etype, payload, Date.now() / 1000));
  }

  /** = py: def _transition(self, target) */
  _transition(target) {
    const legal = {
      [State.IDLE]: new Set([State.PLANNING]),
      [State.PLANNING]: new Set([State.EXECUTING, State.IDLE, State.DONE]),
      [State.EXECUTING]: new Set([State.AWAITING_TOOL, State.REFLECTING, State.IDLE]),
      [State.AWAITING_TOOL]: new Set([State.REFLECTING, State.IDLE]),
      [State.REFLECTING]: new Set([
        State.PLANNING, State.EXECUTING, State.DONE, State.IDLE,
      ]),
      [State.DONE]: new Set(),
    };
    if (!legal[this.state].has(target)) {
      throw new Error(`illegal transition ${this.state} -> ${target}`);
    }
    this.state = target;
  }

  /** = py: def _check_budget(self) -> PullRequest | None */
  _checkBudget() {
    const which = this.budget.exceeded();
    if (which === null) return null;
    this._emit("budget.warn", { limit: which });
    this.hooks.fire("on_budget_exceeded", { limit: which, budget: this.budget });
    this._reason = `budget_exceeded:${which}`;
    this._prevState = this.state;
    return this._pause(this._reason);
  }

  /** = py: def _pause(self, reason) -> PullRequest */
  _pause(reason) {
    this._emit("session.pause", { reason });
    this.hooks.fire("on_pause", { reason });
    this._transition(State.IDLE);
    return new PullRequest(reason, this.state, { reason });
  }

  /**
   * 启动会话。必须从 IDLE 开始。
   * = py: def run(self, goal) -> PullRequest | SessionResult
   */
  run(goal) {
    if (this.state !== State.IDLE) {
      throw new Error(`run() requires IDLE, got ${this.state}`);
    }
    this._goal = goal;
    this.budget.startedAt = Date.now() / 1000;
    this._emit("session.start", { goal });
    return this._step(); // 进入内部步进
  }

  /**
   * 交还控制权后再进来：预算恢复，或送回工具结果。
   * = py: def resume(self, payload=None)
   */
  resume(payload = null) {
    // 分支 1：预算暂停后从 IDLE 恢复
    if (this.state === State.IDLE && this._reason.startsWith("budget_exceeded")) {
      this.budget.turns = 0;
      this.budget.toolCalls = 0;
      this.budget.startedAt = Date.now() / 1000;
      this._reason = "";
      const prev = this._prevState;
      this._prevState = null;
      if (this._plan.length === 0) return this._beginPlan();
      if (prev === State.EXECUTING) this.state = State.EXECUTING;
      else this.state = State.REFLECTING;
      return this._step();
    }

    // 分支 2：工具拉取点 — payload 必填
    if (this.state === State.AWAITING_TOOL) {
      if (payload === null) {
        throw new Error("resume from AWAITING_TOOL requires a payload");
      }
      const current = this._plan[this._cursor];
      if ("error" in payload) {
        current.error = String(payload.error);
        this._emit("tool.error", { step: current.id, error: current.error });
        this.hooks.fire("on_error", { step: current, error: current.error });
      } else {
        current.result = payload.result; // = py: payload.get("result")
        this._emit("tool.result", { step: current.id, result: current.result });
      }
      this.hooks.fire("after_tool_call", { step: current });
      this._transition(State.REFLECTING);
      return this._step();
    }

    throw new Error(`resume() unsupported from state ${this.state}`);
  }

  /** = py: def _begin_plan(self) */
  _beginPlan() {
    this._transition(State.PLANNING);
    this.hooks.fire("before_plan", { goal: this._goal, history: [...this._history] });
    const draft = this._planner(this._goal, [...this._history]);
    this._emit("plan.draft", { steps: draft.map((s) => s.description) });
    this.hooks.fire("after_plan", { steps: draft });
    this._plan = draft;
    this._cursor = 0;
    this._emit("plan.commit", { count: draft.length });
    if (draft.length === 0) return this._complete("no_plan");
    this._transition(State.EXECUTING);
    return this._step();
  }

  /**
   * 内部步进：检查预算 → 反思推进 / 执行一步 → 可能 PullRequest 或完成
   * = py: def _step(self)
   */
  _step() {
    if (this.state === State.IDLE) return this._beginPlan();

    const budgetHit = this._checkBudget();
    if (budgetHit !== null) return budgetHit;

    // 反思：游标前进；走完计划则完成
    if (this.state === State.REFLECTING) {
      this._cursor += 1;
      this.budget.turns += 1;
      if (this._cursor >= this._plan.length) return this._complete("goal_met");
      this._transition(State.EXECUTING);
      return this._step();
    }

    if (this.state !== State.EXECUTING) {
      throw new Error(`_step requires EXECUTING/REFLECTING, got ${this.state}`);
    }

    const step = this._plan[this._cursor];
    this.hooks.fire("before_step", { step });
    this._emit("step.start", { step_id: step.id, desc: step.description });

    // 需要工具：可能被 HookAbort 拦住；否则进入 AWAITING_TOOL 并 return PullRequest
    if (step.requiresTool) {
      try {
        this.hooks.fire("before_tool_call", { step });
      } catch (exc) {
        if (!(exc instanceof HookAbort)) throw exc;
        step.error = `hook_abort:${exc.message}`;
        this._emit("tool.error", { step: step.id, error: step.error });
        this.hooks.fire("on_error", { step, error: step.error });
        this._transition(State.REFLECTING);
        return this._step();
      }
      this.budget.toolCalls += 1;
      this._emit("tool.call", {
        step: step.id,
        tool: step.toolName,
        args: step.toolArgs,
      });
      this._transition(State.AWAITING_TOOL);
      this._emit("step.end", { step_id: step.id, outcome: "awaiting_tool" });
      this.hooks.fire("after_step", { step, outcome: "awaiting_tool" });
      return new PullRequest("tool_call", this.state, {
        tool: step.toolName,
        args: step.toolArgs,
        step_id: step.id,
      });
    }

    // 不需要工具：本地记一个占位结果，进入反思再继续
    step.result = `ok:${step.description}`;
    this._emit("step.end", { step_id: step.id, outcome: "ok" });
    this.hooks.fire("after_step", { step, outcome: "ok" });
    this._transition(State.REFLECTING);
    return this._step();
  }

  /** = py: def _complete(self, reason) -> SessionResult */
  _complete(reason) {
    this._emit("session.complete", { reason });
    this.hooks.fire("on_complete", { reason });
    this._transition(State.DONE);
    this._reason = reason;
    return new SessionResult(
      this.state,
      reason,
      [...this._plan],
      [...this._events],
    );
  }
}
