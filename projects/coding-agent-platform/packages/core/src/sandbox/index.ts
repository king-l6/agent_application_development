/** T7 — path jail + virtual filesystem sandbox */

export interface FsStat {
  path: string;
  kind: "file" | "dir";
  size: number;
}

export interface WorkspaceFs {
  root: string;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  list(path?: string): string[];
  stat(path: string): FsStat | null;
  snapshot(): Record<string, string>;
  restore(files: Record<string, string>): void;
}

export class PathJailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathJailError";
  }
}

/** Resolve and enforce that `path` stays under `root`. */
export function jailPath(root: string, path: string): string {
  const normalizedRoot = normalizePosix(root.endsWith("/") ? root.slice(0, -1) : root || ".");
  let candidate = path;
  if (!candidate.startsWith("/")) {
    candidate = `${normalizedRoot}/${candidate}`;
  }
  const resolved = normalizePosix(candidate);
  const prefix = normalizedRoot === "." ? "" : normalizedRoot;
  if (prefix) {
    if (resolved !== prefix && !resolved.startsWith(prefix + "/")) {
      throw new PathJailError(`path escapes jail: ${path}`);
    }
  } else {
    if (resolved.startsWith("..") || resolved.includes("/../")) {
      throw new PathJailError(`path escapes jail: ${path}`);
    }
  }
  // Block absolute escapes outside toy roots
  if (
    resolved.startsWith("/etc") ||
    resolved.startsWith("/usr") ||
    resolved.startsWith("/var") ||
    resolved.startsWith("/home") ||
    resolved.startsWith("/Users")
  ) {
    throw new PathJailError(`path escapes jail: ${path}`);
  }
  return resolved === "" ? "." : resolved;
}

function normalizePosix(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  const stack: string[] = [];
  const absolute = p.startsWith("/");
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length && stack[stack.length - 1] !== "..") stack.pop();
      else if (!absolute) stack.push("..");
    } else {
      stack.push(part);
    }
  }
  const joined = stack.join("/");
  return absolute ? "/" + joined : joined || ".";
}

