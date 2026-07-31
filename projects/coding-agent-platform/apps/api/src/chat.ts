/** 对话：结合文档检索 + 可选触发编码 Agent 任务 */

import { listAgents, getAgent } from "./agents.js";
import { createQueuedTask, startTaskRun } from "./runner.js";
import {
  loadDoc,
  loadSession,
  saveSession,
  type ChatMessage,
  type ChatSession,
} from "./docs-store.js";

function mid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createSession(input: {
  title?: string;
  agentId?: string;
  docIds?: string[];
}): ChatSession {
  const now = Date.now();
  const s: ChatSession = {
    id: `chat_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title: input.title ?? "新对话",
    agentId: input.agentId,
    docIds: input.docIds ?? [],
    messages: [
      {
        id: mid(),
        role: "assistant",
        content:
          "你好，我是智工台助手。可以问文档内容，或说「运行编码修复 / 边界守卫 / 越狱审计」触发真实 Agent 任务。",
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  saveSession(s);
  return s;
}

function retrieveDocs(docIds: string[], query: string): string {
  const chunks: string[] = [];
  for (const id of docIds) {
    const d = loadDoc(id);
    if (!d) continue;
    const hit =
      !query ||
      d.title.includes(query) ||
      d.content.includes(query) ||
      query.split(/\s+/).some((w) => w && d.content.includes(w));
    if (hit || docIds.length <= 3) {
      chunks.push(
        `### ${d.title}\n来源: ${d.source}${d.url ? ` · ${d.url}` : ""}\n${d.content.slice(0, 3000)}`,
      );
    }
  }
  return chunks.slice(0, 5).join("\n\n");
}

function detectAgentIntent(text: string): string | null {
  if (/越狱|安全|passwd|jail|拒绝路径/.test(text)) return "refuse-escape";
  if (/除零|守卫|divide|边界/.test(text)) return "add-guard";
  if (/修复|拼写|greet|typo|编码/.test(text)) return "fix-typo";
  if (/运行|跑一下|执行任务/.test(text)) return "fix-typo";
  return null;
}

export async function postMessage(
  sessionId: string,
  content: string,
  opts?: { agentId?: string; docIds?: string[]; runAgent?: boolean },
): Promise<{ session: ChatSession; taskId?: string }> {
  const session = loadSession(sessionId);
  if (!session) throw new Error("会话不存在");

  const userMsg: ChatMessage = {
    id: mid(),
    role: "user",
    content,
    createdAt: Date.now(),
  };
  session.messages.push(userMsg);
  if (opts?.docIds) session.docIds = opts.docIds;
  if (opts?.agentId) session.agentId = opts.agentId;

  const intent =
    opts?.runAgent !== false
      ? opts?.agentId || detectAgentIntent(content) || session.agentId
      : null;

  let taskId: string | undefined;
  let reply: string;

  // 明确要求跑任务，或命中编码意图
  const wantRun =
    opts?.runAgent === true ||
    /运行|执行|跑一下|开始任务/.test(content) ||
    Boolean(detectAgentIntent(content));

  if (wantRun && intent && getAgent(intent)) {
    const task = createQueuedTask({ agentId: intent, goal: content });
    void startTaskRun(task.id);
    taskId = task.id;
    const agent = getAgent(intent)!;
    reply = [
      `已为你创建编码任务并开始执行。`,
      ``,
      `· Agent：${agent.name}`,
      `· 任务 ID：${task.id}`,
      `· 可到「任务」页查看 SSE 事件流与 Diff`,
      ``,
      `目标：${task.goal}`,
    ].join("\n");
  } else {
    const docIds = session.docIds.length
      ? session.docIds
      : opts?.docIds ?? [];
    const ctx = retrieveDocs(docIds, content);
    const agents = listAgents()
      .map((a) => `- ${a.name}（${a.id}）：${a.description}`)
      .join("\n");

    if (ctx) {
      reply = [
        `基于已选/命中的文档，回答如下：`,
        ``,
        summarizeFromDocs(content, ctx),
        ``,
        `——`,
        `引用文档片段：`,
        ctx.slice(0, 2500),
      ].join("\n");
    } else {
      reply = [
        `当前没有选中文档，或文档库为空。`,
        `你可以：`,
        `1. 到「文档」页从企微同步，或新建本地文档`,
        `2. 在对话里勾选文档后再问`,
        `3. 直接说「运行编码修复」触发 Agent`,
        ``,
        `可用 Agent：`,
        agents,
      ].join("\n");
    }
  }

  session.messages.push({
    id: mid(),
    role: "assistant",
    content: reply,
    createdAt: Date.now(),
    meta: taskId ? { taskId } : undefined,
  });
  if (session.title === "新对话" && content.trim()) {
    session.title = content.trim().slice(0, 24);
  }
  session.updatedAt = Date.now();
  saveSession(session);
  return { session, taskId };
}

function summarizeFromDocs(question: string, ctx: string): string {
  const lines = ctx.split("\n").filter(Boolean);
  const keywords = question
    .replace(/[？?！!。，,]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const hits = lines.filter((l) => keywords.some((k) => l.includes(k)));
  if (hits.length) {
    return `与「${question}」相关的要点：\n${hits
      .slice(0, 8)
      .map((h) => `• ${h.slice(0, 160)}`)
      .join("\n")}`;
  }
  return `已检索到相关文档，但没有精确关键词命中。请换个问法，或打开「文档」查看原文。文档开头如下：\n${lines.slice(0, 6).join("\n")}`;
}
