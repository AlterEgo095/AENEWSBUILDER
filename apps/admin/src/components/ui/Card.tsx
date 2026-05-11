import React from 'react';
import clsx from 'clsx';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, className, glow, hover, padding = 'md' }: CardProps) {
  return (
    <div
      className={clsx(
        'glass rounded-xl transition-all duration-200',
        glow && 'glow-border',
        hover && 'hover:bg-white/[0.05] hover:border-white/[0.1] hover:-translate-y-0.5 hover:shadow-glass-lg',
        paddingMap[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function CardHeader({ children, className, action }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-center justify-between mb-4', className)}>
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={clsx('text-sm font-semibold text-zinc-200', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={clsx('text-xs text-zinc-500 mt-0.5', className)}>
      {children}
    </p>
  );
}
