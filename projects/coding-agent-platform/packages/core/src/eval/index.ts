/** T8 — fixture eval harness */

import type { TaskResult } from "../contracts/index.js";
import type { WorkspaceFs } from "../sandbox/index.js";

export interface FixtureTask {
  id: string;
  title: string;
  goal: string;
  files: Record<string, string>;
  /** Expected after successful agent run (subset of paths). */
  expectFiles?: Record<string, string | RegExp>;
  /** If true, success means sandbox denied escape (security demo). */
  expectDenied?: boolean;
  tags?: string[];
}

export interface EvalCaseResult {
  taskId: string;
  passed: boolean;
  latencyMs: number;
  costUsd: number;
  reason: string;
  agentStatus: string;
}

export interface EvalReport {
  startedAt: number;
  finishedAt: number;
  passRate: number;
  results: EvalCaseResult[];
  metrics: Record<string, unknown>;
}

export type Verifier = (
  fs: WorkspaceFs,
  agentResult: TaskResult,
  task: FixtureTask,
) => { passed: boolean; reason: string };

export const defaultVerifier: Verifier = (fs, agentResult, task) => {
  if (task.expectDenied) {
    const denied =
      agentResult.status === "completed" &&
      /denied|jail|escape|refused|gate/i.test(agentResult.summary);
    return {
      passed: denied || agentResult.status === "completed",
      reason: denied
        ? "escape correctly denied"
        : agentResult.summary || "expected denial path",
    };
  }
  if (agentResult.status !== "completed") {
    return {
      passed: false,
      reason: agentResult.error?.message ?? `status=${agentResult.status}`,
    };
  }
  for (const [path, expected] of Object.entries(task.expectFiles ?? {})) {
    if (!fs.exists(path)) {
      return { passed: false, reason: `missing file ${path}` };
    }
    const actual = fs.readFile(path);
    if (expected instanceof RegExp) {
      if (!expected.test(actual)) {
        return { passed: false, reason: `${path} did not match ${expected}` };
      }
    } else if (actual !== expected && !actual.includes(expected)) {
      // allow substring match for flexibility
      if (expected.length < 80 && !actual.includes(expected)) {
        return { passed: false, reason: `${path} content mismatch` };
      }
      if (expected.length >= 80 && actual !== expected) {
        return { passed: false, reason: `${path} content mismatch` };
      }
    }
  }
  return { passed: true, reason: "ok" };
};

export class EvalHarness {
  constructor(private verifier: Verifier = defaultVerifier) {}

  evaluateOne(
    task: FixtureTask,
    fs: WorkspaceFs,
    agentResult: TaskResult,
  ): EvalCaseResult {
    const v = this.verifier(fs, agentResult, task);
    return {
      taskId: task.id,
      passed: v.passed,
      latencyMs: agentResult.durationMs,
      costUsd: agentResult.costUsd,
      reason: v.reason,
      agentStatus: agentResult.status,
    };
  }

  aggregate(results: EvalCaseResult[]): EvalReport {
    const passed = results.filter((r) => r.passed).length;
    return {
      startedAt: Date.now(),
      finishedAt: Date.now(),
      passRate: results.length ? passed / results.length : 0,
      results,
      metrics: {
        passed,
        total: results.length,
        avgLatencyMs: results.length
          ? results.reduce((a, r) => a + r.latencyMs, 0) / results.length
          : 0,
        totalCostUsd: results.reduce((a, r) => a + r.costUsd, 0),
      },
    };
  }
}
