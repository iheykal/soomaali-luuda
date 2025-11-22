import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/authAPI';
import { storage } from '../lib/storage';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string) => Promise<void>;
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
    const storedToken = storage.getToken();
    if (!storedToken) {
      return; // No token, can't refresh
    }

    try {
      const currentUser = await authAPI.getCurrentUser();
      // Update user with fresh data from server
      setUser(currentUser);
      // Update localStorage with fresh user data
      storage.setUser(currentUser);
      console.log('✅ User data refreshed from server');
    } catch (error: any) {
      // If the error is an auth error, logout the user
      if (error.message.includes('401') || error.message.includes('403')) {
        console.warn('Auth token is invalid, logging out.');
        logout();
      } else {
        // For other errors (like network), keep the session
        const errorMessage = error?.message || '';
        console.log('ℹ️ Could not refresh user data, keeping existing session:', errorMessage);
      }
    }
  };

  useEffect(() => {
    // Check for stored authentication token
    const storedUser = storage.getUser();
    const storedToken = storage.getToken();
    
    if (storedUser && storedToken) {
      // Immediately restore user and keep them logged in
      setUser(storedUser);
      setLoading(false);
      
      // Refresh user data in the background
      refreshUser();
    } else {
      setLoading(false);
    }
  }, []);

  // Refresh user data when window gains focus (user returns to tab)
  useEffect(() => {
    const handleFocus = async () => {
      const storedToken = storage.getToken();
      if (storedToken && user) {
        // Silently refresh user data when user returns to tab
        await refreshUser();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  // Periodic refresh of user data (every 5 minutes) to keep it current
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const storedToken = storage.getToken();
      if (storedToken) {
        // Silently refresh user data periodically
        refreshUser();
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  }, [user]);

  const login = async (phone: string, password: string) => {
    const response = await authAPI.login(phone, password);
    setUser(response.user);
    storage.setUser(response.user);
    storage.setToken(response.token);
  };

  const register = async (fullName: string, phone: string, password: string) => {
    const response = await authAPI.register(fullName, phone, password);
    setUser(response.user);
    storage.setUser(response.user);
    storage.setToken(response.token);
  };

  const logout = () => {
    setUser(null);
    storage.clearUser();
    storage.clearToken();
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

