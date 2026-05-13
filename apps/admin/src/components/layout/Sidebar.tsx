import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Users,
  Plug,
  Activity,
  DollarSign,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/jobs', icon: ListTodo, label: 'Jobs' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/mcp', icon: Plug, label: 'MCP Tools' },
  { to: '/monitoring', icon: Activity, label: 'Monitoring' },
  { to: '/costs', icon: DollarSign, label: 'Costs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function Sidebar({ collapsed, onToggle, className }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={clsx(
        'fixed top-0 left-0 z-40 h-full flex flex-col transition-all duration-300 ease-in-out',
        'bg-surface-1/80 backdrop-blur-xl border-r border-white/[0.06]',
        collapsed ? 'w-[68px]' : 'w-[240px]',
        className,
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-brand shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-sm font-bold text-white tracking-tight">AENEWS</h1>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Admin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 scrollbar-hide">
        <ul className="space-y-1">
          {navItems.map(item => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);

            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={clsx(
                    'sidebar-link group relative',
                    isActive && 'sidebar-link-active',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full gradient-brand" />
                  )}
                  <item.icon
                    size={18}
                    className={clsx(
                      'shrink-0 transition-colors',
                      isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300',
                    )}
                  />
                  {!collapsed && (
                    <span className="animate-fade-in truncate">{item.label}</span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors text-sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : (
            <>
              <ChevronLeft size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
