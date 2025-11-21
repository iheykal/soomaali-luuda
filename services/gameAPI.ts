import { API_URL } from '../lib/apiConfig';

interface ActiveGameResponse {
  hasActiveGame: boolean;
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
  async checkActiveGame(userId: string): Promise<ActiveGameResponse> {
    const url = `${getGameUrl()}/game/check-active/${userId}`;
    console.log('🔍 Checking for active game:', { userId, url });
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to check active game';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      const data: ActiveGameResponse = await response.json();
      console.log('✅ Active game check result:', data);
      return data;
    } catch (error: any) {
      console.error('Error checking active game:', error);
      // Return no active game on error to avoid blocking the user
      return { hasActiveGame: false, game: null };
    }
  },

  async rejoinGame(gameId: string, userId: string, userName?: string): Promise<RejoinResponse> {
    const url = `${getGameUrl()}/game/rejoin`;
    console.log('🔄 Rejoining game:', { gameId, userId, userName, url });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameId, userId, userName }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to rejoin game';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      const data: RejoinResponse = await response.json();
      console.log('✅ Rejoin successful:', data);
      return data;
    } catch (error: any) {
      console.error('Error rejoining game:', error);
      throw new Error(error.message || 'Failed to rejoin game');
    }
  },
};

