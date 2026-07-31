#!/usr/bin/env node
/** Coding Agent Platform CLI — run / status / resume / eval / clean */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  runAgentCollect,
  DeterministicPolicy,
  EvalHarness,
  MemoryStateStore,
  type Checkpoint,
} from "@cap/core";
import { ALL_FIXTURES, getFixture } from "@cap/fixtures";

const STATE_DIR = join(process.cwd(), ".cap-state");

function usage(): never {
  console.log(`Usage:
  cap run --task <fix-typo|add-guard|refuse-escape> [--task-id id]
  cap status [--task-id id]
  cap resume --task-id <id>
  cap eval
  cap clean [--task-id id]
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = { _: "" };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  out._cmd = positionals[0] ?? "";
  return out;
}

function ensureStateDir() {
  mkdirSync(STATE_DIR, { recursive: true });
}

function saveCheckpoint(cp: Checkpoint) {
  ensureStateDir();
  writeFileSync(join(STATE_DIR, `${cp.taskId}.json`), JSON.stringify(cp, null, 2));
}

function loadCheckpoint(taskId: string): Checkpoint | null {
  const p = join(STATE_DIR, `${taskId}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Checkpoint;
}

function listStatus() {
  ensureStateDir();
  const files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".json"));
  if (!files.length) {
    console.log("No saved tasks.");
    return;
  }
  for (const f of files) {
    const cp = JSON.parse(readFileSync(join(STATE_DIR, f), "utf8")) as Checkpoint;
    console.log(
      `${cp.taskId}\t${cp.fixtureId ?? "-"}\tsteps=${cp.plan.steps.length}\t${cp.summary ?? ""}`,
    );
  }
}

async function cmdRun(args: Record<string, string | boolean>) {
  const taskName = String(args.task || "");
  const fixture = getFixture(taskName);
  if (!fixture) {
    console.error(`Unknown task: ${taskName}`);
    console.error(`Available: ${ALL_FIXTURES.map((f) => f.id).join(", ")}`);
    process.exit(2);
  }
  const taskId = String(args["task-id"] || `cli-${fixture.id}-${Date.now()}`);
  const store = new MemoryStateStore();
  const policy = new DeterministicPolicy();

  const { events, result } = await runAgentCollect(
    {
      taskId,
      goal: fixture.goal,
      repository: "/workspace",
      fixtureId: fixture.id,
    },
    {
      fixture,
      files: fixture.files,
      model: policy,
      store,
      saveCheckpoints: true,
      emit(ev) {
        if (process.env.CAP_QUIET) return;
        console.log(JSON.stringify(ev));
      },
    },
  );

  const cp = store.load(taskId);
  if (cp) saveCheckpoint(cp);

  console.error(
    JSON.stringify(
      {
        taskId,
        status: result.status,
        summary: result.summary,
        toolCalls: result.toolCalls,
        durationMs: result.durationMs,
        events: events.length,
      },
      null,
      2,
    ),
  );
  process.exit(result.status === "completed" ? 0 : 2);
}

async function cmdResume(args: Record<string, string | boolean>) {
  const taskId = String(args["task-id"] || "");
  if (!taskId) usage();
  const cp = loadCheckpoint(taskId);
  if (!cp) {
    console.error(`No checkpoint for ${taskId}`);
    process.exit(2);
  }
  const fixture = getFixture(cp.fixtureId ?? "") ?? {
    id: cp.fixtureId ?? "custom",
    title: "resumed",
    goal: cp.goal,
    files: cp.files,
  };
  const store = new MemoryStateStore();
  store.save(cp);
  const policy = new DeterministicPolicy();
  const { result } = await runAgentCollect(
    {
      taskId,
      goal: cp.goal,
      repository: "/workspace",
      fixtureId: fixture.id,
    },
    {
      fixture,
      files: cp.files,
      model: policy,
      store,
      resumeFrom: cp,
      saveCheckpoints: true,
      emit(ev) {
        console.log(JSON.stringify(ev));
      },
    },
  );
  const next = store.load(taskId);
  if (next) saveCheckpoint(next);
  console.error(JSON.stringify({ status: result.status, summary: result.summary }, null, 2));
  process.exit(result.status === "completed" ? 0 : 2);
}

async function cmdEval() {
  const harness = new EvalHarness();
  const cases = [];
  for (const fixture of ALL_FIXTURES) {
    const policy = new DeterministicPolicy();
    const { result, fs } = await runAgentCollect(
      {
        taskId: `eval-${fixture.id}`,
        goal: fixture.goal,
        repository: "/workspace",
        fixtureId: fixture.id,
      },
      {
        fixture,
        files: fixture.files,
        model: policy,
        saveCheckpoints: false,
      },
    );
    cases.push(harness.evaluateOne(fixture, fs, result));
  }
  const report = harness.aggregate(cases);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passRate === 1 ? 0 : 2);
}

function cmdClean(args: Record<string, string | boolean>) {
  const taskId = args["task-id"] ? String(args["task-id"]) : "";
  if (taskId) {
    const p = join(STATE_DIR, `${taskId}.json`);
    if (existsSync(p)) rmSync(p);
    console.log(`cleaned ${taskId}`);
  } else if (existsSync(STATE_DIR)) {
    rmSync(STATE_DIR, { recursive: true, force: true });
    console.log("cleaned all .cap-state");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = String(args._cmd || "");
  switch (cmd) {
    case "run":
      await cmdRun(args);
      break;
    case "status":
      listStatus();
      break;
    case "resume":
      await cmdResume(args);
      break;
    case "eval":
      await cmdEval();
      break;
    case "clean":
      cmdClean(args);
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
