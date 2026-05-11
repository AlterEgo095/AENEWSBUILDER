import { Users, FolderKanban, DollarSign, Activity, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import { AreaChartComponent } from '@/components/charts/AreaChart';
import { BarChartComponent } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { useApi } from '@/hooks/useApi';
import api from '@/lib/api';
import { SkeletonCard } from '@/components/ui/Skeleton';

const sampleProjects = [
  { date: 'Jan 1', count: 12 },
  { date: 'Jan 2', count: 18 },
  { date: 'Jan 3', count: 8 },
  { date: 'Jan 4', count: 24 },
  { date: 'Jan 5', count: 16 },
  { date: 'Jan 6', count: 30 },
  { date: 'Jan 7', count: 22 },
  { date: 'Jan 8', count: 28 },
  { date: 'Jan 9', count: 20 },
  { date: 'Jan 10', count: 35 },
  { date: 'Jan 11', count: 26 },
  { date: 'Jan 12', count: 32 },
];

const sampleRevenue = [
  { date: 'Jan 1', revenue: 120 },
  { date: 'Jan 2', revenue: 180 },
  { date: 'Jan 3', revenue: 90 },
  { date: 'Jan 4', revenue: 240 },
  { date: 'Jan 5', revenue: 160 },
  { date: 'Jan 6', revenue: 300 },
  { date: 'Jan 7', revenue: 220 },
  { date: 'Jan 8', revenue: 280 },
  { date: 'Jan 9', revenue: 200 },
  { date: 'Jan 10', revenue: 350 },
  { date: 'Jan 11', revenue: 260 },
  { date: 'Jan 12', revenue: 320 },
];

const sampleFrameworks = [
  { name: 'Next.js', count: 145 },
  { name: 'React', count: 98 },
  { name: 'Vue', count: 67 },
  { name: 'SvelteKit', count: 45 },
  { name: 'Astro', count: 38 },
  { name: 'Express', count: 28 },
];

const statusData = [
  { name: 'Completed', value: 342, color: '#10B981' },
  { name: 'Processing', value: 28, color: '#3B82F6' },
  { name: 'Failed', value: 15, color: '#EF4444' },
  { name: 'Pending', value: 8, color: '#F59E0B' },
];

export default function Dashboard() {
  const { data: metrics, loading } = useApi(() => api.getMetrics(), {
    onError: () => { /* use fallback data */ },
  });

  const m = metrics?.data;

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
              value={m?.totalUsers?.toLocaleString() ?? '1,247'}
              change={m ? 12.5 : 12}
              changeLabel="vs last month"
              color="brand"
              data={[20, 25, 22, 30, 28, 35, 32, 40, 38, 45, 42, 48]}
            />
            <StatsCard
              icon={<FolderKanban size={18} />}
              label="Total Projects"
              value={m?.totalProjects?.toLocaleString() ?? '3,891'}
              change={m ? 8.3 : 8}
              changeLabel="vs last month"
              color="accent"
              data={[30, 35, 40, 38, 45, 50, 48, 55, 52, 60, 58, 65]}
            />
            <StatsCard
              icon={<DollarSign size={18} />}
              label="Revenue"
              value={m?.totalRevenue != null ? `$${m.totalRevenue.toLocaleString()}` : '$24,580'}
              change={m ? 15.2 : 15}
              changeLabel="vs last month"
              color="success"
              data={[10, 15, 12, 20, 18, 25, 22, 30, 28, 35, 32, 38]}
            />
            <StatsCard
              icon={<Activity size={18} />}
              label="Active Jobs"
              value={m?.activeJobs ?? 14}
              change={-3.1}
              changeLabel="vs yesterday"
              color="warning"
              data={[8, 12, 10, 15, 14, 18, 16, 20, 18, 14, 12, 14]}
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Projects Over Time */}
        <Card className="lg:col-span-2" padding="none">
          <div className="p-5 pb-0">
            <CardHeader>
              <CardTitle>Projects Over Time</CardTitle>
              <Badge variant="success" pulse>Live</Badge>
            </CardHeader>
          </div>
          <div className="px-2 pb-2">
            <AreaChartComponent
              data={m?.dailyProjects || sampleProjects}
              dataKey="count"
              xAxisKey="date"
              color="#3B82F6"
              height={260}
            />
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
              data={statusData}
              centerLabel="Total"
              centerValue={String(m?.totalProjects || 393)}
              height={200}
            />
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue */}
        <Card padding="none">
          <div className="p-5 pb-0">
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
          </div>
          <div className="px-2 pb-2">
            <AreaChartComponent
              data={m?.dailyRevenue || sampleRevenue}
              dataKey="revenue"
              xAxisKey="date"
              color="#10B981"
              gradientId="revenueGradient"
              height={220}
            />
          </div>
        </Card>

        {/* Popular Frameworks */}
        <Card padding="none">
          <div className="p-5 pb-0">
            <CardHeader>
              <CardTitle>Popular Frameworks</CardTitle>
            </CardHeader>
          </div>
          <div className="px-2 pb-2">
            <BarChartComponent
              data={m?.popularFrameworks || sampleFrameworks}
              dataKey="count"
              xAxisKey="name"
              height={220}
              barSize={28}
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
          <HealthIndicator label="API Server" status="healthy" />
          <HealthIndicator label="Redis" status="healthy" />
          <HealthIndicator label="Database" status="healthy" />
          <HealthIndicator label="Queue" status="degraded" />
        </div>
      </Card>
    </div>
  );
}

function HealthIndicator({ label, status }: { label: string; status: 'healthy' | 'degraded' | 'down' }) {
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
        <Badge variant={c.variant} dot={false} className="mt-0.5">
          {status}
        </Badge>
      </div>
    </div>
  );
}
