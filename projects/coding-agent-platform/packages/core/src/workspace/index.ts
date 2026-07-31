/** T14 — worktree-like isolation via workspace snapshots */

import { VirtualFs, type WorkspaceFs } from "../sandbox/index.js";

export interface WorkspaceHandle {
  id: string;
  root: string;
  fs: WorkspaceFs;
  createdAt: number;
  baseSnapshot: Record<string, string>;
}

export class WorkspaceManager {
  private spaces = new Map<string, WorkspaceHandle>();

  create(id: string, files: Record<string, string>, root = "/workspace"): WorkspaceHandle {
    const fs = new VirtualFs(root, files);
    const handle: WorkspaceHandle = {
      id,
      root,
      fs,
      createdAt: Date.now(),
      baseSnapshot: structuredClone(files),
    };
    this.spaces.set(id, handle);
    return handle;
  }

  get(id: string): WorkspaceHandle | undefined {
    return this.spaces.get(id);
  }

  /** Diff current files vs base snapshot. */
  diff(id: string): { path: string; before: string; after: string }[] {
    const h = this.spaces.get(id);
    if (!h) return [];
    const now = h.fs.snapshot();
    const paths = new Set([...Object.keys(h.baseSnapshot), ...Object.keys(now)]);
    const out: { path: string; before: string; after: string }[] = [];
    for (const path of paths) {
      const before = h.baseSnapshot[path] ?? "";
      const after = now[path] ?? "";
      if (before !== after) out.push({ path, before, after });
    }
    return out;
  }

  clean(id: string): boolean {
    return this.spaces.delete(id);
  }

  list(): string[] {
    return [...this.spaces.keys()];
  }

  /** Restore workspace files from a checkpoint snapshot without touching host FS. */
  restoreFiles(id: string, files: Record<string, string>): void {
    const h = this.spaces.get(id);
    if (!h) throw new Error(`unknown workspace ${id}`);
    h.fs.restore(files);
  }
}
