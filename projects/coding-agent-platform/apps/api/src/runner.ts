/** 后台执行 harness，事件写入持久化存储 */

import {
  runAgent,
  DeterministicPolicy,
  MemoryStateStore,
  planSummary,
  type Plan,
} from "@cap/core";
import { resolveFixture } from "./agents.js";
import {
  appendEvent,
  loadTask,
  saveTask,
  type StoredTask,
} from "./store.js";

const running = new Set<string>();

export function isRunning(taskId: string): boolean {
  return running.has(taskId);
}

export async function startTaskRun(taskId: string): Promise<void> {
  if (running.has(taskId)) return;
  const task = loadTask(taskId);
  if (!task) throw new Error(`任务不存在: ${taskId}`);

  const fixture = resolveFixture(task.agentId);
  if (!fixture) throw new Error(`未知 Agent: ${task.agentId}`);

  running.add(taskId);
  task.status = "running";
  task.updatedAt = Date.now();
  saveTask(task);

  const policy = new DeterministicPolicy();
  const store = new MemoryStateStore();

  try {
    const gen = runAgent(
      {
        taskId,
        goal: task.goal,
        repository: "/workspace",
        fixtureId: fixture.id,
      },
      {
        fixture,
        files: fixture.files,
        model: policy,
        store,
        saveCheckpoints: true,
      },
    );

    let lastPlan: Plan | undefined;
    for await (const ev of gen) {
      if (ev.type === "plan.commit" || ev.type === "replan") {
        lastPlan = {
          goal: task.goal,
          steps: ev.steps,
          cursor: 0,
          version: 1,
        };
      }
      const updated = appendEvent(taskId, ev);
      if (updated && lastPlan) {
        updated.planSummary = planSummary(lastPlan);
        saveTask(updated);
      }
    }
  } catch (err) {
    const t = loadTask(taskId);
    if (t) {
      t.status = "failed";
      t.errorMessage = err instanceof Error ? err.message : String(err);
      t.updatedAt = Date.now();
      saveTask(t);
    }
  } finally {
    running.delete(taskId);
  }
}

export function createQueuedTask(input: {
  agentId: string;
  goal?: string;
}): StoredTask {
  const fixture = resolveFixture(input.agentId);
  if (!fixture) throw new Error(`未知 Agent: ${input.agentId}`);

  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: StoredTask = {
    id,
    agentId: input.agentId,
    fixtureId: fixture.id,
    goal: input.goal?.trim() || fixture.goal,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
  };
  saveTask(task);
  return task;
}
