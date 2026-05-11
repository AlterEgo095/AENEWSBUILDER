import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, MoreVertical, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { Project } from '@/types';

const statusVariant = {
  pending: 'warning' as const,
  processing: 'info' as const,
  completed: 'success' as const,
  failed: 'danger' as const,
};

const sampleProjects: Project[] = Array.from({ length: 20 }, (_, i) => ({
  id: `proj-${String(i + 1).padStart(3, '0')}`,
  userId: `user-${(i % 5) + 1}`,
  name: [
    'E-Commerce Store', 'SaaS Dashboard', 'Portfolio Site', 'Blog Platform',
    'Admin Panel', 'Landing Page', 'API Docs', 'Chat App',
    'Task Manager', 'Analytics Tool', 'CRM System', 'Social Network',
    'Learning Platform', 'Job Board', 'Recipe App', 'Weather App',
    'Music Player', 'File Manager', 'Wiki System', 'Survey Tool',
  ][i],
  prompt: 'Build a modern web application...',
  status: (['completed', 'completed', 'completed', 'processing', 'pending', 'failed'] as const)[i % 6],
  state: 'DONE',
  progress: [100, 100, 100, 67, 0, 100][i % 6],
  files: { 'index.tsx': '...', 'App.tsx': '...' },
  deployUrl: i % 3 === 0 ? `https://app-${i + 1}.aenews.app` : undefined,
  createdAt: new Date(Date.now() - i * 86400000 * Math.random() * 10).toISOString(),
  updatedAt: new Date().toISOString(),
  cost: Math.round(Math.random() * 5 * 100) / 100,
}));

export default function Projects() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const filtered = sampleProjects.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const columns: TableColumn<Project>[] = [
    {
      key: 'name',
      header: 'Project',
      sortable: true,
      render: (p) => (
        <div>
          <p className="font-medium text-white">{p.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{p.id}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (p) => <Badge variant={statusVariant[p.status]}>{p.status}</Badge>,
    },
    {
      key: 'cost',
      header: 'Cost',
      sortable: true,
      render: (p) => (
        <span className="text-sm font-medium text-zinc-300">
          ${p.cost.toFixed(2)}
        </span>
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
      width: '48px',
      render: (p) => (
        <div className="flex items-center gap-1">
          {p.deployUrl && (
            <a
              href={p.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded text-zinc-500 hover:text-brand transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={14} />
            </a>
          )}
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
          {['', 'completed', 'processing', 'pending', 'failed'].map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status || 'All'}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card padding="none">
        <Table
          columns={columns}
          data={filtered}
          keyExtractor={p => p.id}
          onRowClick={p => navigate(`/projects/${p.id}`)}
          pagination={{
            page,
            total: filtered.length,
            limit: 10,
            onPageChange: setPage,
          }}
          emptyMessage="No projects found"
        />
      </Card>
    </div>
  );
}
