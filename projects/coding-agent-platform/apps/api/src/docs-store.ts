/** 企微凭证与本地文档库 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { dataDir } from "./store.js";

export interface WecomConfig {
  corpId: string;
  corpSecret: string;
  /** 微盘空间 ID 列表（应用可见且你有权限的空间） */
  spaceIds: string[];
  /** 可选：以某成员身份拉取（部分接口需要） */
  userid?: string;
  updatedAt: number;
}

export interface DocRecord {
  id: string;
  title: string;
  source: "local" | "wecom";
  content: string;
  /** 企微 fileid / docid */
  externalId?: string;
  spaceId?: string;
  fileType?: number;
  url?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  meta?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  agentId?: string;
  docIds: string[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

function docsDir() {
  const d = join(dataDir(), "docs");
  mkdirSync(d, { recursive: true });
  return d;
}

function chatDir() {
  const d = join(dataDir(), "chats");
  mkdirSync(d, { recursive: true });
  return d;
}

function wecomPath() {
  return join(dataDir(), "wecom-config.json");
}

export function loadWecomConfig(): WecomConfig | null {
  const p = wecomPath();
  if (!existsSync(p)) {
    // 环境变量兜底
    const corpId = process.env.WECOM_CORP_ID ?? "";
    const corpSecret = process.env.WECOM_CORP_SECRET ?? "";
    const spaceIds = (process.env.WECOM_SPACE_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!corpId || !corpSecret) return null;
    return {
      corpId,
      corpSecret,
      spaceIds,
      userid: process.env.WECOM_USERID,
      updatedAt: Date.now(),
    };
  }
  return JSON.parse(readFileSync(p, "utf8")) as WecomConfig;
}

export function saveWecomConfig(cfg: Omit<WecomConfig, "updatedAt">): WecomConfig {
  const full: WecomConfig = { ...cfg, updatedAt: Date.now() };
  writeFileSync(wecomPath(), JSON.stringify(full, null, 2));
  return full;
}

export function listDocs(): DocRecord[] {
  return readdirSync(docsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(docsDir(), f), "utf8")) as DocRecord)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadDoc(id: string): DocRecord | null {
  const p = join(docsDir(), `${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as DocRecord;
}

export function saveDoc(doc: DocRecord): void {
  writeFileSync(join(docsDir(), `${doc.id}.json`), JSON.stringify(doc, null, 2));
}

export function deleteDoc(id: string): boolean {
  const p = join(docsDir(), `${id}.json`);
  if (!existsSync(p)) return false;
  unlinkSync(p);
  return true;
}

export function listSessions(): ChatSession[] {
  return readdirSync(chatDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(chatDir(), f), "utf8")) as ChatSession)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadSession(id: string): ChatSession | null {
  const p = join(chatDir(), `${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as ChatSession;
}

export function saveSession(s: ChatSession): void {
  writeFileSync(join(chatDir(), `${s.id}.json`), JSON.stringify(s, null, 2));
}
