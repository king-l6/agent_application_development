/** T5 — typed plan, cursor, replan budget */

export type StepStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";

export interface PlanStep {
  id: string;
  description: string;
  status: StepStatus;
  toolHint?: string;
  note?: string;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
  cursor: number;
  version: number;
}

export function createPlan(goal: string, descriptions: string[]): Plan {
  return {
    goal,
    cursor: 0,
    version: 1,
    steps: descriptions.map((description, i) => ({
      id: `s${i + 1}`,
      description,
      status: "pending" as const,
    })),
  };
}

export function currentStep(plan: Plan): PlanStep | undefined {
  return plan.steps[plan.cursor];
}

export function markCurrent(plan: Plan, status: StepStatus, note?: string): Plan {
  const steps = plan.steps.map((s, i) =>
    i === plan.cursor ? { ...s, status, note: note ?? s.note } : s,
  );
  const cursor =
    status === "done" || status === "skipped"
      ? Math.min(plan.cursor + 1, plan.steps.length)
      : plan.cursor;
  return { ...plan, steps, cursor };
}

export function allDone(plan: Plan): boolean {
  return plan.steps.every((s) => s.status === "done" || s.status === "skipped");
}

export function replan(
  plan: Plan,
  reason: string,
  remainingDescriptions: string[],
): Plan {
  const kept = plan.steps
    .slice(0, plan.cursor)
    .map((s) =>
      s.status === "failed" || s.status === "in_progress"
        ? { ...s, status: "skipped" as const, note: reason }
        : s,
    );
  const fresh = remainingDescriptions.map((description, i) => ({
    id: `r${plan.version + 1}_${i + 1}`,
    description,
    status: "pending" as const,
  }));
  return {
    goal: plan.goal,
    version: plan.version + 1,
    cursor: kept.length,
    steps: [...kept, ...fresh],
  };
}

export function planSummary(plan: Plan): string {
  const lines = [`GOAL: ${plan.goal} (v${plan.version})`];
  for (const s of plan.steps) {
    const mark =
      { pending: " ", in_progress: ">", done: "x", failed: "!", skipped: "-" }[
        s.status
      ] ?? "?";
    lines.push(`  [${mark}] ${s.id}. ${s.description}`);
  }
  return lines.join("\n");
}
