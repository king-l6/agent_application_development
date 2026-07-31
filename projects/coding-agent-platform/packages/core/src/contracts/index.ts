/** T0 — stable input/output/error contracts */

export type TaskStatus = "completed" | "failed" | "paused";

export type ErrorCode =
  | "invalid_request"
  | "internal_error"
  | "budget_exceeded"
  | "validation_error"
  | "sandbox_denied"
  | "tool_error"
  | "gate_denied"
  | "replan_exhausted";

export interface AgentError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, string>;
}

export interface TaskRequest {
  taskId: string;
  goal: string;
  /** Logical workspace root label (VFS root or disk root). */
  repository: string;
  /** Fixture id when running a demo task. */
  fixtureId?: string;
  metadata?: Record<string, string>;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  summary: string;
  error?: AgentError;
  stepsCompleted: number;
  toolCalls: number;
  durationMs: number;
  costUsd: number;
  artifacts?: DeliveryArtifacts;
}

export interface DeliveryArtifacts {
  diffSummary: string;
  testEvidence: string;
  traceJsonl: string;
  evalSnippet?: string;
  prBody: string;
}

export function validateRequest(req: TaskRequest): AgentError | null {
  if (!req.taskId?.trim()) {
    return {
      code: "invalid_request",
      message: "taskId is required",
      retryable: false,
      details: { field: "taskId" },
    };
  }
  if (!req.goal?.trim()) {
    return {
      code: "invalid_request",
      message: "goal is required",
      retryable: false,
      details: { field: "goal" },
    };
  }
  if (!req.repository?.trim()) {
    return {
      code: "invalid_request",
      message: "repository is required",
      retryable: false,
      details: { field: "repository" },
    };
  }
  return null;
}

export function assertResultConsistency(result: TaskResult): void {
  if (result.status === "completed" && result.error) {
    throw new Error("completed result cannot carry an error");
  }
  if (result.status === "failed" && !result.error) {
    throw new Error("failed result must carry an error");
  }
}
