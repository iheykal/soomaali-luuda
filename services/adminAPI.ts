import { API_URL } from '../lib/apiConfig';
import type { User, FinancialRequest, Revenue, RevenueWithdrawal, GameState, UserDetailsResponse } from '../types';

const getApiUrl = () => {
  return API_URL || 'http://localhost:5000/api';
};

const getAuthToken = () => {
  return localStorage.getItem('ludo_token');
};

export const adminAPI = {
  async getAllUsers(): Promise<User[]> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/users`;
    
    if (!token) {
      throw new Error('No authentication token');
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          try {
            const errorData = await response.json();
            throw new Error(errorData.message || errorData.error || 'Access denied. Super Admin role required.');
          } catch {
            throw new Error('Access denied. Super Admin role required.');
          }
        }
        const error = await response.json().catch(() => ({ message: 'Failed to fetch users' }));
        throw new Error(error.message || error.error || 'Failed to fetch users');
      }

      const data = await response.json();
      return data.users || [];
    } catch (error: any) {
      console.error('API: Get users error:', error);
      if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend is running.');
      }
      throw new Error(error.message || 'Failed to fetch users');
    }
  },

  async getRevenueStats(filter: string = 'all'): Promise<{ 
    totalRevenue: number; 
    totalWithdrawn: number;
    netRevenue: number;
    history: Revenue[]; 
    withdrawals: RevenueWithdrawal[];
    filter: string 
  }> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/revenue?filter=${filter}`;

    if (!token) throw new Error('No authentication token');

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Failed to fetch revenue' }));
            throw new Error(error.message || error.error);
        }

        const data = await response.json();
        return {
            totalRevenue: data.totalRevenue,
            totalWithdrawn: data.totalWithdrawn || 0,
            netRevenue: data.netRevenue || (data.totalRevenue - (data.totalWithdrawn || 0)),
            history: data.history || [],
            withdrawals: data.withdrawals || [],
            filter: data.filter || filter
        };
    } catch (error: any) {
        throw new Error(error.message || 'Failed to fetch revenue stats');
    }
  },

  async withdrawRevenue(amount: number, destination: string, reference?: string): Promise<RevenueWithdrawal> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/revenue/withdraw`;

    if (!token) throw new Error('No authentication token');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, destination, reference }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to withdraw revenue' }));
        throw new Error(error.message || error.error);
      }

      const data = await response.json();
      return data.withdrawal;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to withdraw revenue');
    }
  },

  async getActiveGames(): Promise<GameState[]> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/games/active`;

    if (!token) throw new Error('No authentication token');

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Failed to fetch active games' }));
            throw new Error(error.message || error.error);
        }

        const data = await response.json();
        return data.games || [];
    } catch (error: any) {
        throw new Error(error.message || 'Failed to fetch active games');
    }
  },

  async deleteGame(gameId: string): Promise<void> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/matches/${gameId}`;

    if (!token) throw new Error('No authentication token');

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to delete game' }));
        throw new Error(error.message || error.error);
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete game');
    }
  },

  async getUserDetails(userId: string): Promise<UserDetailsResponse> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/user/${userId}/details`;

    if (!token) throw new Error('No authentication token');

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Failed to fetch user details' }));
            throw new Error(error.message || error.error);
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        throw new Error(error.message || 'Failed to fetch user details');
    }
  },

  async getWalletRequests(): Promise<FinancialRequest[]> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/wallet/requests`;

    if (!token) {
      console.error('❌ No authentication token for getWalletRequests');
      throw new Error('No authentication token');
    }

    try {
      console.log('🔄 Fetching wallet requests from:', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch requests' }));
        console.error('❌ Error response:', errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to fetch requests');
      }

      const data = await response.json();
      console.log('✅ Received data:', { success: data.success, requestCount: data.requests?.length || 0 });
      
      if (!data.success) {
        console.error('❌ API returned success: false');
        throw new Error(data.error || 'Failed to fetch requests');
      }
      
      const requests = data.requests || [];
      console.log('📋 Returning requests:', requests.length);
      return requests;
    } catch (error: any) {
      console.error('❌ getWalletRequests error:', error);
      throw new Error(error.message || 'Failed to fetch wallet requests');
    }
  },

  async processWalletRequest(requestId: string, action: 'APPROVE' | 'REJECT', comment?: string): Promise<{ request: FinancialRequest; user?: { phone?: string | null } }> {
    const token = getAuthToken();
    const url = `${getApiUrl()}/admin/wallet/request/${requestId}`;

    if (!token) throw new Error('No authentication token');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, adminComment: comment }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to process request' }));
        throw new Error(errorData.message || errorData.error || 'Failed to process request');
      }

      const data = await response.json();
      return { request: data.request, user: data.user };
    } catch (error: any) {
       throw new Error(error.message || 'Failed to process wallet request');
    }
  }
};
