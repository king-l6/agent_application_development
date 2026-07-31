/**
 * T1.5 — 三条验收路径的【完整翻译】
 *
 * 对应文件：
 *   phases/19-capstone-projects/20-agent-harness-loop-contract/code/tests/test_loop.py
 * 对应范围（完整译出，无删断言）：
 *   - linear_planner / two_tool_planner
 *   - test_idle_to_done_linear          （路径 A：正常完成）
 *   - test_turn_limit_paused            （路径 B：预算暂停）
 *   - test_hook_abort_skips_tool_call   （路径 C：策略中止）
 *
 * 用法：左开本文件，右开 test_loop.py 同名函数。
 * 真正跑通用下面的 python3 -m unittest ...（本 JS 是对照阅读材料）。
 */

import assert from "node:assert/strict";
import {
  Budget,
  HarnessLoop,
  HookAbort,
  PullRequest,
  SessionResult,
  State,
  Step,
} from "./t1_04_harness_loop.js";

/**
 * = py: def linear_planner(goal, history):
 * 三步都不需要工具 → 一次 run() 就能到 DONE
 */
export function linearPlanner(goal, history) {
  // = py: if history: return []
  if (history.length) return [];
  // = py: return [ Step(...), Step(...), Step(...) ]
  return [
    new Step({ id: 1, description: "step1", requiresTool: false }),
    new Step({ id: 2, description: "step2", requiresTool: false }),
    new Step({ id: 3, description: "step3", requiresTool: false }),
  ];
}

/**
 * = py: def two_tool_planner(goal, history):
 * 第 2、3 步需要工具 → 可测拉取点，也可被 HookAbort 拦住
 */
export function twoToolPlanner(goal, history) {
  if (history.length) return [];
  return [
    new Step({ id: 1, description: "prep", requiresTool: false }),
    new Step({
      id: 2,
      description: "fetch",
      requiresTool: true,
      toolName: "t.fetch",
      toolArgs: {},
    }),
    new Step({
      id: 3,
      description: "render",
      requiresTool: true,
      toolName: "t.render",
      toolArgs: {},
    }),
  ];
}

// ===========================================================================
// 路径 A：正常完成
// = py: class TestStateTransitions → test_idle_to_done_linear
// ===========================================================================
export function testIdleToDoneLinear() {
  // = py: loop = HarnessLoop(planner=linear_planner)
  const loop = new HarnessLoop(linearPlanner);

  // = py: result = loop.run("g")
  const result = loop.run("g");

  // = py: self.assertIsInstance(result, SessionResult)
  // assert.ok(x) = 断言 x 为真；instanceof = 是否某类的实例
  assert.ok(result instanceof SessionResult);

  // = py: self.assertEqual(result.state, State.DONE)
  assert.equal(result.state, State.DONE);

  // = py: self.assertEqual(result.reason, "goal_met")
  assert.equal(result.reason, "goal_met");
}

// ===========================================================================
// 路径 B：预算暂停（不是 completed）
// = py: class TestBudget → test_turn_limit_paused
// ===========================================================================
export function testTurnLimitPaused() {
  // = py: budget = Budget(max_turns=1, max_tool_calls=10, max_wall_seconds=10.0)
  const budget = new Budget({
    maxTurns: 1,
    maxToolCalls: 10,
    maxWallSeconds: 10.0,
  });

  // = py: loop = HarnessLoop(planner=linear_planner, budget=budget)
  const loop = new HarnessLoop(linearPlanner, budget);

  // = py: result = loop.run("g")
  const result = loop.run("g");

  // 预算用尽 → PullRequest，reason 以 budget_exceeded 开头
  // = py: self.assertIsInstance(result, PullRequest)
  assert.ok(result instanceof PullRequest);

  // = py: self.assertTrue(result.reason.startswith("budget_exceeded"))
  // startsWith ≈ Python str.startswith
  assert.ok(result.reason.startsWith("budget_exceeded"));
}

// ===========================================================================
// 路径 C：策略中止（HookAbort）
// = py: class TestHooks → test_hook_abort_skips_tool_call
// ===========================================================================
export function testHookAbortSkipsToolCall() {
  // = py: loop = HarnessLoop(planner=two_tool_planner)
  const loop = new HarnessLoop(twoToolPlanner);

  // = py: errors: list[str] = []
  const errors = [];

  // = py: loop.hooks.on("on_error", lambda p: errors.append(p["error"]))
  loop.hooks.on("on_error", (p) => errors.push(p.error));

  // = py:
  //   def block(p):
  //       raise HookAbort("policy_denied")
  //   loop.hooks.on("before_tool_call", block)
  function block(_p) {
    throw new HookAbort("policy_denied");
  }
  loop.hooks.on("before_tool_call", block);

  // 两个工具步都会在 before_tool_call 被中止，不会对外 PullRequest(tool_call)
  // = py: result = loop.run("g")
  const result = loop.run("g");

  // = py: self.assertIsInstance(result, SessionResult)
  assert.ok(result instanceof SessionResult);

  // 两个工具步 → 两次 on_error
  // = py: self.assertEqual(len(errors), 2)
  assert.equal(errors.length, 2);

  // = py: self.assertTrue(errors[0].startswith("hook_abort"))
  assert.ok(errors[0].startsWith("hook_abort"));
}
