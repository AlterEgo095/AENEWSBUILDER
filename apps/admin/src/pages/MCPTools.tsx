import { useState } from 'react';
import { Plug, ToggleLeft, ToggleRight, Search, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { MCPToolInfo } from '@/types';

const sampleTools: MCPToolInfo[] = [
  { id: 'figma', name: 'Figma', category: 'Design', enabled: true, invocations: 1245, successRate: 98.2, avgLatency: 320, lastUsed: '2 min ago' },
  { id: 'playwright', name: 'Playwright', category: 'Browser', enabled: true, invocations: 892, successRate: 95.7, avgLatency: 4500, lastUsed: '5 min ago' },
  { id: 'github', name: 'GitHub', category: 'Code', enabled: true, invocations: 2103, successRate: 99.1, avgLatency: 850, lastUsed: '1 min ago' },
  { id: 'slack', name: 'Slack', category: 'Communication', enabled: true, invocations: 567, successRate: 97.8, avgLatency: 230, lastUsed: '10 min ago' },
  { id: 'websearch', name: 'Web Search', category: 'Search', enabled: true, invocations: 3421, successRate: 92.3, avgLatency: 1200, lastUsed: '30 sec ago' },
  { id: 'supabase', name: 'Supabase', category: 'Database', enabled: false, invocations: 234, successRate: 96.1, avgLatency: 680, lastUsed: '2 days ago' },
  { id: 'vercel', name: 'Vercel', category: 'Cloud', enabled: true, invocations: 789, successRate: 99.5, avgLatency: 2100, lastUsed: '8 min ago' },
  { id: 'prometheus', name: 'Prometheus', category: 'Monitoring', enabled: true, invocations: 156, successRate: 100, avgLatency: 150, lastUsed: '1 hr ago' },
  { id: 'notion', name: 'Notion', category: 'Productivity', enabled: false, invocations: 89, successRate: 94.2, avgLatency: 560, lastUsed: '5 days ago' },
  { id: 'replicate', name: 'Replicate', category: 'AI/ML', enabled: true, invocations: 445, successRate: 91.5, avgLatency: 8200, lastUsed: '15 min ago' },
  { id: 'cloudflare', name: 'Cloudflare', category: 'Cloud', enabled: true, invocations: 312, successRate: 98.8, avgLatency: 340, lastUsed: '3 min ago' },
  { id: 'terraform', name: 'Terraform', category: 'Infrastructure', enabled: false, invocations: 67, successRate: 88.2, avgLatency: 15000, lastUsed: '1 week ago' },
];

const categoryColors: Record<string, string> = {
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
  const [tools, setTools] = useState(sampleTools);
  const [search, setSearch] = useState('');

  const filtered = tools.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase())
  );

  const toggleTool = (id: string) => {
    setTools(prev => prev.map(t =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
  };

  const enabledCount = tools.filter(t => t.enabled).length;
  const totalInvocations = tools.reduce((s, t) => s + t.invocations, 0);
  const avgSuccessRate = tools.reduce((s, t) => s + t.successRate, 0) / tools.length;

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
            <p className="text-lg font-bold text-white">{enabledCount} <span className="text-zinc-500 font-normal text-sm">/ {tools.length}</span></p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <RefreshCw size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Total Invocations</p>
            <p className="text-lg font-bold text-white">{totalInvocations.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <span className="text-accent-light text-sm font-bold">%</span>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Avg Success Rate</p>
            <p className="text-lg font-bold text-white">{avgSuccessRate.toFixed(1)}%</p>
          </div>
        </Card>
      </div>

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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(tool => (
          <Card key={tool.id} hover padding="sm" className="group">
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                    <Plug size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">{tool.name}</h3>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${categoryColors[tool.category] || 'bg-zinc-500/15 text-zinc-400'}`}>
                      {tool.category}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleTool(tool.id)}
                  className="p-1 transition-colors"
                  aria-label={tool.enabled ? 'Disable tool' : 'Enable tool'}
                >
                  {tool.enabled ? (
                    <ToggleRight size={24} className="text-brand-light" />
                  ) : (
                    <ToggleLeft size={24} className="text-zinc-600" />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-zinc-500">Calls</p>
                  <p className="text-sm font-semibold text-zinc-200">{tool.invocations.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Success</p>
                  <p className={`text-sm font-semibold ${tool.successRate >= 95 ? 'text-emerald-400' : tool.successRate >= 90 ? 'text-amber-400' : 'text-red-400'}`}>
                    {tool.successRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Latency</p>
                  <p className="text-sm font-semibold text-zinc-200">
                    {tool.avgLatency >= 1000 ? `${(tool.avgLatency / 1000).toFixed(1)}s` : `${tool.avgLatency}ms`}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Last used: {tool.lastUsed}</span>
                <Badge variant={tool.enabled ? 'success' : 'neutral'} dot={!tool.enabled} pulse={tool.enabled}>
                  {tool.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
