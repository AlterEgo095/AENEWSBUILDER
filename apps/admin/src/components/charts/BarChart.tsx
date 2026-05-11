import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export interface BarChartProps {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  xAxisKey?: string;
  colors?: string[];
  height?: number;
  className?: string;
  barSize?: number;
  borderRadius?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 shadow-glass-lg text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="font-semibold text-white">
        {payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

const DEFAULT_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

export function BarChartComponent({
  data,
  dataKey,
  xAxisKey = 'name',
  colors = DEFAULT_COLORS,
  height = 280,
  className,
  barSize = 32,
  borderRadius = 6,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height} className={className}>
      <RechartsBarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey={dataKey} barSize={barSize} radius={[borderRadius, borderRadius, 0, 0]}>
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors[index % colors.length]}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
