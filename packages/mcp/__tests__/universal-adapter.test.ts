/**
 * Universal MCP Adapter Tests
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ─── Hoist shared mock state so vi.mock factories can access it ─────────

const { mockSpawnCalls, mockStdioProcess, mockCatalogEntries, mockPost, mockGet, mockAxiosCreate } = vi.hoisted(() => {
  const mockSpawnCalls: Array<{ cmd: string; args: string[]; opts?: any }> = [];

  const mockStdioProcess = () => {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const proc: any = {
      killed: false,
      exitCode: null as number | null,
      stdin: {
        write: vi.fn((data: string, cb?: (err?: Error) => void) => {
          if (cb) cb();
        }),
      },
      stdout: {
        on: vi.fn((event: string, fn: (...args: any[]) => void) => {
          listeners[`stdout:${event}`] = listeners[`stdout:${event}`] || [];
          listeners[`stdout:${event}`].push(fn);
        }),
      },
      stderr: {
        on: vi.fn((event: string, fn: (...args: any[]) => void) => {
          listeners[`stderr:${event}`] = listeners[`stderr:${event}`] || [];
          listeners[`stderr:${event}`].push(fn);
        }),
      },
      on: vi.fn((event: string, fn: (...args: any[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      }),
      kill: vi.fn(() => {
        proc.killed = true;
        if (listeners['close']) {
          for (const f of listeners['close']) f(null);
        }
      }),
      _listeners: listeners,
    };
    return proc;
  };

  const mockCatalogEntries = [
    {
      id: 'test-stdio',
      name: 'Test Stdio',
      version: '1.0.0',
      author: 'test',
      category: 'devops',
      description: 'A stdio test tool',
      source: { transport: 'stdio', type: 'npm', package: 'test-pkg' },
      permissions: ['read'],
      envVars: [],
      tags: ['test'],
      status: 'active',
    },
    {
      id: 'test-sse',
      name: 'Test SSE',
      version: '1.0.0',
      author: 'test',
      category: 'devops',
      description: 'An SSE test tool',
      source: { transport: 'sse', type: 'npm', package: 'http://localhost:3000' },
      permissions: ['read'],
      envVars: [],
      tags: ['test'],
      status: 'active',
    },
    {
      id: 'test-unsupported',
      name: 'Test Unsupported',
      version: '1.0.0',
      author: 'test',
      category: 'devops',
      description: 'An unsupported transport tool',
      source: { transport: 'websocket', type: 'npm', package: 'ws-pkg' },
      permissions: ['read'],
      envVars: [],
      tags: ['test'],
      status: 'active',
    },
  ];

  const mockPost = vi.fn();
  const mockGet = vi.fn();
  const mockAxiosCreate = vi.fn(() => ({
    post: mockPost,
    get: mockGet,
  }));

  return { mockSpawnCalls, mockStdioProcess, mockCatalogEntries, mockPost, mockGet, mockAxiosCreate };
});

// ─── Mock dependencies ──────────────────────────────────────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn((cmd: string, args: string[], opts: any) => {
    mockSpawnCalls.push({ cmd, args, opts });
    return mockStdioProcess();
  }),
}));

vi.mock('axios', () => ({
  default: {
    create: (...args: any[]) => mockAxiosCreate(...args),
  },
}));

vi.mock('../catalog.js', () => ({
  mcpCatalog: mockCatalogEntries,
}));

vi.mock('../adapter.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Import module (mocks are active) ────────────────────────────────────

import { UniversalMCPAdapter } from '../universal-adapter.js';

describe('UniversalMCPAdapter', () => {
  let adapter: UniversalMCPAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSpawnCalls.length = 0;
    adapter = new UniversalMCPAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // execute()
  // ═══════════════════════════════════════════════════════════════════════
  describe('execute', () => {
    it('should return error for unknown tool id', async () => {
      const result = await adapter.execute({
        toolId: 'nonexistent-tool',
        action: 'doSomething',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool id');
      expect(result.error).toContain('nonexistent-tool');
    });

    it('should throw after shutdown', async () => {
      await adapter.shutdown();

      await expect(
        adapter.execute({ toolId: 'test-stdio', action: 'run' }),
      ).rejects.toThrow('Adapter has been shut down');
    });

    it('should return duration >= 0', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          result: { tools: [{ name: 'test' }] },
        },
      }); // connectSSE tool list
      mockPost.mockResolvedValueOnce({
        data: { result: { output: 'hello' } },
      }); // executeSSE call

      const result = await adapter.execute({
        toolId: 'test-sse',
        action: 'run',
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should return success:true for valid SSE call', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [{ name: 'test' }] } },
      });
      mockPost.mockResolvedValueOnce({
        data: { result: { output: 'hello' } },
      });

      const result = await adapter.execute({
        toolId: 'test-sse',
        action: 'run',
        params: { key: 'value' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should catch and return error on exception', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network failure'));

      const result = await adapter.execute({
        toolId: 'test-sse',
        action: 'run',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle unsupported transport', async () => {
      const result = await adapter.execute({
        toolId: 'test-unsupported',
        action: 'run',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported transport');
    });

    it('should use stdio transport for stdio entries', async () => {
      const executePromise = adapter.execute({
        toolId: 'test-stdio',
        action: 'run',
        timeout: 1000,
      });

      // Give it a tick for the spawn to happen
      await vi.advanceTimersByTimeAsync(10);

      // The spawn should have been called
      expect(mockSpawnCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockSpawnCalls[0].cmd).toBe('npx');
      expect(mockSpawnCalls[0].args).toContain('-y');
      expect(mockSpawnCalls[0].args).toContain('test-pkg');

      // Now let the timeout fire
      await vi.advanceTimersByTimeAsync(2000);
      const result = await executePromise;

      // Should timeout since we never write a response
      expect(result.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // listTools()
  // ═══════════════════════════════════════════════════════════════════════
  describe('listTools', () => {
    it('should throw for unknown entry id', async () => {
      await expect(adapter.listTools('nonexistent')).rejects.toThrow('Unknown tool id');
    });

    it('should return cached tools for SSE connection', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [{ name: 'tool-a' }, { name: 'tool-b' }] } },
      }); // connectSSE
      mockPost.mockResolvedValueOnce({
        data: { result: 'done' },
      }); // executeSSE

      await adapter.execute({ toolId: 'test-sse', action: 'run' });

      // Now listTools should return cached tools
      const tools = await adapter.listTools('test-sse');
      expect(tools).toEqual(['tool-a', 'tool-b']);
    });

    it('should fetch tools from SSE endpoint if not cached', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [{ name: 'fetched-tool' }] } },
      });

      const tools = await adapter.listTools('test-sse');
      expect(tools).toEqual(['fetched-tool']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // hasConnection()
  // ═══════════════════════════════════════════════════════════════════════
  describe('hasConnection', () => {
    it('should return false for no connection', () => {
      expect(adapter.hasConnection('test-stdio')).toBe(false);
    });

    it('should return true after SSE connection is established', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [{ name: 't' }] } },
      });

      await adapter.listTools('test-sse');
      expect(adapter.hasConnection('test-sse')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // shutdown()
  // ═══════════════════════════════════════════════════════════════════════
  describe('shutdown', () => {
    it('should set _shutdown flag and clear connections', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [] } },
      });
      await adapter.listTools('test-sse');
      expect(adapter.hasConnection('test-sse')).toBe(true);

      await adapter.shutdown();

      expect((adapter as any)._shutdown).toBe(true);
      expect(adapter.hasConnection('test-sse')).toBe(false);
    });

    it('should kill stdio child processes', async () => {
      const proc = mockStdioProcess();

      const stdioConn = {
        process: proc,
        encoder: new TextEncoder(),
        buffer: '',
        pending: new Map(),
        nextId: 1,
      };
      (adapter as any).connections.set('test-stdio', stdioConn);

      await adapter.shutdown();

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(adapter.hasConnection('test-stdio')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // disconnect()
  // ═══════════════════════════════════════════════════════════════════════
  describe('disconnect', () => {
    it('should remove a specific connection', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [] } },
      });
      await adapter.listTools('test-sse');
      expect(adapter.hasConnection('test-sse')).toBe(true);

      await adapter.disconnect('test-sse');
      expect(adapter.hasConnection('test-sse')).toBe(false);
    });

    it('should do nothing for unknown entry id', async () => {
      await adapter.disconnect('nonexistent');
      expect(adapter.hasConnection('nonexistent')).toBe(false);
    });

    it('should kill stdio process on disconnect', async () => {
      const proc = mockStdioProcess();
      const stdioConn = {
        process: proc,
        encoder: new TextEncoder(),
        buffer: '',
        pending: new Map(),
        nextId: 1,
      };
      (adapter as any).connections.set('test-stdio', stdioConn);

      await adapter.disconnect('test-stdio');

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(adapter.hasConnection('test-stdio')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // executeParallel()
  // ═══════════════════════════════════════════════════════════════════════
  describe('executeParallel', () => {
    it('should run all calls in parallel', async () => {
      // Use a function-based mock to handle the race condition of connectSSE
      let callCount = 0;
      mockPost.mockImplementation(async () => {
        callCount++;
        // First call is connectSSE tools/list, rest are executeSSE calls
        if (callCount === 1) {
          return { data: { result: { tools: [] } } };
        }
        // All subsequent calls are execute calls
        const resultIndex = callCount - 2;
        const results = ['a', 'b', 'c'];
        return { data: { result: results[resultIndex] || 'done' } };
      });

      const calls = [
        { toolId: 'test-sse', action: 'run-a' },
        { toolId: 'test-sse', action: 'run-b' },
        { toolId: 'test-sse', action: 'run-c' },
      ];

      const results = await adapter.executeParallel(calls);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // executeSequential()
  // ═══════════════════════════════════════════════════════════════════════
  describe('executeSequential', () => {
    it('should stop on first failure', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { result: { tools: [] } } }) // connect
        .mockResolvedValueOnce({ data: { result: 'ok' } }) // first call succeeds
        .mockRejectedValueOnce(new Error('Fail')); // second call fails

      const calls = [
        { toolId: 'test-sse', action: 'step-1' },
        { toolId: 'test-sse', action: 'step-2' },
        { toolId: 'test-sse', action: 'step-3' },
      ];

      const results = await adapter.executeSequential(calls);

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should continue on failure with continueOnError=true', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { result: { tools: [] } } }) // connect
        .mockResolvedValueOnce({ data: { result: 'ok' } }) // first succeeds
        .mockRejectedValueOnce(new Error('Fail')) // second fails
        .mockResolvedValueOnce({ data: { result: 'ok' } }); // third succeeds

      const calls = [
        { toolId: 'test-sse', action: 'step-1' },
        { toolId: 'test-sse', action: 'step-2' },
        { toolId: 'test-sse', action: 'step-3' },
      ];

      const results = await adapter.executeSequential(calls, { continueOnError: true });

      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getDiagnostics()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getDiagnostics', () => {
    it('should return correct structure', () => {
      const diag = adapter.getDiagnostics();

      expect(diag).toHaveProperty('totalEntries');
      expect(diag).toHaveProperty('activeConnections');
      expect(diag).toHaveProperty('connections');
      expect(typeof diag.totalEntries).toBe('number');
      expect(typeof diag.activeConnections).toBe('number');
      expect(Array.isArray(diag.connections)).toBe(true);
    });

    it('should show totalEntries matching catalog length', () => {
      const diag = adapter.getDiagnostics();
      expect(diag.totalEntries).toBe(mockCatalogEntries.length);
    });

    it('should show zero active connections initially', () => {
      const diag = adapter.getDiagnostics();
      expect(diag.activeConnections).toBe(0);
      expect(diag.connections).toHaveLength(0);
    });

    it('should show stdio connections as alive', () => {
      const proc = mockStdioProcess();
      const stdioConn = {
        process: proc,
        encoder: new TextEncoder(),
        buffer: '',
        pending: new Map(),
        nextId: 1,
      };
      (adapter as any).connections.set('test-stdio', stdioConn);

      const diag = adapter.getDiagnostics();
      const stdioDiag = diag.connections.find((c) => c.entryId === 'test-stdio');
      expect(stdioDiag).toBeDefined();
      expect(stdioDiag!.transport).toBe('stdio');
      expect(stdioDiag!.alive).toBe(true);
    });

    it('should show stdio connections as dead when killed', () => {
      const proc = mockStdioProcess();
      proc.killed = true;
      const stdioConn = {
        process: proc,
        encoder: new TextEncoder(),
        buffer: '',
        pending: new Map(),
        nextId: 1,
      };
      (adapter as any).connections.set('test-stdio', stdioConn);

      const diag = adapter.getDiagnostics();
      const stdioDiag = diag.connections.find((c) => c.entryId === 'test-stdio');
      expect(stdioDiag!.alive).toBe(false);
    });

    it('should show SSE connections', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [] } },
      });
      await adapter.listTools('test-sse');

      const diag = adapter.getDiagnostics();
      const sseDiag = diag.connections.find((c) => c.entryId === 'test-sse');
      expect(sseDiag).toBeDefined();
      expect(sseDiag!.transport).toBe('sse');
      expect(sseDiag!.alive).toBe(true);
    });

    it('should count active connections correctly', async () => {
      mockPost.mockResolvedValueOnce({
        data: { result: { tools: [] } },
      });
      await adapter.listTools('test-sse');

      const proc = mockStdioProcess();
      const stdioConn = {
        process: proc,
        encoder: new TextEncoder(),
        buffer: '',
        pending: new Map(),
        nextId: 1,
      };
      (adapter as any).connections.set('test-stdio', stdioConn);

      const diag = adapter.getDiagnostics();
      expect(diag.activeConnections).toBe(2);
    });
  });
});
