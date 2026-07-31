/** T4 — tool call dispatcher: timeout, retry, idempotency, concurrency */

import type { ToolRegistry, ToolResult } from "../tools/index.js";

export type ErrorClass = "transient" | "permanent";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  classify: (err: unknown, result?: ToolResult) => ErrorClass;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 25,
  classify(err, result) {
    if (result && !result.ok && result.error?.includes("timeout")) return "transient";
    if (err instanceof Error && /timeout|ECONNRESET|temporar/i.test(err.message)) {
      return "transient";
    }
    return "permanent";
  },
};

export class IdempotencyStore {
  private map = new Map<string, ToolResult>();

  get(key: string): ToolResult | undefined {
    return this.map.get(key);
  }

  set(key: string, value: ToolResult): void {
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class ToolDispatcher {
  private inflight = 0;
  private queue: Array<() => void> = [];

  constructor(
    private registry: ToolRegistry,
    private opts: {
      timeoutMs?: number;
      maxConcurrency?: number;
      retry?: RetryPolicy;
      idempotency?: IdempotencyStore;
    } = {},
  ) {}

  async call(
    name: string,
    args: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<ToolResult> {
    if (idempotencyKey) {
      const hit = this.opts.idempotency?.get(idempotencyKey);
      if (hit) return hit;
    }

    await this.acquire();
    try {
      const result = await this.executeWithRetry(name, args);
      if (idempotencyKey) this.opts.idempotency?.set(idempotencyKey, result);
      return result;
    } finally {
      this.release();
    }
  }

  private async executeWithRetry(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const policy = this.opts.retry ?? defaultRetryPolicy;
    const tool = this.registry.get(name);
    if (!tool) {
      return { ok: false, output: "", error: `unknown tool ${name}` };
    }

    let last: ToolResult | undefined;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        last = await this.withTimeout(() => tool.handler(args));
        if (last.ok) return last;
        if (policy.classify(undefined, last) === "permanent") return last;
      } catch (err) {
        lastErr = err;
        if (policy.classify(err) === "permanent") {
          return {
            ok: false,
            output: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      if (attempt < policy.maxAttempts) {
        await sleep(policy.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    if (last) return last;
    return {
      ok: false,
      output: "",
      error: lastErr instanceof Error ? lastErr.message : "dispatch failed",
    };
  }

  private async withTimeout(fn: () => Promise<ToolResult> | ToolResult): Promise<ToolResult> {
    const ms = this.opts.timeoutMs ?? 5_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(fn()),
        new Promise<ToolResult>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private acquire(): Promise<void> {
    const max = this.opts.maxConcurrency ?? 4;
    if (this.inflight < max) {
      this.inflight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.inflight++;
        resolve();
      });
    });
  }

  private release(): void {
    this.inflight--;
    const next = this.queue.shift();
    if (next) next();
  }
}
