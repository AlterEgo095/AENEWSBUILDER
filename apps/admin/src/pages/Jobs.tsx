import { useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import { StatsCard } from '@/components/ui/StatsCard';
import type { Job } from '@/types';

const stateVariant = {
  DONE: 'success' as const,
  PROCESSING: 'info' as const,
  FAILED: 'danger' as const,
  PENDING: 'warning' as const,
  ACTIVE: 'info' as const,
};

const sampleJobs: Job[] = Array.from({ length: 25 }, (_, i) => ({
  id: `job-${String(i + 1).padStart(3, '0')}`,
  projectId: `proj-${String((i % 10) + 1).padStart(3, '0')}`,
  state: (['DONE', 'DONE', 'DONE', 'PROCESSING', 'FAILED', 'PENDING'] as const)[i % 6],
  progress: [100, 100, 100, 67, 0, 0][i % 6],
  attempts: [1, 1, 1, 2, 3, 1][i % 6],
  createdAt: new Date(Date.now() - i * 3600000 * Math.random() * 24).toISOString(),
  processedAt: i % 6 < 3 ? new Date(Date.now() - i * 3600000 * 2).toISOString() : undefined,
  failedReason: i % 6 === 4 ? 'Timeout: AI generation exceeded 60s limit' : undefined,
}));

export default function Jobs() {
  const [page, setPage] = useState(1);
  const [stateFilter, setStateFilter] = useState('');

  const filtered = sampleJobs.filter(j => {
    if (stateFilter && j.state !== stateFilter) return false;
    return true;
  });

  const columns: TableColumn<Job>[] = [
    {
      key: 'id',
      header: 'Job ID',
      sortable: true,
      render: (j) => (
        <span className="font-mono text-xs text-zinc-400">{j.id}</span>
      ),
    },
    {
      key: 'projectId',
      header: 'Project',
      sortable: true,
      render: (j) => (
        <span className="font-mono text-xs text-brand-light">{j.projectId}</span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      sortable: true,
      render: (j) => <Badge variant={stateVariant[j.state as keyof typeof stateVariant] || 'neutral'}>{j.state}</Badge>,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (j) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full gradient-brand transition-all"
              style={{ width: `${j.progress}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400">{j.progress}%</span>
        </div>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      sortable: true,
      render: (j) => (
        <span className={j.attempts > 2 ? 'text-amber-400' : 'text-zinc-400'}>
          {j.attempts}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (j) => (
        <span className="text-xs text-zinc-400">
          {new Date(j.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'failedReason',
      header: 'Error',
      render: (j) => (
        j.failedReason ? (
          <span className="text-xs text-red-400 max-w-[200px] truncate block" title={j.failedReason}>
            {j.failedReason}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      render: (j) => (
        j.state === 'FAILED' ? (
          <Button variant="ghost" size="sm" iconLeft={<RefreshCw size={12} />}>
            Retry
          </Button>
        ) : null
      ),
    },
  ];

  const doneCount = sampleJobs.filter(j => j.state === 'DONE').length;
  const failedCount = sampleJobs.filter(j => j.state === 'FAILED').length;
  const activeCount = sampleJobs.filter(j => j.state === 'PROCESSING' || j.state === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          icon={<span className="text-emerald-400 text-sm font-bold">✓</span>}
          label="Completed"
          value={doneCount}
          color="success"
        />
        <StatsCard
          icon={<span className="text-blue-400 text-sm font-bold">⟳</span>}
          label="Active"
          value={activeCount}
          color="brand"
        />
        <StatsCard
          icon={<span className="text-red-400 text-sm font-bold">✕</span>}
          label="Failed"
          value={failedCount}
          color="danger"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {['', 'DONE', 'PROCESSING', 'PENDING', 'FAILED'].map(state => (
          <Button
            key={state}
            variant={stateFilter === state ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setStateFilter(state)}
          >
            {state || 'All'}
          </Button>
        ))}
        <div className="flex-1" />
        <Button variant="danger" size="sm" iconLeft={<Trash2 size={12} />}>
          Clear Failed
        </Button>
      </div>

      {/* Table */}
      <Card padding="none">
        <Table
          columns={columns}
          data={filtered}
          keyExtractor={j => j.id}
          pagination={{
            page,
            total: filtered.length,
            limit: 10,
            onPageChange: setPage,
          }}
          emptyMessage="No jobs found"
        />
      </Card>
    </div>
  );
}
