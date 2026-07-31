/** Minimal harness loop controller — state transitions + event emission. */

import type { State, EventSink, HookBus } from "./index.js";
import { Budget } from "./budget.js";

export class HarnessLoop {
  state: State = "idle";
  readonly budget: Budget;
  readonly hooks: HookBus;
  private emit: EventSink;

  constructor(opts: { budget?: Budget; hooks: HookBus; emit: EventSink }) {
    this.budget = opts.budget ?? new Budget();
    this.hooks = opts.hooks;
    this.emit = opts.emit;
  }

  transition(to: State): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.emit({ type: "state.changed", from, to, ts: Date.now() });
  }

  pause(reason: string): void {
    void reason;
    this.transition("paused");
    void this.hooks.emit("on_pause", { reason });
  }

  complete(): void {
    this.transition("done");
    void this.hooks.emit("on_complete", {});
  }
}
