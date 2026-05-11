'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, Server, Database, HardDrive, Clock, CheckCircle2,
  AlertTriangle, XCircle, Info, AlertCircle, RefreshCw, Cpu,
  MemoryStick, Zap, Timer, Filter, ArrowUp, ArrowDown, Minus,
  ChevronRight, Play, Pause,
} from 'lucide-react';
import {
  mockHealthData,
  mockResourceMetrics,
  mockLogEvents,
  mockJobs,
  mockQueueStats,
} from '../data/mock-data';
import type { SystemHealth, LogEvent, ResourceMetrics, Job } from '../types';

// ─── Mini Area Chart (SVG) ───────────────────────────────────────────────────

function MiniAreaChart({ data, color = '#3b82f6', height = 60 }: {
  data: { time: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 300;
  const h = height;
  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - ((v - min) / range) * (h - 4) - 2,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Mini Bar Chart (SVG) ────────────────────────────────────────────────────

function MiniBarChart({ data, color = '#8b5cf6', height = 60 }: {
  data: { time: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value));
  const w = 300;
  const h = height;
  const barWidth = Math.max(4, (w / data.length) * 0.6);
  const gap = (w - barWidth * data.length) / (data.length + 1);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = max > 0 ? (d.value / max) * (h - 4) : 0;
        const x = gap + i * (barWidth + gap);
        return (
          <rect
            key={i}
            x={x}
            y={h - barH}
            width={barWidth}
            height={barH}
            rx={1}
            fill={color}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

// ─── Multi-line Chart ────────────────────────────────────────────────────────

function MultiLineChart({ data, height = 60 }: {
  data: { time: string; p50: number; p95: number; p99: number }[];
  height?: number;
}) {
  if (data.length < 2) return null;

  const allValues = data.flatMap((d) => [d.p50, d.p95, d.p99]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const w = 300;
  const h = height;

  const makePath = (key: 'p50' | 'p95' | 'p99') =>
    data.map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d[key] - min) / range) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

  const lines = [
    { key: 'p50' as const, color: '#10b981', label: 'P50' },
    { key: 'p95' as const, color: '#f59e0b', label: 'P95' },
    { key: 'p99' as const, color: '#ef4444', label: 'P99' },
  ];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        {lines.map(({ key, color }) => (
          <path key={key} d={makePath(key)} fill="none" stroke={color} strokeWidth="1.5" />
        ))}
      </svg>
      <div className="flex items-center justify-center gap-4 mt-1">
        {lines.map(({ key, color, label }) => (
          <span key={key} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-0.5 rounded" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Health Card ─────────────────────────────────────────────────────────────

function HealthCard({ title, icon: Icon, status, details, extra }: {
  title: string;
  icon: React.ElementType;
  status: 'up' | 'down';
  details: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const isUp = status === 'up';
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${isUp ? 'text-emerald-400' : 'text-red-400'}`} />
          <h3 className="text-sm font-medium text-white">{title}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
          isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-red-400'} ${isUp ? 'animate-pulse' : ''}`} />
          {isUp ? 'Up' : 'Down'}
        </span>
      </div>
      {details}
      {extra}
    </div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = 'blue' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
  };
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorMap[color] ?? 'bg-blue-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Active Job Row ──────────────────────────────────────────────────────────

function ActiveJobRow({ job }: { job: Job }) {
  const stateColors: Record<string, string> = {
    active: 'text-blue-400 bg-blue-500/15',
    waiting: 'text-amber-400 bg-amber-500/15',
    completed: 'text-emerald-400 bg-emerald-500/15',
    failed: 'text-red-400 bg-red-500/15',
    stalled: 'text-orange-400 bg-orange-500/15',
    delayed: 'text-purple-400 bg-purple-500/15',
  };

  const elapsed = job.elapsed;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="flex items-center gap-4 py-2.5 px-3 rounded-lg hover:bg-white/5 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500">{job.id}</span>
          <span className="text-sm text-white truncate">{job.projectName}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${stateColors[job.state] ?? 'text-gray-400 bg-gray-500/15'}`}>
            {job.state}
          </span>
        </div>
      </div>
      <div className="w-32">
        <ProgressBar value={job.progress} max={100} color={job.progress > 80 ? 'emerald' : job.progress > 40 ? 'blue' : 'amber'} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-14 text-right">{job.progress}%</span>
      <div className="flex items-center gap-1 text-xs text-gray-500 w-16 justify-end">
        <Clock className="w-3 h-3" />
        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
      </div>
    </div>
  );
}

// ─── Log Event Row ───────────────────────────────────────────────────────────

function LogEventRow({ event }: { event: LogEvent }) {
  const levelConfig: Record<string, { icon: React.ElementType; color: string }> = {
    info: { icon: Info, color: 'text-blue-400' },
    warn: { icon: AlertTriangle, color: 'text-amber-400' },
    error: { icon: XCircle, color: 'text-red-400' },
    debug: { icon: Activity, color: 'text-gray-400' },
  };
  const cfg = levelConfig[event.level] ?? levelConfig.info;
  const LevelIcon = cfg.icon;

  const time = new Date(event.timestamp);
  const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className={`flex items-start gap-2 py-1.5 px-3 rounded text-xs font-mono hover:bg-white/5 transition-colors ${
      event.level === 'error' ? 'bg-red-500/5' : event.level === 'warn' ? 'bg-amber-500/5' : ''
    }`}>
      <span className="text-gray-600 tabular-nums shrink-0">{timeStr}</span>
      <LevelIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
      <span className="text-gray-500 shrink-0">[{event.source}]</span>
      <span className="text-gray-300 break-all">{event.message}</span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [health, setHealth] = useState<SystemHealth>(mockHealthData);
  const [metrics, setMetrics] = useState<ResourceMetrics>(mockResourceMetrics);
  const [logs, setLogs] = useState<LogEvent[]>(mockLogEvents);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Simulate auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setLastRefresh(new Date());
      // Simulate metric changes
      setMetrics((prev) => ({
        memory: prev.memory.map((p) => ({ ...p, value: Math.max(1.5, p.value + (Math.random() - 0.5) * 0.3) })),
        cpu: prev.cpu.map((p) => ({ ...p, value: Math.max(2, Math.min(95, p.value + (Math.random() - 0.5) * 8)) })),
        queueThroughput: prev.queueThroughput.map((p) => ({ ...p, value: Math.max(1, p.value + (Math.random() - 0.5) * 5) })),
        responseTime: prev.responseTime.map((p) => ({
          ...p,
          p50: Math.max(10, p.p50 + (Math.random() - 0.5) * 15),
          p95: Math.max(50, p.p95 + (Math.random() - 0.5) * 30),
          p99: Math.max(100, p.p99 + (Math.random() - 0.5) * 50),
        })),
      }));
      // Simulate new log event
      setLogs((prev) => {
        const newEvent: LogEvent = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: (['info', 'info', 'info', 'warn', 'error'] as const)[Math.floor(Math.random() * 5)],
          source: ['api', 'queue', 'worker-1', 'worker-2', 'mcp-executor'][Math.floor(Math.random() * 5)],
          message: 'Auto-refresh health check completed successfully',
        };
        return [newEvent, ...prev].slice(0, 100);
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs.length, autoScroll]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter((l) => l.level === logFilter);
  }, [logs, logFilter]);

  const activeJobs = mockJobs.filter((j) => j.state === 'active' || j.state === 'waiting');
  const memPct = Math.round((metrics.memory[metrics.memory.length - 1]?.value ?? 0 / 8) * 100);
  const cpuPct = Math.round(metrics.cpu[metrics.cpu.length - 1]?.value ?? 0);

  return (
    <div className="min-h-screen bg-[#0A0B0E]">
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">System Monitoring</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoRefresh
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
              }`}
            >
              {autoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              Auto-refresh (10s)
            </button>
            <button
              onClick={() => setLastRefresh(new Date())}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* System Health Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <HealthCard
            title="API Server"
            icon={Server}
            status={health.api.status}
            details={
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Latency</span>
                  <span className="text-white font-medium">{health.api.latency}ms</span>
                </div>
                <ProgressBar value={health.api.latency} max={500} color={health.api.latency < 100 ? 'emerald' : health.api.latency < 300 ? 'amber' : 'red'} />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Uptime</span>
                  <span className="text-emerald-400 font-medium">{health.api.uptime}</span>
                </div>
              </div>
            }
          />

          <HealthCard
            title="PostgreSQL"
            icon={Database}
            status={health.postgresql.status}
            details={
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Connection Pool</span>
                  <span className="text-white font-medium">{health.postgresql.connections}/{health.postgresql.maxConnections}</span>
                </div>
                <ProgressBar value={health.postgresql.connections} max={health.postgresql.maxConnections} color="blue" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Pool Usage</span>
                  <span className="text-blue-400 font-medium">{Math.round(health.postgresql.poolUsage * 100)}%</span>
                </div>
              </div>
            }
          />

          <HealthCard
            title="Redis"
            icon={HardDrive}
            status={health.redis.status}
            details={
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Memory</span>
                  <span className="text-white font-medium">{health.redis.memoryUsage}/{health.redis.maxMemory} MB</span>
                </div>
                <ProgressBar value={health.redis.memoryUsage} max={health.redis.maxMemory} color="amber" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Cache Hit Rate</span>
                  <span className="text-emerald-400 font-medium">{health.redis.hitRate}%</span>
                </div>
              </div>
            }
          />

          <HealthCard
            title="BullMQ Queue"
            icon={Zap}
            status="up"
            details={
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/15 text-blue-400">{health.bullmq.active} active</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/15 text-amber-400">{health.bullmq.waiting} waiting</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/15 text-emerald-400">{health.bullmq.completed.toLocaleString()} done</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-500/15 text-red-400">{health.bullmq.failed} failed</span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/15 text-purple-400">{health.bullmq.delayed} delayed</span>
              </div>
            }
          />
        </div>

        {/* Resource Usage Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Memory */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MemoryStick className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Memory Usage</h3>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-white">{metrics.memory[metrics.memory.length - 1]?.value.toFixed(1)}</span>
                <span className="text-xs text-gray-500 ml-1">/ 8 GB</span>
              </div>
            </div>
            <MiniAreaChart data={metrics.memory} color="#8b5cf6" height={80} />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>60 min ago</span>
              <span className={memPct > 80 ? 'text-red-400' : memPct > 60 ? 'text-amber-400' : 'text-emerald-400'}>
                {memPct}% used
              </span>
              <span>Now</span>
            </div>
          </div>

          {/* CPU */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">CPU Usage</h3>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-white">{cpuPct}</span>
                <span className="text-xs text-gray-500 ml-1">%</span>
              </div>
            </div>
            <MiniAreaChart data={metrics.cpu} color="#3b82f6" height={80} />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>60 min ago</span>
              <span className={cpuPct > 80 ? 'text-red-400' : cpuPct > 60 ? 'text-amber-400' : 'text-emerald-400'}>
                {cpuPct > 80 ? 'High load' : cpuPct > 40 ? 'Moderate' : 'Normal'}
              </span>
              <span>Now</span>
            </div>
          </div>

          {/* Queue Throughput */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-medium text-white">Queue Throughput</h3>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-white">{mockQueueStats.throughputPerMinute}</span>
                <span className="text-xs text-gray-500 ml-1">jobs/min</span>
              </div>
            </div>
            <MiniBarChart data={metrics.queueThroughput} color="#f59e0b" height={80} />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>60 min ago</span>
              <span className="text-emerald-400">{mockQueueStats.totalProcessed.toLocaleString()} total processed</span>
              <span>Now</span>
            </div>
          </div>

          {/* Response Time */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-medium text-white">API Response Time</h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400">P50: {metrics.responseTime[metrics.responseTime.length - 1]?.p50}ms</span>
                <span className="text-amber-400">P95: {metrics.responseTime[metrics.responseTime.length - 1]?.p95}ms</span>
                <span className="text-red-400">P99: {metrics.responseTime[metrics.responseTime.length - 1]?.p99}ms</span>
              </div>
            </div>
            <MultiLineChart data={metrics.responseTime} height={80} />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>60 min ago</span>
              <span>Now</span>
            </div>
          </div>
        </div>

        {/* Active Jobs + Event Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active Jobs */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
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

          {/* Event Stream */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Event Stream</h3>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/15 text-purple-400">
                  Live
                </span>
              </div>
              <div className="flex items-center gap-1">
                {(['all', 'info', 'warn', 'error'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setLogFilter(level)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                      logFilter === level
                        ? level === 'all' ? 'bg-white/10 text-white'
                        : level === 'error' ? 'bg-red-500/15 text-red-400'
                        : level === 'warn' ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-blue-500/15 text-blue-400'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {level.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={logContainerRef}
              className="space-y-0.5 max-h-80 overflow-y-auto custom-scrollbar font-mono"
            >
              {filteredLogs.slice(0, 50).map((event) => (
                <LogEventRow key={event.id} event={event} />
              ))}
            </div>
          </div>
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
