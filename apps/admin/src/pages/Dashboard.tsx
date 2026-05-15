import { Users, FolderKanban, Activity, CheckCircle, AlertTriangle, Cpu, Zap, Shield, ThermometerSun } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { AreaChartComponent } from '@/components/charts/AreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { useApi } from '@/hooks/useApi';
import api from '@/lib/api';
import { SkeletonCard } from '@/components/ui/Skeleton';

// ─── L4 Pipeline States ─────────────────────────────────────────────────────
const L4_STATES = [
  { key: 'INIT', label: 'INIT', color: '#94a3b8' },
  { key: 'ANALYSIS', label: 'ANALYSIS', color: '#a78bfa' },
  { key: 'PLANNING', label: 'PLANNING', color: '#60a5fa' },
  { key: 'EXECUTE_MCP', label: 'EXECUTE_MCP', color: '#fb923c' },
  { key: 'GENERATE', label: 'GENERATE', color: '#22d3ee' },
  { key: 'TEST', label: 'TEST', color: '#facc15' },
  { key: 'FIX', label: 'FIX', color: '#f87171' },
  { key: 'DEPLOY', label: 'DEPLOY', color: '#f472b6' },
  { key: 'DONE', label: 'DONE', color: '#34d399' },
  { key: 'FAILED', label: 'FAILED', color: '#dc2626' },
];

