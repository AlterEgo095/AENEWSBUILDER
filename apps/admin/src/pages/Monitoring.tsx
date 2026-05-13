import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Server, Database, HardDrive, Clock,
  RefreshCw, Zap,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Health Card ─────────────────────────────────────────────────────────────

function HealthCard({ title, icon: Icon, status, details }: {
  title: string;
  icon: React.ElementType;
  status: 'up' | 'down' | 'unknown';
  details: React.ReactNode;
}) {
  const isUp = status === 'up';
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${isUp ? 'text-emerald-400' : status === 'down' ? 'text-red-400' : 'text-zinc-500'}`} />
          <h3 className="text-sm font-medium text-white">{title}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
          isUp ? 'bg-emerald-500/15 text-emerald-400' : status === 'down' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-500/15 text-zinc-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {status}
        </span>
      </div>
      {details}
    </div>
  );
}

// ─── Active Job Row ──────────────────────────────────────────────────────────

function ActiveJobRow({ job }: { job: any }) {
  const stateColors: Record<string, string> = {
    active: 'text-blue-400 bg-blue-500/15',
    waiting: 'text-amber-400 bg-amber-500/15',
    completed: 'text-emerald-400 bg-emerald-500/15',
    failed: 'text-red-400 bg-red-500/15',
  };

  return (
    <div className="flex items-center gap-4 py-2.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500">{(job.id || '').slice(0, 16)}</span>
          <span className="text-sm text-white truncate">{job.projectName || job.name || 'Unknown'}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${stateColors[job.state] ?? 'text-gray-400 bg-gray-500/15'}`}>
            {job.state}
          </span>
        </div>
      </div>
      <div className="w-32">
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full gradient-brand transition-all"
            style={{ width: `${job.progress || 0}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-14 text-right">{job.progress || 0}%</span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [activeJobs, setActiveJobs] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [m, q] = await Promise.all([
        api.getMetrics(),
        api.getQueueStats(),
      ]);
      setMetrics(m);
      setQueueStats(q);
      setLastRefresh(new Date());

      // Get active/waiting jobs from queue
      const jobsRes = await api.getJobs(1, 50, { state: 'active' });
      setActiveJobs((jobsRes.data || []).slice(0, 10));

      // Also get waiting jobs
      const waitingRes = await api.getJobs(1, 50, { state: 'waiting' });
      setActiveJobs(prev => [...prev, ...(waitingRes.data || []).slice(0, 5)]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-600 border-t-blue-400 rounded-full" />
      </div>
    );
  }

  const sysHealth = metrics?.systemHealth || {};
  const qCounts = queueStats?.counts || {};
  const overview = metrics?.overview || {};

  return (
    <div className="max-w-[1600px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">System Monitoring</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Last: {lastRefresh.toLocaleTimeString()}</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
              }`}
            >
              {autoRefresh ? 'Auto (10s)' : 'Manual'}
            </button>
            <button onClick={fetchData} className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400 mb-4">
            {error} <button onClick={fetchData} className="underline ml-2">Retry</button>
          </div>
        )}

        {/* System Health */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <HealthCard
            title="API Server"
            icon={Server}
            status="up"
            details={
              <p className="text-xs text-zinc-500 mt-1">Running</p>
            }
          />
          <HealthCard
            title="PostgreSQL"
            icon={Database}
            status={sysHealth.database?.status === 'up' ? 'up' : 'down'}
            details={
              <div className="space-y-1">
                <p className="text-xs text-zinc-500">
                  Latency: <span className="text-white font-medium">{sysHealth.database?.latencyMs ?? '-'}ms</span>
                </p>
              </div>
            }
          />
          <HealthCard
            title="Redis"
            icon={HardDrive}
            status={sysHealth.redis?.status === 'up' ? 'up' : 'down'}
            details={
              <div className="space-y-1">
                <p className="text-xs text-zinc-500">
                  Latency: <span className="text-white font-medium">{sysHealth.redis?.latencyMs ?? '-'}ms</span>
                </p>
              </div>
            }
          />
          <HealthCard
            title="BullMQ Queue"
            icon={Zap}
            status={(qCounts.failed || 0) > 10 ? 'down' : 'up'}
            details={
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/15 text-blue-400">{qCounts.active || 0} active</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/15 text-amber-400">{qCounts.waiting || 0} waiting</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/15 text-emerald-400">{(qCounts.completed || 0).toLocaleString()} done</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-500/15 text-red-400">{qCounts.failed || 0} failed</span>
              </div>
            }
          />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Users</p>
            <p className="text-xl font-bold text-white">{overview.totalUsers ?? '-'}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Projects</p>
            <p className="text-xl font-bold text-white">{overview.totalProjects ?? '-'}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Success Rate</p>
            <p className="text-xl font-bold text-white">{overview.successRate ? `${overview.successRate}%` : '-'}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Active Jobs</p>
            <p className="text-xl font-bold text-white">{overview.activeJobs ?? qCounts.active ?? 0}</p>
          </div>
        </div>

        {/* Active Jobs */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-medium text-white">Active Jobs</h3>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/15 text-blue-400">
                {activeJobs.length} running
              </span>
            </div>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
            {activeJobs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No active jobs</p>
            ) : (
              activeJobs.map((job) => <ActiveJobRow key={job.id} job={job} />)
            )}
          </div>
        </div>

        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        `}</style>
    </div>
  );
}
