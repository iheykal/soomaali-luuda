import { API_URL } from '../lib/apiConfig';
import { instrumentedFetch } from './apiService';

const getApiUrl = () => {
    return API_URL || 'http://localhost:5000/api';
};

/**
 * Get user's referral statistics
 */
export async function getReferralStats() {
    const url = `${getApiUrl()}/referrals/stats`;
    const token = localStorage.getItem('ludo_token');

    const { responseData } = await instrumentedFetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    return responseData;
}

/**
 * Get paginated referral earnings history
 */
export async function getReferralEarnings(page = 1, limit = 20) {
    const url = `${getApiUrl()}/referrals/earnings?page=${page}&limit=${limit}`;
    const token = localStorage.getItem('ludo_token');

    const { responseData } = await instrumentedFetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    return responseData;
}

/**
 * Get user's referral code and share URL
 */
export async function getReferralCode() {
    const url = `${getApiUrl()}/referrals/code`;
    const token = localStorage.getItem('ludo_token');

    const { responseData } = await instrumentedFetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    return responseData;
}

/**
 * Validate a referral code
 * @param {string} code - The referral code to validate
 */
export async function validateReferralCode(code: string) {
    const url = `${getApiUrl()}/referrals/validate`;

    const { responseData } = await instrumentedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
    });
    return responseData;
}
