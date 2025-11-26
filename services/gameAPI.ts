import { API_URL } from '../lib/apiConfig';
import { instrumentedFetch } from './api';

interface ActiveGameResponse {
  hasActiveGame: boolean;
  message?: string; // Add this line
  game: {
    gameId: string;
    playerColor: string;
    isDisconnected: boolean;
    status: string;
    stake: number;
    allPawnsHome?: boolean;
    winners?: string[];
  } | null;
}

interface RejoinResponse {
  success: boolean;
  gameId: string;
  playerColor: string;
  allPawnsHome: boolean;
  canRejoin: boolean;
}

const getGameUrl = () => {
  return API_URL || 'http://localhost:5000/api';
};

export const gameAPI = {
  async checkActiveGame(userId: string, gameId?: string): Promise<ActiveGameResponse> {
    let url = `${getGameUrl()}/game/check-active/${userId}`;
    if (gameId) {
      url += `?gameId=${gameId}`;
    }
    const options = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      };

    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      console.error('Error checking active game:', error);
      // Return no active game on error to avoid blocking the user
      return { hasActiveGame: false, game: null };
    }
  },

  async rejoinGame(gameId: string, userId: string, userName?: string): Promise<RejoinResponse> {
    const url = `${getGameUrl()}/game/rejoin`;
    const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameId, userId, userName }),
      };
    
    try {
      const { responseData } = await instrumentedFetch(url, options);
      return responseData;
    } catch (error: any) {
      const errorMessage = error.responseData?.message || 'Failed to rejoin game';
      throw new Error(errorMessage);
    }
  },
};

