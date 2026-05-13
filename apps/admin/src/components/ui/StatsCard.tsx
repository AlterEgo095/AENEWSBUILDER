import React from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Sparkline } from '@/components/charts/Sparkline';

export interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  data?: Array<{ value: number }>;
  color?: 'brand' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}

const colorStyles = {
  brand: {
    icon: 'bg-brand/10 text-brand-light',
    positive: 'text-brand-light',
    negative: 'text-red-400',
    stroke: '#3B82F6',
  },
  accent: {
    icon: 'bg-accent/10 text-accent-light',
    positive: 'text-accent-light',
    negative: 'text-red-400',
    stroke: '#8B5CF6',
  },
  success: {
    icon: 'bg-emerald-500/10 text-emerald-400',
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    stroke: '#10B981',
  },
  warning: {
    icon: 'bg-amber-500/10 text-amber-400',
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    stroke: '#F59E0B',
  },
  danger: {
    icon: 'bg-red-500/10 text-red-400',
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    stroke: '#EF4444',
  },
};

export function StatsCard({
  icon,
  label,
  value,
  change,
  changeLabel,
  data,
  color = 'brand',
  className,
}: StatsCardProps) {
  const styles = colorStyles[color];
  const isPositive = change !== undefined ? change >= 0 : undefined;

  return (
    <div
      className={clsx(
        'glass glass-hover rounded-xl p-5 group',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-3">
            <div className={clsx('flex items-center justify-center w-9 h-9 rounded-lg', styles.icon)}>
              {icon}
            </div>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
          {change !== undefined && (
            <div className="flex items-center gap-1.5 mt-2">
              {isPositive ? (
                <TrendingUp size={14} className={styles.positive} />
              ) : (
                <TrendingDown size={14} className={styles.negative} />
              )}
              <span
                className={clsx(
                  'text-xs font-medium',
                  isPositive ? styles.positive : styles.negative,
                )}
              >
                {isPositive ? '+' : ''}{change}%
              </span>
              {changeLabel && (
                <span className="text-xs text-zinc-500">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        {data && data.length > 0 && (
          <div className="w-24 h-12 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <Sparkline
              data={data.map(d => d.value)}
              color={styles.stroke}
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>
    </div>
  );
}
