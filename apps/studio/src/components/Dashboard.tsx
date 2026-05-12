import React, { useState, useEffect, useCallback, useRef } from 'react';

interface DashboardProps {
  token: string;
}

interface Project {
  id: string;
  name: string;
  prompt: string;
  state: string;
  deployUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalProjects: number;
  completed: number;
  failed: number;
  processing: number;
  queued: number;
  successRate: number;
}

interface HealthData {
  status: string;
  timestamp: string;
  uptime: number;
  services: {
    redis: string;
    database: string;
    queue: string;
    api: string;
  };
  queueStats: {
    active: number;
    waiting: number;
    failed: number;
    completed: number;
  };
}

export function Dashboard({ token }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      const [healthRes, projectsRes] = await Promise.all([
        fetch('/api/health', { headers }),
        fetch('/api/projects', { headers }),
      ]);

      if (!healthRes.ok) throw new Error('Failed to fetch health');

      const healthData = await healthRes.json();
      setHealth(healthData);

      if (projectsRes.ok) {
        const projData = await projectsRes.json();
        const projList = projData.projects || projData.data?.projects || [];
        setProjects(Array.isArray(projList) ? projList : []);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboardData().then(() => setLoading(false));

    intervalRef.current = setInterval(fetchDashboardData, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDashboardData]);

  // Compute stats from projects
  useEffect(() => {
    if (projects.length > 0) {
      const total = projects.length;
      const completed = projects.filter(p => p.state === 'DONE').length;
      const failed = projects.filter(p => p.state === 'FAILED').length;
      const processing = projects.filter(p => ['PLANNING', 'CODING', 'TESTING', 'BUILDING', 'DEPLOYING'].includes(p.state)).length;
      const queued = projects.filter(p => ['QUEUED', 'INIT', 'PENDING'].includes(p.state)).length;
      const resolved = completed + failed;
      setStats({
        totalProjects: total,
        completed,
        failed,
        processing,
        queued,
        successRate: resolved > 0 ? Math.round((completed / resolved) * 100) : 0,
      });
    } else {
      setStats({
        totalProjects: 0, completed: 0, failed: 0, processing: 0, queued: 0, successRate: 0,
      });
    }
  }, [projects]);

  const getStateBadge = (state: string) => {
    const colors: Record<string, string> = {
      DONE: '#10b981', FAILED: '#ef4444', INIT: '#6b7280', QUEUED: '#f59e0b',
      PLANNING: '#8b5cf6', CODING: '#3b82f6', TESTING: '#06b6d4', BUILDING: '#f97316',
      DEPLOYING: '#ec4899', PENDING: '#6b7280',
    };
    return colors[state] || '#6b7280';
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
          <p>Loading your workspace...</p>
        </div>
        <div className="loading-grid">
          {[1,2,3,4].map(i => <div key={i} className="skeleton-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">Real-time overview of your AI development workspace</p>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={fetchDashboardData}>&#x21BB; Refresh</button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>&#x26A0;&#xFE0F; {error}</span>
          <button onClick={() => setError('')}>&#x2715;</button>
        </div>
      )}

      {/* System Health Banner */}
      {health && (
        <div className="health-banner">
          <div className="health-item">
            <span className={`health-dot ${health.services.redis === 'up' ? 'up' : 'down'}`} />
            <span>Redis</span>
          </div>
          <div className="health-item">
            <span className={`health-dot ${health.services.database === 'up' ? 'up' : 'down'}`} />
            <span>Database</span>
          </div>
          <div className="health-item">
            <span className={`health-dot ${health.services.queue === 'up' ? 'up' : 'down'}`} />
            <span>Queue</span>
          </div>
          <div className="health-item">
            <span className={`health-dot ${health.services.api === 'up' ? 'up' : 'down'}`} />
            <span>API</span>
          </div>
          <div className="health-item uptime">
            Uptime: {formatUptime(health.uptime)}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            &#x1F4C1;
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.totalProjects || 0}</span>
            <span className="stat-label">Total Projects</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            &#x2705;
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.completed || 0}</span>
            <span className="stat-label">Completed</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
            &#x2699;&#xFE0F;
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.processing || 0}</span>
            <span className="stat-label">Processing</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: stats?.successRate && stats.successRate >= 70 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            &#x1F4C8;
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats?.successRate || 0}%</span>
            <span className="stat-label">Success Rate</span>
          </div>
        </div>
      </div>

      {/* Queue Stats */}
      {health?.queueStats && (
        <div className="queue-panel">
          <h3>Queue Status</h3>
          <div className="queue-stats">
            <div className="queue-stat">
              <span className="queue-label">Active</span>
              <span className="queue-value active">{health.queueStats.active}</span>
            </div>
            <div className="queue-stat">
              <span className="queue-label">Waiting</span>
              <span className="queue-value waiting">{health.queueStats.waiting}</span>
            </div>
            <div className="queue-stat">
              <span className="queue-label">Completed</span>
              <span className="queue-value completed">{health.queueStats.completed}</span>
            </div>
            <div className="queue-stat">
              <span className="queue-label">Failed</span>
              <span className="queue-value failed">{health.queueStats.failed}</span>
            </div>
          </div>
        </div>
      )}

      {/* Projects Table */}
      <div className="projects-panel">
        <div className="panel-header">
          <h3>Recent Projects</h3>
          <span className="project-count">{projects.length} projects</span>
        </div>
        {projects.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">&#x1F4ED;</span>
            <p>No projects yet</p>
            <p className="empty-hint">Go to &quot;New Project&quot; to create your first AI-generated app</p>
          </div>
        ) : (
          <div className="projects-table">
            <div className="table-header">
              <span className="col-name">Project</span>
              <span className="col-state">Status</span>
              <span className="col-time">Created</span>
            </div>
            {projects.map((project) => (
              <div key={project.id} className="table-row">
                <div className="col-name">
                  <span className="project-name">{project.name}</span>
                  <span className="project-prompt">{project.prompt.substring(0, 80)}...</span>
                </div>
                <div className="col-state">
                  <span
                    className="state-badge"
                    style={{ background: getStateBadge(project.state) + '22', color: getStateBadge(project.state), borderColor: getStateBadge(project.state) + '44' }}
                  >
                    {project.state}
                  </span>
                </div>
                <div className="col-time">
                  {timeAgo(project.createdAt)}
                  {project.deployUrl && (
                    <a href={project.deployUrl} target="_blank" rel="noopener noreferrer" className="deploy-link">
                      &#x1F680; View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
