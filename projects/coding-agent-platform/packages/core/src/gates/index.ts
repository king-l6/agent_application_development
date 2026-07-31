/** T6 — verification gates + observation budget ledger */

export interface ToolCallRequest {
  turn: number;
  tool: string;
  args: Record<string, unknown>;
}

export interface GateDecision {
  allow: boolean;
  gate: string;
  reason: string;
}

export type Gate = (call: ToolCallRequest, ctx: GateContext) => GateDecision;

export interface GateContext {
  whitelist: Set<string>;
  toolCallsUsed: number;
  maxToolCalls: number;
  observationTokens: number;
  maxObservationTokens: number;
  /** schema validation errors if any */
  schemaErrors: { path: string; keyword: string; message: string }[];
}

/** Cheapest gates first — short-circuit on first deny. */
export function buildDefaultGateChain(): Gate[] {
  return [
    (call, ctx) => {
      if (!ctx.whitelist.has(call.tool)) {
        return {
          allow: false,
          gate: "whitelist",
          reason: `tool "${call.tool}" is not whitelisted`,
        };
      }
      return { allow: true, gate: "whitelist", reason: "ok" };
    },
    (call, ctx) => {
      void call;
      if (ctx.schemaErrors.length) {
        const e = ctx.schemaErrors[0];
        return {
          allow: false,
          gate: "schema",
          reason: `${e.path}: ${e.message}`,
        };
      }
      return { allow: true, gate: "schema", reason: "ok" };
    },
    (call, ctx) => {
      void call;
      if (ctx.toolCallsUsed >= ctx.maxToolCalls) {
        return {
          allow: false,
          gate: "budget",
          reason: "tool call budget exhausted",
        };
      }
      return { allow: true, gate: "budget", reason: "ok" };
    },
    (call, ctx) => {
      void call;
      if (ctx.observationTokens >= ctx.maxObservationTokens) {
        return {
          allow: false,
          gate: "freshness",
          reason: "observation budget exhausted — stop reading more",
        };
      }
      return { allow: true, gate: "freshness", reason: "ok" };
    },
  ];
}

export class GateChain {
  constructor(private gates: Gate[] = buildDefaultGateChain()) {}

  evaluate(call: ToolCallRequest, ctx: GateContext): GateDecision {
    for (const gate of this.gates) {
      const d = gate(call, ctx);
      if (!d.allow) return d;
    }
    return { allow: true, gate: "all", reason: "passed" };
  }
}

export interface Observation {
  turn: number;
  tool: string;
  text: string;
  tokens: number;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export class ObservationLedger {
  rows: Observation[] = [];
  maxCharsPerObs: number;

  constructor(maxCharsPerObs = 2_000) {
    this.maxCharsPerObs = maxCharsPerObs;
  }

  record(obs: Observation): Observation {
    let text = obs.text;
    let truncated = false;
    if (text.length > this.maxCharsPerObs) {
      text = text.slice(0, this.maxCharsPerObs) + "\n…[truncated]";
      truncated = true;
    }
    const tokens = estimateTokens(text);
    const row = { ...obs, text, tokens };
    this.rows.push(row);
    void truncated;
    return row;
  }

  cumulative(): number {
    return this.rows.reduce((a, r) => a + r.tokens, 0);
  }

  /** Keep last N observations + any that mention errors. */
  compact(keepLast = 4): Observation[] {
    const important = this.rows.filter((r) =>
      /error|fail|denied|denied|refused/i.test(r.text),
    );
    const tail = this.rows.slice(-keepLast);
    const seen = new Set<Observation>();
    const out: Observation[] = [];
    for (const r of [...important, ...tail]) {
      if (!seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    }
    this.rows = out;
    return out;
  }
}
