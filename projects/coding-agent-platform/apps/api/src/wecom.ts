/**
 * 企微微盘对接（官方 API）
 * - gettoken
 * - wedrive/file_list 拉取空间内文件（含微文档）
 * - wedrive/file_download 尝试下载普通文件正文
 *
 * 说明：微文档（file_type 3/4/5）通常只有元数据+url，正文需在企微侧打开；
 * 「我有权限」体现在：应用可见范围 + 你配置的 spaceIds（你有权限的空间）。
 */

import { loadWecomConfig, saveDoc, listDocs, type DocRecord } from "./docs-store.js";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string> {
  const cfg = loadWecomConfig();
  if (!cfg?.corpId || !cfg.corpSecret) {
    throw new Error("未配置企微：请先填写 corpId / corpSecret");
  }
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.corpSecret)}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    errcode?: number;
    errmsg?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`获取 access_token 失败: ${data.errcode} ${data.errmsg}`);
  }
  if (!data.access_token) throw new Error("access_token 为空");
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  return data.access_token;
}

export interface WecomFile {
  fileid: string;
  file_name: string;
  spaceid: string;
  fatherid: string;
  file_size: number;
  ctime: number;
  mtime: number;
  file_type: number;
  file_status: number;
  url?: string;
}

const FILE_TYPE_LABEL: Record<number, string> = {
  1: "文件夹",
  2: "文件",
  3: "微文档",
  4: "微表格",
  5: "收集表",
};

export function fileTypeLabel(t: number): string {
  return FILE_TYPE_LABEL[t] ?? `类型${t}`;
}

async function wecomPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/${path}?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json()) as T & { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`企微接口 ${path} 失败: ${data.errcode} ${data.errmsg}`);
  }
  return data;
}

/** 拉取某空间目录下文件（分页） */
export async function listSpaceFiles(
  spaceId: string,
  fatherId?: string,
): Promise<WecomFile[]> {
  const files: WecomFile[] = [];
  let start = 0;
  let hasMore = true;
  while (hasMore) {
    const data = await wecomPost<{
      has_more?: boolean;
      next_start?: number;
      file_list?: { item?: WecomFile[] } | WecomFile[];
    }>("wedrive/file_list", {
      spaceid: spaceId,
      fatherid: fatherId ?? spaceId,
      sort_type: 6,
      start,
      limit: 100,
    });
    const raw = data.file_list;
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.item)
        ? raw.item
        : [];
    files.push(...items);
    hasMore = Boolean(data.has_more);
    start = data.next_start ?? start + items.length;
    if (!items.length) break;
  }
  return files;
}

/** 递归列出空间内文档（跳过文件夹深入一层/多层，限制深度） */
export async function crawlSpaceDocs(
  spaceId: string,
  maxDepth = 3,
): Promise<WecomFile[]> {
  const out: WecomFile[] = [];
  async function walk(fatherId: string, depth: number) {
    if (depth > maxDepth) return;
    const items = await listSpaceFiles(spaceId, fatherId);
    for (const f of items) {
      if (f.file_status === 2) continue;
      if (f.file_type === 1) {
        await walk(f.fileid, depth + 1);
      } else if ([2, 3, 4, 5].includes(f.file_type)) {
        out.push(f);
      }
    }
  }
  await walk(spaceId, 0);
  return out;
}

/** 尝试下载普通文件内容（微文档可能失败，会回退为元数据说明） */
export async function tryDownloadFileText(fileid: string): Promise<string | null> {
  try {
    const data = await wecomPost<{ download_url?: string }>(
      "wedrive/file_download",
      { fileid },
    );
    if (!data.download_url) return null;
    const res = await fetch(data.download_url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // 只收文本类
    const text = buf.toString("utf8");
    if (text.includes("\u0000")) return null;
    return text.slice(0, 200_000);
  } catch {
    return null;
  }
}

export interface SyncResult {
  imported: number;
  updated: number;
  files: Array<{
    title: string;
    fileid: string;
    fileType: string;
    docId: string;
  }>;
  errors: string[];
}

/** 从配置的 spaceIds 同步「你有权限的」微盘文档到本地文档库 */
export async function syncWecomDocs(): Promise<SyncResult> {
  const cfg = loadWecomConfig();
  if (!cfg) throw new Error("未配置企微");
  if (!cfg.spaceIds.length) {
    throw new Error("请至少配置一个微盘 spaceId（你有权限的空间）");
  }

  const existing = listDocs();
  const byExternal = new Map(
    existing.filter((d) => d.externalId).map((d) => [d.externalId!, d]),
  );

  const result: SyncResult = { imported: 0, updated: 0, files: [], errors: [] };

  for (const spaceId of cfg.spaceIds) {
    try {
      const files = await crawlSpaceDocs(spaceId);
      for (const f of files) {
        const prev = byExternal.get(f.fileid);
        let content =
          prev?.content ??
          `【企微${fileTypeLabel(f.file_type)}】${f.file_name}\n空间: ${spaceId}\nfileid: ${f.fileid}\n${f.url ? `链接: ${f.url}\n` : ""}\n（正文需在企微打开；普通文件将尝试下载）\n`;

        if (f.file_type === 2) {
          const downloaded = await tryDownloadFileText(f.fileid);
          if (downloaded) content = downloaded;
        }

        const now = Date.now();
        const doc: DocRecord = {
          id: prev?.id ?? `wecom_${f.fileid}`,
          title: f.file_name,
          source: "wecom",
          content,
          externalId: f.fileid,
          spaceId,
          fileType: f.file_type,
          url: f.url,
          tags: ["企微", fileTypeLabel(f.file_type)],
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
          syncedAt: now,
        };
        saveDoc(doc);
        if (prev) result.updated++;
        else result.imported++;
        result.files.push({
          title: doc.title,
          fileid: f.fileid,
          fileType: fileTypeLabel(f.file_type),
          docId: doc.id,
        });
      }
    } catch (err) {
      result.errors.push(
        `空间 ${spaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return result;
}

export function wecomStatus() {
  const cfg = loadWecomConfig();
  return {
    configured: Boolean(cfg?.corpId && cfg?.corpSecret),
    spaceCount: cfg?.spaceIds.length ?? 0,
    hasUserid: Boolean(cfg?.userid),
    corpIdMasked: cfg?.corpId
      ? `${cfg.corpId.slice(0, 4)}…${cfg.corpId.slice(-4)}`
      : null,
  };
}
