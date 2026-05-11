'use client';

import React, { useMemo } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Building2, Calculator,
  AlertTriangle, ArrowUpDown, ChevronRight, Download,
} from 'lucide-react';
import {
  mockCostSummary,
  mockDailyCosts,
  mockCostByCategory,
  mockCostByModel,
  mockCostByUser,
  mockProjects,
} from '../data/mock-data';

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
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
              className="transition-all duration-500"
            />
          );
        })}
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          fill="white"
          fontSize="16"
          fontWeight="bold"
        >
          ${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 10}
          textAnchor="middle"
          fill="#6b7280"
          fontSize="9"
        >
          total
        </text>
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
  const max = Math.max(...data.map((d) => d.cost));
  const barWidth = Math.max(4, (chartW / data.length) * 0.7);
  const gap = (chartW - barWidth * data.length) / (data.length + 1);
  const avg = data.reduce((s, d) => s + d.cost, 0) / data.length;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        {/* Average line */}
        <line
          x1={padding.left}
          y1={padding.top + chartH - (avg / max) * chartH}
          x2={w - padding.right}
          y2={padding.top + chartH - (avg / max) * chartH}
          stroke="#6b7280"
          strokeDasharray="4 2"
          strokeWidth="0.5"
        />
        {data.map((d, i) => {
          const barH = max > 0 ? (d.cost / max) * chartH : 0;
          const x = padding.left + gap + i * (barWidth + gap);
          const y = padding.top + chartH - barH;
          const isToday = i === data.length - 1;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={2}
                fill={isToday ? '#8b5cf6' : '#3b82f6'}
                opacity={isToday ? 1 : 0.6}
              />
              {data.length <= 15 && (
                <text
                  x={x + barWidth / 2}
                  y={h - 4}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="6"
                >
                  {d.date.split('-').slice(1).join('/')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-blue-500/60" /> Daily cost
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-gray-500" /> Avg: ${avg.toFixed(2)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-purple-500" /> Today
        </span>
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
  const max = Math.max(...data.map((d) => d.value));
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
              <text
                x={labelW - 8}
                y={y + barH / 2 + 3}
                textAnchor="end"
                fill="#d1d5db"
                fontSize="9"
              >
                {d.label.length > 18 ? d.label.slice(0, 18) + '…' : d.label}
              </text>
              <rect x={labelW} y={y} width={barW} height={barH} rx={3} fill="#3b82f6" opacity={0.7} />
              <text
                x={labelW + barW + 6}
                y={y + barH / 2 + 3}
                fill="#9ca3af"
                fontSize="9"
              >
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

function SummaryCard({ icon: Icon, label, value, subValue, trend, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  trend?: number;
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
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trend >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
      {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
    </div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

function BudgetBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const over = pct > 90;
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">{label}</h3>
        <span className={`text-sm font-bold ${over ? 'text-red-400' : 'text-white'}`}>
          ${used.toFixed(2)} <span className="text-gray-500 font-normal">/ ${limit.toFixed(2)}</span>
        </span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            over ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-gray-500">{pct.toFixed(1)}% used</span>
        {over && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertTriangle className="w-3 h-3" />
            Approaching limit
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CostsPage() {
  const summary = mockCostSummary;
  const sortedProjects = useMemo(() => [...mockProjects].sort((a, b) => b.cost - a.cost), []);
  const totalCost = sortedProjects.reduce((s, p) => s + p.cost, 0);

  return (
    <div className="min-h-screen bg-[#0A0B0E]">
      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-6 h-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Cost Analytics</h1>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/5 text-gray-400 border border-white/10">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            icon={DollarSign}
            label="Total Platform Cost"
            value={`$${summary.totalThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            subValue="This month"
            trend={summary.trend}
            color="blue"
          />
          <SummaryCard
            icon={Calculator}
            label="Average Cost per Project"
            value={`$${summary.avgPerProject.toFixed(2)}`}
            subValue="Across all active projects"
            color="purple"
          />
          <SummaryCard
            icon={Building2}
            label="Most Expensive Project"
            value={summary.mostExpensiveProject.cost > 0 ? `$${summary.mostExpensiveProject.cost.toFixed(2)}` : '—'}
            subValue={summary.mostExpensiveProject.name}
            color="amber"
          />
          <SummaryCard
            icon={TrendingUp}
            label="Daily Average Cost"
            value={`$${summary.dailyAverage.toFixed(2)}`}
            subValue="Last 30 days"
            color="emerald"
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Daily Cost Trend */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Daily Cost Trend</h3>
            <DailyCostBarChart data={mockDailyCosts} height={160} />
          </div>

          {/* Cost by Category */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Cost by Category</h3>
            <DonutChart
              data={mockCostByCategory.map((c) => ({ label: c.category, value: c.cost, color: c.color }))}
              size={160}
              strokeWidth={24}
            />
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Cost by User */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Cost by User (Top 10)</h3>
            <HorizontalBarChart
              data={mockCostByUser.slice(0, 10).map((u) => ({ label: u.user, value: u.cost }))}
              height={240}
            />
          </div>

          {/* AI Model Cost Distribution */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">AI Model Cost Distribution</h3>
            <DonutChart
              data={mockCostByModel.map((m) => ({ label: m.model, value: m.cost, color: m.color }))}
              size={160}
              strokeWidth={24}
            />
          </div>
        </div>

        {/* Project Cost Table */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl mb-6 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <h3 className="text-sm font-medium text-white">Project Cost Breakdown</h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-400 hover:bg-white/10 transition-colors">
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1 justify-end">
                      Cost <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="text-right py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Files</th>
                  <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">AI Model</th>
                  <th className="text-left py-3 px-5 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((project) => {
                  const statusColors: Record<string, string> = {
                    active: 'text-blue-400 bg-blue-500/15',
                    building: 'text-amber-400 bg-amber-500/15',
                    deployed: 'text-emerald-400 bg-emerald-500/15',
                    failed: 'text-red-400 bg-red-500/15',
                    archived: 'text-gray-400 bg-gray-500/15',
                  };
                  return (
                    <tr key={project.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{project.name}</span>
                          {project.url && (
                            <ChevronRight className="w-3 h-3 text-gray-600" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <div>
                          <p className="text-gray-300 text-sm">{project.user}</p>
                          <p className="text-gray-600 text-xs">{project.userEmail}</p>
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded capitalize ${statusColors[project.status] ?? ''}`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <span className="text-white font-medium tabular-nums">${project.cost.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-5 text-right text-gray-400 tabular-nums">{project.files}</td>
                      <td className="py-3 px-5">
                        <span className="px-2 py-0.5 text-xs bg-white/5 text-gray-400 rounded border border-white/5 font-mono">
                          {project.aiModel}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-gray-500 text-xs">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="border-t border-white/10 bg-white/5">
                  <td colSpan={3} className="py-3 px-5 text-sm font-medium text-white">Total</td>
                  <td className="py-3 px-5 text-right">
                    <span className="text-white font-bold tabular-nums">${totalCost.toFixed(2)}</span>
                  </td>
                  <td className="py-3 px-5 text-right text-gray-400 tabular-nums">
                    {sortedProjects.reduce((s, p) => s + p.files, 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Budget Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <BudgetBar
            used={summary.dailyBudget.used}
            limit={summary.dailyBudget.limit}
            label="Daily Budget"
          />
          <BudgetBar
            used={summary.monthlyBudget.used}
            limit={summary.monthlyBudget.limit}
            label="Monthly Budget"
          />
        </div>

        {/* Budget Alert Config */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-white">Budget Alert Configuration</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Alert threshold (%)</label>
              <input
                type="number"
                defaultValue={80}
                min={0}
                max={100}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Daily alert threshold ($)</label>
              <input
                type="number"
                defaultValue={180}
                min={0}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Monthly alert threshold ($)</label>
              <input
                type="number"
                defaultValue={4500}
                min={0}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
