import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateArgs,
  ToolRegistry,
  jailPath,
  PathJailError,
  JsonRpcServer,
  InProcessRpcClient,
  createPlan,
  markCurrent,
  GateChain,
  Budget,
  EvalHarness,
  runAgentCollect,
  DeterministicPolicy,
  type AgentEvent,
} from "./index.js";

describe("T2 schema validation", () => {
  it("rejects missing required fields", () => {
    const errs = validateArgs(
      {
        type: "object",
        required: ["path"],
        properties: { path: { type: "string" } },
      },
      {},
    );
    assert.equal(errs.length, 1);
    assert.equal(errs[0].keyword, "required");
  });

  it("rejects duplicate tool registration", () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "x",
      description: "x",
      parameters: { type: "object", properties: {} },
      handler: () => ({ ok: true, output: "" }),
    });
    assert.throws(() =>
      reg.register({
        name: "x",
        description: "x",
        parameters: { type: "object", properties: {} },
        handler: () => ({ ok: true, output: "" }),
      }),
    );
  });
});

describe("T7 path jail", () => {
  it("blocks /etc/passwd", () => {
    assert.throws(() => jailPath("/workspace", "/etc/passwd"), PathJailError);
  });

  it("allows workspace-relative paths", () => {
    const p = jailPath("/workspace", "src/a.js");
    assert.equal(p, "/workspace/src/a.js");
  });
});

describe("T3 JSON-RPC", () => {
  it("handles request and ignores notification response", async () => {
    const server = new JsonRpcServer();
    server.register("echo", (p) => p);
    const client = new InProcessRpcClient(server);
    const r = await client.request("echo", { a: 1 } as unknown);
    assert.deepEqual(r, { a: 1 });
    await client.notify("echo", { a: 2 } as unknown);
  });
});

describe("T5 plan", () => {
  it("advances cursor on done", () => {
    let plan = createPlan("g", ["a", "b"]);
    plan = markCurrent(plan, "in_progress");
    plan = markCurrent(plan, "done");
    assert.equal(plan.cursor, 1);
    assert.equal(plan.steps[0].status, "done");
  });
});

describe("T6 gates", () => {
  it("denies unknown tools first", () => {
    const chain = new GateChain();
    const d = chain.evaluate(
      { turn: 1, tool: "boom", args: {} },
      {
        whitelist: new Set(["read_file"]),
        toolCallsUsed: 0,
        maxToolCalls: 10,
        observationTokens: 0,
        maxObservationTokens: 1000,
        schemaErrors: [],
      },
    );
    assert.equal(d.allow, false);
    assert.equal(d.gate, "whitelist");
  });
});

describe("T1 budget", () => {
  it("detects turn exhaustion", () => {
    const b = new Budget({ maxTurns: 2 });
    b.turns = 2;
    assert.ok(b.checkPullPoint("turn"));
  });
});

describe("T10 e2e fix-typo", () => {
  it("fixes greet and passes verifier", async () => {
    const files = {
      "/workspace/src/greet.js":
        "export function greett(name) {\n  return `Hello, ${name}!`;\n}\n",
      "/workspace/src/greet.test.js": `export function test(assert, requireFile) {
  const mod = requireFile("src/greet.js");
  assert.equal(typeof mod.greet, "function");
  assert.equal(mod.greet("Ada"), "Hello, Ada!");
}
`,
    };
    const policy = new DeterministicPolicy();
    const { result, fs } = await runAgentCollect(
      {
        taskId: "t-fix",
        goal: "fix typo",
        repository: "/workspace",
        fixtureId: "fix-typo",
      },
      { files, model: policy, saveCheckpoints: false },
    );
    assert.equal(result.status, "completed");
    assert.match(fs.readFile("/workspace/src/greet.js"), /function greet\(/);
    const harness = new EvalHarness();
    const ev = harness.evaluateOne(
      {
        id: "fix-typo",
        title: "t",
        goal: "g",
        files,
        expectFiles: { "/workspace/src/greet.js": /function greet\(/ },
      },
      fs,
      result,
    );
    assert.equal(ev.passed, true);
  });
});

describe("T10 e2e refuse-escape", () => {
  it("denies /etc/passwd", async () => {
    const policy = new DeterministicPolicy();
    const { result, events } = await runAgentCollect(
      {
        taskId: "t-sec",
        goal: "probe escape",
        repository: "/workspace",
        fixtureId: "refuse-escape",
      },
      {
        files: { "/workspace/README.md": "# x\n" },
        model: policy,
        saveCheckpoints: false,
      },
    );
    assert.equal(result.status, "completed");
    assert.match(result.summary, /denied|jail/i);
    const denied = events.some((e: AgentEvent) =>
      (e.type === "tool.result" && !e.ok) ||
      (e.type === "observation" && /jail|denied/i.test(e.text)),
    );
    assert.ok(denied);
  });
});
