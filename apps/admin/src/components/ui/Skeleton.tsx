import clsx from 'clsx';

export interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

export function SkeletonLine({ width = '100%', height = '12px', className }: SkeletonLineProps) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded bg-white/[0.06]',
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function SkeletonCircle({ size = '40px', className }: { size?: string; className?: string }) {
  return (
    <div
      className={clsx('animate-pulse rounded-full bg-white/[0.06]', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'glass rounded-xl p-5 animate-pulse',
        className,
      )}
    >
      <SkeletonLine width="40%" height="16px" className="mb-3" />
      <SkeletonLine width="70%" height="28px" className="mb-2" />
      <SkeletonLine width="50%" height="12px" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-white/[0.06]">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${60 + Math.random() * 40}%`} height="10px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-white/[0.03]">
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine
              key={j}
              width={`${50 + Math.random() * 50}%`}
              height="12px"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={clsx('glass rounded-xl p-5', className)}>
      <SkeletonLine width="30%" height="14px" className="mb-6" />
      <div className="flex items-end gap-2 h-48">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-white/[0.06] rounded-t animate-pulse"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}