const DENYLIST = [
  /\brm\s+-rf\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /[|&;`$]/,
  /\bsudo\b/i,
];

export function assertSafeCommand(cmd: string): void {
  for (const re of DENYLIST) {
    if (re.test(cmd)) {
      throw new PathJailError(`command denied by denylist: ${cmd}`);
    }
  }
}

export class VirtualFs implements WorkspaceFs {
  root: string;
  private files = new Map<string, string>();

  constructor(root = "/workspace", initial: Record<string, string> = {}) {
    this.root = root;
    this.restore(initial);
  }

  private key(path: string): string {
    return jailPath(this.root, path);
  }

  readFile(path: string): string {
    const k = this.key(path);
    if (!this.files.has(k)) throw new Error(`ENOENT: ${path}`);
    return this.files.get(k)!;
  }

  writeFile(path: string, content: string): void {
    const k = this.key(path);
    this.files.set(k, content);
  }

  exists(path: string): boolean {
    try {
      return this.files.has(this.key(path));
    } catch {
      return false;
    }
  }

  list(path = this.root): string[] {
    const prefix = this.key(path);
    const out: string[] = [];
    for (const k of this.files.keys()) {
      if (k === prefix) continue;
      if (k.startsWith(prefix + "/") || prefix === ".") {
        const rel =
          prefix === "."
            ? k
            : k.slice(prefix.length + (k.startsWith(prefix + "/") ? 1 : 0));
        if (rel && !rel.includes("/")) out.push(rel);
        else if (rel) {
          const top = rel.split("/")[0];
          if (!out.includes(top)) out.push(top);
        }
      }
    }
    return out.sort();
  }

  stat(path: string): FsStat | null {
    try {
      const k = this.key(path);
      if (this.files.has(k)) {
        return { path: k, kind: "file", size: this.files.get(k)!.length };
      }
      // directory if any child
      const kids = this.list(path);
      if (kids.length) return { path: k, kind: "dir", size: 0 };
      return null;
    } catch {
      return null;
    }
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files);
  }

  restore(files: Record<string, string>): void {
    this.files.clear();
    for (const [p, c] of Object.entries(files)) {
      const k = p.startsWith(this.root) ? p : jailPath(this.root, p);
      this.files.set(k, c);
    }
  }
}

export interface SandboxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  exitCode: number;
}

export class SandboxRunner {
  maxOutputBytes: number;

  constructor(
    private fs: WorkspaceFs,
    opts: { maxOutputBytes?: number } = {},
  ) {
    this.maxOutputBytes = opts.maxOutputBytes ?? 8_000;
  }

  read(path: string): SandboxResult {
    try {
      const text = this.fs.readFile(path);
      return this.pack(true, text, "", 0);
    } catch (err) {
      return this.pack(
        false,
        "",
        err instanceof Error ? err.message : String(err),
        1,
      );
    }
  }

  write(path: string, content: string): SandboxResult {
    try {
      this.fs.writeFile(path, content);
      return this.pack(true, `wrote ${path}`, "", 0);
    } catch (err) {
      return this.pack(
        false,
        "",
        err instanceof Error ? err.message : String(err),
        1,
      );
    }
  }

  /** Extremely small test runner for fixture `*.test.js` style asserts in VFS. */
  runTests(): SandboxResult {
    try {
      assertSafeCommand("node test");
      const files = Object.entries(this.fs.snapshot()).filter(([p]) =>
        p.endsWith(".test.js"),
      );
      if (!files.length) {
        return this.pack(false, "", "no test files found", 1);
      }
      const logs: string[] = [];
      for (const [path, src] of files) {
        const result = runSimpleTestModule(src, this.fs);
        logs.push(`${path}: ${result.ok ? "ok" : "FAIL"} ${result.detail}`);
        if (!result.ok) {
          return this.pack(false, logs.join("\n"), result.detail, 1);
        }
      }
      return this.pack(true, logs.join("\n"), "", 0);
    } catch (err) {
      return this.pack(
        false,
        "",
        err instanceof Error ? err.message : String(err),
        1,
      );
    }
  }

  private pack(
    ok: boolean,
    stdout: string,
    stderr: string,
    exitCode: number,
  ): SandboxResult {
    let truncated = false;
    let out = stdout;
    let err = stderr;
    if (out.length > this.maxOutputBytes) {
      out = out.slice(0, this.maxOutputBytes);
      truncated = true;
    }
    if (err.length > this.maxOutputBytes) {
      err = err.slice(0, this.maxOutputBytes);
      truncated = true;
    }
    return { ok, stdout: out, stderr: err, truncated, exitCode };
  }
}

interface TestAssert {
  equal(a: unknown, b: unknown, msg?: string): void;
  ok(v: unknown, msg?: string): void;
  throws(fn: () => void, msg?: string): void;
}

type RequireFileFn = (rel: string) => Record<string, unknown>;
type TestFn = (assert: TestAssert, requireFile: RequireFileFn) => void;

function runSimpleTestModule(
  src: string,
  fs: WorkspaceFs,
): { ok: boolean; detail: string } {
  const requireFile: RequireFileFn = (rel: string) => {
    const root = fs.root;
    const full = rel.startsWith(root)
      ? rel
      : `${root}/${rel}`.replace(/\/+/g, "/");
    const code = fs.readFile(full.startsWith(root) ? full : `${root}/${rel}`);
    if (code.includes("module.exports")) {
      const mod: { exports: Record<string, unknown> } = { exports: {} };
      const fn = new Function("module", "exports", code);
      fn(mod, mod.exports);
      return mod.exports;
    }
    const exportsObj: Record<string, unknown> = {};
    const rewritten =
      code.replace(/export\s+function\s+(\w+)/g, "exports.$1 = function $1") +
      "\nreturn exports;";
    const fn = new Function("exports", rewritten);
    return fn(exportsObj) as Record<string, unknown>;
  };

  const asserts: string[] = [];
  const assertApi: TestAssert = {
    equal(a: unknown, b: unknown, msg?: string) {
      if (!Object.is(a, b)) {
        throw new Error(msg ?? `expected ${String(b)}, got ${String(a)}`);
      }
      asserts.push("pass");
    },
    ok(v: unknown, msg?: string) {
      if (!v) throw new Error(msg ?? "expected truthy");
      asserts.push("pass");
    },
    throws(fn: () => void, msg?: string) {
      let threw = false;
      try {
        fn();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error(msg ?? "expected throw");
      asserts.push("pass");
    },
  };

  try {
    if (src.includes("export function test")) {
      const rewritten =
        src.replace(/export\s+function\s+test/, "function test") +
        "\nreturn test;";
      const getTest = new Function(rewritten);
      const testFn = getTest() as TestFn;
      testFn(assertApi, requireFile);
    } else if (src.includes("module.exports")) {
      const mod: { exports: { test?: TestFn } } = { exports: {} };
      const fn = new Function("module", "exports", src);
      fn(mod, mod.exports);
      const testFn = mod.exports.test;
      if (!testFn) return { ok: false, detail: "no test() export found" };
      testFn(assertApi, requireFile);
    } else {
      return { ok: false, detail: "no test() export found" };
    }
    return { ok: true, detail: `${asserts.length} assertions` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
