import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, Loader2, ListTodo } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import { StatsCard } from '@/components/ui/StatsCard';
import api from '@/lib/api';

const stateVariant: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'neutral'> = {
  completed: 'success',
  active: 'info',
  waiting: 'warning',
  failed: 'danger',
  delayed: 'neutral',
  stalled: 'danger',
  prioritized: 'neutral',
};

export default function Jobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stateFilter, setStateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const limit = 20;

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getJobs(page, limit, stateFilter ? { state: stateFilter } : undefined);
      setJobs(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [page, stateFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => { setPage(1); }, [stateFilter]);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await api.retryJob(id);
      fetchJobs();
    } catch (err: any) {
      setError(err?.message || 'Failed to retry job');
    } finally {
      setRetrying(null);
    }
  };

  const handleClearFailed = async () => {
    try {
      await api.clearFailedJobs();
      fetchJobs();
    } catch (err: any) {
      setError(err?.message || 'Failed to clear jobs');
    }
  };

  // Compute stats from loaded data
  const doneCount = jobs.filter(j => j.state === 'completed').length;
  const failedCount = jobs.filter(j => j.state === 'failed').length;
  const activeCount = jobs.filter(j => j.state === 'active' || j.state === 'waiting').length;

  const columns: TableColumn<any>[] = [
    {
      key: 'id',
      header: 'Job ID',
      sortable: true,
      render: (j) => (
        <span className="font-mono text-xs text-zinc-400">{(j.id || '').slice(0, 16)}</span>
      ),
    },
    {
      key: 'projectName',
      header: 'Project',
      sortable: true,
      render: (j) => (
        <span className="text-sm text-brand-light">{j.projectName || j.name || '—'}</span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      sortable: true,
      render: (j) => <Badge variant={stateVariant[j.state] || 'neutral'}>{j.state}</Badge>,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (j) => {
        const p = j.progress ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full gradient-brand transition-all"
                style={{ width: `${p}%` }}
              />
            </div>
            <span className="text-xs text-zinc-400">{p}%</span>
          </div>
        );
      },
    },
    {
      key: 'attemptsMade',
      header: 'Attempts',
      sortable: true,
      render: (j) => (
        <span className={j.attemptsMade > 2 ? 'text-amber-400' : 'text-zinc-400'}>
          {j.attemptsMade ?? j.attempts ?? 0}
        </span>
      ),
    },
    {
      key: 'timestamp',
      header: 'Created',
      sortable: true,
      render: (j) => {
        const ts = j.timestamp || j.createdAt;
        return (
          <span className="text-xs text-zinc-400">
            {ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
          </span>
        );
      },
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
      width: '80px',
      render: (j) => (
        j.state === 'failed' ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={retrying === j.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            onClick={() => handleRetry(j.id)}
          >
            Retry
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard icon={<span className="text-emerald-400 text-sm font-bold">&#10003;</span>} label="Completed" value={doneCount} color="success" />
        <StatsCard icon={<span className="text-blue-400 text-sm font-bold">&#10227;</span>} label="Active" value={activeCount} color="brand" />
        <StatsCard icon={<span className="text-red-400 text-sm font-bold">&#10005;</span>} label="Failed" value={failedCount} color="danger" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {['', 'completed', 'active', 'waiting', 'failed', 'delayed'].map(state => (
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
        <Button variant="danger" size="sm" iconLeft={<Trash2 size={12} />} onClick={handleClearFailed}>
          Clear Failed
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <ListTodo size={32} className="mb-3 opacity-50" />
            <p className="text-sm">{stateFilter ? 'No jobs in this state' : 'No jobs found'}</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={jobs}
            keyExtractor={j => j.id}
            pagination={{
              page,
              total,
              limit,
              onPageChange: setPage,
            }}
            emptyMessage="No jobs found"
          />
        )}
      </Card>
    </div>
  );
}
