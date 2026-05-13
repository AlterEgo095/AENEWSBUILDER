import { Users, FolderKanban, Activity, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { AreaChartComponent } from '@/components/charts/AreaChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { useApi } from '@/hooks/useApi';
import api from '@/lib/api';
import { SkeletonCard } from '@/components/ui/Skeleton';

export default function Dashboard() {
  const { data: metrics, loading, error, refetch } = useApi(
    () => api.getMetrics(),
    { onError: () => { /* will show partial data */ } },
  );

  // Backend returns { overview: { totalUsers, totalProjects, ... }, dailyProjects, systemHealth, queueStats }
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

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
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
        </div>
      </Card>
    </div>
  );
}

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
