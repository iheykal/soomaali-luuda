
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
  lastEvent?: string | null; // Track last game event (e.g., 'CAPTURE')
  rerollsUsed?: Record<string, number>; // Tracking gem re-rolls per player
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
  gems?: number; // Virtual currency for re-rolls
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
  processedBy?: string; // ID of the admin who processed the request
  approverName?: string;
}

export interface Revenue {
  id?: string;
  _id?: string;
  gameId: string;
  amount: number;
  gemRevenue?: number;
  totalPot: number;
  winnerId: string;
  timestamp: string;
  reason: string;
  gameDetails?: GameDetailsForRevenue; // New field
}

export interface GameDetailsForRevenue {
  players: { userId?: string; username?: string; color: PlayerColor }[];
  winner: { userId?: string; username?: string; color: PlayerColor } | null;
  stake: number;
  gameId: string;
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

export interface Transaction {
  type: 'deposit' | 'withdrawal' | 'game_win' | 'game_loss' | 'game_refund' | 'match_stake' | 'match_unstake' | 'admin_deposit' | 'admin_withdrawal';
  amount: number;
  matchId?: string;
  description?: string;
  timestamp: string;
}

export interface UserDetailsResponse {
  user: User;
  history: MatchHistory[];
  transactions: Transaction[];
}

// Referral Leaderboard Types
export interface ReferredUser {
  id: string;
  username: string;
  phone?: string;
  stats: {
    gamesPlayed: number;
    wins: number;
  };
  balance: number;
  createdAt: string;
}

export interface ReferralLeaderboardEntry {
  referrer: {
    id: string;
    username: string;
    phone?: string;
    referralCode: string;
    referralEarnings: number;
  };
  totalReferrals: number;
  activeReferrals: number;
  inactiveReferrals: number;
  referredUsers: ReferredUser[];
}

export interface ReferralLeaderboardData {
  success: boolean;
  leaderboard: ReferralLeaderboardEntry[];
}

// Analytics Types for SuperAdmin Dashboard
export type AnalyticsTimeRange = '7d' | '30d' | '90d' | 'all';

export interface GGRDataPoint {
  date: Date;
  revenue: number;
  gamesCount: number;
}

export interface GGRData {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  data: GGRDataPoint[];
  summary: {
    total: number;
    averageDaily: number;
    daysCount: number;
  };
}

export interface DAUDataPoint {
  date: Date;
  activeUsers: number;
}

export interface DAUData {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  data: DAUDataPoint[];
  summary: {
    peak: number;
    average: number;
    daysCount: number;
  };
}

export interface AvgStakeDataPoint {
  date: Date;
  averageStake: number;
  totalStake: number;
  gamesCount: number;
}

export interface AvgStakeData {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  data: AvgStakeDataPoint[];
  summary: {
    current: number;
    daysCount: number;
  };
}

export interface RetentionDataPoint {
  date: Date;
  retentionRate: number;
  totalUsers: number;
  returnedUsers: number;
}

export interface RetentionData {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  data: RetentionDataPoint[];
  summary: {
    overallRetention: number;
    totalUsers: number;
    daysCount: number;
  };
}

export interface MatchVelocityDataPoint {
  hour: number;
  matches: number;
}

export interface MatchVelocityData {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  data: MatchVelocityDataPoint[];
  summary: {
    peakHour: number;
    peakMatches: number;
    averagePerHour: number;
    totalMatches: number;
  };
}

export interface AnalyticsOverview {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  overview: {
    ggr: number;
    dau: number;
    avgStake: number;
    totalGames: number;
    revenueGames: number;
  };
}

export interface TodayAnalytics {
  success: boolean;
  timeRange: 'today';
  data: {
    moneyFlow: {
      deposits: {
        amount: number;
        count: number;
      };
      withdrawals: {
        amount: number;
        count: number;
      };
      netFlow: number;
      totalTransactions: number;
    };
    rake: {
      totalEarned: number;
      fromGamesCount: number;
      totalPotValue: number;
    };
    gameplay: {
      totalGames: number;
      totalStaked: number;
      depositsPlayed: number;
      depositsPlayedPercentage: string;
      rakeFromDeposits: number;
    };
  };
}
