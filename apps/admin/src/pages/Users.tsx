import { useState, useEffect, useCallback } from 'react';
import { Search, MoreVertical, Shield, UserX, TrendingUp, Users, RefreshCw, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, type TableColumn } from '@/components/ui/Table';
import { StatsCard } from '@/components/ui/StatsCard';
import type { User } from '@/types';
import api from '@/lib/api';

const roleVariant: Record<string, 'info' | 'neutral' | 'danger'> = {
  admin: 'info',
  user: 'neutral',
  moderator: 'info',
  banned: 'danger',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUsers(page, limit, search || undefined);
      setUsers(res.data || []);
      setTotalUsers(res.pagination?.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  // Fetch when page/search changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  // Filter by role on client side since backend doesn't support role filter yet
  const filteredUsers = roleFilter
    ? users.filter(u => u.role === roleFilter)
    : users;

  const adminCount = users.filter(u => u.role === 'admin').length;
  const activeCount = users.filter(u => u.role !== 'banned').length;
  const bannedCount = users.filter(u => u.role === 'banned').length;

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.updateUser(userId, { role: newRole as User['role'] });
      fetchUsers();
    } catch (err: any) {
      setError(err?.message || 'Failed to update role');
    }
  };

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
      render: (u) => (
        <select
          value={u.role}
          onChange={(e) => handleRoleChange(u.id, e.target.value)}
          className="text-xs bg-transparent border border-white/10 rounded px-2 py-1 text-zinc-300 focus:border-brand/50 focus:outline-none"
        >
          <option value="user" className="bg-zinc-900">User</option>
          <option value="admin" className="bg-zinc-900">Admin</option>
          <option value="moderator" className="bg-zinc-900">Moderator</option>
        </select>
      ),
    },
    {
      key: 'projectCount',
      header: 'Projects',
      sortable: true,
      render: (u: User) => <span className="text-sm text-zinc-300">{u.projectCount || 0}</span>,
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      sortable: true,
      render: (u: User) => <span className="text-sm text-zinc-300">${(u.totalCost || 0).toFixed(2)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      render: (u: User) => (
        <span className="text-xs text-zinc-400">
          {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatsCard icon={<Users size={18} />} label="Total Users" value={totalUsers} color="brand" />
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
          {['', 'admin', 'user', 'moderator'].map(role => (
            <Button
              key={role}
              variant={roleFilter === role ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setRoleFilter(role)}
            >
              {role || 'All'}
            </Button>
          ))}
          <button
            onClick={fetchUsers}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
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
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <Users size={32} className="mb-3 opacity-50" />
            <p className="text-sm">{search ? 'No users match your search' : 'No users yet'}</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredUsers}
            keyExtractor={u => u.id}
            pagination={{
              page,
              total: totalUsers,
              limit,
              onPageChange: setPage,
            }}
            emptyMessage="No users found"
          />
        )}
      </Card>
    </div>
  );
}
