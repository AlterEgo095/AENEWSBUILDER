import type {
  ApiResponse,
  DashboardMetrics,
  User,
  Project,
  Job,
  SystemHealth,
  CostRecord,
  MCPToolInfo,
  QueueStats,
  PaginatedResponse,
} from '@/types';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_API_URL || '/api';
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('admin_token');
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = {
      method,
      headers: this.headers,
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    const data = await res.json();

    if (!res.ok) {
      const message = data?.error || data?.message || `Request failed (${res.status})`;
      throw new ApiError(message, res.status);
    }

    return data as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ─── Auth ────────────────────────────────────
  // API returns { success, token, user } but admin expects { success, data: { token, user } }
  async login(email: string, password: string) {
    const res = await this.post<{ success: boolean; token: string; user: User; error?: string }>('/auth/login', { email, password });
    if (res.success && res.token) {
      return {
        success: true,
        data: { token: res.token, user: res.user },
      } as ApiResponse<{ token: string; user: User }>;
    }
    return {
      success: false,
      error: res.error || 'Login failed',
    } as ApiResponse<{ token: string; user: User }>;
  }

  async register(email: string, password: string, name: string) {
    return this.post<ApiResponse<{ token: string; user: User }>>('/auth/register', { email, password, name });
  }

  async getMe() {
    // /auth/me returns the user if authenticated, or 401
    const res = await this.get<User | { valid: boolean; user: User }>('/auth/me');
    // Map to ApiResponse<User>
    if ('valid' in res && res.user) {
      return { success: res.valid, data: res.user } as ApiResponse<User>;
    }
    if ('id' in res) {
      return { success: true, data: res as User } as ApiResponse<User>;
    }
    return { success: false, error: 'Not authenticated' } as ApiResponse<User>;
  }

  // ─── Users ───────────────────────────────────
  async getUsers(page = 1, limit = 20, search?: string) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    return this.get<ApiResponse<PaginatedResponse<User>>>(`/admin/users?${params}`);
  }

  async updateUser(id: string, data: Partial<User>) {
    return this.put<ApiResponse<User>>(`/admin/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete<ApiResponse<void>>(`/admin/users/${id}`);
  }

  // ─── Projects ────────────────────────────────
  async getProjects(page = 1, limit = 20, filters?: { status?: string; userId?: string }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.status) params.set('status', filters.status);
    if (filters?.userId) params.set('userId', filters.userId);
    return this.get<ApiResponse<PaginatedResponse<Project>>>(`/admin/projects?${params}`);
  }

  async getProject(id: string) {
    return this.get<ApiResponse<Project>>(`/admin/projects/${id}`);
  }

  async deleteProject(id: string) {
    return this.delete<ApiResponse<void>>(`/admin/projects/${id}`);
  }

  // ─── Jobs ────────────────────────────────────
  async getJobs(page = 1, limit = 20, filters?: { state?: string; projectId?: string }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.state) params.set('state', filters.state);
    if (filters?.projectId) params.set('projectId', filters.projectId);
    return this.get<ApiResponse<PaginatedResponse<Job>>>(`/admin/jobs?${params}`);
  }

  async retryJob(id: string) {
    return this.post<ApiResponse<Job>>(`/admin/jobs/${id}/retry`);
  }

  // ─── Dashboard & Metrics ─────────────────────
  async getMetrics() {
    return this.get<ApiResponse<DashboardMetrics>>('/admin/metrics');
  }

  async getHealth() {
    return this.get<ApiResponse<SystemHealth>>('/health');
  }

  async getDetailedHealth() {
    return this.get<ApiResponse<SystemHealth & Record<string, unknown>>>('/health/detailed');
  }

  // ─── Costs ───────────────────────────────────
  async getCosts(from?: string, to?: string) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return this.get<ApiResponse<CostRecord[]>>(`/admin/costs?${params}`);
  }

  // ─── MCP Tools ───────────────────────────────
  async getMCPTools() {
    return this.get<ApiResponse<MCPToolInfo[]>>('/admin/mcp/tools');
  }

  async toggleMCPTool(id: string, enabled: boolean) {
    return this.put<ApiResponse<MCPToolInfo>>(`/admin/mcp/tools/${id}`, { enabled });
  }

  // ─── Queue ───────────────────────────────────
  async getQueueStats() {
    return this.get<ApiResponse<QueueStats>>('/admin/queue/stats');
  }

  async clearFailedJobs() {
    return this.post<ApiResponse<void>>('/admin/queue/clear-failed');
  }

  // ─── Settings ────────────────────────────────
  async getSettings() {
    return this.get<ApiResponse<Record<string, unknown>>>('/admin/settings');
  }

  async updateSettings(data: Record<string, unknown>) {
    return this.put<ApiResponse<Record<string, unknown>>>('/admin/settings', data);
  }
}

export const api = new ApiClient();
export { ApiError };
export default api;
