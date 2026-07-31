import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  DeterministicPolicy,
  EvalHarness,
  runAgentCollect,
} from "@cap/core";
import { ALL_FIXTURES } from "@cap/fixtures";
import { getAgent, listAgents } from "./agents.js";
import { createQueuedTask, isRunning, startTaskRun } from "./runner.js";
import {
  dataDir,
  listTasks,
  loadLatestEval,
  loadTask,
  saveEvalReport,
} from "./store.js";
import {
  deleteDoc,
  listDocs,
  listSessions,
  loadDoc,
  loadSession,
  loadWecomConfig,
  saveDoc,
  saveWecomConfig,
  type DocRecord,
} from "./docs-store.js";
import { createSession, postMessage } from "./chat.js";
import { syncWecomDocs, wecomStatus } from "./wecom.js";

const PORT = Number(process.env.CAP_API_PORT ?? 8787);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "智工台 API",
    dataDir: dataDir(),
    time: new Date().toISOString(),
  }),
);

app.get("/api/agents", (c) => c.json({ agents: listAgents() }));

app.get("/api/agents/:id", (c) => {
  const agent = getAgent(c.req.param("id"));
  if (!agent) return c.json({ error: "Agent 不存在" }, 404);
  return c.json({ agent });
});

app.get("/api/tasks", (c) => {
  const tasks = listTasks().map((t) => ({
    id: t.id,
    agentId: t.agentId,
    fixtureId: t.fixtureId,
    goal: t.goal,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    eventCount: t.events.length,
    summary: t.result?.summary,
    toolCalls: t.result?.toolCalls,
    durationMs: t.result?.durationMs,
    planSummary: t.planSummary,
    errorMessage: t.errorMessage,
  }));
  return c.json({ tasks });
});

app.get("/api/tasks/:id", (c) => {
  const task = loadTask(c.req.param("id"));
  if (!task) return c.json({ error: "任务不存在" }, 404);
  return c.json({ task, running: isRunning(task.id) });
});

const createSchema = z.object({
  agentId: z.string().min(1),
  goal: z.string().optional(),
});

