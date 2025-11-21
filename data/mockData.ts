
// This file contains mock data to simulate a real backend for the admin dashboard.

export const mockUsers = [
  { id: 'u001', name: 'Alice', email: 'alice@example.com', balance: 1250, gamesPlayed: 15, wins: 8, status: 'Active', joined: '2023-10-15', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice' },
  { id: 'u002', name: 'Bob', email: 'bob@example.com', balance: 800, gamesPlayed: 12, wins: 5, status: 'Active', joined: '2023-10-18', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob' },
  { id: 'u003', name: 'Charlie', email: 'charlie@example.com', balance: 2500, gamesPlayed: 25, wins: 18, status: 'Active', joined: '2023-09-01', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie' },
  { id: 'u004', name: 'Diana', email: 'diana@example.com', balance: 50, gamesPlayed: 5, wins: 0, status: 'Suspended', joined: '2023-11-01', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana' },
  { id: 'u005', name: 'Gemini AI', email: 'ai@gemini.dev', balance: null, gamesPlayed: 100, wins: 78, status: 'System', joined: '2023-01-01', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Gemini' },
];

export const mockGames = [
  { 
    id: 'g001', 
    players: ['Alice (u001)', 'Bob (u002)'], 
    stake: 50, 
    pot: 100, 
    winner: 'Alice (u001)', 
    status: 'Completed', 
    startedAt: '2023-11-10T10:00:00Z', 
    duration: '12m 34s',
    moves: []
  },
  { 
    id: 'g002', 
    players: ['Charlie (u003)', 'Gemini AI'], 
    stake: 100, 
    pot: 200, 
    winner: 'Charlie (u003)', 
    status: 'Completed', 
    startedAt: '2023-11-10T11:30:00Z', 
    duration: '8m 12s',
    moves: []
  },
  { 
    id: 'g003', 
    players: ['Alice (u001)', 'Gemini AI'], 
    stake: 50, 
    pot: 100, 
    winner: null, 
    status: 'In Progress', 
    startedAt: '2023-11-11T09:00:00Z', 
    duration: '5m 02s',
    moves: []
  },
   { 
    id: 'g004', 
    players: ['Diana (u004)', 'Bob (u002)'], 
    stake: 25, 
    pot: 50, 
    winner: null, 
    status: 'Disputed', 
    startedAt: '2023-11-09T14:00:00Z', 
    duration: '15m 50s',
    moves: []
  },
];

export const mockTransactions = [
  { id: 't001', userId: 'u001', type: 'Entry Fee', amount: -50, date: '2023-11-10T10:00:00Z', description: 'Game g001 entry' },
  { id: 't002', userId: 'u002', type: 'Entry Fee', amount: -50, date: '2023-11-10T10:00:00Z', description: 'Game g001 entry' },
  { id: 't003', userId: 'u001', type: 'Winnings', amount: 95, date: '2023-11-10T10:12:34Z', description: 'Game g001 win (5% commission)' },
  { id: 't004', userId: 'platform', type: 'Commission', amount: 5, date: '2023-11-10T10:12:34Z', description: 'Game g001 rake' },
  { id: 't005', userId: 'u003', type: 'Entry Fee', amount: -100, date: '2023-11-10T11:30:00Z', description: 'Game g002 entry' },
  { id: 't006', userId: 'u003', type: 'Winnings', amount: 190, date: '2023-11-10T11:38:12Z', description: 'Game g002 win (5% commission)' },
  { id: 't007', userId: 'platform', type: 'Commission', amount: 10, date: '2023-11-10T11:38:12Z', description: 'Game g002 rake' },
  { id: 't008', userId: 'u004', type: 'Manual Adjustment', amount: 100, date: '2023-11-11T15:00:00Z', description: 'Credited by admin for dispute g004' },
] as const;

export const mockAuditLog = [
    { id: 'a001', admin: 'super_admin', action: "Logged in from IP 192.168.1.100", timestamp: '2023-11-11T14:55:12Z' },
    { id: 'a002', admin: 'super_admin', action: "Viewed details for Game g004", timestamp: '2023-11-11T14:58:03Z' },
    { id: 'a003', admin: 'super_admin', action: "Manually credited 100 to User Diana (u004). Reason: Refund for disputed game g004.", timestamp: '2023-11-11T15:00:00Z' },
    { id: 'a004', admin: 'super_admin', action: "Changed system setting 'commission_rate' from '5' to '7'", timestamp: '2023-11-11T15:02:45Z' },
    { id: 'a005', admin: 'support_staff', action: "Logged in from IP 203.0.113.25", timestamp: '2023-11-11T16:10:05Z' },
    { id: 'a006', admin: 'support_staff', action: "Suspended User Diana (u004). Reason: Fair play violation.", timestamp: '2023-11-11T16:11:30Z' },
].reverse();

export interface FinancialRequest {
    id: string;
    userId: string;
    userName: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amount: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    timestamp: string;
    details?: string;
}

export const mockRequests: FinancialRequest[] = [
    { id: 'r001', userId: 'u002', userName: 'Bob', type: 'DEPOSIT', amount: 500, status: 'PENDING', timestamp: '2023-11-12T08:30:00Z', details: 'Stripe Transfer' },
    { id: 'r002', userId: 'u004', userName: 'Diana', type: 'WITHDRAWAL', amount: 45, status: 'PENDING', timestamp: '2023-11-12T10:15:00Z', details: 'PayPal: diana@example.com' },
    { id: 'r003', userId: 'u001', userName: 'Alice', type: 'WITHDRAWAL', amount: 200, status: 'PENDING', timestamp: '2023-11-12T11:00:00Z', details: 'Bank Wire: **** 1234' },
    { id: 'r004', userId: 'u003', userName: 'Charlie', type: 'DEPOSIT', amount: 1000, status: 'APPROVED', timestamp: '2023-11-11T09:00:00Z', details: 'Crypto Transfer' },
];

export const mockRevenueData = [
  { day: 'Mon', amount: 120 },
  { day: 'Tue', amount: 145 },
  { day: 'Wed', amount: 90 },
  { day: 'Thu', amount: 210 },
  { day: 'Fri', amount: 180 },
  { day: 'Sat', amount: 320 },
  { day: 'Sun', amount: 290 },
];

export const mockActivityFeed = [
  { id: 1, text: "User #u001 won $95 in Game #g001", time: "2 mins ago", type: "win" },
  { id: 2, text: "Deposit of $500 pending from Bob", time: "5 mins ago", type: "alert" },
  { id: 3, text: "New user registration: Frank", time: "12 mins ago", type: "info" },
  { id: 4, text: "Commission of $10 recorded", time: "15 mins ago", type: "revenue" },
  { id: 5, text: "Game #g004 marked as Disputed", time: "1 hour ago", type: "error" },
];
