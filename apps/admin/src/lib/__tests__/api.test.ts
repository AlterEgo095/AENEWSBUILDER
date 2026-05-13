import api, { ApiError } from '../api';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] || null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(store).forEach(k => delete store[k]);
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('api client (singleton)', () => {
  describe('headers', () => {
    it('should include Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.get('/test');

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers['Content-Type']).toBe('application/json');
    });

    it('should include Authorization header when token exists in localStorage', async () => {
      store['admin_token'] = 'test-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.get('/test');

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers['Authorization']).toBe('Bearer test-token');
    });

    it('should omit Authorization header when no token in localStorage', async () => {
      delete store['admin_token'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.get('/test');

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers['Authorization']).toBeUndefined();
    });
  });

  describe('request methods', () => {
    it('get() should make GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await api.get('/endpoint');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/endpoint');
      expect(call[1].method).toBe('GET');
    });

    it('post() should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await api.post('/endpoint', { key: 'value' });

      const call = mockFetch.mock.calls[0];
      expect(call[1].method).toBe('POST');
      expect(call[1].body).toBe(JSON.stringify({ key: 'value' }));
    });

    it('put() should make PUT request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await api.put('/endpoint', { key: 'value' });

      const call = mockFetch.mock.calls[0];
      expect(call[1].method).toBe('PUT');
      expect(call[1].body).toBe(JSON.stringify({ key: 'value' }));
    });

    it('delete() should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await api.delete('/endpoint');

      const call = mockFetch.mock.calls[0];
      expect(call[1].method).toBe('DELETE');
    });

    it('should not send body for GET requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await api.get('/endpoint');

      const call = mockFetch.mock.calls[0];
      expect(call[1].body).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      await expect(api.get('/missing')).rejects.toThrow('Not found');
    });

    it('should use default error message when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(api.get('/error')).rejects.toThrow('Request failed (500)');
    });

    it('should set correct status code on ApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      try {
        await api.get('/forbidden');
        fail('Expected error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(403);
        expect(err.message).toBe('Forbidden');
      }
    });

    it('should use error field (priority) then message field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Fallback msg', error: 'Priority error' }),
      });

      await expect(api.get('/bad')).rejects.toThrow('Priority error');
    });

    it('should fall back to message field when error is absent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Only message' }),
      });

      await expect(api.get('/bad')).rejects.toThrow('Only message');
    });
  });

  describe('domain methods', () => {
    it('login() should call correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { token: 't', user: {} } }),
      });

      await api.login('test@test.com', 'password');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/auth/login');
      expect(call[1].method).toBe('POST');
      expect(call[1].body).toBe(JSON.stringify({ email: 'test@test.com', password: 'password' }));
    });

    it('getMe() should call correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.getMe();

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/auth/me');
      expect(call[1].method).toBe('GET');
    });

    it('getUsers() should include pagination params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.getUsers(2, 50, 'search-term');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('page=2');
      expect(url).toContain('limit=50');
      expect(url).toContain('search=search-term');
    });

    it('getProjects() should include filter params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.getProjects(1, 20, { status: 'active', userId: 'user-1' });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('status=active');
      expect(url).toContain('userId=user-1');
    });

    it('getHealth() should call /health endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { api: { status: 'up' } } }),
      });

      await api.getHealth();

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/health');
    });

    it('getMetrics() should call /admin/metrics endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await api.getMetrics();

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/admin/metrics');
    });

    it('getMCPTools() should call /admin/mcp/tools endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

      await api.getMCPTools();

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/admin/mcp/tools');
    });
  });
});

describe('ApiError', () => {
  it('should set name to ApiError', () => {
    const err = new ApiError('Test error', 404);
    expect(err.name).toBe('ApiError');
  });

  it('should set message correctly', () => {
    const err = new ApiError('Not found', 404);
    expect(err.message).toBe('Not found');
  });

  it('should set status correctly', () => {
    const err = new ApiError('Server error', 500);
    expect(err.status).toBe(500);
  });

  it('should be instance of Error', () => {
    const err = new ApiError('test', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});
