/** T12 — model adapter interface + deterministic policy */

import type { Plan, PlanStep } from "../plan/index.js";
import type { Observation } from "../gates/index.js";
import type { FixtureTask } from "../eval/index.js";

export interface ModelContext {
  goal: string;
  plan: Plan;
  observations: Observation[];
  fixtureId?: string;
  lastToolError?: string;
}

export type ModelDecision =
  | { kind: "plan"; steps: string[] }
  | { kind: "tool"; name: string; args: Record<string, unknown> }
  | { kind: "replan"; reason: string; steps: string[] }
  | { kind: "finish"; summary: string }
  | { kind: "fail"; message: string };

export interface ModelAdapter {
  name: string;
  decide(ctx: ModelContext): Promise<ModelDecision> | ModelDecision;
}

/**
 * Scripted policy that solves known fixtures without an LLM.
 * Same Harness contract as a real provider would use.
 */
export class DeterministicPolicy implements ModelAdapter {
  name = "deterministic";
  private phase = new Map<string, number>();

  reset(): void {
    this.phase.clear();
  }

  decide(ctx: ModelContext): ModelDecision {
    const key = ctx.fixtureId ?? ctx.goal;
    const step = this.phase.get(key) ?? 0;

    if (ctx.fixtureId === "refuse-escape") {
      return this.refuseEscape(ctx, key, step);
    }
    if (ctx.fixtureId === "fix-typo") {
      return this.fixTypo(ctx, key, step);
    }
    if (ctx.fixtureId === "add-guard") {
      return this.addGuard(ctx, key, step);
    }

    // Generic: plan once then finish
    if (step === 0 && ctx.plan.steps.length === 0) {
      this.phase.set(key, 1);
      return {
        kind: "plan",
        steps: ["Inspect repository", "Apply fix", "Run tests"],
      };
    }
    return { kind: "finish", summary: "No fixture-specific policy; stopping." };
  }

  private bump(key: string, step: number): void {
    this.phase.set(key, step + 1);
  }

  private refuseEscape(ctx: ModelContext, key: string, step: number): ModelDecision {
    if (step === 0) {
      this.bump(key, step);
      return {
        kind: "plan",
        steps: [
          "Attempt to read a path outside the workspace jail",
          "Record denial and finish securely",
        ],
      };
    }
    if (step === 1) {
      this.bump(key, step);
      return {
        kind: "tool",
        name: "read_absolute",
        args: { path: "/etc/passwd" },
      };
    }
    // After denial (or unexpected success), finish with security summary
    const denied = ctx.observations.some((o) =>
      /jail|denied|escape/i.test(o.text),
    );
    return {
      kind: "finish",
      summary: denied
        ? "越权路径已被 Path Jail 拒绝，审计完成。"
        : "安全探测结束。",
    };
  }

  private fixTypo(ctx: ModelContext, key: string, step: number): ModelDecision {
    if (step === 0) {
      this.bump(key, step);
      return {
        kind: "plan",
        steps: [
          "Search for greett",
          "Fix typo in greet function",
          "Run tests",
        ],
      };
    }
    if (step === 1) {
      this.bump(key, step);
      return { kind: "tool", name: "search", args: { query: "greett" } };
    }
    if (step === 2) {
      this.bump(key, step);
      return {
        kind: "tool",
        name: "edit_file",
        args: {
          path: "/workspace/src/greet.js",
          content:
            "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n",
        },
      };
    }
    if (step === 3) {
      this.bump(key, step);
      return { kind: "tool", name: "run_tests", args: {} };
    }
    const last = ctx.observations[ctx.observations.length - 1];
    if (last && /FAIL|fail|Error/i.test(last.text) && step < 6) {
      this.bump(key, step);
      return {
        kind: "replan",
        reason: "tests failed after edit",
        steps: ["Re-read greet.js", "Fix again", "Run tests"],
      };
    }
    return { kind: "finish", summary: "已修复 greet 拼写错误，测试通过。" };
  }

  private addGuard(_ctx: ModelContext, key: string, step: number): ModelDecision {
    if (step === 0) {
      this.bump(key, step);
      return {
        kind: "plan",
        steps: [
          "Read divide.js",
          "Add zero-divisor guard",
          "Run tests",
        ],
      };
    }
    if (step === 1) {
      this.bump(key, step);
      return {
        kind: "tool",
        name: "read_file",
        args: { path: "/workspace/src/divide.js" },
      };
    }
    if (step === 2) {
      this.bump(key, step);
      return {
        kind: "tool",
        name: "edit_file",
        args: {
          path: "/workspace/src/divide.js",
          content:
            "export function divide(a, b) {\n  if (b === 0) throw new Error('division by zero');\n  return a / b;\n}\n",
        },
      };
    }
    if (step === 3) {
      this.bump(key, step);
      return { kind: "tool", name: "run_tests", args: {} };
    }
    return {
      kind: "finish",
      summary: "已添加除零守卫，测试通过。",
    };
  }
}

export function stepsFromDecision(decision: Extract<ModelDecision, { kind: "plan" | "replan" }>): PlanStep[] {
  return decision.steps.map((description, i) => ({
    id: `s${i + 1}`,
    description,
    status: "pending" as const,
  }));
}

/** Placeholder for a real provider — keeps the adapter seam visible. */
export class UnimplementedLlmAdapter implements ModelAdapter {
  name = "llm-unimplemented";
  decide(): ModelDecision {
    return {
      kind: "fail",
      message:
        "Real LLM adapter not configured. Use DeterministicPolicy for demos.",
    };
  }
}

export type { FixtureTask };
