import { useState } from 'react';
import { Search, MoreVertical, Shield, UserX, Ban } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import { StatsCard } from '@/components/ui/StatsCard';
import { Users, Shield, UserX, TrendingUp } from 'lucide-react';
import type { User } from '@/types';

const roleVariant = {
  admin: 'info' as const,
  user: 'neutral' as const,
  banned: 'danger' as const,
};

const sampleUsers: User[] = Array.from({ length: 30 }, (_, i) => ({
  id: `user-${String(i + 1).padStart(3, '0')}`,
  email: `user${i + 1}@example.com`,
  name: [
    'Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Edward Norton',
    'Fiona Apple', 'George Lucas', 'Hannah Montana', 'Ivan Drago', 'Julia Roberts',
    'Kevin Hart', 'Luna Lovegood', 'Michael Scott', 'Nina Simone', 'Oscar Wilde',
    'Patricia Arquette', 'Quinn Hughes', 'Rachel Green', 'Steve Jobs', 'Tina Turner',
    'Uma Thurman', 'Vincent Vega', 'Wendy Darling', 'Xavier Charles', 'Yara Shahidi',
    'Zoe Saldana', 'Adam Sandler', 'Beyonce Knowles', 'Chris Evans', 'David Bowie',
  ][i],
  role: (['admin', 'user', 'user', 'user', 'banned'] as const)[i % 5],
  createdAt: new Date(Date.now() - i * 86400000 * 7).toISOString(),
  lastLogin: i % 5 !== 4 ? new Date(Date.now() - i * 86400000).toISOString() : undefined,
  projectCount: Math.floor(Math.random() * 20),
  totalCost: Math.round(Math.random() * 50 * 100) / 100,
}));

export default function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const filtered = sampleUsers.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    return true;
  });

  const columns: TableColumn<User>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-xs font-bold text-white shrink-0">
            {u.name.split(' ').map(n => n[0]).join('').toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-white text-sm">{u.name}</p>
            <p className="text-xs text-zinc-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (u) => <Badge variant={roleVariant[u.role]}>{u.role}</Badge>,
    },
    {
      key: 'projectCount',
      header: 'Projects',
      sortable: true,
      render: (u) => <span className="text-sm text-zinc-300">{u.projectCount}</span>,
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      sortable: true,
      render: (u) => <span className="text-sm text-zinc-300">${u.totalCost.toFixed(2)}</span>,
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      sortable: true,
      render: (u) => (
        u.lastLogin ? (
          <span className="text-xs text-zinc-400">
            {new Date(u.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">Never</span>
        )
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      render: () => (
        <button className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors">
          <MoreVertical size={14} />
        </button>
      ),
    },
  ];

  const adminCount = sampleUsers.filter(u => u.role === 'admin').length;
  const activeCount = sampleUsers.filter(u => u.role !== 'banned').length;
  const bannedCount = sampleUsers.filter(u => u.role === 'banned').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatsCard icon={<Users size={18} />} label="Total Users" value={sampleUsers.length} color="brand" />
        <StatsCard icon={<Shield size={18} />} label="Admins" value={adminCount} color="accent" />
        <StatsCard icon={<TrendingUp size={18} />} label="Active" value={activeCount} color="success" />
        <StatsCard icon={<UserX size={18} />} label="Banned" value={bannedCount} color="danger" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark pl-9 w-full text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          {['', 'admin', 'user', 'banned'].map(role => (
            <Button
              key={role}
              variant={roleFilter === role ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setRoleFilter(role)}
            >
              {role || 'All'}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card padding="none">
        <Table
          columns={columns}
          data={filtered}
          keyExtractor={u => u.id}
          pagination={{
            page,
            total: filtered.length,
            limit: 10,
            onPageChange: setPage,
          }}
          emptyMessage="No users found"
        />
      </Card>
    </div>
  );
}