app.post("/api/tasks", async (c) => {
  const body = createSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: "参数无效", details: body.error.flatten() }, 400);
  }
  try {
    const task = createQueuedTask(body.data);
    // 异步执行，不阻塞响应
    void startTaskRun(task.id);
    return c.json({ task }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

app.post("/api/tasks/:id/retry", async (c) => {
  const old = loadTask(c.req.param("id"));
  if (!old) return c.json({ error: "任务不存在" }, 404);
  const task = createQueuedTask({ agentId: old.agentId, goal: old.goal });
  void startTaskRun(task.id);
  return c.json({ task }, 201);
});

/** SSE：推送任务事件（含历史回放 + 轮询增量） */
app.get("/api/tasks/:id/events", (c) => {
  const id = c.req.param("id");
  const task = loadTask(id);
  if (!task) return c.json({ error: "任务不存在" }, 404);

  return streamSSE(c, async (stream) => {
    let cursor = 0;
    const push = async () => {
      const t = loadTask(id);
      if (!t) return false;
      while (cursor < t.events.length) {
        const ev = t.events[cursor++];
        await stream.writeSSE({
          event: "agent",
          data: JSON.stringify(ev),
          id: String(cursor),
        });
      }
      await stream.writeSSE({
        event: "status",
        data: JSON.stringify({
          status: t.status,
          running: isRunning(id),
          result: t.result ?? null,
        }),
      });
      return t.status === "completed" || t.status === "failed" || t.status === "paused";
    };

    // 先推历史
    let done = await push();
    while (!done) {
      await stream.sleep(200);
      done = await push();
    }
  });
});

app.post("/api/eval", async (c) => {
  const harness = new EvalHarness();
  const cases = [];
  for (const fixture of ALL_FIXTURES) {
    const policy = new DeterministicPolicy();
    const { result, fs } = await runAgentCollect(
      {
        taskId: `eval-${fixture.id}-${Date.now()}`,
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
  report.startedAt = cases.length ? Date.now() - 1 : Date.now();
  report.finishedAt = Date.now();
  saveEvalReport(report);
  return c.json({ report });
});

app.get("/api/eval/latest", (c) => {
  const report = loadLatestEval();
  if (!report) return c.json({ report: null });
  return c.json({ report });
});

app.get("/api/metrics", (c) => {
  const tasks = listTasks();
  const completed = tasks.filter((t) => t.status === "completed");
  const failed = tasks.filter((t) => t.status === "failed");
  const byAgent: Record<
    string,
    { runs: number; success: number; toolCalls: number; durationMs: number }
  > = {};
  for (const t of tasks) {
    const row = byAgent[t.agentId] ?? {
      runs: 0,
      success: 0,
      toolCalls: 0,
      durationMs: 0,
    };
    row.runs++;
    if (t.status === "completed") row.success++;
    row.toolCalls += t.result?.toolCalls ?? 0;
    row.durationMs += t.result?.durationMs ?? 0;
    byAgent[t.agentId] = row;
  }
  return c.json({
    totals: {
      tasks: tasks.length,
      completed: completed.length,
      failed: failed.length,
      running: tasks.filter((t) => t.status === "running" || isRunning(t.id))
        .length,
      successRate: tasks.length ? completed.length / tasks.length : 0,
      toolCalls: tasks.reduce((a, t) => a + (t.result?.toolCalls ?? 0), 0),
      avgDurationMs:
        completed.length
          ? completed.reduce((a, t) => a + (t.result?.durationMs ?? 0), 0) /
            completed.length
          : 0,
    },
    byAgent,
    latestEval: loadLatestEval(),
  });
});

// —— 文档 ——
app.get("/api/docs", (c) => c.json({ docs: listDocs() }));

app.get("/api/docs/:id", (c) => {
  const doc = loadDoc(c.req.param("id"));
  if (!doc) return c.json({ error: "文档不存在" }, 404);
  return c.json({ doc });
});

app.post("/api/docs", async (c) => {
  const body = z
    .object({
      title: z.string().min(1),
      content: z.string().default(""),
      tags: z.array(z.string()).optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "参数无效" }, 400);
  const now = Date.now();
  const doc: DocRecord = {
    id: `doc_${now}`,
    title: body.data.title,
    content: body.data.content,
    source: "local",
    tags: body.data.tags ?? ["本地"],
    createdAt: now,
    updatedAt: now,
  };
  saveDoc(doc);
  return c.json({ doc }, 201);
});

app.put("/api/docs/:id", async (c) => {
  const prev = loadDoc(c.req.param("id"));
  if (!prev) return c.json({ error: "文档不存在" }, 404);
  const body = z
    .object({
      title: z.string().optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "参数无效" }, 400);
  const doc: DocRecord = {
    ...prev,
    title: body.data.title ?? prev.title,
    content: body.data.content ?? prev.content,
    tags: body.data.tags ?? prev.tags,
    updatedAt: Date.now(),
  };
  saveDoc(doc);
  return c.json({ doc });
});

app.delete("/api/docs/:id", (c) => {
  if (!deleteDoc(c.req.param("id"))) return c.json({ error: "文档不存在" }, 404);
  return c.json({ ok: true });
});

// —— 企微 ——
app.get("/api/wecom/status", (c) => c.json(wecomStatus()));

app.get("/api/wecom/config", (c) => {
  const cfg = loadWecomConfig();
  if (!cfg) return c.json({ config: null });
  return c.json({
    config: {
      corpId: cfg.corpId,
      corpSecret: cfg.corpSecret ? "********" : "",
      spaceIds: cfg.spaceIds,
      userid: cfg.userid ?? "",
      hasSecret: Boolean(cfg.corpSecret),
    },
  });
});

app.put("/api/wecom/config", async (c) => {
  const body = z
    .object({
      corpId: z.string().min(1),
      corpSecret: z.string().min(1),
      spaceIds: z.array(z.string()).default([]),
      userid: z.string().optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "参数无效" }, 400);
  // 若前端传掩码，保留原 secret
  let secret = body.data.corpSecret;
  if (secret === "********") {
    const prev = loadWecomConfig();
    secret = prev?.corpSecret ?? "";
  }
  const cfg = saveWecomConfig({
    corpId: body.data.corpId,
    corpSecret: secret,
    spaceIds: body.data.spaceIds,
    userid: body.data.userid,
  });
  return c.json({
    ok: true,
    status: wecomStatus(),
    updatedAt: cfg.updatedAt,
  });
});

app.post("/api/wecom/sync", async (c) => {
  try {
    const result = await syncWecomDocs();
    return c.json({ result });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

// —— 对话 ——
app.get("/api/chat/sessions", (c) => c.json({ sessions: listSessions() }));

app.post("/api/chat/sessions", async (c) => {
  const body = z
    .object({
      title: z.string().optional(),
      agentId: z.string().optional(),
      docIds: z.array(z.string()).optional(),
    })
    .safeParse((await c.req.json().catch(() => ({}))) || {});
  const session = createSession(body.success ? body.data : {});
  return c.json({ session }, 201);
});

app.get("/api/chat/sessions/:id", (c) => {
  const session = loadSession(c.req.param("id"));
  if (!session) return c.json({ error: "会话不存在" }, 404);
  return c.json({ session });
});

app.post("/api/chat/sessions/:id/messages", async (c) => {
  const body = z
    .object({
      content: z.string().min(1),
      agentId: z.string().optional(),
      docIds: z.array(z.string()).optional(),
      runAgent: z.boolean().optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "参数无效" }, 400);
  try {
    const out = await postMessage(c.req.param("id"), body.data.content, body.data);
    return c.json(out);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

console.log(`智工台 API → http://127.0.0.1:${PORT}`);
console.log(`数据目录   → ${dataDir()}`);

serve({ fetch: app.fetch, port: PORT });
