/** 文件持久化：任务、事件、评测报告 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, TaskResult, EvalReport } from "@cap/core";

const DATA_DIR = process.env.CAP_DATA_DIR ?? join(process.cwd(), ".cap-data");

export interface StoredTask {
  id: string;
  agentId: string;
  fixtureId: string;
  goal: string;
  status: "queued" | "running" | "completed" | "failed" | "paused";
  createdAt: number;
  updatedAt: number;
  events: AgentEvent[];
  result?: TaskResult;
  planSummary?: string;
  errorMessage?: string;
}

function ensure() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(DATA_DIR, "tasks"), { recursive: true });
}

function taskPath(id: string) {
  return join(DATA_DIR, "tasks", `${id}.json`);
}

export function saveTask(task: StoredTask): void {
  ensure();
  writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2));
}

export function loadTask(id: string): StoredTask | null {
  const p = taskPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as StoredTask;
}

export function listTasks(): StoredTask[] {
  ensure();
  const dir = join(DATA_DIR, "tasks");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as StoredTask)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function appendEvent(id: string, event: AgentEvent): StoredTask | null {
  const task = loadTask(id);
  if (!task) return null;
  task.events.push(event);
  task.updatedAt = Date.now();
  if (event.type === "session.complete") {
    task.result = event.result;
    task.status =
      event.result.status === "completed"
        ? "completed"
        : event.result.status === "paused"
          ? "paused"
          : "failed";
  }
  saveTask(task);
  return task;
}

export function saveEvalReport(report: EvalReport): void {
  ensure();
  writeFileSync(join(DATA_DIR, "eval-latest.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(DATA_DIR, `eval-${report.finishedAt}.json`),
    JSON.stringify(report, null, 2),
  );
}

export function loadLatestEval(): EvalReport | null {
  const p = join(DATA_DIR, "eval-latest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as EvalReport;
}

export function dataDir(): string {
  ensure();
  return DATA_DIR;
}
