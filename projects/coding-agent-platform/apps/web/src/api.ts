const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `请求失败 ${res.status}`);
  }
  return data;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  fixtureId: string;
  category: string;
  tags: string[];
  capabilities: string[];
}

export interface TaskSummary {
  id: string;
  agentId: string;
  fixtureId: string;
  goal: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  eventCount: number;
  summary?: string;
  toolCalls?: number;
  durationMs?: number;
  planSummary?: string;
  errorMessage?: string;
}

export interface TaskDetail {
  id: string;
  agentId: string;
  fixtureId: string;
  goal: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  events: unknown[];
  result?: {
    status: string;
    summary: string;
    toolCalls: number;
    durationMs: number;
    costUsd: number;
    artifacts?: {
      prBody: string;
      diffSummary: string;
      testEvidence: string;
      traceJsonl: string;
    };
  };
  planSummary?: string;
  errorMessage?: string;
}

export interface Metrics {
  totals: {
    tasks: number;
    completed: number;
    failed: number;
    running: number;
    successRate: number;
    toolCalls: number;
    avgDurationMs: number;
  };
  byAgent: Record<
    string,
    { runs: number; success: number; toolCalls: number; durationMs: number }
  >;
  latestEval: {
    passRate: number;
    results: {
      taskId: string;
      passed: boolean;
      latencyMs: number;
      costUsd: number;
      reason: string;
    }[];
    metrics: Record<string, unknown>;
  } | null;
}

export interface DocItem {
  id: string;
  title: string;
  source: "local" | "wecom";
  content: string;
  externalId?: string;
  spaceId?: string;
  url?: string;
  tags: string[];
  updatedAt: number;
  syncedAt?: number;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  meta?: { taskId?: string };
}

export interface ChatSession {
  id: string;
  title: string;
  agentId?: string;
  docIds: string[];
  messages: ChatMsg[];
  createdAt: number;
  updatedAt: number;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),
  agents: () => request<{ agents: Agent[] }>("/api/agents"),
  tasks: () => request<{ tasks: TaskSummary[] }>("/api/tasks"),
  task: (id: string) =>
    request<{ task: TaskDetail; running: boolean }>(`/api/tasks/${id}`),
  createTask: (agentId: string, goal?: string) =>
    request<{ task: TaskDetail }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ agentId, goal }),
    }),
  retryTask: (id: string) =>
    request<{ task: TaskDetail }>(`/api/tasks/${id}/retry`, { method: "POST" }),
  runEval: () =>
    request<{ report: NonNullable<Metrics["latestEval"]> }>("/api/eval", {
      method: "POST",
    }),
  latestEval: () =>
    request<{ report: Metrics["latestEval"] }>("/api/eval/latest"),
  metrics: () => request<Metrics>("/api/metrics"),
  eventsUrl: (id: string) => `${API_BASE}/api/tasks/${id}/events`,

  docs: () => request<{ docs: DocItem[] }>("/api/docs"),
  createDoc: (title: string, content: string) =>
    request<{ doc: DocItem }>("/api/docs", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    }),
  updateDoc: (id: string, patch: { title?: string; content?: string }) =>
    request<{ doc: DocItem }>(`/api/docs/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deleteDoc: (id: string) =>
    request<{ ok: boolean }>(`/api/docs/${id}`, { method: "DELETE" }),

  wecomStatus: () =>
    request<{
      configured: boolean;
      spaceCount: number;
      corpIdMasked: string | null;
    }>("/api/wecom/status"),
  wecomConfig: () =>
    request<{
      config: {
        corpId: string;
        corpSecret: string;
        spaceIds: string[];
        userid: string;
        hasSecret: boolean;
      } | null;
    }>("/api/wecom/config"),
  saveWecomConfig: (body: {
    corpId: string;
    corpSecret: string;
    spaceIds: string[];
    userid?: string;
  }) =>
    request<{ ok: boolean }>("/api/wecom/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  syncWecom: () =>
    request<{
      result: {
        imported: number;
        updated: number;
        files: { title: string; docId: string; fileType: string }[];
        errors: string[];
      };
    }>("/api/wecom/sync", { method: "POST" }),

  chatSessions: () => request<{ sessions: ChatSession[] }>("/api/chat/sessions"),
  createChat: (body?: { title?: string; agentId?: string; docIds?: string[] }) =>
    request<{ session: ChatSession }>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  chatSession: (id: string) =>
    request<{ session: ChatSession }>(`/api/chat/sessions/${id}`),
  sendChat: (
    id: string,
    body: {
      content: string;
      agentId?: string;
      docIds?: string[];
      runAgent?: boolean;
    },
  ) =>
    request<{ session: ChatSession; taskId?: string }>(
      `/api/chat/sessions/${id}/messages`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};

export { API_BASE };
