import { API_URL } from '../lib/apiConfig';
import type { User } from '../types';

interface LoginResponse {
  user: User;
  token: string;
}

interface AuthError {
  message: string;
  code?: string;
}

const getAuthUrl = () => {
  return API_URL || 'http://localhost:5000/api';
};

export const authAPI = {
  async login(phone: string, password: string): Promise<LoginResponse> {
    const url = `${getAuthUrl()}/auth/login`;
    console.log('🔧 Auth API Configuration:', { API_URL, url });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          password,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Login failed';
        try {
          const error: AuthError = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          // If response is not JSON, try to get text
          try {
            const text = await response.text();
            if (text) errorMessage = text;
          } catch {
            // Use default error message
          }
        }
        
        // Provide more specific error messages
        if (response.status === 401) {
          throw new Error('Invalid phone number or password');
        } else if (response.status === 403) {
          throw new Error('Account is suspended');
        } else if (response.status === 404) {
          throw new Error('Server not found. Please check if the backend is running.');
        } else if (response.status === 0 || response.status >= 500) {
          throw new Error('Cannot connect to server. Please ensure the backend is running on port 5000.');
        }
        
        throw new Error(errorMessage);
      }

      const data: LoginResponse = await response.json();
      return data;
    } catch (error: any) {
      console.error('API: Login error:', error);
      
      // Provide user-friendly error messages
      if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend is running on port 5000.');
      }
      
      throw new Error(error.message || 'Failed to connect to server');
    }
  },

  async register(fullName: string, phone: string, password: string): Promise<LoginResponse> {
    const url = `${getAuthUrl()}/auth/register`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          phone,
          password,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Registration failed';
        try {
          const error: AuthError = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          try {
            const text = await response.text();
            if (text) errorMessage = text;
          } catch {
            // Use default
          }
        }
        
        if (response.status === 0 || response.status >= 500) {
          throw new Error('Cannot connect to server. Please ensure the backend is running on port 5000.');
        }
        
        throw new Error(errorMessage);
      }

      const data: LoginResponse = await response.json();
      return data;
    } catch (error: any) {
      console.error('API: Register error:', error);
      
      if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend is running on port 5000.');
      }
      
      throw new Error(error.message || 'Failed to register');
    }
  },

  async getCurrentUser(): Promise<User> {
    const url = `${getAuthUrl()}/auth/me`;
    // Use the centralized API client which handles the token and errors
    return apiClient.get(url);
  },

  async requestPasswordReset(phoneOrUsername: string): Promise<void> {
    const url = `${getAuthUrl()}/auth/forgot-password`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneOrUsername }),
    });

    if (!response.ok) {
      const error: AuthError = await response.json().catch(() => ({
        message: 'Failed to request password reset',
      }));
      throw new Error(error.message || 'Failed to request password reset');
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const url = `${getAuthUrl()}/auth/reset-password`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, newPassword }),
    });

    if (!response.ok) {
      const error: AuthError = await response.json().catch(() => ({
        message: 'Failed to reset password',
      }));
      throw new Error(error.message || 'Failed to reset password');
    }
  },
};

