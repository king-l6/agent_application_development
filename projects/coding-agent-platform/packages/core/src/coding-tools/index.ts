/** T11 — coding tool surface bound to WorkspaceFs + SandboxRunner */

import type { ToolRegistry } from "../tools/index.js";
import type { WorkspaceFs } from "../sandbox/index.js";
import { SandboxRunner, PathJailError, jailPath } from "../sandbox/index.js";

export function registerCodingTools(
  registry: ToolRegistry,
  fs: WorkspaceFs,
  sandbox = new SandboxRunner(fs),
): void {
  registry.register({
    name: "read_file",
    description: "Read a file from the workspace",
    parameters: {
      type: "object",
      required: ["path"],
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1 },
      },
    },
    handler(args) {
      const path = String(args.path);
      const r = sandbox.read(path);
      return {
        ok: r.ok,
        output: r.ok ? r.stdout : r.stderr,
        truncated: r.truncated,
        error: r.ok ? undefined : r.stderr,
      };
    },
  });

  registry.register({
    name: "edit_file",
    description: "Create or overwrite a file in the workspace",
    parameters: {
      type: "object",
      required: ["path", "content"],
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1 },
        content: { type: "string" },
      },
    },
    handler(args) {
      const path = String(args.path);
      const content = String(args.content);
      const before = fs.exists(path) ? fs.readFile(path) : "";
      const r = sandbox.write(path, content);
      return {
        ok: r.ok,
        output: r.ok ? `edited ${path}` : r.stderr,
        error: r.ok ? undefined : r.stderr,
        data: { before, after: content, path },
      };
    },
  });

  registry.register({
    name: "search",
    description: "Search file contents for a substring",
    parameters: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1 },
      },
    },
    handler(args) {
      const query = String(args.query);
      const hits: string[] = [];
      for (const [path, text] of Object.entries(fs.snapshot())) {
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          if (line.includes(query)) hits.push(`${path}:${i + 1}:${line}`);
        });
      }
      let output = hits.slice(0, 50).join("\n") || "(no matches)";
      let truncated = hits.length > 50;
      if (output.length > 4000) {
        output = output.slice(0, 4000);
        truncated = true;
      }
      return { ok: true, output, truncated };
    },
  });

  registry.register({
    name: "run_tests",
    description: "Run workspace test files",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    handler() {
      const r = sandbox.runTests();
      return {
        ok: r.ok,
        output: [r.stdout, r.stderr].filter(Boolean).join("\n"),
        truncated: r.truncated,
        error: r.ok ? undefined : r.stderr || r.stdout,
      };
    },
  });

  registry.register({
    name: "git_status",
    description: "List tracked files in the workspace snapshot",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    handler() {
      const files = Object.keys(fs.snapshot()).sort();
      return { ok: true, output: files.join("\n") || "(empty)" };
    },
  });

  // Intentional escape probe for security demo — always jail-checked
  registry.register({
    name: "read_absolute",
    description: "Attempt to read an absolute path (usually denied)",
    parameters: {
      type: "object",
      required: ["path"],
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1 },
      },
    },
    handler(args) {
      const path = String(args.path);
      try {
        jailPath(fs.root, path);
        const r = sandbox.read(path);
        return {
          ok: r.ok,
          output: r.stdout,
          error: r.ok ? undefined : r.stderr,
        };
      } catch (err) {
        const msg =
          err instanceof PathJailError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        return { ok: false, output: "", error: msg };
      }
    },
  });
}
