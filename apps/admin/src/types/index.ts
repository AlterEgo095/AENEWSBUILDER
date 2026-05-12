export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'banned';
  createdAt: string;
  lastLogin?: string;
  projectCount: number;
  totalCost: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  state: string;
  progress: number;
  files: Record<string, string>;
  deployUrl?: string;
  createdAt: string;
  updatedAt: string;
  cost: number;
  classification?: Record<string, unknown>;
}

export interface Job {
  id: string;
  projectId: string;
  state: string;
  progress: number;
  attempts: number;
  createdAt: string;
  processedAt?: string;
  failedReason?: string;
}

export interface SystemHealth {
  api: string;
  redis: string;
  database: string;
  queue: string;
  uptime: number;
  memory: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
  };
}

export interface CostRecord {
  date: string;
  projectCosts: Record<string, number>;
  totalCost: number;
}

export interface MCPToolInfo {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  invocations: number;
  successRate: number;
  avgLatency: number;
  lastUsed?: string;
}

export interface QueueStats {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DashboardMetrics {
  totalUsers: number;
  totalProjects: number;
  totalRevenue: number;
  activeJobs: number;
  successRate: number;
  avgGenerationTime: number;
  dailyProjects: Array<{ date: string; count: number }>;
  dailyRevenue: Array<{ date: string; revenue: number }>;
  popularFrameworks: Array<{ name: string; count: number }>;
  systemHealth: SystemHealth;
  queueStats: QueueStats;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface TableSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  width?: string;
}
