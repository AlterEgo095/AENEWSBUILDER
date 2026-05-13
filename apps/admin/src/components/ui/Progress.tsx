interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  color?: string;
}

export function ProgressBar({
  value,
  max = 100,
  className = '',
  size = 'sm',
  showLabel = false,
  color,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2.5';

  const barColor = color || (pct >= 100
    ? 'bg-emerald-500'
    : pct >= 60
      ? 'bg-blue-500'
      : pct >= 30
        ? 'bg-amber-500'
        : 'bg-red-500');

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 ${heightClass} bg-white/10 rounded-full overflow-hidden`}>
        <div
          className={`${heightClass} ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-white/40 font-mono min-w-[36px] text-right">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
