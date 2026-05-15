/**
 * Admin useAuth Hook - With session timeout and auto token refresh
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { User } from '@/types';
import api from '@/lib/api';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const TOKEN_REFRESH_MS = 10 * 60 * 1000;

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    loading: true,
  });
  const lastActivityRef = useRef<number>(Date.now());

  const clearAuthStorage = useCallback(() => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
    if (!token) {
      setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
      return;
    }

    try {
      const res = await api.getMe();
      const user = res.data;
      if (user && res.success) {
        setState({
          user,
          isAuthenticated: true,
          isAdmin: user.role === 'admin',
          loading: false,
        });
      } else {
        clearAuthStorage();
        setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
      }
    } catch {
      clearAuthStorage();
      setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
    }
  }, [clearAuthStorage]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Session timeout
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const check = () => {
      if (Date.now() - lastActivityRef.current > SESSION_TIMEOUT_MS) {
        logout();
      }
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated]);

  // Track activity
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const update = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', update);
    window.addEventListener('keydown', update);
    window.addEventListener('click', update);
    window.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('keydown', update);
      window.removeEventListener('click', update);
      window.removeEventListener('scroll', update);
    };
  }, [state.isAuthenticated]);

  // Periodic token verification
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        await checkAuth();
      } catch {
        logout();
      }
    }, TOKEN_REFRESH_MS);
    return () => clearInterval(interval);
  }, [state.isAuthenticated, checkAuth]);

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const res = await api.login(email, password);
    if (res.success && res.data) {
      const { token, user } = res.data;
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('admin_token', token);
      storage.setItem('admin_user', JSON.stringify(user));
      setState({
        user,
        isAuthenticated: true,
        isAdmin: user.role === 'admin',
        loading: false,
      });
      lastActivityRef.current = Date.now();
      return user;
    }
    throw new Error(res.error || 'Login failed');
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
  }, [clearAuthStorage]);

  return {
    ...state,
    login,
    logout,
    refresh: checkAuth,
  };
}

