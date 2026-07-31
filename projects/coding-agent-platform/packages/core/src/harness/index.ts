/** T1 — harness state machine, hooks, budget, events */

import type { PlanStep } from "../plan/index.js";
import type { BudgetSnapshot } from "./budget.js";
import type { TaskResult } from "../contracts/index.js";

export type State =
  | "idle"
  | "planning"
  | "executing"
  | "awaiting_tool"
  | "reflecting"
  | "done"
  | "paused";

export type HookTopic =
  | "before_plan"
  | "after_plan"
  | "before_step"
  | "after_step"
  | "before_tool_call"
  | "after_tool_call"
  | "on_error"
  | "on_pause"
  | "on_budget_exceeded"
  | "on_complete";

export class HookAbort extends Error {
  constructor(message = "hook aborted turn") {
    super(message);
    this.name = "HookAbort";
  }
}

export type AgentEvent =
  | { type: "session.start"; taskId: string; ts: number }
  | { type: "state.changed"; from: State; to: State; ts: number }
  | { type: "plan.commit"; steps: PlanStep[]; ts: number }
  | {
      type: "gate.decision";
      allow: boolean;
      gate: string;
      reason: string;
      ts: number;
    }
  | { type: "tool.call"; name: string; args: unknown; ts: number }
  | {
      type: "tool.result";
      name: string;
      ok: boolean;
      truncated: boolean;
      preview: string;
      ts: number;
    }
  | { type: "budget.warn"; remaining: BudgetSnapshot; ts: number }
  | {
      type: "validation.error";
      path: string;
      keyword: string;
      message: string;
      ts: number;
    }
  | { type: "checkpoint.saved"; id: string; ts: number }
  | { type: "replan"; reason: string; steps: PlanStep[]; ts: number }
  | { type: "observation"; text: string; tokens: number; ts: number }
  | { type: "diff"; path: string; before: string; after: string; ts: number }
  | { type: "session.complete"; result: TaskResult; ts: number };

export type EventSink = (event: AgentEvent) => void;

export type HookHandler = (payload: Record<string, unknown>) => void | Promise<void>;

export class HookBus {
  private handlers = new Map<HookTopic, HookHandler[]>();

  on(topic: HookTopic, handler: HookHandler): () => void {
    const list = this.handlers.get(topic) ?? [];
    list.push(handler);
    this.handlers.set(topic, list);
    return () => {
      const next = (this.handlers.get(topic) ?? []).filter((h) => h !== handler);
      this.handlers.set(topic, next);
    };
  }

  async emit(topic: HookTopic, payload: Record<string, unknown> = {}): Promise<void> {
    for (const h of this.handlers.get(topic) ?? []) {
      await h(payload);
    }
  }
}

export { Budget, type BudgetSnapshot, type BudgetLimits } from "./budget.js";
export { HarnessLoop } from "./loop.js";
