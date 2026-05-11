import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/layout/Layout';
import { AuthForm } from '@/components/AuthForm';
import { SkeletonCard } from '@/components/ui/Skeleton';

// Lazy-loaded pages
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Projects = lazy(() => import('@/pages/Projects'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const Jobs = lazy(() => import('@/pages/Jobs'));
const Users = lazy(() => import('@/pages/Users'));
const MCPTools = lazy(() => import('@/pages/MCPTools'));
const Monitoring = lazy(() => import('@/pages/Monitoring'));
const Costs = lazy(() => import('@/pages/Costs'));
const Settings = lazy(() => import('@/pages/Settings'));

function PageLoader() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <div className="md:col-span-2 lg:col-span-3">
        <SkeletonCard />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <PageLoader />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PageWrapper({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Layout title={title} subtitle={subtitle}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </Layout>
  );
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <PageLoader />
      </div>
    );
  }

  return (
    <Routes>
      {/* Auth Route */}
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to="/" replace />
            : <AuthForm />
        }
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <PageWrapper title="Dashboard" subtitle="System overview and key metrics">
              <Dashboard />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <PageWrapper title="Projects" subtitle="Manage generated projects">
              <Projects />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            <PageWrapper title="Project Details" subtitle="View project details and files">
              <ProjectDetail />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <PageWrapper title="Jobs" subtitle="Background job processing queue">
              <Jobs />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <PageWrapper title="Users" subtitle="Manage user accounts and permissions">
              <Users />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mcp"
        element={
          <ProtectedRoute>
            <PageWrapper title="MCP Tools" subtitle="Model Context Protocol tool management">
              <MCPTools />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitoring"
        element={
          <ProtectedRoute>
            <PageWrapper title="Monitoring" subtitle="System health and performance metrics">
              <Monitoring />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/costs"
        element={
          <ProtectedRoute>
            <PageWrapper title="Costs" subtitle="Usage costs and billing analytics">
              <Costs />
            </PageWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <PageWrapper title="Settings" subtitle="System configuration and preferences">
              <Settings />
            </PageWrapper>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
