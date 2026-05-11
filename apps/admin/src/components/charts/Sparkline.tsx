import React from 'react';
import { Line, ResponsiveContainer } from 'recharts';

export interface SparklineProps {
  data: Array<number>;
  color?: string;
  strokeWidth?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = '#3B82F6',
  strokeWidth = 1.5,
  height = 40,
  className,
}: SparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height={height} className={className}>
      <Line
        data={chartData}
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={strokeWidth}
        dot={false}
        isAnimationActive={false}
      />
    </ResponsiveContainer>
  );
}
