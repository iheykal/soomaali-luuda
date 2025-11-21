
export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

export type TurnState = 'ROLLING' | 'MOVING' | 'ANIMATING' | 'GAMEOVER';

export type TokenPosition =
  | { type: 'YARD'; index: number } // 0-3 in the yard
  | { type: 'PATH'; index: number } // 0-51 on the main path
  | { type: 'HOME_PATH'; index: number } // 0-4 in the home path
  | { type: 'HOME' }; // Finished

export interface Token {
  id: string; // e.g., 'red-0'
  color: PlayerColor;
  position: TokenPosition;
}

export interface Player {
  color: PlayerColor;
  isAI: boolean;
  isDisconnected?: boolean;
  userId?: string;
  username?: string;
}

export interface LegalMove {
  tokenId: string;
  finalPosition: TokenPosition;
}

export interface GameState {
  players: Player[];
  tokens: Token[];
  currentPlayerIndex: number;
  diceValue: number | null;
  turnState: TurnState;
  message: string;
  gameStarted: boolean;
  winners: PlayerColor[];
  legalMoves: LegalMove[];
  timer: number; // Countdown timer in seconds
  _pendingExtraTurn?: boolean;
  stake?: number;
  gameId?: string;
  status?: string;
  createdAt?: string;
}

// New type for simulating a multiplayer game session
export interface MultiplayerGame {
  id: string;
  hostSessionId: string;
  guestSessionId: string | null;
  state: GameState;
  lastUpdate: number; // Used to trigger storage events reliably
  stake?: number; // The betting amount
}

export type MultiplayerMessage =
  | { type: 'PLAYER_JOINED'; payload: { sessionId: string } }
  | { type: 'GAME_ACTION'; payload: { action: any; sessionId: string } }
  | { type: 'GAME_STATE_UPDATE'; payload: { state: GameState; sessionId: string } }
  | { type: 'GAME_TERMINATED'; payload: { reason: string } }
  | { type: 'GAME_STARTING'; payload: { players: Player[] } };

// --- Account & Finance Types ---

export interface User {
  id?: string;
  _id?: string; // MongoDB uses _id
  username: string;
  phone?: string;
  email?: string;
  password?: string; // Simple password for demo
  balance: number;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  avatar: string;
  status: 'Active' | 'Suspended';
  joined?: string;
  createdAt?: string;
  stats?: {
    gamesPlayed: number;
    wins: number;
  };
}

export interface FinancialRequest {
  id?: string;
  _id?: string;
  shortId?: number;
  userId: string;
  userName: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp: string;
  details?: string;
  adminComment?: string;
}

export interface Revenue {
  id?: string;
  _id?: string;
  gameId: string;
  amount: number;
  totalPot: number;
  winnerId: string;
  timestamp: string;
  reason: string;
}

export interface RevenueWithdrawal {
  id?: string;
  _id?: string;
  amount: number;
  adminId: string;
  adminName: string;
  destination: string;
  reference: string;
  timestamp: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
}

export interface RevenueStats {
  totalRevenue: number;
  totalWithdrawn: number;
  netRevenue: number;
  history: Revenue[];
  withdrawals: RevenueWithdrawal[];
  filter: string;
}

export interface MatchHistory {
  gameId: string;
  date: string;
  opponentName: string;
  result: 'WON' | 'LOST';
  amount: number;
  stake: number;
}

export interface UserDetailsResponse {
  user: User;
  history: MatchHistory[];
}
