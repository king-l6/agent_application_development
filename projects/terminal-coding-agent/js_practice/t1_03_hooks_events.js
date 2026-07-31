/**
 * T1.3 — 本节目标 Python 的【完整翻译】
 *
 * 对应文件：
 *   phases/19-capstone-projects/20-agent-harness-loop-contract/code/main.py
 * 对应范围（完整译出，无删减方法）：
 *   - HOOK_TOPICS          （约 29–40 行）
 *   - EVENT_TYPES          （约 42–54 行）
 *   - class HookAbort      （约 57–58 行）
 *   - class Event          （约 61–68 行）
 *   - class HookRegistry   （约 120–133 行）
 *
 * 用法：左开本文件，右开 main.py 同一范围，从上到下并排扫。
 * 本文件不是“概念 demo”，而是上述符号的完整 JS 版。
 */

// ---------------------------------------------------------------------------
// HOOK_TOPICS
// = py: HOOK_TOPICS = ( ... )
// 元组/数组里是「允许注册的钩子主题名」。拼错名字会在 on() 里被拒绝。
// ---------------------------------------------------------------------------
export const HOOK_TOPICS = [
  "before_plan", // 规划开始前
  "after_plan", // 规划结束后
  "before_step", // 每个执行步骤开始前
  "after_step", // 每个执行步骤结束后
  "before_tool_call", // 调用工具前（常挂安全策略）
  "after_tool_call", // 工具调用结束后
  "on_error", // 出错时
  "on_pause", // 暂停时
  "on_budget_exceeded", // 预算超限时
  "on_complete", // 会话完成时
];

// ---------------------------------------------------------------------------
// EVENT_TYPES
// = py: EVENT_TYPES = ( ... )
// 事件流允许的类型名。循环 _emit 时若类型不在此列表会报错（见 HarnessLoop._emit）。
// ---------------------------------------------------------------------------
export const EVENT_TYPES = [
  "session.start", // 会话开始（run 时一次）
  "plan.draft", // 规划器返回草稿
  "plan.commit", // 草稿提交为活动计划
  "step.start", // 步骤开始
  "step.end", // 步骤结束
  "tool.call", // 需要工具，即将把控制权交还
  "tool.result", // 带着成功结果 resume
  "tool.error", // 带着错误 resume 或钩子中止
  "budget.warn", // 触达预算限制
  "session.pause", // 会话暂停（交还控制权）
  "session.complete", // 会话到达 DONE
];

// ---------------------------------------------------------------------------
// HookAbort
// = py:
//   class HookAbort(Exception):
//       """Raised by a hook to cancel the in-flight turn."""
//
// Exception / Error：异常类型。钩子里 throw/raise 它可以取消当前工具调用。
// ---------------------------------------------------------------------------
export class HookAbort extends Error {
  /**
   * @param {string} message 中止原因，例如 "policy_denied"
   */
  constructor(message) {
    super(message); // = py: Exception 的初始化（消息挂在异常上）
    this.name = "HookAbort"; // JS 习惯：标明异常类名，便于 instanceof 判断
  }
}

// ---------------------------------------------------------------------------
// Event
// = py:
//   @dataclass
//   class Event:
//       type: str
//       payload: dict
//       ts: float
//
//       def to_dict(self) -> dict:
//           return {"type": self.type, "payload": self.payload, "ts": self.ts}
//
// @dataclass：Python 按字段自动生成 __init__ 等；JS 里用手写 constructor 对应。
// ---------------------------------------------------------------------------
export class Event {
  /**
   * @param {string} type 事件类型，应属于 EVENT_TYPES
   * @param {Record<string, unknown>} payload 附加数据字典
   * @param {number} ts 时间戳（秒）
   */
  constructor(type, payload, ts) {
    this.type = type; // = py: self.type
    this.payload = payload; // = py: self.payload
    this.ts = ts; // = py: self.ts
  }

  /**
   * 转成普通对象，方便 JSON 序列化
   * = py: def to_dict(self) -> dict
   */
  toDict() {
    return {
      type: this.type,
      payload: this.payload,
      ts: this.ts,
    };
  }
}

// ---------------------------------------------------------------------------
// HookRegistry
// = py: class HookRegistry:  （三个方法全部译出，无省略）
// ---------------------------------------------------------------------------
export class HookRegistry {
  /**
   * = py: def __init__(self) -> None:
   *        self._subs = {t: [] for t in HOOK_TOPICS}
   *
   * __init__ / constructor：创建实例时的初始化。
   * 字典推导 / Object.fromEntries：给每个主题准备一个空订阅列表。
   */
  constructor() {
    /** @type {Record<string, Array<(payload: Record<string, unknown>) => unknown>>} */
    this._subs = Object.fromEntries(HOOK_TOPICS.map((t) => [t, []]));
  }

  /**
   * 注册订阅函数
   * = py: def on(self, topic: str, fn: Callable[[dict], Any]) -> None:
   *
   * Callable[[dict], Any]：接收一个 dict、返回任意值的函数类型。
   * append / push：把 fn 加到该主题列表末尾（按注册顺序触发）。
   */
  on(topic, fn) {
    // = py: if topic not in self._subs:
    if (!(topic in this._subs)) {
      // = py: raise ValueError(f"unknown hook topic: {topic}")
      // ValueError：参数不合法；JS 里用 Error 表达同类失败
      throw new Error(`unknown hook topic: ${topic}`);
    }
    // = py: self._subs[topic].append(fn)
    this._subs[topic].push(fn);
  }

  /**
   * 触发某主题下全部订阅者，按顺序调用，收集返回值
   * = py: def fire(self, topic: str, payload: dict) -> list[Any]:
   *
   * 若某个 fn 抛出 HookAbort，不会在这里吞掉，会冒泡给 HarnessLoop 处理。
   */
  fire(topic, payload) {
    // = py: results = []
    const results = [];
    // = py: for fn in self._subs[topic]:
    for (const fn of this._subs[topic]) {
      // = py: results.append(fn(payload))
      results.push(fn(payload));
    }
    // = py: return results
    return results;
  }
}
