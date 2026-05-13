import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Loader2,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Donut Chart (SVG) ───────────────────────────────────────────────────────

function DonutChart({ data, size = 160, strokeWidth = 28 }: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {data.map((d, i) => {
          const pct = total > 0 ? d.value / total : 0;
          const dashLength = pct * circumference;
          const gap = circumference - dashLength;
          const rotation = (offset / circumference) * 360 - 90;
          offset += dashLength;
          return (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={d.color} strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
              className="transition-all duration-500"
            />
          );
        })}
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">
          ${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </text>
        <text x={size / 2} y={size / 2 + 10} textAnchor="middle" fill="#6b7280" fontSize="9">total</text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-gray-400 w-28 truncate">{d.label}</span>
            <span className="text-white font-medium tabular-nums">${d.value.toFixed(2)}</span>
            <span className="text-gray-500 tabular-nums">
              ({total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar Chart (SVG) ─────────────────────────────────────────────────────────

function DailyCostBarChart({ data, height = 120 }: {
  data: { date: string; cost: number }[];
  height?: number;
}) {
  if (data.length === 0) return null;
  const w = 600;
  const h = height;
  const padding = { top: 10, bottom: 20, left: 10, right: 10 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.cost), 0.01);
  const barWidth = Math.max(4, (chartW / data.length) * 0.7);
  const gap = (chartW - barWidth * data.length) / (data.length + 1);
  const avg = data.reduce((s, d) => s + d.cost, 0) / data.length;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <line
          x1={padding.left} y1={padding.top + chartH - (avg / max) * chartH}
          x2={w - padding.right} y2={padding.top + chartH - (avg / max) * chartH}
          stroke="#6b7280" strokeDasharray="4 2" strokeWidth="0.5"
        />
        {data.map((d, i) => {
          const barH = max > 0 ? (d.cost / max) * chartH : 0;
          const x = padding.left + gap + i * (barWidth + gap);
          const y = padding.top + chartH - barH;
          const isToday = i === data.length - 1;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={2}
                fill={isToday ? '#8b5cf6' : '#3b82f6'} opacity={isToday ? 1 : 0.6} />
              {data.length <= 15 && (
                <text x={x + barWidth / 2} y={h - 4} textAnchor="middle" fill="#6b7280" fontSize="6">
                  {d.date.split('-').slice(1).join('/')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/60" /> Daily cost</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-500" /> Avg: ${avg.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Horizontal Bar Chart ────────────────────────────────────────────────────

function HorizontalBarChart({ data, height = 240 }: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  if (data.length === 0) return null;
  const w = 500;
  const max = Math.max(...data.map((d) => d.value), 0.01);
  const barH = Math.min(20, (height / data.length) * 0.6);
  const rowH = height / data.length;
  const labelW = 120;
  const chartW = w - labelW - 60;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const barW = max > 0 ? (d.value / max) * chartW : 0;
          const y = i * rowH + (rowH - barH) / 2;
          return (
            <g key={i}>
              <text x={labelW - 8} y={y + barH / 2 + 3} textAnchor="end" fill="#d1d5db" fontSize="9">
                {d.label.length > 18 ? d.label.slice(0, 18) + '...' : d.label}
              </text>
              <rect x={labelW} y={y} width={barW} height={barH} rx={3} fill="#3b82f6" opacity={0.7} />
              <text x={labelW + barW + 6} y={y + barH / 2 + 3} fill="#9ca3af" fontSize="9">
                ${d.value.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, subValue, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  color: string;
}) {
  const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'text-blue-400' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'text-purple-400' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: 'text-emerald-400' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: 'text-amber-400' },
  };
  const c = colorClasses[color] ?? colorClasses.blue;
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
      {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CostsPage() {
  const [costData, setCostData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('30');

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(Date.now() - parseInt(dateRange) * 86400000).toISOString().split('T')[0];
      const res = await api.getCosts(from);
      setCostData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load cost data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={fetchCosts} className="underline ml-2">Retry</button>
        </div>
      </div>
    );
  }

  const totalCost = costData?.total?.cost || 0;
  const totalTokens = costData?.total?.tokens || 0;
  const totalRecords = costData?.total?.records || 0;
  const dailyCosts = costData?.daily || [];
  const byOperation = costData?.byOperation || [];
  const byModel = costData?.byModel || [];
  const avgDailyCost = dailyCosts.length > 0 ? totalCost / dailyCosts.length : 0;

  const categoryColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  return (
    <div className="max-w-[1600px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Cost Analytics</h1>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/5 text-gray-400 border border-white/10">
              Last {dateRange} days
            </span>
          </div>
          <div className="flex items-center gap-2">
            {['7', '14', '30', '90'].map(d => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${dateRange === d ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard icon={DollarSign} label="Total Cost" value={`$${totalCost.toFixed(2)}`} subValue={`${totalRecords} API calls`} color="blue" />
          <SummaryCard icon={DollarSign} label="Daily Average" value={`$${avgDailyCost.toFixed(2)}`} color="purple" />
          <SummaryCard icon={DollarSign} label="Total Tokens" value={totalTokens.toLocaleString()} color="emerald" />
          <SummaryCard icon={DollarSign} label="Operations" value={byOperation.length.toString()} color="amber" />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Daily Cost Trend */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Daily Cost Trend</h3>
            {dailyCosts.length > 0 ? (
              <DailyCostBarChart data={dailyCosts} height={160} />
            ) : (
              <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">No cost data available</div>
            )}
          </div>

          {/* Cost by Operation */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Cost by Operation</h3>
            {byOperation.length > 0 ? (
              <DonutChart
                data={byOperation.map((o: any, i: number) => ({
                  label: o.operation,
                  value: o.cost || 0,
                  color: categoryColors[i % categoryColors.length],
                }))}
                size={160} strokeWidth={24}
              />
            ) : (
              <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">No operation data</div>
            )}
          </div>
        </div>

        {/* Cost by Model */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-medium text-white mb-4">Cost by AI Model</h3>
          {byModel.length > 0 ? (
            <HorizontalBarChart
              data={byModel.map((m: any) => ({ label: m.model, value: m.cost || 0 }))}
              height={Math.max(120, byModel.length * 36)}
            />
          ) : (
            <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">No model cost data</div>
          )}
        </div>
    </div>
  );
}
