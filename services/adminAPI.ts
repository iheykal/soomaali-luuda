import { API_URL } from '../lib/apiConfig';
import type { User, FinancialRequest, Revenue, RevenueWithdrawal, GameState, UserDetailsResponse, ReferralLeaderboardData } from '../types';
import { instrumentedFetch } from './apiService';

const getApiUrl = () => {
  return API_URL || 'http://localhost:5000/api';
};

const getAuthToken = () => {
  return localStorage.getItem('ludo_token');
};

const getAuthHeaders = () => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export const adminAPI = {
  async getAllUsers(): Promise<User[]> {
    const url = `${getApiUrl()}/admin/users`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData.users || [];
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch users';
      throw new Error(errorMessage);
    }
  },

  async getRevenueStats(filter: string = 'all', page: number = 1, limit: number = 10): Promise<{
    totalRevenue: number;
    totalWithdrawn: number;
    netRevenue: number;
    history: Revenue[];
    withdrawals: RevenueWithdrawal[];
    filter: string;
    pagination?: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      limit: number;
    }
  }> {
    const url = `${getApiUrl()}/admin/revenue?filter=${filter}&page=${page}&limit=${limit}`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return {
        totalRevenue: responseData.totalRevenue,
        totalWithdrawn: responseData.totalWithdrawn || 0,
        netRevenue: responseData.netRevenue || (responseData.totalRevenue - (responseData.totalWithdrawn || 0)),
        history: responseData.history || [],
        withdrawals: responseData.withdrawals || [],
        filter: responseData.filter || filter,
        pagination: responseData.pagination
      };
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch revenue stats';
      throw new Error(errorMessage);
    }
  },

  async withdrawRevenue(amount: number, destination: string, reference?: string): Promise<RevenueWithdrawal> {
    const url = `${getApiUrl()}/admin/revenue/withdraw`;
    const options = {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ amount, destination, reference }),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData.withdrawal;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to withdraw revenue';
      throw new Error(errorMessage);
    }
  },

  async getActiveGames(): Promise<GameState[]> {
    const url = `${getApiUrl()}/admin/games/active`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData.games || [];
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch active games';
      throw new Error(errorMessage);
    }
  },

  async forceRejoin(gameId: string): Promise<GameState> {
    const url = `${getApiUrl()}/admin/games/force-rejoin/${gameId}`;
    const options = {
      method: 'POST',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData.game;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to force rejoin';
      throw new Error(errorMessage);
    }
  },

  async deleteGame(gameId: string): Promise<void> {
    const url = `${getApiUrl()}/admin/matches/${gameId}`;
    const options = {
      method: 'DELETE',
      headers: getAuthHeaders(),
    };

    try {
      await instrumentedFetch(url, options);
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to delete game';
      throw new Error(errorMessage);
    }
  },

  // Delete specific user
  deleteUser: async (userId: string): Promise<void> => {
    const url = `${getApiUrl()}/admin/user/${userId}`;
    const options = {
      method: 'DELETE',
      headers: getAuthHeaders(),
    };

    try {
      await instrumentedFetch(url, options);
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to delete user';
      throw new Error(errorMessage);
    }
  },

  // Delete specific financial request
  deleteFinancialRequest: async (requestId: string): Promise<void> => {
    const url = `${getApiUrl()}/admin/financial-request/${requestId}`;
    const options = {
      method: 'DELETE',
      headers: getAuthHeaders(),
    };

    try {
      await instrumentedFetch(url, options);
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to delete financial request';
      throw new Error(errorMessage);
    }
  },

  // Delete specific revenue entry
  deleteRevenueEntry: async (revenueId: string): Promise<void> => {
    const url = `${getApiUrl()}/admin/revenue/${revenueId}`;
    const options = {
      method: 'DELETE',
      headers: getAuthHeaders(),
    };

    try {
      await instrumentedFetch(url, options);
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to delete revenue entry';
      throw new Error(errorMessage);
    }
  },

  // Delete specific withdrawal
  deleteWithdrawal: async (withdrawalId: string): Promise<void> => {
    const url = `${getApiUrl()}/admin/withdrawal/${withdrawalId}`;
    const options = {
      method: 'DELETE',
      headers: getAuthHeaders(),
    };

    try {
      await instrumentedFetch(url, options);
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to delete withdrawal';
      throw new Error(errorMessage);
    }
  },

  async getUserDetails(userId: string): Promise<UserDetailsResponse> {
    const url = `${getApiUrl()}/admin/user/${userId}/details`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch user details';
      throw new Error(errorMessage);
    }
  },

  async getWalletRequests(): Promise<FinancialRequest[]> {
    const url = `${getApiUrl()}/admin/wallet/requests`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);

      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch requests');
      }

      return responseData.requests || [];
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch wallet requests';
      throw new Error(errorMessage);
    }
  },

  async processWalletRequest(requestId: string, action: 'APPROVE' | 'REJECT', comment?: string): Promise<{ request: FinancialRequest; user?: { phone?: string | null } }> {
    const url = `${getApiUrl()}/admin/wallet/request/${requestId}`;
    const options = {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ action, adminComment: comment }),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return { request: responseData.request, user: responseData.user };
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to process wallet request';
      throw new Error(errorMessage);
    }
  },

  async updateUserBalance(userId: string, amount: number, type: 'deposit' | 'withdrawal', comment?: string): Promise<{ success: boolean; message: string; user: { id: string; username: string; balance: number } }> {
    const url = `${getApiUrl()}/admin/user/balance-update`;
    const options = {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, amount, type, comment }),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to update user balance';
      throw new Error(errorMessage);
    }
  },

  async getVisitorAnalytics(): Promise<{
    totalVisitors: number;
    authenticatedVisitors: number;
    anonymousVisitors: number;
    returningVisitors: number;
    topVisitors: Array<{
      username: string | null;
      pageViews: number;
      isAuthenticated: boolean;
      lastActivity: string;
    }>;
    hourlyActivity: Array<{ hour: number; visitors: number }>;
  }> {
    const url = `${getApiUrl()}/admin/visitor-analytics`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch visitor analytics';
      throw new Error(errorMessage);
    }
  },

  async refundGame(gameId: string): Promise<{ success: boolean, message: string }> {
    const url = `${getApiUrl()}/admin/games/${gameId}/refund`;
    const options = {
      method: 'POST',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to refund game';
      throw new Error(errorMessage);
    }
  },

  async getReferralLeaderboard(): Promise<ReferralLeaderboardData> {
    const url = `${getApiUrl()}/admin/referral-leaderboard`;
    const options = {
      method: 'GET',
      headers: getAuthHeaders(),
    };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || error.responseData?.error || 'Failed to fetch referral leaderboard';
      throw new Error(errorMessage);
    }
  }
};
