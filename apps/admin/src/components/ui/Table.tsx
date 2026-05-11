import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { TableColumn, TableSortConfig } from '@/types';
import { SkeletonLine } from './Skeleton';

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  pagination?: {
    page: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data found',
  emptyIcon,
  loading = false,
  loadingRows = 5,
  pagination,
  className,
}: TableProps<T>) {
  const [sort, setSort] = useState<TableSortConfig | null>(null);

  const sortedData = useMemo(() => {
    if (!sort || !data) return data;
    const sorted = [...data];
    sorted.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sort.key];
      const bVal = (b as Record<string, unknown>)[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [data, sort]);

  const handleSort = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  return (
    <div className={clsx('rounded-xl border border-white/[0.06] overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap',
                    col.sortable && 'cursor-pointer hover:text-zinc-300 select-none transition-colors',
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sort?.key === col.key && (
                      sort.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-white/[0.03]">
                  {columns.map((col, j) => (
                    <td key={j} className="px-4 py-3">
                      <SkeletonLine width={j === 0 ? '60%' : '80%'} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-500">
                    {emptyIcon || <Inbox size={32} className="opacity-50" />}
                    <span className="text-sm">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map(item => (
                <tr
                  key={keyExtractor(item)}
                  className={clsx(
                    'border-b border-white/[0.03] transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-white/[0.03]',
                  )}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          <span className="text-xs text-zinc-500">
            {pagination.total} items &middot; Page {pagination.page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page: number;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (pagination.page <= 3) {
                page = i + 1;
              } else if (pagination.page >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = pagination.page - 2 + i;
              }
              return (
                <button
                  key={page}
                  onClick={() => pagination.onPageChange(page)}
                  className={clsx(
                    'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                    page === pagination.page
                      ? 'gradient-brand text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]',
                  )}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
