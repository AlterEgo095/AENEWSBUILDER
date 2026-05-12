import { useState, useCallback, useEffect } from 'react';
import type { User } from '@/types';
import api from '@/lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

/**
 * Auth response from /auth/verify endpoint
 * Shape: { valid: boolean; user?: { id, email, name, role, createdAt } }
 */
interface VerifyResponse {
  valid: boolean;
  user?: User;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    loading: true,
  });

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
      return;
    }

    try {
      const res = await api.getMe();
      // getMe() maps { valid, user } → { success, data: user }
      // So res.data is the user object
      const user = res.data;
      if (user && res.success) {
        setState({
          user,
          isAuthenticated: true,
          isAdmin: user.role === 'admin',
          loading: false,
        });
      } else {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
      }
    } catch {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (res.success && res.data) {
      const { token, user } = res.data;
      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_user', JSON.stringify(user));
      setState({
        user,
        isAuthenticated: true,
        isAdmin: user.role === 'admin',
        loading: false,
      });
      return user;
    }
    throw new Error(res.error || 'Login failed');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setState({ user: null, isAuthenticated: false, isAdmin: false, loading: false });
  }, []);

  return {
    ...state,
    login,
    logout,
    refresh: checkAuth,
  };
}
