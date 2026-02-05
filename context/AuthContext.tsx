import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/authAPI';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string, referralCode?: string) => Promise<void>;
  logout: () => void;
  requestPasswordReset: (phoneOrUsername: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to refresh user data from server
  const refreshUser = async () => {
    const storedToken = localStorage.getItem('ludo_token');
    if (!storedToken) {
      return; // No token, can't refresh
    }

    try {
      const currentUser = await authAPI.getCurrentUser();
      // Update user with fresh data from server
      setUser(currentUser);
      // Update localStorage with fresh user data
      localStorage.setItem('ludo_user', JSON.stringify(currentUser));
      console.log('✅ User data refreshed from server');
    } catch (error: any) {
      // NEVER clear storage on refresh - keep user logged in
      // They have a token and can continue using the app
      const errorMessage = error?.message || '';
      console.log('ℹ️ Could not refresh user data, keeping existing session:', errorMessage);
      // User stays logged in with their existing token and data
    }
  };

  useEffect(() => {
    // Check for stored authentication token
    const storedUser = localStorage.getItem('ludo_user');
    const storedToken = localStorage.getItem('ludo_token');

    if (storedUser && storedToken) {
      try {
        const userData = JSON.parse(storedUser);
        // Immediately restore user from localStorage and keep them logged in
        setUser(userData);
        setLoading(false);

        // Refresh user data in the background
        refreshUser();
      } catch {
        // Invalid JSON in localStorage, clear it
        console.warn('⚠️ Invalid user data in localStorage, clearing');
        localStorage.removeItem('ludo_user');
        localStorage.removeItem('ludo_token');
        setUser(null);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for global user refresh events (e.g. from game logic XP updates)
  useEffect(() => {
    const handleRefresh = () => {
      console.log('🔄 Global user refresh triggered');
      refreshUser();
    };

    window.addEventListener('LUDO_REFRESH_USER', handleRefresh);
    return () => window.removeEventListener('LUDO_REFRESH_USER', handleRefresh);
  }, []);

  /*
  // Refresh user data when window gains focus (user returns to tab)
  useEffect(() => {
    const handleFocus = async () => {
      const storedToken = localStorage.getItem('ludo_token');
      // Do not auto-refresh for super admins to prevent session issues
      if (storedToken && user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
        // Silently refresh user data when user returns to tab
        await refreshUser();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);
  */

  /*
  // Periodic refresh of user data (every 5 minutes) to keep it current
  useEffect(() => {
    // Do not auto-refresh for super admins to prevent session issues
    if (!user || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return;

    const interval = setInterval(() => {
      const storedToken = localStorage.getItem('ludo_token');
      if (storedToken) {
        // Silently refresh user data periodically
        refreshUser();
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  }, [user]);
  */

  const login = async (phone: string, password: string) => {
    const response = await authAPI.login(phone, password);
    setUser(response.user);
    localStorage.setItem('ludo_user', JSON.stringify(response.user));
    localStorage.setItem('ludo_token', response.token);
  };

  const register = async (fullName: string, phone: string, password: string, referralCode?: string) => {
    const response = await authAPI.register(fullName, phone, password, referralCode);
    setUser(response.user);
    localStorage.setItem('ludo_user', JSON.stringify(response.user));
    localStorage.setItem('ludo_token', response.token);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ludo_user');
    localStorage.removeItem('ludo_token');
  };

  const requestPasswordReset = async (phoneOrUsername: string) => {
    await authAPI.requestPasswordReset(phoneOrUsername);
  };

  const resetPassword = async (token: string, newPassword: string) => {
    await authAPI.resetPassword(token, newPassword);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        register,
        logout,
        requestPasswordReset,
        resetPassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

