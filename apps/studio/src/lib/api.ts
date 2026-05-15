/**
 * Studio API Client - Centralized HTTP client with auth, retry, and error handling
 */

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class StudioApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_API_URL || '/api';
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('aenews:token');
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
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
            throw new ApiError('Session expired. Please sign in again.', 401);
          }
          throw new ApiError(`Server returned ${res.status} (${res.statusText})`, res.status);
        }
        throw new ApiError('Invalid response from server', res.status);
      }

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          this.handleUnauthorized();
          throw new ApiError('Session expired. Please sign in again.', 401);
        }
        const message = data?.error || data?.message || `Request failed (${res.status})`;
        throw new ApiError(message, res.status);
      }

      return data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return this.request<T>(method, path, body, retries - 1);
      }
      throw new ApiError('Network error. Please check your connection.', 0);
    }
  }

  private handleUnauthorized() {
    localStorage.removeItem('aenews:token');
    localStorage.removeItem('aenews:user');
    if (window.location.pathname !== '/') {
      window.location.href = '/';
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
    return this.post<ApiResponse<{ token: string; user: any }>>('/auth/login', { email, password });
  }

  async register(email: string, password: string, name: string) {
    return this.post<ApiResponse<{ token: string; user: any }>>('/auth/register', { email, password, name });
  }

  async verify() {
    return this.get<{ valid: boolean; user: any }>('/auth/verify');
  }

  // Projects
  async createProject(name: string, prompt: string) {
    return this.post<ApiResponse<{ projectId: string }>>('/projects', { name, prompt });
  }

  async getProject(projectId: string) {
    return this.get<any>(`/projects/${projectId}`);
  }

  async listProjects() {
    return this.get<ApiResponse<any[]>>('/projects');
  }

  async deleteProject(projectId: string) {
    return this.delete<any>(`/projects/${projectId}`);
  }

  // Health
  async health() {
    return this.get<any>('/health');
  }

  // Chat
  async chat(message: string, projectId?: string) {
    return this.post<ApiResponse<any>>('/chat', { message, projectId });
  }
}

const api = new StudioApiClient();
export { ApiError, StudioApiClient };
export default api;

