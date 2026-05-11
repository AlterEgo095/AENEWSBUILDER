/**
 * @aenews/mcp - Universal MCP Adapter
 *
 * A universal client that can spawn external MCP server processes via stdio
 * transport, connect to SSE-based MCP servers over HTTP, proxy tool calls,
 * cache connections for reuse, and handle timeouts / errors gracefully.
 *
 * Designed to work with the catalog (catalog.ts) for auto-configuration.
 */

import { spawn, ChildProcess } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import { mcpCatalog, type MCPCatalogEntry } from './catalog.js';
import { logger } from './adapter.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MCPToolCall {
  /** Catalog entry id (kebab-case) */
  toolId: string;
  /** Method / action to invoke on the MCP server */
  action: string;
  /** Optional parameters forwarded to the tool */
  params?: Record<string, any>;
  /** Timeout in milliseconds (default 30 000) */
  timeout?: number;
}

export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

interface StdioConnection {
  process: ChildProcess;
  /** Serialiser used to encode requests sent to stdin */
  encoder: TextEncoder;
  /** Buffer for assembling response chunks from stdout */
  buffer: string;
  /** Pending JSON-RPC request → resolve / reject */
  pending: Map<
    number,
    {
      resolve: (data: any) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >;
  /** Monotonic request id counter */
  nextId: number;
}

interface SSEConnection {
  /** HTTP client configured with base URL + auth */
  client: AxiosInstance;
  /** Cache of tool list fetched once after connect */
  tools: string[] | null;
}

// ─── Universal MCP Adapter ─────────────────────────────────────────────────

export class UniversalMCPAdapter {
  /** Cached connections keyed by catalog entry id */
  private connections = new Map<string, StdioConnection | SSEConnection>();

  /** Whether the adapter has been shut down */
  private _shutdown = false;

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Execute a tool call on any MCP server identified by its catalog id.
   *
   * - Looks up the catalog entry
   * - Establishes a connection (or reuses a cached one)
   * - Sends a JSON-RPC request
   * - Returns normalised `MCPResult`
   */
  async execute(call: MCPToolCall): Promise<MCPResult> {
    if (this._shutdown) {
      throw new Error('Adapter has been shut down');
    }

    const start = performance.now();
    const entry = mcpCatalog.find((e) => e.id === call.toolId);

    if (!entry) {
      return {
        success: false,
        error: `Unknown tool id: "${call.toolId}". Not found in catalog.`,
        duration: performance.now() - start,
      };
    }

    try {
      logger.info({ toolId: call.toolId, action: call.action }, '🔧 MCP execute');

      let result: any;

      if (entry.source.transport === 'stdio') {
        result = await this.executeStdio(entry, call);
      } else if (entry.source.transport === 'sse') {
        result = await this.executeSSE(entry, call);
      } else {
        throw new Error(`Unsupported transport: ${entry.source.transport}`);
      }

      return {
        success: true,
        data: result,
        duration: performance.now() - start,
      };
    } catch (err: any) {
      logger.error({ err, toolId: call.toolId }, '❌ MCP execute failed');
      return {
        success: false,
        error: err?.message ?? String(err),
        duration: performance.now() - start,
      };
    }
  }

  /**
   * Get the list of available tools/functions exposed by a connected server.
   *
   * Returns cached list if already fetched; otherwise performs an initial
   * `tools/list` JSON-RPC request.
   */
  async listTools(entryId: string): Promise<string[]> {
    const entry = mcpCatalog.find((e) => e.id === entryId);
    if (!entry) throw new Error(`Unknown tool id: "${entryId}"`);

    if (entry.source.transport === 'sse') {
      const conn = this.connections.get(entryId);
      if (conn && conn instanceof Object && 'tools' in conn && (conn as SSEConnection).tools) {
        return (conn as SSEConnection).tools!;
      }
      // Fetch tools from SSE endpoint
      const sseConn = await this.connectSSE(entry);
      return sseConn.tools ?? [];
    }

    // For stdio, we send a tools/list JSON-RPC request
    const stdioConn = await this.ensureStdio(entry);
    return this.rpcCall(stdioConn, 'tools/list', {}).then((res) => {
      return (res?.tools ?? []).map((t: any) => t.name ?? String(t));
    }).catch(() => [] as string[]);
  }

  /**
   * Check whether a connection to the given entry id already exists.
   */
  hasConnection(entryId: string): boolean {
    return this.connections.has(entryId);
  }

