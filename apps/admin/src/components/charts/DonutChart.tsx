import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export interface DonutChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  innerRadius?: number;
  outerRadius?: number;
  height?: number;
  className?: string;
  centerLabel?: string;
  centerValue?: string;
}

const DEFAULT_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color?: string } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 shadow-glass-lg text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: payload[0].payload.color || DEFAULT_COLORS[0] }}
        />
        <span className="text-zinc-300">{payload[0].name}</span>
      </div>
      <p className="font-semibold text-white pl-4">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

export function DonutChart({
  data,
  innerRadius = 60,
  outerRadius = 90,
  height = 240,
  className,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={`relative ${className || ''}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.map((d, i) => ({ ...d, color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }))}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={data[index].color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center Label */}
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            {centerValue && (
              <div className="text-xl font-bold text-white">{centerValue}</div>
            )}
            {centerLabel && (
              <div className="text-xs text-zinc-500">{centerLabel}</div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
            />
            <span>{d.name}</span>
            <span className="text-zinc-500 font-medium">
              ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
