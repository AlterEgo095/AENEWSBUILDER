import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const variantStyles = {
  primary: 'gradient-brand hover:gradient-brand-hover text-white shadow-glow-brand',
  secondary: 'bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.08]',
  danger: 'bg-danger/15 hover:bg-danger/25 text-red-400 border border-danger/20',
  ghost: 'hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200',
  outline: 'border border-white/[0.1] hover:bg-white/[0.05] hover:border-white/[0.2] text-zinc-300',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
        'disabled:opacity-50 disabled:pointer-events-none',
        'active:scale-[0.97]',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} />
      ) : (
        iconLeft
      )}
      {children && <span>{children}</span>}
      {!loading && iconRight}
    </button>
  );
}
