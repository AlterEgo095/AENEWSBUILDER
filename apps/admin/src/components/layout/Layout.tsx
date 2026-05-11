import React, { useState, useCallback } from 'react';
import clsx from 'clsx';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '@/components/ui/Toast';

export interface LayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function Layout({ children, title, subtitle }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 animate-slide-in">
            <Sidebar collapsed={false} onToggle={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        className={clsx(
          'transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[240px]',
        )}
      >
        <Header
          title={title}
          subtitle={subtitle}
          onMenuToggle={toggleMobileMenu}
        />
        <main className="p-6 animate-fade-in">
          {children}
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