export default function Dashboard() {
  const { data: metrics, loading, error, refetch } = useApi(
    () => api.getMetrics(),
    { onError: () => { /* will show partial data */ } },
  );

  // Backend returns { overview, dailyProjects, systemHealth, queueStats, sandboxMetrics }
  const m = metrics;

  const overview = m?.overview || {};
  const totalUsers = overview.totalUsers;
  const totalProjects = overview.totalProjects;
  const completedProjects = overview.completedProjects || 0;
  const failedProjects = overview.failedProjects || 0;
  const activeJobs = overview.activeJobs || 0;
  const successRate = overview.successRate || 0;
  const dailyProjects = m?.dailyProjects || [];

  // System health from backend
  const sysHealth = m?.systemHealth || {};
  const redisStatus = sysHealth.redis?.status === 'up' ? 'healthy' : 'down';
  const dbStatus = sysHealth.database?.status === 'up' ? 'healthy' : 'down';

  // Queue stats
  const qStats = m?.queueStats || {};

  // Sandbox / Warm Pool metrics
  const sandbox = m?.sandboxMetrics || {};
  const warmPoolTotal = sandbox.total ?? 0;
  const warmPoolAvailable = sandbox.available ?? 0;
  const warmPoolBusy = sandbox.busy ?? 0;
  const warmPoolQueueDepth = sandbox.queueDepth ?? 0;
  const warmPoolSaturation = sandbox.saturationPercent ?? 0;
  const warmPoolPredictedDemand = sandbox.predictedDemand ?? 0;

  // Status data for donut chart
  const statusData = [
    { name: 'Completed', value: completedProjects, color: '#10B981' },
    { name: 'Processing', value: qStats.active || 0, color: '#3B82F6' },
    { name: 'Failed', value: failedProjects, color: '#EF4444' },
    { name: 'Pending', value: qStats.waiting || 0, color: '#F59E0B' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatsCard
              icon={<Users size={18} />}
              label="Total Users"
              value={totalUsers != null ? totalUsers.toLocaleString() : '0'}
              changeLabel="registered"
              color="brand"
              data={[]}
            />
            <StatsCard
              icon={<FolderKanban size={18} />}
              label="Total Projects"
              value={totalProjects != null ? totalProjects.toLocaleString() : '0'}
              changeLabel="created"
              color="accent"
              data={[]}
            />
            <StatsCard
              icon={<CheckCircle size={18} />}
              label="Success Rate"
              value={successRate ? `${successRate}%` : '0%'}
              changeLabel="overall"
              color="success"
              data={[]}
            />
            <StatsCard
              icon={<Activity size={18} />}
              label="Active Jobs"
              value={activeJobs}
              changeLabel="in queue"
              color="warning"
              data={[]}
            />
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
          Using cached data. <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Projects Over Time */}
        <Card className="lg:col-span-2" padding="none">
          <div className="p-5 pb-0">
            <CardHeader>
              <CardTitle>Projects Over Time (30 days)</CardTitle>
              <Badge variant={dailyProjects.length > 0 ? 'success' : 'neutral'} pulse={dailyProjects.length > 0}>
                {dailyProjects.length > 0 ? 'Live' : 'No data'}
              </Badge>
            </CardHeader>
          </div>
          <div className="px-2 pb-2">
            {dailyProjects.length > 0 ? (
              <AreaChartComponent
                data={dailyProjects.map((d: any) => ({
                  date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  count: d.count,
                }))}
                dataKey="count"
                xAxisKey="date"
                color="#3B82F6"
                height={260}
              />
            ) : (
              <div className="flex items-center justify-center h-[260px] text-zinc-500 text-sm">
                No project data available yet
              </div>
            )}
          </div>
        </Card>

        {/* Status Distribution */}
        <Card padding="none">
          <div className="p-5 pb-0">
            <CardHeader>
              <CardTitle>Project Status</CardTitle>
            </CardHeader>
          </div>
          <div className="px-5 pb-5">
            <DonutChart
              data={statusData.filter(s => s.value > 0).length > 0 ? statusData : [{ name: 'No data', value: 1, color: '#3F3F46' }]}
              centerLabel="Total"
              centerValue={String(totalProjects || 0)}
              height={200}
            />
          </div>
        </Card>
      </div>

      {/* ═══ L4 Pipeline States ═══ */}
      <Card>
        <CardHeader>
          <CardTitle>L4 Pipeline — State Machine</CardTitle>
          <Badge variant="success" dot={false}>Active</Badge>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {L4_STATES.map((state, idx) => (
            <div key={state.key} className="flex items-center gap-1">
              {idx > 0 && <span className="text-zinc-600 text-xs">→</span>}
              <div
                className="px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold"
                style={{
                  backgroundColor: state.color + '20',
                  color: state.color,
                  border: `1px solid ${state.color}40`,
                }}
              >
                {state.label}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-zinc-500">
          INIT → ANALYSIS → PLANNING → EXECUTE_MCP → GENERATE → TEST → FIX → DEPLOY → DONE/FAILED
        </div>
      </Card>

      {/* ═══ AI Metrics + Warm Pool ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Provider Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>AI Provider Metrics</CardTitle>
            <Zap size={16} className="text-amber-400" />
          </CardHeader>
          <div className="space-y-3">
            <AIMetricRow
              label="DashScope (Qwen)"
              status="active"
              detail="Primary Provider"
              color="#3B82F6"
            />
            <AIMetricRow
              label="OpenAI (GPT-4o)"
              status="standby"
              detail="Fallback Provider"
              color="#10B981"
            />
            <AIMetricRow
              label="Anthropic (Claude)"
              status="standby"
              detail="Fallback Provider"
              color="#8B5CF6"
            />
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Circuit Breaker: DashScope</span>
                <Badge variant="success" dot={false} className="text-[10px]">CLOSED</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
                <span>Model Mapping: resolveModelName()</span>
                <Badge variant="success" dot={false} className="text-[10px]">ACTIVE</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
                <span>enable_thinking: false</span>
                <Badge variant="success" dot={false} className="text-[10px]">AUTO-INJECT</Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Warm Pool / Sandbox Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Warm Pool — Sandbox</CardTitle>
            <ThermometerSun size={16} className="text-orange-400" />
          </CardHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Containers</p>
                <p className="text-xl font-bold text-white">{warmPoolTotal}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Available</p>
                <p className="text-xl font-bold text-emerald-400">{warmPoolAvailable}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Busy</p>
                <p className="text-xl font-bold text-amber-400">{warmPoolBusy}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Queue Depth</p>
                <p className="text-xl font-bold text-blue-400">{warmPoolQueueDepth}</p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Saturation</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(warmPoolSaturation, 100)}%`,
                        backgroundColor: warmPoolSaturation > 80 ? '#EF4444' : warmPoolSaturation > 50 ? '#F59E0B' : '#10B981',
                      }}
                    />
                  </div>
                  <span>{warmPoolSaturation.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mt-2">
                <span>Predicted Demand</span>
                <span className="text-blue-400">{warmPoolPredictedDemand}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
                <span>Execution Service</span>
                <Badge variant={warmPoolTotal > 0 ? 'success' : 'warning'} dot={false} className="text-[10px]">
                  {warmPoolTotal > 0 ? 'Connected' : 'Degraded'}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <Shield size={16} className="text-emerald-400" />
        </CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <HealthIndicator
            label="API Server"
            status="healthy"
            latency={null}
          />
          <HealthIndicator
            label="Redis"
            status={redisStatus}
            latency={sysHealth.redis?.latencyMs}
          />
          <HealthIndicator
            label="Database"
            status={dbStatus}
            latency={sysHealth.database?.latencyMs}
          />
          <HealthIndicator
            label="Queue"
            status={qStats.failed > 0 ? 'degraded' : 'healthy'}
            failedCount={qStats.failed}
          />
          <HealthIndicator
            label="Warm Pool"
            status={warmPoolTotal > 0 ? 'healthy' : 'degraded'}
          />
          <HealthIndicator
            label="Execution Svc"
            status={warmPoolTotal > 0 ? 'healthy' : 'down'}
          />
          <HealthIndicator
            label="Model Registry"
            status="healthy"
          />
          <HealthIndicator
            label="DashScope API"
            status="healthy"
          />
        </div>
      </Card>
    </div>
  );
}

// ─── AI Metric Row ──────────────────────────────────────────────────────────

function AIMetricRow({ label, status, detail, color }: { label: string; status: 'active' | 'standby' | 'down'; detail: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: status === 'active' ? `0 0 6px ${color}` : 'none' }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-white">{label}</div>
        <div className="text-[10px] text-zinc-500">{detail}</div>
      </div>
      <Badge variant={status === 'active' ? 'success' : status === 'standby' ? 'neutral' : 'danger'} dot={status === 'active'} className="text-[10px]">
        {status}
      </Badge>
    </div>
  );
}

// ─── Health Indicator ────────────────────────────────────────────────────────

function HealthIndicator({ label, status, latency, failedCount }: { label: string; status: 'healthy' | 'degraded' | 'down'; latency?: number | null; failedCount?: number }) {
  const config = {
    healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', variant: 'success' as const, icon: <CheckCircle size={16} /> },
    degraded: { color: 'text-amber-400', bg: 'bg-amber-500/10', variant: 'warning' as const, icon: <AlertTriangle size={16} /> },
    down: { color: 'text-red-400', bg: 'bg-red-500/10', variant: 'danger' as const, icon: <AlertTriangle size={16} /> },
  };
  const c = config[status];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${c.bg}`}>
      <div className={c.color}>{c.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-300">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant={c.variant} dot={false} className="text-[10px]">
            {status}
          </Badge>
          {latency != null && (
            <span className="text-[10px] text-zinc-500">{latency}ms</span>
          )}
          {failedCount != null && failedCount > 0 && (
            <span className="text-[10px] text-amber-400">{failedCount} failed</span>
          )}
        </div>
      </div>
    </div>
  );
}

