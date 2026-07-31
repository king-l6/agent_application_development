/** T13 — checkpoint / resume / context compaction */

import type { Plan } from "../plan/index.js";
import type { Observation } from "../gates/index.js";
import { Budget } from "../harness/budget.js";

export interface Checkpoint {
  id: string;
  taskId: string;
  goal: string;
  fixtureId?: string;
  plan: Plan;
  budget: Record<string, unknown>;
  observations: Observation[];
  files: Record<string, string>;
  policyPhase?: Record<string, number>;
  createdAt: number;
  summary?: string;
}

export interface StateStore {
  save(cp: Checkpoint): Promise<void> | void;
  load(taskId: string): Promise<Checkpoint | null> | Checkpoint | null;
  list(): Promise<string[]> | string[];
  delete(taskId: string): Promise<void> | void;
}

export class MemoryStateStore implements StateStore {
  private map = new Map<string, Checkpoint>();

  save(cp: Checkpoint): void {
    this.map.set(cp.taskId, structuredClone(cp));
  }

  load(taskId: string): Checkpoint | null {
    const v = this.map.get(taskId);
    return v ? structuredClone(v) : null;
  }

  list(): string[] {
    return [...this.map.keys()];
  }

  delete(taskId: string): void {
    this.map.delete(taskId);
  }
}

/** Browser-friendly store using localStorage when available. */
export class LocalStorageStateStore implements StateStore {
  constructor(private prefix = "cap.checkpoint.") {}

  save(cp: Checkpoint): void {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage unavailable");
    }
    localStorage.setItem(this.prefix + cp.taskId, JSON.stringify(cp));
  }

  load(taskId: string): Checkpoint | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(this.prefix + taskId);
    return raw ? (JSON.parse(raw) as Checkpoint) : null;
  }

  list(): string[] {
    if (typeof localStorage === "undefined") return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.prefix)) keys.push(k.slice(this.prefix.length));
    }
    return keys;
  }

  delete(taskId: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(this.prefix + taskId);
  }
}

export function compactCheckpoint(cp: Checkpoint, keepLast = 4): Checkpoint {
  const important = cp.observations.filter((r) =>
    /error|fail|denied|jail|refused/i.test(r.text),
  );
  const tail = cp.observations.slice(-keepLast);
  const seen = new Set<Observation>();
  const observations: Observation[] = [];
  for (const r of [...important, ...tail]) {
    if (!seen.has(r)) {
      seen.add(r);
      observations.push(r);
    }
  }
  return { ...cp, observations };
}

export function budgetFromCheckpoint(cp: Checkpoint): Budget {
  return Budget.fromJSON(cp.budget);
}
