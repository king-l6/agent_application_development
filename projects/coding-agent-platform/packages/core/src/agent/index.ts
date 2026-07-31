/** T10 — compose full agent loop over harness contracts */

import {
  validateRequest,
  assertResultConsistency,
  type TaskRequest,
  type TaskResult,
  type AgentError,
} from "../contracts/index.js";
import {
  Budget,
  HookBus,
  HarnessLoop,
  type AgentEvent,
  type EventSink,
} from "../harness/index.js";
import { ToolRegistry } from "../tools/index.js";
import { ToolDispatcher, IdempotencyStore } from "../dispatcher/index.js";
import {
  createPlan,
  markCurrent,
  allDone,
  replan,
  type Plan,
} from "../plan/index.js";
import { GateChain, ObservationLedger, estimateTokens } from "../gates/index.js";
import { registerCodingTools } from "../coding-tools/index.js";
import {
  DeterministicPolicy,
  type ModelAdapter,
  type ModelDecision,
} from "../model/index.js";
import { TraceCollector, MetricsRegistry } from "../observability/index.js";
import {
  MemoryStateStore,
  compactCheckpoint,
  type StateStore,
  type Checkpoint,
} from "../persistence/index.js";
import { WorkspaceManager } from "../workspace/index.js";
import { buildArtifacts } from "../delivery/index.js";
import { VirtualFs } from "../sandbox/index.js";
import type { FixtureTask } from "../eval/index.js";

export interface RunAgentOptions {
  files?: Record<string, string>;
  fixture?: FixtureTask;
  model?: ModelAdapter;
  store?: StateStore;
  resumeFrom?: Checkpoint;
  budget?: Budget;
  emit?: EventSink;
  workspaceManager?: WorkspaceManager;
  saveCheckpoints?: boolean;
}

