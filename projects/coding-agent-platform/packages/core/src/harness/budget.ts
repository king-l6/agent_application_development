/** Pull-point budget for turns, tool calls, wall time, observation tokens, dollars. */

export interface BudgetLimits {
  maxTurns: number;
  maxToolCalls: number;
  maxWallMs: number;
  maxObservationTokens: number;
  maxDollars: number;
  maxReplans: number;
}

export interface BudgetSnapshot {
  turns: number;
  toolCalls: number;
  wallMs: number;
  observationTokens: number;
  dollars: number;
  replans: number;
  remainingTurns: number;
  remainingToolCalls: number;
  remainingWallMs: number;
  remainingObservationTokens: number;
  remainingDollars: number;
  remainingReplans: number;
}

export class Budget {
  turns = 0;
  toolCalls = 0;
  observationTokens = 0;
  dollars = 0;
  replans = 0;
  readonly startedAt: number;
  readonly limits: BudgetLimits;

  constructor(limits: Partial<BudgetLimits> = {}, startedAt = Date.now()) {
    this.limits = {
      maxTurns: limits.maxTurns ?? 24,
      maxToolCalls: limits.maxToolCalls ?? 48,
      maxWallMs: limits.maxWallMs ?? 60_000,
      maxObservationTokens: limits.maxObservationTokens ?? 8_000,
      maxDollars: limits.maxDollars ?? 1,
      maxReplans: limits.maxReplans ?? 3,
    };
    this.startedAt = startedAt;
  }

  wallMs(now = Date.now()): number {
    return now - this.startedAt;
  }

  snapshot(now = Date.now()): BudgetSnapshot {
    const wallMs = this.wallMs(now);
    const L = this.limits;
    return {
      turns: this.turns,
      toolCalls: this.toolCalls,
      wallMs,
      observationTokens: this.observationTokens,
      dollars: this.dollars,
      replans: this.replans,
      remainingTurns: Math.max(0, L.maxTurns - this.turns),
      remainingToolCalls: Math.max(0, L.maxToolCalls - this.toolCalls),
      remainingWallMs: Math.max(0, L.maxWallMs - wallMs),
      remainingObservationTokens: Math.max(
        0,
        L.maxObservationTokens - this.observationTokens,
      ),
      remainingDollars: Math.max(0, L.maxDollars - this.dollars),
      remainingReplans: Math.max(0, L.maxReplans - this.replans),
    };
  }

  /** Returns reason string if a hard pull-point is exceeded. */
  checkPullPoint(
    kind: "turn" | "tool" | "wall" | "observation" | "dollar" | "replan",
    now = Date.now(),
  ): string | null {
    const L = this.limits;
    switch (kind) {
      case "turn":
        return this.turns >= L.maxTurns ? "max turns exceeded" : null;
      case "tool":
        return this.toolCalls >= L.maxToolCalls ? "max tool calls exceeded" : null;
      case "wall":
        return this.wallMs(now) >= L.maxWallMs ? "wall clock budget exceeded" : null;
      case "observation":
        return this.observationTokens >= L.maxObservationTokens
          ? "observation token budget exceeded"
          : null;
      case "dollar":
        return this.dollars >= L.maxDollars ? "dollar budget exceeded" : null;
      case "replan":
        return this.replans >= L.maxReplans ? "replan budget exceeded" : null;
    }
  }

  clone(): Budget {
    const b = new Budget(this.limits, this.startedAt);
    b.turns = this.turns;
    b.toolCalls = this.toolCalls;
    b.observationTokens = this.observationTokens;
    b.dollars = this.dollars;
    b.replans = this.replans;
    return b;
  }

  toJSON(): Record<string, unknown> {
    return {
      limits: this.limits,
      turns: this.turns,
      toolCalls: this.toolCalls,
      observationTokens: this.observationTokens,
      dollars: this.dollars,
      replans: this.replans,
      startedAt: this.startedAt,
    };
  }

  static fromJSON(data: Record<string, unknown>): Budget {
    const b = new Budget(
      data.limits as Partial<BudgetLimits>,
      data.startedAt as number,
    );
    b.turns = data.turns as number;
    b.toolCalls = data.toolCalls as number;
    b.observationTokens = data.observationTokens as number;
    b.dollars = data.dollars as number;
    b.replans = data.replans as number;
    return b;
  }
}
