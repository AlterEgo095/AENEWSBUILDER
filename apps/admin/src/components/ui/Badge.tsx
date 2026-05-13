import React from 'react';
import clsx from 'clsx';

const variantStyles = {
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/20',
  info: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  neutral: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
};

const dotColors = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-blue-400',
  neutral: 'bg-zinc-400',
};

export interface BadgeProps {
  children: React.ReactNode;
  variant?: keyof typeof variantStyles;
  pulse?: boolean;
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'neutral',
  pulse = false,
  dot = true,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        variantStyles[variant],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={clsx(
                'absolute inset-0 rounded-full animate-ping opacity-75',
                dotColors[variant],
              )}
            />
          )}
          <span className={clsx('relative inline-flex rounded-full h-1.5 w-1.5', dotColors[variant])} />
        </span>
      )}
      {children}
    </span>
  );
}