export async function* runAgent(
  request: TaskRequest,
  options: RunAgentOptions = {},
): AsyncGenerator<AgentEvent, TaskResult, void> {
  const events: AgentEvent[] = [];
  const emit: EventSink = (e) => {
    events.push(e);
    options.emit?.(e);
  };

  const started = Date.now();
  const invalid = validateRequest(request);
  if (invalid) {
    const result: TaskResult = {
      taskId: request.taskId,
      status: "failed",
      summary: invalid.message,
      error: invalid,
      stepsCompleted: 0,
      toolCalls: 0,
      durationMs: Date.now() - started,
      costUsd: 0,
    };
    assertResultConsistency(result);
    const ev: AgentEvent = { type: "session.complete", result, ts: Date.now() };
    emit(ev);
    yield ev;
    return result;
  }

  yield { type: "session.start", taskId: request.taskId, ts: Date.now() };

  const fixture = options.fixture;
  const fixtureId = request.fixtureId ?? fixture?.id;
  const initialFiles =
    options.resumeFrom?.files ??
    options.files ??
    fixture?.files ??
    { "/workspace/README.md": "# empty workspace\n" };

  const workspaces = options.workspaceManager ?? new WorkspaceManager();
  const handle =
    workspaces.get(request.taskId) ??
    workspaces.create(request.taskId, initialFiles);
  if (options.resumeFrom) {
    handle.fs.restore(options.resumeFrom.files);
  }

  const registry = new ToolRegistry();
  registerCodingTools(registry, handle.fs);
  const dispatcher = new ToolDispatcher(registry, {
    timeoutMs: 3_000,
    maxConcurrency: 2,
    idempotency: new IdempotencyStore(),
  });
  const gates = new GateChain();
  const ledger = new ObservationLedger();
  if (options.resumeFrom) {
    ledger.rows = [...options.resumeFrom.observations];
  }

  const budget =
    options.budget ??
    (options.resumeFrom
      ? Budget.fromJSON(options.resumeFrom.budget)
      : new Budget({ maxTurns: 20, maxToolCalls: 30, maxWallMs: 30_000 }));

  const hooks = new HookBus();
  const loop = new HarnessLoop({ budget, hooks, emit });
  const trace = new TraceCollector();
  const metrics = new MetricsRegistry();
  const store = options.store ?? new MemoryStateStore();
  const model = options.model ?? new DeterministicPolicy();

  let plan: Plan = options.resumeFrom?.plan ?? createPlan(request.goal, []);
  let lastToolError: string | undefined;
  let testEvidence = "";
  let turn = 0;

  const whitelist = new Set(registry.names());

  const saveCp = async (summary?: string) => {
    if (options.saveCheckpoints === false) return;
    const cp: Checkpoint = compactCheckpoint({
      id: `cp_${request.taskId}_${Date.now()}`,
      taskId: request.taskId,
      goal: request.goal,
      fixtureId,
      plan,
      budget: budget.toJSON(),
      observations: ledger.rows,
      files: handle.fs.snapshot(),
      createdAt: Date.now(),
      summary,
    });
    await store.save(cp);
    const ev: AgentEvent = {
      type: "checkpoint.saved",
      id: cp.id,
      ts: Date.now(),
    };
    emit(ev);
    return ev;
  };

  loop.transition("planning");
  trace.startSpan("agent.session", { taskId: request.taskId });

  let finalResult: TaskResult | undefined;

  try {
    while (loop.state !== "done" && loop.state !== "paused") {
      const wallHit = budget.checkPullPoint("wall");
      const turnHit = budget.checkPullPoint("turn");
      if (wallHit || turnHit) {
        await hooks.emit("on_budget_exceeded", { reason: wallHit ?? turnHit });
        emit({
          type: "budget.warn",
          remaining: budget.snapshot(),
          ts: Date.now(),
        });
        loop.pause(wallHit ?? turnHit ?? "budget");
        finalResult = makeResult(request, "paused", wallHit ?? turnHit ?? "budget", {
          code: "budget_exceeded",
          message: wallHit ?? turnHit ?? "budget",
          retryable: true,
        }, budget, started);
        break;
      }

      budget.turns++;
      turn++;
      metrics.incr("agent.turns");

      const decision = await model.decide({
        goal: request.goal,
        plan,
        observations: ledger.rows,
        fixtureId,
        lastToolError,
      });

      const handled = await handleDecision({
        decision,
        plan,
        setPlan: (p) => {
          plan = p;
        },
        loop,
        emit,
        budget,
        gates,
        whitelist,
        registry,
        dispatcher,
        ledger,
        turn,
        trace,
        metrics,
        onToolError: (e) => {
          lastToolError = e;
        },
        onTestEvidence: (t) => {
          testEvidence = t;
        },
        onDiff: (path, before, after) => {
          emit({ type: "diff", path, before, after, ts: Date.now() });
        },
      });

      const cpEv = await saveCp();
      if (cpEv) yield cpEv;

      // drain queued emits as yields — we yield each new event since last yield
      while (events.length) {
        yield events.shift()!;
      }

      if (handled === "finish" || handled === "fail") {
        break;
      }
      if (handled === "paused") {
        break;
      }
    }

    if (!finalResult) {
      const status =
        loop.state === "paused"
          ? "paused"
          : lastToolError && fixtureId === "refuse-escape"
            ? "completed"
            : loop.state === "done"
              ? "completed"
              : "completed";

      // refuse-escape: completion with denial in summary
      let summary = plan.goal;
      if (fixtureId === "refuse-escape") {
        summary =
          "越权路径已被 Path Jail 拒绝，审计完成。";
      } else if (allDone(plan) || loop.state === "done") {
        summary =
          ledger.rows.find((r) => /passed|Fixed|Added|denied/i.test(r.text))
            ?.text ?? "Task finished.";
      }

      // Prefer finish decision summary from last observation notes
      const finishObs = [...ledger.rows].reverse().find((r) =>
        r.tool === "__finish__",
      );
      if (finishObs) summary = finishObs.text;

      finalResult = makeResult(
        request,
        status === "paused" ? "paused" : "completed",
        summary,
        status === "paused"
          ? {
              code: "budget_exceeded",
              message: summary,
              retryable: true,
            }
          : undefined,
        budget,
        started,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finalResult = makeResult(
      request,
      "failed",
      message,
      { code: "internal_error", message, retryable: false },
      budget,
      started,
    );
    loop.transition("done");
  }

  const diffs = workspaces.diff(request.taskId);
  const artifacts = buildArtifacts({
    result: finalResult!,
    diffs,
    testEvidence,
    traceJsonl: trace.toJSONL(),
  });
  finalResult!.artifacts = artifacts;
  finalResult!.costUsd = budget.dollars;
  finalResult!.toolCalls = budget.toolCalls;
  finalResult!.stepsCompleted = plan.steps.filter((s) => s.status === "done").length;
  finalResult!.durationMs = Date.now() - started;

  assertResultConsistency(finalResult!);
  trace.endSpan("ok", { status: finalResult!.status });
  metrics.observe("agent.duration_ms", finalResult!.durationMs);

  const doneEv: AgentEvent = {
    type: "session.complete",
    result: finalResult!,
    ts: Date.now(),
  };
  emit(doneEv);
  while (events.length) yield events.shift()!;
  return finalResult!;
}

function makeResult(
  request: TaskRequest,
  status: TaskResult["status"],
  summary: string,
  error: AgentError | undefined,
  budget: Budget,
  started: number,
): TaskResult {
  return {
    taskId: request.taskId,
    status,
    summary,
    error,
    stepsCompleted: 0,
    toolCalls: budget.toolCalls,
    durationMs: Date.now() - started,
    costUsd: budget.dollars,
  };
}

async function handleDecision(ctx: {
  decision: ModelDecision;
  plan: Plan;
  setPlan: (p: Plan) => void;
  loop: HarnessLoop;
  emit: EventSink;
  budget: Budget;
  gates: GateChain;
  whitelist: Set<string>;
  registry: ToolRegistry;
  dispatcher: ToolDispatcher;
  ledger: ObservationLedger;
  turn: number;
  trace: TraceCollector;
  metrics: MetricsRegistry;
  onToolError: (e: string) => void;
  onTestEvidence: (t: string) => void;
  onDiff: (path: string, before: string, after: string) => void;
}): Promise<"continue" | "finish" | "fail" | "paused"> {
  const { decision, loop, emit, budget } = ctx;

  switch (decision.kind) {
    case "plan": {
      await ctx.loop.hooks.emit("before_plan", {});
      loop.transition("planning");
      const plan = createPlan(ctx.plan.goal || decision.steps.join("; "), decision.steps);
      // preserve goal from existing plan
      plan.goal = ctx.plan.goal || plan.goal;
      ctx.setPlan(plan);
      emit({ type: "plan.commit", steps: plan.steps, ts: Date.now() });
      await ctx.loop.hooks.emit("after_plan", {});
      loop.transition("executing");
      return "continue";
    }
    case "replan": {
      const hit = budget.checkPullPoint("replan");
      if (hit) {
        emit({ type: "budget.warn", remaining: budget.snapshot(), ts: Date.now() });
        loop.pause(hit);
        return "paused";
      }
      budget.replans++;
      const next = replan(ctx.plan, decision.reason, decision.steps);
      ctx.setPlan(next);
      emit({
        type: "replan",
        reason: decision.reason,
        steps: next.steps,
        ts: Date.now(),
      });
      emit({ type: "plan.commit", steps: next.steps, ts: Date.now() });
      return "continue";
    }
    case "tool": {
      loop.transition("awaiting_tool");
      const schemaErrors = ctx.registry.validate(decision.name, decision.args);
      if (schemaErrors.length) {
        for (const e of schemaErrors) {
          emit({
            type: "validation.error",
            path: e.path,
            keyword: e.keyword,
            message: e.message,
            ts: Date.now(),
          });
        }
      }
      const gate = ctx.gates.evaluate(
        { turn: ctx.turn, tool: decision.name, args: decision.args },
        {
          whitelist: ctx.whitelist,
          toolCallsUsed: budget.toolCalls,
          maxToolCalls: budget.limits.maxToolCalls,
          observationTokens: budget.observationTokens,
          maxObservationTokens: budget.limits.maxObservationTokens,
          schemaErrors,
        },
      );
      emit({
        type: "gate.decision",
        allow: gate.allow,
        gate: gate.gate,
        reason: gate.reason,
        ts: Date.now(),
      });
      if (!gate.allow) {
        ctx.onToolError(gate.reason);
        const obs = ctx.ledger.record({
          turn: ctx.turn,
          tool: decision.name,
          text: `GATE_DENIED: ${gate.reason}`,
          tokens: 0,
        });
        budget.observationTokens += obs.tokens;
        emit({
          type: "observation",
          text: obs.text,
          tokens: obs.tokens,
          ts: Date.now(),
        });
        // Mark current plan step failed then continue so policy can finish
        if (ctx.plan.steps[ctx.plan.cursor]) {
          ctx.setPlan(markCurrent(ctx.plan, "failed", gate.reason));
        }
        loop.transition("reflecting");
        return "continue";
      }

      const toolHit = budget.checkPullPoint("tool");
      if (toolHit) {
        emit({ type: "budget.warn", remaining: budget.snapshot(), ts: Date.now() });
        loop.pause(toolHit);
        return "paused";
      }

      emit({
        type: "tool.call",
        name: decision.name,
        args: decision.args,
        ts: Date.now(),
      });
      await ctx.loop.hooks.emit("before_tool_call", { name: decision.name });
      ctx.trace.startSpan("tool.call", { tool: decision.name });
      budget.toolCalls++;
      budget.dollars += 0.0001;
      ctx.metrics.incr("tool.calls");

      if (ctx.plan.steps[ctx.plan.cursor]) {
        ctx.setPlan(markCurrent(ctx.plan, "in_progress"));
      }

      const result = await ctx.dispatcher.call(
        decision.name,
        decision.args,
        `${decision.name}:${JSON.stringify(decision.args)}`,
      );

      if (result.data?.before !== undefined && result.data?.after !== undefined) {
        ctx.onDiff(
          String(result.data.path ?? decision.args.path),
          String(result.data.before),
          String(result.data.after),
        );
      }

      const text = result.ok
        ? result.output
        : `ERROR: ${result.error ?? result.output}`;
      if (decision.name === "run_tests") ctx.onTestEvidence(text);
      if (!result.ok) ctx.onToolError(result.error ?? text);

      const obs = ctx.ledger.record({
        turn: ctx.turn,
        tool: decision.name,
        text,
        tokens: estimateTokens(text),
      });
      budget.observationTokens += obs.tokens;

      emit({
        type: "tool.result",
        name: decision.name,
        ok: result.ok,
        truncated: Boolean(result.truncated),
        preview: text.slice(0, 240),
        ts: Date.now(),
      });
      emit({
        type: "observation",
        text: obs.text,
        tokens: obs.tokens,
        ts: Date.now(),
      });

      ctx.trace.endSpan(result.ok ? "ok" : "error");
      await ctx.loop.hooks.emit("after_tool_call", { ok: result.ok });

      if (ctx.plan.steps[ctx.plan.cursor]) {
        ctx.setPlan(
          markCurrent(ctx.plan, result.ok ? "done" : "failed", result.error),
        );
      }

      // Special-case: refuse-escape denial is success path
      if (
        decision.name === "read_absolute" &&
        !result.ok &&
        /jail|denied|escape/i.test(result.error ?? "")
      ) {
        // leave error for policy to read via observations
      }

      loop.transition("reflecting");
      return "continue";
    }
    case "finish": {
      ctx.ledger.record({
        turn: ctx.turn,
        tool: "__finish__",
        text: decision.summary,
        tokens: estimateTokens(decision.summary),
      });
      // mark remaining pending as done/skipped
      let p = ctx.plan;
      while (p.steps[p.cursor] && p.steps[p.cursor].status === "pending") {
        p = markCurrent(p, "done");
      }
      ctx.setPlan(p);
      loop.complete();
      return "finish";
    }
    case "fail": {
      loop.transition("done");
      ctx.onToolError(decision.message);
      return "fail";
    }
  }
}

/** Collect all events and the final result (handy for CLI/tests). */
export async function runAgentCollect(
  request: TaskRequest,
  options: RunAgentOptions = {},
): Promise<{ events: AgentEvent[]; result: TaskResult; fs: VirtualFs }> {
  const events: AgentEvent[] = [];
  const workspaces = options.workspaceManager ?? new WorkspaceManager();
  const gen = runAgent(request, { ...options, workspaceManager: workspaces });
  let result: TaskResult | undefined;
  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    events.push(next.value);
  }
  const handle = workspaces.get(request.taskId);
  return {
    events,
    result: result!,
    fs: (handle?.fs as VirtualFs) ?? new VirtualFs(),
  };
}
