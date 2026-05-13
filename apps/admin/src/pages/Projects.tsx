import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, Trash2, Loader2, FolderKanban } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import api from '@/lib/api';
import { PROJECT_STATE_VARIANT, PROJECT_STATE_LABEL } from '@/types';

const stateVariant = { ...PROJECT_STATE_VARIANT };

const stateLabel = { ...PROJECT_STATE_LABEL };

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProjects(page, limit, statusFilter ? { status: statusFilter } : undefined);
      setProjects(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const filtered = search
    ? projects.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()))
    : projects;

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;
    try {
      await api.deleteProject(id);
      fetchProjects();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete project');
    }
  };

  const columns: TableColumn<any>[] = [
    {
      key: 'name',
      header: 'Project',
      sortable: true,
      render: (p) => (
        <div>
          <p className="font-medium text-white">{p.name || 'Untitled'}</p>
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
            <span className="font-mono">{p.id?.slice(0, 12)}...</span>
            {p.user && <span>by {p.user.name}</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      sortable: true,
      render: (p) => {
        const v = stateVariant[p.state] || 'neutral' as const;
        return <Badge variant={v}>{stateLabel[p.state] || p.state}</Badge>;
      },
    },
    {
      key: 'totalCost',
      header: 'Cost',
      sortable: true,
      render: (p) => (
        <span className="text-sm font-medium text-zinc-300">
          ${(p.totalCost || 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'fileCount',
      header: 'Files',
      render: (p) => (
        <span className="text-sm text-zinc-400">{p.fileCount || 0}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (p) => (
        <span className="text-xs text-zinc-400">
          {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (p) => (
        <div className="flex items-center gap-1">
          {p.deployUrl && (
            <a
              href={p.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded text-zinc-500 hover:text-brand transition-colors"
              onClick={e => e.stopPropagation()}
              title="View deployment"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={(e) => handleDelete(p.id, e)}
            className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
            title="Delete project"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark pl-9 w-full text-xs"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['', 'DONE', 'PROCESSING', 'PENDING', 'FAILED'].map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status ? stateLabel[status] : 'All'}
            </Button>
          ))}
        </div>
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <FolderKanban size={32} className="mb-3 opacity-50" />
            <p className="text-sm">{search ? 'No projects match your search' : 'No projects yet'}</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={filtered}
            keyExtractor={p => p.id}
            onRowClick={p => navigate(`/projects/${p.id}`)}
            pagination={{
              page,
              total,
              limit,
              onPageChange: setPage,
            }}
            emptyMessage="No projects found"
          />
        )}
      </Card>
    </div>
  );
}