  /**
   * Gracefully close all open connections (kill child processes).
   */
  async shutdown(): Promise<void> {
    this._shutdown = true;

    for (const [id, conn] of this.connections) {
      try {
        if ('process' in conn && (conn as StdioConnection).process) {
          const proc = (conn as StdioConnection).process;
          if (!proc.killed) {
            proc.kill('SIGTERM');
            // Force kill after 5 s if still alive
            setTimeout(() => {
              if (!proc.killed) proc.kill('SIGKILL');
            }, 5000);
          }
        }
      } catch {
        // best-effort
      }
    }

    this.connections.clear();
    logger.info('🔌 All MCP connections closed');
  }

  /**
   * Explicitly close a single connection by entry id.
   */
  async disconnect(entryId: string): Promise<void> {
    const conn = this.connections.get(entryId);
    if (!conn) return;

    if ('process' in conn && (conn as StdioConnection).process) {
      const proc = (conn as StdioConnection).process;
      if (!proc.killed) proc.kill('SIGTERM');
    }

    this.connections.delete(entryId);
    logger.info({ entryId }, '🔌 MCP connection closed');
  }

  // ─── Stdio Transport ────────────────────────────────────────────────

  /**
   * Ensure a stdio child process is running for the given entry and return
   * the connection handle. Reuses existing processes when available.
   */
  private async ensureStdio(entry: MCPCatalogEntry): Promise<StdioConnection> {
    const existing = this.connections.get(entry.id);
    if (existing && 'process' in existing) {
      const proc = (existing as StdioConnection).process;
      if (!proc.killed && proc.exitCode === null) {
        return existing as StdioConnection;
      }
    }

    return this.spawnStdio(entry);
  }

  /**
   * Spawn an MCP server process that communicates over stdio (JSON-RPC).
   *
   * The command to run is derived from the catalog entry:
   *  - npm packages: `npx <package>`
   *  - github repos:  `npx <org-repo>` (assumes published to npm)
   *
   * Returns a `StdioConnection` handle for subsequent RPC calls.
   */
  private spawnStdio(entry: MCPCatalogEntry): StdioConnection {
    const env: Record<string, string | undefined> = {
      ...process.env,
    };

    // Inject required env vars (even if empty — the server may have defaults)
    for (const varName of entry.envVars) {
      if (!(varName in env)) {
        env[varName] = undefined;
      }
    }

    let cmd: string;
    let args: string[] = [];

    if (entry.source.type === 'npm') {
      cmd = 'npx';
      args = ['-y', entry.source.package];
    } else if (entry.source.type === 'github') {
      // GitHub sources assumed to be published to npm or runnable via npx
      cmd = 'npx';
      args = ['-y', entry.source.package];
    } else {
      // builtin — no external process
      throw new Error(`Builtin transport "${entry.id}" cannot be spawned`);
    }

    logger.info({ cmd, args: args.join(' '), entry: entry.id }, '🚀 Spawning stdio MCP server');

    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      cwd: undefined,
    });

    const conn: StdioConnection = {
      process: proc,
      encoder: new TextEncoder(),
      buffer: '',
      pending: new Map(),
      nextId: 1,
    };

    // ── stdout handler: assemble lines and dispatch JSON-RPC responses ──
    proc.stdout.on('data', (chunk: Buffer) => {
      conn.buffer += chunk.toString();
      this.drainStdioBuffer(conn);
    });

    // ── stderr: forward to logger for debugging ──
    proc.stderr.on('data', (chunk: Buffer) => {
      logger.debug({ entry: entry.id, stderr: chunk.toString().trimEnd() }, 'stderr');
    });

