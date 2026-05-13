export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'moderator' | 'banned';
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
  projectCount?: number;
  totalCost?: number;
}

export type ProjectState = 'INIT' | 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

/** Maps backend state to display-friendly label */
export const PROJECT_STATE_LABEL: Record<string, string> = {
  INIT: 'Pending',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  DONE: 'Completed',
  FAILED: 'Failed',
};

export const PROJECT_STATE_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  INIT: 'warning',
  PENDING: 'warning',
  PROCESSING: 'info',
  DONE: 'success',
  FAILED: 'danger',
};

export interface Project {
  id: string;
  userId?: string;
  name?: string;
  prompt?: string;
  state: ProjectState;
  status?: string;
  progress?: number;
  files?: Record<string, string>;
  context?: Record<string, unknown>;
  deployUrl?: string;
  createdAt: string;
  updatedAt?: string;
  cost?: number;
  totalCost?: number;
  user?: { id: string; name: string; email: string } | null;
  eventCount?: number;
  costRecordCount?: number;
  fileCount?: number;
}

export interface Job {
  id: string;
  name?: string;
  projectId?: string;
  projectName?: string;
  userId?: string;
  state: string;
  progress: number;
  attempts?: number;
  attemptsMade?: number;
  timestamp?: string;
  createdAt?: string;
  processedOn?: string;
  finishedOn?: string;
  failedReason?: string | null;
}

export interface SystemHealth {
  redis?: { status: string; latencyMs?: number };
  database?: { status: string; latencyMs?: number };
  api?: string;
  queue?: string;
  uptime?: number;
  memory?: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
  };
  [key: string]: unknown;
}

export interface CostRecord {
  date: string;
  cost: number;
  tokens?: number;
  count?: number;
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

/** Actual response shape from GET /admin/metrics */
export interface DashboardMetrics {
  timestamp?: string;
  overview: {
    totalUsers: number;
    totalProjects: number;
    completedProjects?: number;
    failedProjects?: number;
    successRate: number;
    activeJobs: number;
  };
  dailyProjects: Array<{ date: string; count: number }>;
  systemHealth: SystemHealth;
  queueStats: QueueStats;
  sandboxMetrics?: Record<string, unknown>;
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
