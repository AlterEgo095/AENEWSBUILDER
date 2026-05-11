import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { Search, Bell, ChevronDown, LogOut, User, Settings, Menu } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuToggle?: () => void;
  className?: string;
}

export function Header({ title, subtitle, onMenuToggle, className }: HeaderProps) {
  const { user, logout, isAdmin } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  return (
    <header
      className={clsx(
        'sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b border-white/[0.06]',
        'bg-surface-0/80 backdrop-blur-xl',
        className,
      )}
    >
      {/* Left: Mobile menu + Title */}
      <div className="flex items-center gap-4">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
        )}
        <div>
          <h1 className="text-base font-semibold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>

      {/* Right: Search, Notifications, User */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center relative">
          <Search size={14} className="absolute left-3 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            className="input-dark pl-9 w-56 py-1.5 text-xs"
          />
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-72 glass rounded-xl shadow-glass-lg animate-scale-in overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <span className="text-xs font-medium text-zinc-300">Notifications</span>
              </div>
              <div className="p-4 text-center text-xs text-zinc-500">
                No new notifications
              </div>
            </div>
          )}
        </div>

        {/* User Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 pr-3 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-zinc-200 leading-tight">
                {user?.name || 'Admin'}
              </p>
              <p className="text-[10px] text-zinc-500 leading-tight">
                {isAdmin ? 'Administrator' : 'User'}
              </p>
            </div>
            <ChevronDown
              size={14}
              className={clsx(
                'hidden sm:block text-zinc-500 transition-transform',
                dropdownOpen && 'rotate-180',
              )}
            />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 glass rounded-xl shadow-glass-lg animate-scale-in overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.06]">
                <p className="text-xs font-medium text-zinc-300 truncate">
                  {user?.email || 'admin@aenews.com'}
                </p>
              </div>
              <div className="p-1">
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                  <User size={14} />
                  Profile
                </button>
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                  <Settings size={14} />
                  Settings
                </button>
              </div>
              <div className="border-t border-white/[0.06] p-1">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/[0.06] transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
