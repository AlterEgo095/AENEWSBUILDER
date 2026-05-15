/**
 * Admin API Client - With retry logic and auto-logout on 401
 */

import type {
  ApiResponse,
  User,
  SystemHealth,
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
    const token = localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }

  private handleUnauthorized() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    if (window.location.pathname !== '/admin/') {
      window.location.href = '/admin/';
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 1,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = {
      method,
      headers: this.headers,
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(url, opts);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (!res.ok) {
          if (res.status === 401) {
            this.handleUnauthorized();
          }
          throw new ApiError(`Server returned ${res.status} (${res.statusText})`, res.status);
        }
        throw new ApiError('Invalid response from server', res.status);
      }

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          this.handleUnauthorized();
        }
        const message = data?.error || data?.message || `Request failed (${res.status})`;
        throw new ApiError(message, res.status);
      }

      return data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network error — retry once
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return this.request<T>(method, path, body, retries - 1);
      }
      throw new ApiError('Network error. Please check your connection.', 0);
    }
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

  // Auth
  async login(email: string, password: string) {
    return this.post<ApiResponse<{ token: string; user: User }>>('/auth/login', { email, password });
  }

  async register(email: string, password: string, name: string) {
    return this.post<ApiResponse<{ token: string; user: User }>>('/auth/register', { email, password, name });
  }

  async getMe() {
    const res = await this.get<{ valid: boolean; user: User }>('/auth/verify');
    return {
      success: res.valid,
      data: res.user,
    } as ApiResponse<User>;
  }

  // Users
  async getUsers(page = 1, limit = 20, search?: string) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    return this.get<PaginatedResponse<User>>(`/admin/users?${params}`);
  }

  async updateUser(id: string, data: Partial<User>) {
    return this.put<ApiResponse<User>>(`/admin/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete<ApiResponse<void>>(`/admin/users/${id}`);
  }

  // Projects
  async getProjects(page = 1, limit = 20, filters?: { status?: string; userId?: string }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.status) params.set('status', filters.status);
    if (filters?.userId) params.set('userId', filters.userId);
    return this.get<PaginatedResponse<any>>(`/admin/projects?${params}`);
  }

  async getProject(id: string) {
    return this.get<Record<string, any>>(`/admin/projects/${id}`);
  }

  async deleteProject(id: string) {
    return this.delete<any>(`/admin/projects/${id}`);
  }

  // Jobs
  async getJobs(page = 1, limit = 20, filters?: { state?: string; projectId?: string }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.state) params.set('state', filters.state);
    if (filters?.projectId) params.set('projectId', filters.projectId);
    return this.get<PaginatedResponse<any>>(`/admin/jobs?${params}`);
  }

  async retryJob(id: string) {
    return this.post<any>(`/admin/jobs/${id}/retry`);
  }

  // Dashboard & Metrics
  async getMetrics() {
    return this.get<any>('/admin/metrics');
  }

  async getHealth() {
    return this.get<SystemHealth>('/health');
  }

  async getDetailedHealth() {
    return this.get<any>('/health/detailed');
  }

  // Settings
  async getSettings() {
    return this.get<Record<string, string>>('/admin/settings');
  }

  async updateSettings(settings: Record<string, string>) {
    return this.put<ApiResponse<void>>('/admin/settings', settings);
  }

  // Costs
  async getCosts(page = 1, limit = 20) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    return this.get<PaginatedResponse<any>>(`/admin/costs?${params}`);
  }

  // MCP Tools
  async getMCPTools() {
    return this.get<any[]>('/admin/mcp/tools');
  }

  async toggleMCPTool(id: string, enabled: boolean) {
    return this.put<ApiResponse<void>>(`/admin/mcp/tools/${id}`, { enabled });
  }
}

const api = new ApiClient();
export { ApiError, ApiClient };
export default api;

