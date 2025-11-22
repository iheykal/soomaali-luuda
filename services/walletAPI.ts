// services/walletAPI.ts
import { apiClient } from './api';
import { API_URL } from '../lib/apiConfig';
import type { FinancialRequest, User } from '../types';

const getWalletUrl = (endpoint: string) => {
  return `${API_URL}/wallet/${endpoint}`;
};

const getAuthUrl = (endpoint: string) => {
    return `${API_URL}/auth/${endpoint}`;
};

interface MyRequestsResponse {
  success: boolean;
  requests: FinancialRequest[];
}

interface RequestResponse {
  success: boolean;
  message: string;
  request: FinancialRequest;
}

export const walletAPI = {
  /**
   * Fetches the current user's data.
   */
  async getCurrentUser(): Promise<User> {
    const url = getAuthUrl('me');
    return apiClient.get(url);
  },

  /**
   * Fetches the financial requests for the current user.
   */
  async getMyRequests(): Promise<MyRequestsResponse> {
    const url = getWalletUrl('my-requests');
    return apiClient.get(url);
  },

  /**
   * Creates a new financial request (deposit or withdrawal).
   */
  async createRequest(
    type: 'DEPOSIT' | 'WITHDRAWAL',
    amount: number,
    details: { userId: string; userName: string; fullName?: string, phoneNumber?: string }
  ): Promise<RequestResponse> {
    const url = getWalletUrl('request');
    const body = {
      userId: details.userId,
      userName: details.userName,
      type,
      amount,
      details: type === 'DEPOSIT'
        ? `Name: ${details.fullName}, Phone: ${details.phoneNumber} (Web Request)`
        : 'Manual Withdrawal Request via Web Wallet',
    };
    return apiClient.post(url, body);
  },
};