    // ── process exit: reject all pending requests ──
    proc.on('close', (code) => {
      if (code !== null && code !== 0) {
        logger.warn({ entry: entry.id, code }, 'stdio process exited');
      }
      for (const [, pending] of conn.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Process exited with code ${code}`));
      }
      conn.pending.clear();
      this.connections.delete(entry.id);
    });

    proc.on('error', (err) => {
      logger.error({ entry: entry.id, err }, 'stdio process error');
      for (const [, pending] of conn.pending) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
      conn.pending.clear();
      this.connections.delete(entry.id);
    });

    this.connections.set(entry.id, conn);
    return conn;
  }

  /**
   * Parse newline-delimited JSON-RPC messages from the stdout buffer.
   */
  private drainStdioBuffer(conn: StdioConnection): void {
    const lines = conn.buffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    conn.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        // JSON-RPC response has "id" field
        if (msg.id != null) {
          const pending = conn.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            conn.pending.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        // Non-JSON output — ignore
      }
    }
  }

  /**
   * Send a JSON-RPC request over stdio and wait for the response.
   */
  private rpcCall(
    conn: StdioConnection,
    method: string,
    params: Record<string, any>,
    timeout = 30_000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (conn.process.killed) {
        return reject(new Error('Process has been killed'));
      }

      const id = conn.nextId++;
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      const timer = setTimeout(() => {
        conn.pending.delete(id);
        reject(new Error(`JSON-RPC request "${method}" timed out after ${timeout}ms`));
      }, timeout);

      conn.pending.set(id, { resolve, reject, timer });

      // Write message + newline (MCP uses newline-delimited JSON)
      conn.process.stdin!.write(message + '\n', (err) => {
        if (err) {
          clearTimeout(timer);
          conn.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Execute a tool call via stdio transport.
   */
  private async executeStdio(entry: MCPCatalogEntry, call: MCPToolCall): Promise<any> {
    const conn = await this.ensureStdio(entry);
    const timeout = call.timeout ?? 30_000;

    // Try to call a named tool first
    return this.rpcCall(
      conn,
      'tools/call',
      {
        name: call.action,
        arguments: call.params ?? {},
      },
      timeout,
    );
  }

  // ─── SSE Transport ──────────────────────────────────────────────────

  /**
   * Connect to an SSE-based MCP server. Reuses existing connections.
   */
  private async connectSSE(entry: MCPCatalogEntry): Promise<SSEConnection> {
    const existing = this.connections.get(entry.id);
    if (existing && 'client' in existing) {
      return existing as SSEConnection;
    }

    const baseUrl = entry.source.package; // For SSE, "package" holds the base URL

    const client = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    });

    const conn: SSEConnection = { client, tools: null };

    // Pre-fetch the tool list
    try {
      const res = await client.post('/sse', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });
      const result = res.data?.result;
      if (result?.tools) {
        conn.tools = result.tools.map((t: any) => t.name ?? String(t));
      }
    } catch {
      // Tool list fetch is best-effort; the server may not support it
      logger.debug({ entry: entry.id }, 'Could not fetch tool list from SSE server');
    }

    this.connections.set(entry.id, conn);
    return conn;
  }

  /**
   * Execute a tool call via SSE transport.
   */
  private async executeSSE(entry: MCPCatalogEntry, call: MCPToolCall): Promise<any> {
    const conn = await this.connectSSE(entry);
    const timeout = call.timeout ?? 30_000;

    try {
      const res = await conn.client.post(
        '/sse',
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: call.action,
            arguments: call.params ?? {},
          },
        },
        { timeout },
      );

      const body = res.data;

      // The SSE endpoint may return the result directly or wrap it in a JSON-RPC envelope
      if (body?.result) {
        return body.result;
      }
      return body;
    } catch (err: any) {
      if (err.code === 'ECONNABORTED') {
        throw new Error(`SSE request to "${entry.id}" timed out after ${timeout}ms`);
      }
      throw err;
    }
  }

  // ─── Batch & Parallel Execution ─────────────────────────────────────

  /**
   * Execute multiple tool calls in parallel. Each call is independent;
   * failures do not affect other calls.
   */
  async executeParallel(calls: MCPToolCall[]): Promise<MCPResult[]> {
    return Promise.all(calls.map((call) => this.execute(call)));
  }

  /**
   * Execute tool calls sequentially in the given order.
   * Stops on the first failure unless `continueOnError` is true.
   */
  async executeSequential(
    calls: MCPToolCall[],
    options: { continueOnError?: boolean } = {},
  ): Promise<MCPResult[]> {
    const results: MCPResult[] = [];

    for (const call of calls) {
      const result = await this.execute(call);
      results.push(result);

      if (!result.success && !options.continueOnError) {
        break;
      }
    }

    return results;
  }

  // ─── Health & Diagnostics ───────────────────────────────────────────

  /**
   * Return diagnostic information about all active connections.
   */
  getDiagnostics(): {
    totalEntries: number;
    activeConnections: number;
    connections: Array<{
      entryId: string;
      transport: string;
      alive: boolean;
    }>;
  } {
    const connections: Array<{ entryId: string; transport: string; alive: boolean }> = [];

    for (const [entryId, conn] of this.connections) {
      const entry = mcpCatalog.find((e) => e.id === entryId);

      if ('process' in conn) {
        const proc = (conn as StdioConnection).process;
        connections.push({
          entryId,
          transport: 'stdio',
          alive: !proc.killed && proc.exitCode === null,
        });
      } else {
        connections.push({
          entryId,
          transport: 'sse',
          alive: true, // HTTP clients don't have a persistent "alive" state
        });
      }
    }

    return {
      totalEntries: mcpCatalog.length,
      activeConnections: this.connections.size,
      connections,
    };
  }
}
