/** T3 — JSON-RPC 2.0 over in-process transport (stdio-compatible shapes) */

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export type RpcHandler = (params: unknown) => Promise<unknown> | unknown;

export class JsonRpcServer {
  private methods = new Map<string, RpcHandler>();

  register(method: string, handler: RpcHandler): void {
    this.methods.set(method, handler);
  }

  async handleLine(line: string): Promise<string | null> {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC_PARSE_ERROR, message: "Parse error" },
      } satisfies JsonRpcFailure);
    }

    if (Array.isArray(msg)) {
      const results: JsonRpcResponse[] = [];
      for (const item of msg) {
        const r = await this.handleOne(item);
        if (r) results.push(r);
      }
      return results.length ? JSON.stringify(results) : null;
    }

    const r = await this.handleOne(msg);
    return r ? JSON.stringify(r) : null;
  }

  private async handleOne(msg: unknown): Promise<JsonRpcResponse | null> {
    if (!msg || typeof msg !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC_INVALID_REQUEST, message: "Invalid Request" },
      };
    }
    const m = msg as Record<string, unknown>;
    if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      return {
        jsonrpc: "2.0",
        id: (m.id as JsonRpcId) ?? null,
        error: { code: RPC_INVALID_REQUEST, message: "Invalid Request" },
      };
    }
    const isNotification = !("id" in m);
    const handler = this.methods.get(m.method);
    if (!handler) {
      if (isNotification) return null;
      return {
        jsonrpc: "2.0",
        id: m.id as JsonRpcId,
        error: { code: RPC_METHOD_NOT_FOUND, message: "Method not found" },
      };
    }
    try {
      const result = await handler(m.params);
      if (isNotification) return null;
      return { jsonrpc: "2.0", id: m.id as JsonRpcId, result };
    } catch (err) {
      if (isNotification) return null;
      return {
        jsonrpc: "2.0",
        id: m.id as JsonRpcId,
        error: {
          code: RPC_INTERNAL_ERROR,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

/** In-process client talking to a JsonRpcServer via string lines. */
export class InProcessRpcClient {
  constructor(private server: JsonRpcServer) {}

  async request(method: string, params?: unknown, id: JsonRpcId = 1): Promise<unknown> {
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    } satisfies JsonRpcRequest);
    const raw = await this.server.handleLine(line);
    if (!raw) throw new Error("expected response for request");
    const resp = JSON.parse(raw) as JsonRpcResponse;
    if ("error" in resp) {
      throw new Error(`RPC ${resp.error.code}: ${resp.error.message}`);
    }
    return resp.result;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    const line = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    } satisfies JsonRpcNotification);
    await this.server.handleLine(line);
  }
}
