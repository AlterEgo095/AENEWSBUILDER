import { useState, useEffect, useCallback } from 'react';
import { Plug, ToggleLeft, ToggleRight, Search, RefreshCw, Loader2, Settings2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';

const categoryColors: Record<string, string> = {
  database: 'bg-amber-500/15 text-amber-400',
  cloud: 'bg-orange-500/15 text-orange-400',
  browser: 'bg-cyan-500/15 text-cyan-400',
  communication: 'bg-violet-500/15 text-violet-400',
  code: 'bg-emerald-500/15 text-emerald-400',
  search: 'bg-blue-500/15 text-blue-400',
  multimedia: 'bg-rose-500/15 text-rose-400',
  monitoring: 'bg-teal-500/15 text-teal-400',
  tools: 'bg-indigo-500/15 text-indigo-400',
  file: 'bg-pink-500/15 text-pink-400',
  security: 'bg-red-500/15 text-red-400',
  translation: 'bg-sky-500/15 text-sky-400',
  social: 'bg-fuchsia-500/15 text-fuchsia-400',
  Design: 'bg-pink-500/15 text-pink-400',
  Browser: 'bg-cyan-500/15 text-cyan-400',
  Code: 'bg-emerald-500/15 text-emerald-400',
  Communication: 'bg-violet-500/15 text-violet-400',
  Search: 'bg-blue-500/15 text-blue-400',
  Database: 'bg-amber-500/15 text-amber-400',
  Cloud: 'bg-orange-500/15 text-orange-400',
  Monitoring: 'bg-teal-500/15 text-teal-400',
  Productivity: 'bg-indigo-500/15 text-indigo-400',
  'AI/ML': 'bg-rose-500/15 text-rose-400',
  Infrastructure: 'bg-slate-500/15 text-slate-400',
};

export default function MCPTools() {
  const [tools, setTools] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [enabledCount, setEnabledCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMCPTools();
      // Backend returns { total, enabled, disabled, categories: { category: [...] } }
      const categories = res.categories || {};
      const allTools = Object.values(categories).flat() as any[];
      setTools(allTools);
      setTotal(res.total || allTools.length);
      setEnabledCount(res.enabled ?? allTools.filter((t: any) => t.enabled).length);
    } catch (err: any) {
      setError(err?.message || 'Failed to load MCP tools');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const toggleTool = async (id: string, currentState: boolean) => {
    setToggling(id);
    try {
      await api.toggleMCPTool(id, !currentState);
      // Update local state optimistically
      setTools(prev => prev.map(t =>
        t.id === id ? { ...t, enabled: !currentState } : t
      ));
      setEnabledCount(prev => currentState ? prev - 1 : prev + 1);
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle tool');
    } finally {
      setToggling(null);
    }
  };

  const filtered = tools.filter(t =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.category?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
            <Plug size={18} className="text-brand-light" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Active Tools</p>
            <p className="text-lg font-bold text-white">{enabledCount} <span className="text-zinc-500 font-normal text-sm">/ {total}</span></p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Settings2 size={18} className="text-red-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Disabled Tools</p>
            <p className="text-lg font-bold text-white">{total - enabledCount}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <button onClick={fetchTools} className="w-10 h-10 rounded-lg bg-zinc-500/10 flex items-center justify-center hover:bg-zinc-500/20 transition-colors">
            <RefreshCw size={18} className="text-zinc-400" />
          </button>
          <div>
            <p className="text-xs text-zinc-500">Categories</p>
            <p className="text-lg font-bold text-white">{new Set(tools.map(t => t.category)).size}</p>
          </div>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search tools..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-dark pl-9 w-full text-xs"
        />
      </div>

      {/* Tools Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <Plug size={32} className="mb-3 opacity-50" />
          <p className="text-sm">{search ? 'No tools match your search' : 'No MCP tools configured'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(tool => (
            <Card key={tool.id} hover padding="sm" className="group">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0">
                      <Plug size={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">{tool.name}</h3>
                      {tool.category && (
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${categoryColors[tool.category] || 'bg-zinc-500/15 text-zinc-400'}`}>
                          {tool.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTool(tool.id, tool.enabled)}
                    disabled={toggling === tool.id}
                    className="p-1 transition-colors shrink-0"
                    aria-label={tool.enabled ? 'Disable tool' : 'Enable tool'}
                  >
                    {toggling === tool.id ? (
                      <Loader2 size={24} className="text-zinc-500 animate-spin" />
                    ) : tool.enabled ? (
                      <ToggleRight size={24} className="text-brand-light" />
                    ) : (
                      <ToggleLeft size={24} className="text-zinc-600" />
                    )}
                  </button>
                </div>

                {/* Description */}
                {tool.description && (
                  <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{tool.description}</p>
                )}

                {/* Status badge */}
                {tool.status && (
                  <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      {tool.version && `v${tool.version}`}
                      {tool.author && ` by ${tool.author}`}
                    </span>
                    <Badge
                      variant={tool.enabled ? 'success' : 'neutral'}
                      dot={!tool.enabled}
                      pulse={tool.enabled}
                    >
                      {tool.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
