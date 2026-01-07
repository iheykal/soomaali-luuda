import React, { useRef, useState, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { adminAPI } from '../../services/adminAPI';
import { useAuth } from '../../context/AuthContext';
import type { User, FinancialRequest, Revenue, RevenueWithdrawal, GameState, UserDetailsResponse, ReferralLeaderboardEntry } from '../../types';
import Board from '../GameBoard';
import Dice from '../Dice';
import { useGameLogic } from '../../hooks/useGameLogic';
import TransactionReceipt from '../TransactionReceipt';

import ErrorBoundary from '../ErrorBoundary';
import AnalyticsDashboard from './AnalyticsDashboard';

// --- Spectator Modal Component ---
const SpectatorModal: React.FC<{ gameId: string; onClose: () => void }> = ({ gameId, onClose }) => {
  const spectatorConfig = React.useMemo(() => ({
    gameId,
    isSpectator: true
  }), [gameId]);

  const { state, handleAnimationComplete } = useGameLogic(spectatorConfig);

  const isGameLoaded = state.players && state.players.length > 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-2 sm:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[98vh] overflow-hidden flex flex-col h-[95vh]">
        <div className="p-3 sm:p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <h3 className="text-base sm:text-xl font-bold text-gray-900 truncate">LIVE Spectator - Game #{gameId}</h3>
          </div>
          <button onClick={onClose} className="p-1 sm:p-2 hover:bg-gray-200 rounded-full transition-colors">
            <span className="text-xl sm:text-2xl leading-none">&times;</span>
          </button>
        </div>

        <ErrorBoundary name="SpectatorModal Content">
          {!isGameLoaded ? (
            <div className="flex-1 overflow-hidden bg-slate-800 flex flex-col items-center justify-center text-white p-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-base sm:text-lg font-bold">Connecting to game...</p>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 text-center">Waiting for server response...</p>
              <button
                onClick={onClose}
                className="mt-8 px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-slate-800 flex flex-col md:flex-row min-h-0">
              {/* Game Board Area */}
              <div className="w-full md:flex-1 flex flex-col items-center justify-center p-2 sm:p-4 relative min-h-[350px] sm:min-h-[500px]">
                {/* Status Overlay - Optimized for mobile */}
                <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-white/95 p-2 sm:p-4 rounded-lg sm:rounded-xl shadow-lg z-10 backdrop-blur-sm border border-white/20 max-w-[140px] sm:max-w-xs transition-all pointer-events-auto">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <div className={`w-2.5 h-2.5 sm:w-3 h-3 rounded-full ${state.players[state.currentPlayerIndex]?.color === 'red' ? 'bg-red-500' :
                      state.players[state.currentPlayerIndex]?.color === 'green' ? 'bg-green-500' :
                        state.players[state.currentPlayerIndex]?.color === 'yellow' ? 'bg-yellow-500' :
                          'bg-blue-500'
                      }`}></div>
                    <p className="font-bold text-gray-800 uppercase text-[10px] sm:text-xs">Current Turn</p>
                  </div>
                  <p className="text-[10px] sm:text-sm text-gray-600 mb-1.5 sm:mb-2 line-clamp-2 leading-tight">{state.message || 'Waiting...'}</p>

                  <div className={`flex justify-center my-1 scale-75 sm:scale-90 origin-top min-h-[60px] transition-opacity duration-300 ${state.diceValue === null ? 'opacity-40 grayscale blur-[1px]' : 'opacity-100'}`}>
                    <ErrorBoundary name="Dice Component">
                      <Dice
                        value={state.diceValue}
                        onRoll={() => { }}
                        isMyTurn={false}
                        playerColor={state.players?.[state.currentPlayerIndex]?.color || 'red'}
                        timer={state.timer || 0}
                        turnState={(state.turnState as any) || 'ROLLING'}
                      />
                    </ErrorBoundary>
                  </div>
                </div>

                {/* Board Container - Fix Clipping and Aspect Ratio */}
                <div className="w-full h-full max-w-[90vw] max-h-[90vw] md:max-w-[85%] md:max-h-[85%] aspect-square shadow-2xl rounded-2xl overflow-hidden border-2 sm:border-4 border-slate-700 bg-slate-900 group relative">
                  <ErrorBoundary name="Board Component">
                    <Board
                      gameState={state}
                      onMoveToken={() => { }} // Spectators can't move
                      onAnimationComplete={handleAnimationComplete}
                      isMyTurn={false} // Always false for spectators
                      perspectiveColor={state.players[state.currentPlayerIndex]?.color || 'red'}
                    />
                  </ErrorBoundary>
                </div>
              </div>

              {/* Sidebar Info - Scrollable and Flex-optimized */}
              <div className="w-full md:w-72 lg:w-80 bg-slate-900 text-white flex flex-col border-t md:border-t-0 md:border-l border-slate-700">
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto lg:h-full">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Players Stats</h4>
                  <div className="space-y-2.5">
                    {state.players.map((p, i) => (
                      <div key={i} className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all ${i === state.currentPlayerIndex
                        ? 'bg-slate-800 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)] ring-1 ring-green-500/20'
                        : 'bg-slate-800/40 border-slate-700'
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-black shadow-lg translate-y-[-1px] ${p.color === 'green' ? 'bg-green-500 text-white' :
                            p.color === 'blue' ? 'bg-blue-500 text-white' :
                              p.color === 'red' ? 'bg-red-500 text-white' :
                                'bg-yellow-500 text-black'
                            }`}>
                            {p.color.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-black text-slate-100 capitalize">{p.name || p.color}</p>
                            <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold">
                              {p.isAI ? (
                                <span className="text-purple-400 flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-purple-400"></span> AI Bot
                                </span>
                              ) : (
                                <span className="text-blue-400 flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-blue-400"></span> Human
                                </span>
                              )}
                              {p.isDisconnected && <span className="text-red-400 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse"></span> Offline
                              </span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-[10px] text-slate-400">Home:</span>
                            <p className="text-xs sm:text-sm font-black text-white">{p.tokensAtHome || 0}/4</p>
                          </div>
                          <p className="text-[9px] text-slate-500 font-mono mt-0.5">{(p.id || '??????').slice(-6)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-800">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Game Summary</h4>
                    <div className="space-y-2.5 text-xs text-slate-400">
                      <div className="flex justify-between items-center bg-slate-800/30 p-2 rounded-lg">
                        <span className="font-semibold px-2">Turn State:</span>
                        <span className="text-white font-black bg-slate-700 px-2 py-0.5 rounded">{state.turnState || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-800/30 p-2 rounded-lg">
                        <span className="font-semibold px-2">Match Bet:</span>
                        <span className="text-green-400 font-black text-sm">${((state.stake || 0)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-800/30 p-2 rounded-lg">
                        <span className="font-semibold px-2">Total Pot:</span>
                        <span className="text-yellow-400 font-black text-sm">${((state.stake || 0) * 2).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sidebar Action - Only on desktop maybe? Or simple exit */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-800">
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-slate-700 hover:bg-red-600 rounded-xl text-sm font-bold transition-all shadow-lg"
                  >
                    Exit Spectator Mode
                  </button>
                </div>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
};

interface SuperAdminDashboardProps {
  onExit: () => void;
}

type AdminTab = 'dashboard' | 'analytics' | 'users' | 'games' | 'wallet' | 'revenue' | 'recent' | 'settings';

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onExit }) => {
  const { user } = useAuth();
  // Default to 'wallet' for standard ADMIN, 'dashboard' for SUPER_ADMIN
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    return (user?.role === 'ADMIN' && user?.role !== 'SUPER_ADMIN') ? 'wallet' : 'dashboard';
  });
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [revenueStats, setRevenueStats] = useState<{
    totalRevenue: number;
    totalWithdrawn: number;
    netRevenue: number;
    history: Revenue[];
    withdrawals: RevenueWithdrawal[];
    filter?: string;
    pagination?: { currentPage: number; totalPages: number; totalItems: number; limit: number }
  } | null>(null);
  const [revenueFilter, setRevenueFilter] = useState<string>('today');
  const [revenuePage, setRevenuePage] = useState<number>(1);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDestination, setWithdrawDestination] = useState('');
  const [withdrawReference, setWithdrawReference] = useState('');
  const [activeGames, setActiveGames] = useState<GameState[]>([]);
  const [visitorAnalytics, setVisitorAnalytics] = useState<{
    totalVisitors: number;
    authenticatedVisitors: number;
    anonymousVisitors: number;
    returningVisitors: number;
    topVisitors: Array<{ username: string | null; pageViews: number; isAuthenticated: boolean; lastActivity: string }>;
    hourlyActivity: Array<{ hour: number; visitors: number }>;
  } | null>(null);
  const [referralLeaderboard, setReferralLeaderboard] = useState<ReferralLeaderboardEntry[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: 'wins' | 'balance' | 'joined' | 'username'; direction: 'asc' | 'desc' }>({ key: 'joined', direction: 'desc' });

  // Spectator State
  const [watchingGameId, setWatchingGameId] = useState<string | null>(null);

  // User Pagination State


  // Live Duration State
  const [currentTime, setCurrentTime] = useState(Date.now());

  // User Pagination State (Removed)
  // const [usersPage, setUsersPage] = useState(1);
  // const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersTotalCount, setUsersTotalCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const getDuration = (createdAt?: string) => {
    if (!createdAt) return 'Just started';
    const start = new Date(createdAt).getTime();
    const diff = currentTime - start;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just started';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // User Modal State
  const [selectedUser, setSelectedUser] = useState<UserDetailsResponse | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userFinancialRequests, setUserFinancialRequests] = useState<FinancialRequest[]>([]);
  const [financialReceiptsToShow, setFinancialReceiptsToShow] = useState(5);
  // Admin balance adjustment state
  const [balanceAmount, setBalanceAmount] = useState<string>('');
  const [balanceType, setBalanceType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [balanceComment, setBalanceComment] = useState<string>('');

  // Receipt Generation State
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<{ req: FinancialRequest, user: { username: string, phone?: string } } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default filter to 'PENDING' for standard ADMIN, 'ALL' for SUPER_ADMIN
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(() => {
    return (user?.role === 'ADMIN' && user?.role !== 'SUPER_ADMIN') ? 'PENDING' : 'ALL';
  });
  const [phoneSearchQuery, setPhoneSearchQuery] = useState<string>('');

  // Notification State
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'success' | 'error' | null>(null);

  // Confirmation Modal State
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [confirmationAction, setConfirmationAction] = useState<(() => void) | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usersData = await adminAPI.getAllUsers();
      setUsers(usersData);
      setUsersTotalCount(usersData.length);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Fetching wallet requests...');
      const requestsData = await adminAPI.getWalletRequests();
      console.log('✅ Received wallet requests:', requestsData.length, requestsData);
      setRequests(requestsData || []);
    } catch (err: any) {
      console.error('❌ Error fetching requests:', err);
      setError(err.message || 'Failed to load requests');
      // Still set empty array to prevent undefined errors
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawAmount || !withdrawDestination) return;

    setLoading(true);
    try {
      await adminAPI.withdrawRevenue(parseFloat(withdrawAmount), withdrawDestination, withdrawReference);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawDestination('');
      setWithdrawReference('');
      fetchRevenue(revenueFilter); // Refresh stats
      showNotificationMessage('Withdrawal successful!', 'success');
    } catch (err: any) {
      showNotificationMessage('Withdrawal failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenue = useCallback(async (filter: string = revenueFilter, page: number = 1) => {
    setLoading(true);
    try {
      const stats = await adminAPI.getRevenueStats(filter, page);
      setRevenueStats(stats);
      setRevenueFilter(filter);
      setRevenuePage(page);
    } catch (err: any) {
      console.error('Error fetching revenue:', err);
    } finally {
      setLoading(false);
    }
  }, [revenueFilter]);

  const fetchActiveGames = useCallback(async () => {
    setLoading(true);
    try {
      const games = await adminAPI.getActiveGames();
      setActiveGames(games);
    } catch (err: any) {
      console.error('Error fetching active games:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVisitorAnalytics = useCallback(async () => {
    try {
      const analytics = await adminAPI.getVisitorAnalytics();
      setVisitorAnalytics(analytics);
    } catch (err: any) {
      console.error('Error fetching visitor analytics:', err);
    }
  }, []);

  const fetchReferralLeaderboard = useCallback(async () => {
    try {
      const result = await adminAPI.getReferralLeaderboard();
      setReferralLeaderboard(result.leaderboard || []);
    } catch (err: any) {
      console.error('Error fetching referral leaderboard:', err);
    }
  }, []);

  const fetchRecentTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getRecentQuickTransactions();
      setRecentTransactions(data || []);
    } catch (err: any) {
      console.error('Error fetching recent transactions:', err);
      showNotificationMessage('Failed to fetch recent transactions', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUserClick = async (userId: string) => {
    setLoading(true);
    try {
      const details = await adminAPI.getUserDetails(userId);
      setSelectedUser(details);

      // Fetch user's approved financial requests
      const allRequests = await adminAPI.getWalletRequests();
      const userApprovedRequests = allRequests.filter(
        req => req.userId === userId && req.status === 'APPROVED'
      );
      setUserFinancialRequests(userApprovedRequests);
      setFinancialReceiptsToShow(5); // Reset pagination

      setShowUserModal(true);
      // reset balance adjust fields
      setBalanceAmount('');
      setBalanceType('DEPOSIT');
      setBalanceComment('');
    } catch (err: any) {
      showNotificationMessage('Failed to fetch user details: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    showConfirmationDialog(`Are you sure you want to delete game #${gameId}? This action cannot be undone.`, async () => {
      setLoading(true);
      try {
        await adminAPI.deleteGame(gameId);
        showNotificationMessage(`Game #${gameId} deleted successfully`, 'success');
        fetchActiveGames();
      } catch (err: any) {
        showNotificationMessage('Error deleting game: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    showConfirmationDialog(`Are you sure you want to delete user "${username}" (ID: ${userId})? This action cannot be undone.`, async () => {
      setLoading(true);
      try {
        await adminAPI.deleteUser(userId);
        showNotificationMessage(`User "${username}" deleted successfully`, 'success');
        fetchUsers();
      } catch (err: any) {
        showNotificationMessage('Error deleting user: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteFinancialRequest = async (requestId: string, userName: string) => {
    showConfirmationDialog(`Are you sure you want to delete this financial request (ID: ${requestId}) from "${userName}"? This action cannot be undone.`, async () => {
      setLoading(true);
      try {
        await adminAPI.deleteFinancialRequest(requestId);
        showNotificationMessage('Financial request deleted successfully', 'success');
        fetchRequests();
      } catch (err: any) {
        showNotificationMessage('Error deleting financial request: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  // Admin: Update user balance (DEPOSIT or WITHDRAWAL)
  const performUpdateBalance = async (userId: string, amount: number, type: 'DEPOSIT' | 'WITHDRAWAL', comment?: string) => {
    setLoading(true);
    try {
      const result = await adminAPI.updateUserBalance(userId, amount, type.toLowerCase() as 'deposit' | 'withdrawal', comment);
      showNotificationMessage(result.message || 'Balance updated', 'success');
      // Refresh lists and selected user details
      await fetchUsers();
      if (selectedUser) {
        try {
          const refreshed = await adminAPI.getUserDetails(selectedUser.user.id || selectedUser.user._id);
          setSelectedUser(refreshed);
        } catch (e) {
          console.warn('Failed to refresh selected user after balance update', e);
        }
      }
    } catch (err: any) {
      console.error('Admin balance update failed:', err);
      showNotificationMessage('Failed to update balance: ' + (err.message || err), 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const confirmAndUpdateBalance = (userId: string) => {
    const amount = parseFloat(balanceAmount || '0');
    if (!amount || amount <= 0) {
      showNotificationMessage('Please enter a valid amount', 'error');
      return;
    }

    // For withdrawals, check client-side balance to avoid unnecessary calls
    if (balanceType === 'WITHDRAWAL' && selectedUser && typeof selectedUser.user.balance === 'number') {
      if (amount > selectedUser.user.balance) {
        showNotificationMessage('Insufficient user balance for withdrawal', 'error');
        return;
      }
    }

    showConfirmationDialog(
      `Are you sure you want to ${balanceType === 'DEPOSIT' ? 'Lacag-Dhigasho' : 'Lacag-Labixid'} $${amount.toFixed(2)} ${balanceType === 'DEPOSIT' ? 'to' : 'from'} user ${selectedUser?.user.username || ''}?`,
      async () => {
        try {
          await performUpdateBalance(userId, amount, balanceType, balanceComment);
          // Clear inputs on success
          setBalanceAmount('');
          setBalanceComment('');
        } catch (e) {
          // Error already handled in performUpdateBalance
        }
      }
    );
  };

  const handleDeleteRevenueEntry = async (revenueId: string) => {
    showConfirmationDialog(`Are you sure you want to delete this revenue entry (ID: ${revenueId})? This action cannot be undone.`, async () => {
      setLoading(true);
      try {
        await adminAPI.deleteRevenueEntry(revenueId);
        showNotificationMessage('Revenue entry deleted successfully', 'success');
        fetchRevenue(revenueFilter);
      } catch (err: any) {
        showNotificationMessage('Error deleting revenue entry: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteWithdrawal = async (withdrawalId: string) => {
    showConfirmationDialog(`Are you sure you want to delete this withdrawal entry (ID: ${withdrawalId})? This action cannot be undone.`, async () => {
      setLoading(true);
      try {
        await adminAPI.deleteWithdrawal(withdrawalId);
        showNotificationMessage('Withdrawal entry deleted successfully', 'success');
        fetchRevenue(revenueFilter);
      } catch (err: any) {
        showNotificationMessage('Error deleting withdrawal entry: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleProcessRequest = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    showConfirmationDialog(`Are you sure you want to ${action} this request (ID: ${requestId})?`, async () => {
      try {
        const result = await adminAPI.processWalletRequest(requestId, action, `Admin ${action}D`);

        // Auto-generate receipt on APPROVE
        if (action === 'APPROVE' && result) {
          // Find the original request to get user details
          const originalReq = requests.find(r => (r.id || r._id) === requestId);
          if (originalReq) {
            // Use the phone number from the API response (user's actual registered phone)
            // Fallback to users list if not in response
            const userPhone = result.user?.phone || users.find(u => u.id === originalReq.userId || u._id === originalReq.userId)?.phone;

            // Trigger receipt download with actual user phone number
            downloadReceipt(originalReq, userPhone || undefined);
          }
        }

        // Refresh data
        fetchRequests();
        fetchUsers(); // Balance might change
        showNotificationMessage(`Request ${action}D successfully`, 'success');
      } catch (err: any) {
        showNotificationMessage(`Failed to process: ${err.message}`, 'error');
      }
    });
  };

  const downloadReceipt = async (req: FinancialRequest, userPhone?: string) => {
    // If phone is not provided, try to find it in the loaded users list
    let phone = userPhone;
    if (!phone) {
      const user = users.find(u => u.id === req.userId || u._id === req.userId);
      phone = user?.phone;
    }

    // Temporarily render the receipt
    setReceiptData({
      req,
      user: {
        username: req.userName,
        phone: phone
      }
    });

    // Wait for render
    setTimeout(async () => {
      if (receiptRef.current) {
        try {
          const canvas = await html2canvas(receiptRef.current, {
            scale: 2, // Higher quality
            backgroundColor: '#ffffff',
            logging: false
          });

          const image = canvas.toDataURL("image/png");
          const link = document.createElement('a');
          link.href = image;
          link.download = `Ludo-Receipt-${req.type}-${req.id || Date.now()}.png`;
          link.click();
        } catch (err) {
          console.error('Receipt generation failed:', err);
          alert('Failed to generate receipt image');
        } finally {
          setReceiptData(null); // Hide receipt template
        }
      }
    }, 100);
  };

  // Helper to show custom notification
  const showNotificationMessage = (message: string, type: 'success' | 'error') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
      setNotificationMessage('');
      setNotificationType(null);
    }, 3000); // Notification disappears after 3 seconds
  };

  // Helper to show custom confirmation dialog
  const showConfirmationDialog = (message: string, onConfirm: () => void) => {
    setConfirmationMessage(message);
    setConfirmationAction(() => onConfirm); // Use a closure to store the action
    setShowConfirmationModal(true);
  };

  // Fetch data based on active tab
  useEffect(() => {
    if ((activeTab === 'users' || activeTab === 'dashboard') && user?.role === 'SUPER_ADMIN') {
      fetchUsers();
    }
    if (activeTab === 'wallet' || activeTab === 'dashboard') {
      fetchRequests();
    }
    if ((activeTab === 'revenue' || activeTab === 'dashboard') && user?.role === 'SUPER_ADMIN') {
      fetchRevenue(revenueFilter);
    }
    if ((activeTab === 'games' || activeTab === 'dashboard') && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN')) {
      fetchActiveGames();
    }
    if (activeTab === 'dashboard' && user?.role === 'SUPER_ADMIN') {
      fetchVisitorAnalytics();
      fetchReferralLeaderboard();
    }
    if (activeTab === 'recent') {
      fetchRecentTransactions();
    }
  }, [activeTab, fetchUsers, fetchRequests, fetchRevenue, fetchActiveGames, fetchVisitorAnalytics, fetchReferralLeaderboard, fetchRecentTransactions, user]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        const pendingRequestsCount = requests.filter(r => r.status === 'PENDING').length;
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Users - Only for SUPER_ADMIN */}
              {(user?.role === 'SUPER_ADMIN') && (
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 sm:p-6 rounded-xl border-2 border-green-200 shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer group" onClick={() => setActiveTab('users')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-green-500 rounded-xl group-hover:scale-110 transition-transform">
                      <span className="text-2xl">👥</span>
                    </div>
                    <span className="text-green-600 text-sm font-semibold">View All →</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold mb-2 text-green-700">Total Users</h2>
                  <p className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">{users.length}</p>
                  <p className="text-xs sm:text-sm text-gray-600">Registered players</p>
                </div>
              )}

              {/* Active Games - For SUPER_ADMIN and ADMIN */}
              {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 sm:p-6 rounded-xl border-2 border-blue-200 shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer group" onClick={() => setActiveTab('games')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-blue-500 rounded-xl group-hover:scale-110 transition-transform">
                      <span className="text-2xl">🎮</span>
                    </div>
                    <span className="text-blue-600 text-sm font-semibold">View All →</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold mb-2 text-blue-700">Active Games</h2>
                  <p className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">{activeGames.length}</p>
                  <p className="text-xs sm:text-sm text-gray-600">Matches in progress</p>
                </div>
              )}

              {/* Wallet - Visible to ADMIN and SUPER_ADMIN */}
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-5 sm:p-6 rounded-xl border-2 border-yellow-200 shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer group" onClick={() => setActiveTab('wallet')}>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-3 bg-yellow-500 rounded-xl group-hover:scale-110 transition-transform">
                    <span className="text-2xl">💰</span>
                  </div>
                  <span className="text-yellow-600 text-sm font-semibold">View All →</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold mb-2 text-yellow-700">Pending Requests</h2>
                <p className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">{pendingRequestsCount}</p>
                <p className="text-xs sm:text-sm text-gray-600">Wallet transactions</p>
              </div>

              {/* Revenue - Only for SUPER_ADMIN */}
              {(user?.role === 'SUPER_ADMIN') && (
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 sm:p-6 rounded-xl border-2 border-purple-200 shadow-md hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer group" onClick={() => setActiveTab('revenue')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-purple-500 rounded-xl group-hover:scale-110 transition-transform">
                      <span className="text-2xl">📈</span>
                    </div>
                    <span className="text-purple-600 text-sm font-semibold">View All →</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold mb-2 text-purple-700">Total Revenue</h2>
                  <p className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">${revenueStats?.totalRevenue.toFixed(2) || '0.00'}</p>
                  <p className="text-xs sm:text-sm text-gray-600">Platform earnings (10%)</p>
                </div>
              )}
            </div>
            {visitorAnalytics && user?.role === 'SUPER_ADMIN' && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <span>👁️</span> Visitor Analytics (Last 48 Hours)
                  </div>
                  <button
                    onClick={fetchVisitorAnalytics}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    🔄 Refresh
                  </button>
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Total</p>
                    <p className="text-2xl font-black text-gray-900">{visitorAnalytics.totalVisitors}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-xs text-green-700 uppercase font-semibold mb-1">Authenticated</p>
                    <p className="text-2xl font-black text-green-700">{visitorAnalytics.authenticatedVisitors}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 uppercase font-semibold mb-1">Anonymous</p>
                    <p className="text-2xl font-black text-blue-700">{visitorAnalytics.anonymousVisitors}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-700 uppercase font-semibold mb-1">Returning</p>
                    <p className="text-2xl font-black text-purple-700">{visitorAnalytics.returningVisitors}</p>
                  </div>
                </div>

                {/* Top Visitors */}
                {visitorAnalytics.topVisitors && visitorAnalytics.topVisitors.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">TOP VISITORS</h4>
                    <div className="space-y-2">
                      {visitorAnalytics.topVisitors.slice(0, 5).map((visitor, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900">
                              {visitor.username || 'Anonymous'}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full ${visitor.isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                              }`}>
                              {visitor.isAuthenticated ? 'User' : 'Guest'}
                            </span>
                          </div>
                          <span className="text-sm text-gray-600">{visitor.pageViews} views</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Referral Leaderboard - HIDDEN */}
            {/* {referralLeaderboard && referralLeaderboard.length > 0 && user?.role === 'SUPER_ADMIN' && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    <span>🏆</span> Referral Leaderboard
                  </h3>
                  <button
                    onClick={fetchReferralLeaderboard}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    🔄 Refresh
                  </button>
                </div>

                <div className="space-y-4">
                  {referralLeaderboard && referralLeaderboard.slice(0, 10).map((entry, index) => (
                    <ReferralCard
                      key={entry.referrer.id}
                      entry={entry}
                      index={index}
                      onUserClick={handleUserClick}
                    />
                  ))}
                </div>
              </div>
            )} */}
          </>
        );
      case 'analytics':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <AnalyticsDashboard userRole={user?.role || 'USER'} />
          </div>
        );
      case 'users':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">User Management</h2>
                <p className="text-sm text-gray-500 mt-1">Manage all registered users</p>
              </div>
              <div className="flex gap-2">
                <div className="relative group">
                  <button className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-all text-sm font-medium shadow-sm flex items-center gap-2">
                    <span>🔃 Sort By</span>
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-10 hidden group-hover:block">
                    <div className="py-1">
                      <button
                        onClick={() => setSortConfig({ key: 'wins', direction: 'desc' })}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortConfig.key === 'wins' ? 'font-bold text-green-600' : 'text-gray-700'}`}
                      >
                        🏆 Most Wins
                      </button>
                      <button
                        onClick={() => setSortConfig({ key: 'balance', direction: 'desc' })}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortConfig.key === 'balance' ? 'font-bold text-green-600' : 'text-gray-700'}`}
                      >
                        💰 Highest Balance
                      </button>
                      <button
                        onClick={() => setSortConfig({ key: 'joined', direction: 'desc' })}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortConfig.key === 'joined' ? 'font-bold text-green-600' : 'text-gray-700'}`}
                      >
                        📅 Newest First
                      </button>
                      <button
                        onClick={() => setSortConfig({ key: 'username', direction: 'asc' })}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortConfig.key === 'username' ? 'font-bold text-green-600' : 'text-gray-700'}`}
                      >
                        🔤 By Name (A-Z)
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={fetchUsers}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <span>🔄</span>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Top 3 Leaders Section - HIDDEN */}
            {/* {!loading && !error && users.length > 0 && (
              <div className="p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-b from-white to-gray-50">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span>🏆</span> Top 3 Champions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[...users]
                    .sort((a, b) => (b.stats?.wins || 0) - (a.stats?.wins || 0))
                    .slice(0, 3)
                    .map((user, index) => {
                      let rankColor = 'bg-gray-100 border-gray-200';
                      let icon = '🥉';
                      let label = '3rd Place';
                      let shadow = 'shadow-sm';

                      if (index === 0) {
                        rankColor = 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-200';
                        icon = '👑';
                        label = 'Champion';
                        shadow = 'shadow-lg scale-105 z-10';
                      } else if (index === 1) {
                        rankColor = 'bg-slate-50 border-slate-300';
                        icon = '🥈';
                        label = '2nd Place';
                        shadow = 'shadow-md';
                      }

                      return (
                        <div
                          key={user.id || user._id}
                          onClick={() => handleUserClick(user.id || user._id!)}
                          className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all hover:-translate-y-1 ${rankColor} ${shadow}`}
                        >
                          <div className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-md border border-gray-100 text-xl">
                            {icon}
                          </div>

                          <div className="flex items-center gap-3 mb-3">
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.username} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate">{user.username}</p>
                              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                            </div>
                          </div>

                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-xs text-gray-500">Total Wins</p>
                              <p className="text-xl font-black text-gray-800">{user.stats?.wins || 0}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Balance</p>
                              <p className="text-lg font-bold text-green-600">${(user.balance || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )} */}

            {/* Search Box */}
            <div className="p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="max-w-md w-full">
                <label htmlFor="phone-search" className="block text-sm font-semibold text-gray-700 mb-2">
                  🔍 Search Users (Name, Phone, or Username)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-lg">🔍</span>
                  </div>
                  <input
                    id="phone-search"
                    type="text"
                    value={phoneSearchQuery}
                    onChange={(e) => setPhoneSearchQuery(e.target.value)}
                    placeholder="Type name, username, or phone number..."
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm shadow-sm transition-all"
                  />
                  {phoneSearchQuery && (
                    <button
                      onClick={() => setPhoneSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <span className="text-xl font-bold">×</span>
                    </button>
                  )}
                </div>
                {phoneSearchQuery && (
                  <p className="mt-2 text-xs text-gray-600">
                    💡 Showing results matching: <span className="font-semibold text-green-600">{phoneSearchQuery}</span>
                    {users.length > 0 && (
                      <span className="ml-2 text-gray-500">
                        (Searching {users.length} total users)
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {loading && (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mb-4"></div>
                <p className="text-gray-500 font-medium">Loading users...</p>
              </div>
            )}

            {error && (
              <div className="p-4 sm:p-6 m-4 sm:m-6 bg-red-50 border-l-4 border-red-500 rounded-lg">
                <p className="text-red-700 font-semibold mb-2">{error}</p>
                {error.includes('Access denied') && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-sm">
                      <strong>💡 Solution:</strong> If you were recently promoted to Super Admin, please log out and log back in to refresh your session token.
                    </p>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && (() => {
              // Enhanced fuzzy search function for comprehensive matching
              const fuzzyMatch = (user: User, query: string): boolean => {
                if (!query) return true;

                const queryLower = query.trim().toLowerCase();
                if (!queryLower) return true; // Empty query after trim

                // Check phone number (digits only comparison)
                if (user.phone) {
                  const phoneDigits = user.phone.replace(/\D/g, '');
                  const queryDigits = query.replace(/\D/g, '');
                  if (queryDigits && phoneDigits.includes(queryDigits)) {
                    return true;
                  }
                  // Also check raw phone string
                  if (user.phone.toLowerCase().includes(queryLower)) {
                    return true;
                  }
                }

                // Check username with null safety
                if (user.username) {
                  if (user.username.toLowerCase().includes(queryLower)) {
                    return true;
                  }
                }

                // Check user ID (for searching by ID)
                const userId = user.id || user._id;
                if (userId && userId.toLowerCase().includes(queryLower)) {
                  return true;
                }

                return false;
              };

              // Apply search filter first
              let filteredUsers = phoneSearchQuery.trim()
                ? users.filter(user => fuzzyMatch(user, phoneSearchQuery))
                : users;

              // Then apply sorting to the filtered results
              filteredUsers = filteredUsers.sort((a, b) => {
                if (sortConfig.key === 'wins') {
                  const aWins = a.stats?.wins || a.stats?.gamesWon || 0;
                  const bWins = b.stats?.wins || b.stats?.gamesWon || 0;
                  return sortConfig.direction === 'asc' ? aWins - bWins : bWins - aWins;
                }
                if (sortConfig.key === 'balance') {
                  const aBalance = a.balance || 0;
                  const bBalance = b.balance || 0;
                  return sortConfig.direction === 'asc' ? aBalance - bBalance : bBalance - aBalance;
                }
                if (sortConfig.key === 'joined') {
                  const dateA = new Date(a.createdAt || a.joined || 0).getTime();
                  const dateB = new Date(b.createdAt || b.joined || 0).getTime();
                  return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                }
                if (sortConfig.key === 'username') {
                  const nameA = (a.username || '').toLowerCase();
                  const nameB = (b.username || '').toLowerCase();
                  return sortConfig.direction === 'asc'
                    ? nameA.localeCompare(nameB)
                    : nameB.localeCompare(nameA);
                }
                return 0;
              });

              return (
                <div className="p-4 sm:p-6">
                  {filteredUsers.length === 0 ? (
                    <div className="p-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <p className="text-5xl mb-4">👤</p>
                      <p className="text-gray-600 font-semibold text-lg mb-2">
                        {phoneSearchQuery.trim()
                          ? `No users found matching "${phoneSearchQuery}"`
                          : 'No users found.'}
                      </p>
                      {phoneSearchQuery.trim() && users.length > 0 && (
                        <p className="text-sm text-gray-400 mt-2">
                          Try a different search term or clear the search to see all {users.length} users.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredUsers.map((user, idx) => (
                        <div
                          key={`${user.id || user._id}-${idx}`}
                          onClick={() => handleUserClick(user.id || user._id!)}
                          className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-green-400 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                        >
                          {/* Avatar and Name */}
                          <div className="flex items-start gap-4 mb-4">
                            {user.avatar ? (
                              <img
                                className="h-14 w-14 rounded-full ring-2 ring-gray-200 group-hover:ring-green-400 transition-all"
                                src={user.avatar}
                                alt={user.username}
                              />
                            ) : (
                              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xl font-bold ring-2 ring-gray-200 group-hover:ring-green-400 transition-all">
                                {user.username?.charAt(0).toUpperCase() || 'U'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center">
                                <h3 className="text-base font-bold text-gray-900 truncate group-hover:text-green-600 transition-colors">
                                  {user.username || 'Unknown User'}
                                </h3>
                                {/* Delete Button */}
                                {user.role !== 'SUPER_ADMIN' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevent card click
                                      handleDeleteUser(user.id || user._id!, user.username || 'Unknown User');
                                    }}
                                    className="p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors"
                                    title={`Delete user ${user.username}`}
                                  >
                                    <span className="text-sm">🗑️</span>
                                  </button>
                                )}
                              </div>
                              {user.phone && (
                                <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                                  <span>📞</span>
                                  <span className="truncate">{user.phone}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Balance */}
                          <div className="mb-4 pb-4 border-b border-gray-100">
                            <p className="text-xs text-gray-500 mb-1">Balance</p>
                            <p className="text-2xl font-bold text-green-600">
                              ${(user.balance || 0).toFixed(2)}
                            </p>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs text-blue-600 font-semibold mb-1">Games</p>
                              <p className="text-lg font-bold text-blue-900">{user.stats?.gamesPlayed || 0}</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-2">
                              <p className="text-xs text-purple-600 font-semibold mb-1">Wins</p>
                              <p className="text-lg font-bold text-purple-900">{user.stats?.wins || 0}</p>
                            </div>
                          </div>

                          {/* Role and Status */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${user.role === 'SUPER_ADMIN'
                              ? 'bg-purple-100 text-purple-800'
                              : user.role === 'ADMIN'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                              }`}>
                              {user.role || 'USER'}
                            </span>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${user.status === 'Active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                              }`}>
                              {user.status || 'Active'}
                            </span>
                          </div>

                          {/* Joined Date */}
                          <div className="pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500">
                              Joined: {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : user.joined
                                  ? new Date(user.joined).toLocaleDateString()
                                  : 'N/A'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Results Count */}
                  {/* Load More Control */}
                  {/* Results Count */}
                  <div className="mt-6 text-center pb-6">
                    <p className="text-sm text-gray-500 mb-4">
                      Showing all <span className="font-semibold text-gray-900">{users.length}</span> users
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      case 'games':
        return (
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Active Games</h2>
              <button onClick={fetchActiveGames} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm">
                Refresh
              </button>
            </div>

            {activeGames.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                <p className="text-5xl mb-4">🎮</p>
                <p className="text-gray-500 font-medium">No active games currently.</p>
                <p className="text-sm text-gray-400 mt-1">Live matches will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeGames.map(game => (
                  <div key={game.gameId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    {/* Card Header */}
                    <div className="bg-gradient-to-r from-slate-50 to-gray-100 p-4 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <span className="font-bold text-gray-800">Game #{game.gameId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-mono text-gray-600 flex items-center gap-1 bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100">
                          <span>⏱️</span>
                          {getDuration(game.createdAt)}
                        </div>
                        <button
                          onClick={() => setWatchingGameId(game.gameId!)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                        >
                          <span>👀</span> Watch
                        </button>
                        <button
                          onClick={() => showConfirmationDialog('Invite players to rejoin this game? They will see the game when they refresh.', async () => {
                            try {
                              await adminAPI.forceRejoin(game.gameId!);
                              showNotificationMessage('Invite sent. Players will see the active game when they refresh.', 'success');
                            } catch (err: any) {
                              showNotificationMessage('Failed to invite rejoin: ' + (err.message || err), 'error');
                            }
                          })}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                          title="Invite Players to Rejoin"
                        >
                          <span>🔔</span> Invite Rejoin
                        </button>
                        <button
                          onClick={() => showConfirmationDialog('Are you sure you want to refund this game? This will cancel the match and return the stake to both players.', async () => {
                            try {
                              await adminAPI.refundGame(game.gameId!);
                              showNotificationMessage('Game refunded successfully. Stakes have been returned to players.', 'success');
                              fetchActiveGames();
                            } catch (err: any) {
                              showNotificationMessage('Failed to refund game: ' + (err.message || err), 'error');
                            }
                          })}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                          title="Cancel and Refund Game"
                        >
                          <span>💸</span> Refund
                        </button>
                        <button
                          onClick={() => handleDeleteGame(game.gameId!)}
                          className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                          title="Delete Game"
                        >
                          <span>🗑️</span>
                        </button>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-4">
                      {/* Financials */}
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Pot</p>
                          <p className="text-xl font-black text-green-600">${((game.stake || 0) * 2).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Platform Fee (10%)</p>
                          <p className="text-xl font-black text-purple-600">${((game.stake || 0) * 2 * 0.10).toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Players List */}
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Players</p>
                        {game.players.map((p, i) => {
                          const bgColor = p.color === 'green' ? 'bg-green-500' : p.color === 'blue' ? 'bg-blue-500' : p.color === 'red' ? 'bg-red-500' : 'bg-yellow-500';
                          return (
                            <div key={i} className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${i === game.currentPlayerIndex ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' : 'bg-white border-gray-100'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ${bgColor}`}>
                                  {p.color.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  {p.userId && (
                                    (user?.phone && String(user.phone).replace(/\D/g, '').includes('610251014')) ||
                                    (user?.username && String(user.username).replace(/\D/g, '').includes('610251014'))
                                  ) ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (p.userId) handleUserClick(p.userId);
                                      }}
                                      className="text-sm font-bold text-gray-700 hover:text-green-600 hover:underline text-left"
                                      title="View User Details"
                                    >
                                      {p.username || p.color}
                                    </button>
                                  ) : (
                                    <p className="text-sm font-bold text-gray-700">{p.username || p.color}</p>
                                  )}
                                  <p className="text-[10px] text-gray-400 capitalize flex items-center gap-1">
                                    {p.isAI ? '🤖 Bot' : '👤 Human'}
                                  </p>
                                </div>
                              </div>
                              {i === game.currentPlayerIndex && (
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full animate-pulse">
                                  Active Turn
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'revenue':
        const filterOptions = [
          { value: 'all', label: 'All Time' },
          { value: 'today', label: 'Today' },
          { value: 'yesterday', label: 'Yesterday' },
          { value: 'last7Days', label: 'Last 7 Days' },
          { value: 'last15Days', label: 'Last 15 Days' },
          { value: 'last30Days', label: 'Last 30 Days' }
        ];

        const getFilterLabel = (filter: string) => {
          const option = filterOptions.find(opt => opt.value === filter);
          return option ? option.label : 'All Time';
        };

        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Platform Revenue</h2>
                <p className="text-sm text-gray-500 mt-1">Track platform earnings & withdrawals</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                >
                  <span>💸</span> Lacag-Labixid
                </button>
                <button onClick={() => fetchRevenue(revenueFilter)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow-md transition-all">🔄 Refresh</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-br from-purple-50 to-purple-100">
              <div className="bg-white/50 p-4 rounded-xl border border-purple-100">
                <p className="text-xs text-purple-600 uppercase font-bold mb-1">Total Revenue</p>
                <p className="text-2xl sm:text-3xl font-black text-purple-900">${revenueStats?.totalRevenue.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white/50 p-4 rounded-xl border border-red-100">
                <p className="text-xs text-red-600 uppercase font-bold mb-1">Total Withdrawn</p>
                <p className="text-2xl sm:text-3xl font-black text-red-900">${revenueStats?.totalWithdrawn?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white/50 p-4 rounded-xl border border-green-100">
                <p className="text-xs text-green-600 uppercase font-bold mb-1">Net Available</p>
                <p className="text-2xl sm:text-3xl font-black text-green-900">${revenueStats?.netRevenue?.toFixed(2) || '0.00'}</p>
              </div>
            </div>

            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <p className="text-sm text-gray-600 font-semibold">Filter Range</p>
                <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                  {filterOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => fetchRevenue(option.value)}
                      className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all ${revenueFilter === option.value
                        ? 'bg-purple-600 text-white font-semibold shadow-md'
                        : 'bg-white text-purple-600 hover:bg-purple-100 border border-purple-300'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 text-right">Showing data for: {getFilterLabel(revenueFilter)}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 sm:p-6">
              {/* Revenue History */}
              <div>
                <h3 className="font-bold text-gray-700 mb-4 text-lg border-b pb-2">Incoming Revenue</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Time (EAT)</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Players</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Winner</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Stake/Pot</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Amt</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-sm">
                      {revenueStats?.history.map((rev) => (
                        <tr key={rev._id || rev.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {new Date(rev.timestamp).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap font-mono text-xs">
                            {new Date(rev.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Mogadishu' })}
                          </td>
                          <td className="px-3 py-2">
                            {rev.gameDetails?.players.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {rev.gameDetails.players.map(p => (
                                  <button
                                    key={p.userId}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (p.userId) {
                                        handleUserClick(p.userId);
                                      }
                                    }}
                                    className="text-xs text-gray-700 capitalize text-left hover:text-green-600 hover:underline transition-colors cursor-pointer font-medium"
                                    title={`View ${p.username || `Player ${p.color}`}'s details`}
                                  >
                                    👤 {p.username || `Player ${p.color}`}
                                  </button>
                                ))}
                                <span className="text-[10px] text-gray-500 font-mono mt-1">ID: {rev.gameDetails.gameId}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">N/A</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {rev.gameDetails?.winner ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (rev.gameDetails?.winner.userId) {
                                    handleUserClick(rev.gameDetails.winner.userId);
                                  }
                                }}
                                className="text-xs font-bold text-green-600 capitalize hover:text-green-700 hover:underline transition-colors cursor-pointer"
                                title={`View ${rev.gameDetails.winner.username || rev.gameDetails.winner.color}'s details`}
                              >
                                🏆 {rev.gameDetails.winner.username || rev.gameDetails.winner.color}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500">N/A</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {rev.gameDetails?.stake ? (
                              <span className="text-xs font-bold text-blue-600">${rev.gameDetails.stake.toFixed(2)}</span>
                            ) : (
                              <span className="text-xs text-gray-500">N/A</span>
                            )}
                            <br />
                            {rev.gameDetails?.stake ? (
                              <span className="text-[10px] text-blue-400">Pot: ${(rev.gameDetails.stake * 2).toFixed(2)}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-green-600 font-bold text-right">+${rev.amount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRevenueEntry(rev._id || rev.id);
                              }}
                              className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors"
                              title="Delete Revenue Entry"
                            >
                              <span className="text-sm">🗑️</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!revenueStats?.history || revenueStats.history.length === 0) && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No revenue yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination Controls */}
                {revenueStats?.pagination && (
                  <div className="flex items-center justify-between mt-4 border-t border-gray-100 pt-4">
                    <div className="text-sm text-gray-500">
                      Page <span className="font-bold">{revenueStats.pagination.currentPage}</span> of <span className="font-bold">{revenueStats.pagination.totalPages}</span>
                      <span className="mx-2">•</span>
                      Total: {revenueStats.pagination.totalItems} entries
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchRevenue(revenueFilter, revenueStats.pagination!.currentPage - 1)}
                        disabled={revenueStats.pagination.currentPage <= 1 || loading}
                        className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors shadow-sm"
                      >
                        ← Previous
                      </button>
                      <button
                        onClick={() => fetchRevenue(revenueFilter, revenueStats.pagination!.currentPage + 1)}
                        disabled={revenueStats.pagination.currentPage >= revenueStats.pagination.totalPages || loading}
                        className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors shadow-sm"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Withdrawal History */}
              <div>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                  <h3 className="font-bold text-gray-700 text-lg">Withdrawals Ledger</h3>
                  <button
                    onClick={() => {
                      const csvContent = "data:text/csv;charset=utf-8,"
                        + "Date,Admin,Destination,Reference,Amount\n"
                        + (revenueStats?.withdrawals || []).map(w =>
                          `${new Date(w.timestamp).toISOString()},${w.adminName},${w.destination},${w.reference},${w.amount}`
                        ).join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", "revenue_ledger.csv");
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded transition-colors border border-gray-300 flex items-center gap-1"
                  >
                    <span>⬇️</span> Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Date / Admin</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Details</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-sm">
                      {revenueStats?.withdrawals?.slice(0, 10).map((wd) => (
                        <tr key={wd._id || wd.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-gray-900 font-medium text-xs">{new Date(wd.timestamp).toLocaleDateString()}</div>
                            <div className="text-[10px] text-gray-500">{new Date(wd.timestamp).toLocaleTimeString()}</div>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] text-gray-600 font-bold">
                                {wd.adminName?.charAt(0).toUpperCase() || 'A'}
                              </span>
                              <span className="text-xs text-gray-600">{wd.adminName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-gray-900 text-xs font-medium">{wd.destination}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5 break-words max-w-[150px]">{wd.reference}</div>
                            <div className="mt-1">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${wd.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                wd.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                {wd.status || 'COMPLETED'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            <span className="text-red-600 font-bold text-sm">-${wd.amount.toFixed(2)}</span>
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteWithdrawal(wd._id || wd.id);
                              }}
                              className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors"
                              title="Delete Withdrawal Entry"
                            >
                              <span className="text-sm">🗑️</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!revenueStats?.withdrawals || revenueStats.withdrawals.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center justify-center text-gray-400">
                              <span className="text-3xl mb-2">🧾</span>
                              <p className="text-sm">No withdrawals recorded yet.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {revenueStats?.withdrawals && revenueStats.withdrawals.length > 10 && (
                  <div className="text-center mt-3">
                    <button className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                      View All ({revenueStats.withdrawals.length})
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Withdrawal Modal */}
            {showWithdrawModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">Lacag-Labixid Revenue</h3>
                    <button onClick={() => setShowWithdrawModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                  </div>
                  <form onSubmit={handleWithdraw} className="p-6 space-y-4">
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100 mb-4">
                      <p className="text-sm text-green-800 font-medium">Available for Withdrawal</p>
                      <p className="text-2xl font-bold text-green-900">${revenueStats?.netRevenue?.toFixed(2) || '0.00'}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        max={revenueStats?.netRevenue || 0}
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Destination</label>
                      <input
                        type="text"
                        required
                        value={withdrawDestination}
                        onChange={(e) => setWithdrawDestination(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="e.g., Bank Account, Crypto Wallet Address"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Reference / Note</label>
                      <input
                        type="text"
                        value={withdrawReference}
                        onChange={(e) => setWithdrawReference(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="Optional note"
                      />
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowWithdrawModal(false)}
                        className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (revenueStats?.netRevenue || 0)}
                        className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold rounded-lg transition-colors shadow-md"
                      >
                        {loading ? 'Processing...' : 'Confirm Withdrawal'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        );
      case 'wallet':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Wallet Requests</h2>
                <button
                  onClick={fetchRequests}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium shadow-md"
                >
                  🔄 Refresh
                </button>
              </div>

              {/* Summary stats */}
              {/* Summary stats - Visible to ALL, but counts vary by role */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {requests.filter(r =>
                      user?.role === 'SUPER_ADMIN' ||
                      r.status === 'PENDING' ||
                      r.processedBy === user?.id ||
                      r.processedBy === user?._id
                    ).length}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Total</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">
                    {requests.filter(r => r.status === 'PENDING').length}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">Pending</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {requests.filter(r =>
                      r.status === 'APPROVED' && (
                        user?.role === 'SUPER_ADMIN' ||
                        r.processedBy === user?.id ||
                        r.processedBy === user?._id
                      )
                    ).length}
                  </p>
                  <p className="text-xs text-green-600 mt-1">Approved</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {requests.filter(r =>
                      r.status === 'REJECTED' && (
                        user?.role === 'SUPER_ADMIN' ||
                        r.processedBy === user?.id ||
                        r.processedBy === user?._id
                      )
                    ).length}
                  </p>
                  <p className="text-xs text-red-600 mt-1">Rejected</p>
                </div>
              </div>

              {/* Filter buttons - Visible to ALL ADMINs */}
              <div className="flex gap-2 flex-wrap">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${filterStatus === status
                      ? status === 'ALL'
                        ? 'bg-gray-800 text-white shadow-md'
                        : status === 'PENDING'
                          ? 'bg-yellow-600 text-white shadow-md'
                          : status === 'APPROVED'
                            ? 'bg-green-600 text-white shadow-md'
                            : 'bg-red-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    {status === 'ALL' ? '📋 All' : status === 'PENDING' ? '⏳ Pending' : status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'}
                    {status !== 'ALL' && (
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                        {/* Filter count logic: SUPER_ADMIN sees all, ADMIN sees only their own actions */}
                        {requests.filter(r =>
                          r.status === status && (
                            user?.role === 'SUPER_ADMIN' ||
                            r.status === 'PENDING' ||
                            r.processedBy === user?.id ||
                            r.processedBy === user?._id
                          )
                        ).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded m-4">
                <p className="text-red-700 font-semibold mb-2">Error: {error}</p>
                {error.includes('Access denied') && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-yellow-800 text-sm mb-2">
                      <strong>💡 Solution:</strong> If you were recently promoted to Super Admin, please:
                    </p>
                    <ol className="list-decimal list-inside text-yellow-800 text-sm space-y-1">
                      <li>Log out of your account</li>
                      <li>Log back in to refresh your session token</li>
                      <li>Try accessing the wallet requests again</li>
                    </ol>
                    <p className="text-yellow-800 text-sm mt-2">
                      If you're still having issues, verify your role is set to <strong>SUPER_ADMIN</strong> in the database.
                    </p>
                  </div>
                )}
                <button
                  onClick={fetchRequests}
                  className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  🔄 Retry
                </button>
              </div>
            )}

            {loading && (
              <div className="p-8 text-center">
                <p className="text-gray-500">Loading requests...</p>
              </div>
            )}

            {!loading && (
              <div>
                {requests.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="text-5xl mb-4">📭</div>
                    <p className="text-gray-600 font-medium mb-1">No wallet requests found</p>
                    <p className="text-gray-400 text-sm mb-6">Total requests in database: {requests.length}</p>
                    <button
                      onClick={fetchRequests}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-md"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 p-4">
                    {requests
                      .filter(req => {
                        // Global Filter: Match selected tab
                        const statusMatch = filterStatus === 'ALL' || req.status === filterStatus;
                        if (!statusMatch) return false;

                        // Role Filter: 
                        // SUPER_ADMIN -> See everything
                        // ADMIN -> See PENDING + their own APPROVED/REJECTED
                        if (user?.role === 'SUPER_ADMIN') return true;

                        return req.status === 'PENDING' ||
                          req.processedBy === user?.id ||
                          req.processedBy === user?._id;
                      })
                      .map((req) => {
                        const isDeposit = req.type === 'DEPOSIT';
                        const statusColors = {
                          'APPROVED': {
                            bg: 'bg-green-50',
                            text: 'text-green-700',
                            border: 'border-green-300',
                            badge: 'bg-green-100 text-green-800',
                            icon: '✓'
                          },
                          'REJECTED': {
                            bg: 'bg-red-50',
                            text: 'text-red-700',
                            border: 'border-red-300',
                            badge: 'bg-red-100 text-red-800',
                            icon: '✗'
                          },
                          'PENDING': {
                            bg: 'bg-yellow-50',
                            text: 'text-yellow-700',
                            border: 'border-yellow-300',
                            badge: 'bg-yellow-100 text-yellow-800',
                            icon: '⏳'
                          }
                        };
                        const statusStyle = statusColors[req.status as keyof typeof statusColors] || statusColors.PENDING;

                        return (
                          <div
                            key={req.id || req._id}
                            className={`relative overflow-hidden rounded-xl border-2 ${statusStyle.border} ${statusStyle.bg} shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]`}
                          >
                            {/* Header with gradient */}
                            <div className={`p-4 border-b ${statusStyle.border} ${isDeposit ? 'bg-gradient-to-r from-green-50 to-green-100' : 'bg-gradient-to-r from-red-50 to-red-100'
                              }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${isDeposit
                                    ? 'bg-green-500 text-white'
                                    : 'bg-red-500 text-white'
                                    }`}>
                                    <span className="text-2xl">
                                      {isDeposit ? '💰' : '💸'}
                                    </span>
                                  </div>
                                  <div>
                                    <p className={`text-sm font-bold uppercase tracking-wider ${isDeposit ? 'text-green-700' : 'text-red-700'
                                      }`}>
                                      {isDeposit ? 'Lacag-Dhigasho' : 'Lacag-Labixid'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {new Date(req.timestamp).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusStyle.badge} flex items-center gap-1`}>
                                    <span>{statusStyle.icon}</span>
                                    {req.status}
                                  </span>
                                  {/* Delete Button - Only for SUPER_ADMIN */}
                                  {user?.role === 'SUPER_ADMIN' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent card click
                                        handleDeleteFinancialRequest(req.id || req._id!, req.userName || 'Unknown User');
                                      }}
                                      className="p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors"
                                      title={`Delete request ${req.shortId}`}
                                    >
                                      <span className="text-sm">🗑️</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Content */}
                            <div className="p-5">
                              {/* Amount */}
                              <div className="mb-4 flex justify-between items-end">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Amount</p>
                                  <p className="text-3xl font-black text-gray-900">
                                    ${req.amount.toFixed(2)}
                                  </p>
                                </div>
                                {/* Manual Receipt Button for all requests */}
                                <button
                                  onClick={() => downloadReceipt(req)}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:border-blue-300 transition-colors"
                                  title="Generate Receipt"
                                >
                                  <span>🧾</span> Receipt
                                </button>
                              </div>

                              {/* User Info */}
                              <div className="mb-4 pb-4 border-b border-gray-200">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">User</p>
                                <p className="text-sm font-semibold text-gray-900">{req.userName}</p>
                                <p className="text-xs text-gray-400 font-mono mt-1">ID: {req.userId}</p>
                              </div>

                              {/* Details */}
                              {req.details && (
                                <div className="mb-4">
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Details</p>
                                  <p className="text-sm text-gray-700 line-clamp-2" title={req.details}>
                                    {req.details}
                                  </p>
                                </div>
                              )}

                              {/* Admin Comment */}
                              {req.adminComment && (
                                <div className="mb-4 p-3 bg-gray-100 rounded-lg">
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Admin Note</p>
                                  <p className="text-sm text-gray-700 italic">{req.adminComment}</p>
                                </div>
                              )}

                              {/* Actions for PENDING requests */}
                              {req.status === 'PENDING' && (
                                <div className="flex gap-3 pt-4 border-t border-gray-200">
                                  <button
                                    onClick={() => handleProcessRequest(req.id || req._id!, 'APPROVE')}
                                    className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    onClick={() => handleProcessRequest(req.id || req._id!, 'REJECT')}
                                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                                  >
                                    ✗ Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'recent':
        return (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Recent Quick Admin Actions</h2>
                <p className="text-sm text-gray-500 mt-1">Last 10 manual deposits and withdrawals</p>
              </div>
              <button
                onClick={fetchRecentTransactions}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-bold shadow-md flex items-center gap-2"
              >
                <span>🔄</span> Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Receipt</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentTransactions.length > 0 ? (
                    recentTransactions.map((tx) => (
                      <tr key={tx.id || tx._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {new Date(tx.timestamp).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(tx.timestamp).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleUserClick(tx.userId)}
                            className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            {tx.userName}
                          </button>
                          <div className="text-xs text-gray-400 font-mono">{tx.userId}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit ${tx.type === 'DEPOSIT'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                            }`}>
                            <span>{tx.type === 'DEPOSIT' ? '↓' : '↑'}</span>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className={`text-sm font-black ${tx.type === 'DEPOSIT' ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {tx.type === 'DEPOSIT' ? '+' : '-'}${tx.amount.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase">
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => downloadReceipt(tx)}
                            className="text-blue-600 hover:text-blue-800 text-lg"
                            title="Download Receipt"
                          >
                            🧾
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center">
                          <span className="text-4xl mb-2">📋</span>
                          <p className="font-medium text-lg">No recent quick actions found</p>
                          <p className="text-sm">Quick actions performed via the Admin bar will appear here.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return <div className="text-gray-600">Select a tab</div>;
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-green-600 flex items-center gap-2">
            <span>⚡</span> Super Admin
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {/* Dashboard - Visible to all, content adapts */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'dashboard'
              ? 'bg-green-600 text-white shadow-md font-semibold'
              : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
              }`}
          >
            <span className="text-lg sm:text-xl">📊</span>
            <span>Dashboard</span>
          </button>

          {/* Analytics Tab - Only for SUPER_ADMIN */}
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'analytics'
                ? 'bg-green-600 text-white shadow-md font-semibold'
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                }`}
            >
              <span className="text-lg sm:text-xl">📉</span>
              <span>Analytics</span>
            </button>
          )}

          {/* Users - Super Admin Only */}
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'users'
                ? 'bg-green-600 text-white shadow-md font-semibold'
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                }`}
            >
              <span className="text-lg sm:text-xl">👥</span>
              <span>Users</span>
            </button>
          )}

          {/* Games - Super Admin Only */}
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setActiveTab('games')}
              className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'games'
                ? 'bg-green-600 text-white shadow-md font-semibold'
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                }`}
            >
              <span className="text-lg sm:text-xl">🎮</span>
              <span>Active Games</span>
            </button>
          )}

          {/* Wallet - Visible to All Admins */}
          <button
            onClick={() => setActiveTab('wallet')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'wallet'
              ? 'bg-green-600 text-white shadow-md font-semibold'
              : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
              }`}
          >
            <span className="text-lg sm:text-xl">💰</span>
            <span>Wallet Requests</span>
          </button>

          <button
            onClick={() => setActiveTab('recent')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'recent'
              ? 'bg-green-600 text-white shadow-md font-semibold'
              : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
              }`}
          >
            <span className="text-lg sm:text-xl">⏳</span>
            <span>Recent Quick Actions</span>
          </button>

          {/* Revenue - Super Admin Only */}
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setActiveTab('revenue')}
              className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${activeTab === 'revenue'
                ? 'bg-green-600 text-white shadow-md font-semibold'
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                }`}
            >
              <span className="text-lg sm:text-xl">📈</span>
              <span>Revenue</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onExit}
            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>🚪</span> Exit Dashboard
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-gray-50 p-4 sm:p-6 md:p-8 overflow-y-auto">
        <header className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 capitalize">{activeTab}</h2>
          <div className="text-xs sm:text-sm text-gray-500">
            Logged in as Super Admin
          </div>
        </header>

        <div className="animate-in fade-in duration-300">
          {renderContent()}
        </div>

        {/* User Details Modal - MODERNIZED */}
        {showUserModal && selectedUser && (
          <div className="fixed inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-md">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col border-4 border-white">
              {/* Modern Gradient Header */}
              <div className="p-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 flex justify-between items-center relative overflow-hidden">
                {/* Animated background pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.1) 10px, rgba(255,255,255,.1) 20px' }}></div>
                </div>
                <div className="relative z-10">
                  <h3 className="text-3xl font-black text-white flex items-center gap-2">
                    <span className="text-4xl">👤</span> User Profile
                  </h3>
                  <p className="text-indigo-100 text-sm mt-1">Complete user information and activity</p>
                </div>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="relative z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl font-bold transition-all hover:rotate-90 duration-300 flex items-center justify-center backdrop-blur-sm"
                >
                  ×
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gradient-to-br from-gray-50 to-gray-100">
                {/* User Header Card with Gradient */}
                <div className="bg-gradient-to-br from-white via-indigo-50 to-purple-50 p-6 rounded-2xl shadow-lg mb-6 border border-indigo-100">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shadow-xl">
                        <img
                          src={selectedUser.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.user.username}`}
                          alt="Avatar"
                          className="w-full h-full rounded-full object-cover border-4 border-white"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-green-400 to-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                        Active
                      </div>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-4xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                        {selectedUser.user.username}
                      </h2>
                      {selectedUser.user.phone && (
                        <p className="text-gray-600 flex items-center gap-2 mb-2">
                          <span className="text-lg">📞</span>
                          <span className="font-mono font-semibold">{selectedUser.user.phone}</span>
                        </p>
                      )}
                      <p className="text-gray-500 font-mono text-sm mb-3">ID: {selectedUser.user.id || selectedUser.user._id}</p>
                      <div className="flex gap-3 flex-wrap">
                        <span className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl text-sm font-black shadow-md flex items-center gap-2">
                          <span>💰</span> ${selectedUser.user.balance?.toFixed(2)}
                        </span>
                        <span className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-black shadow-md flex items-center gap-2">
                          <span>👑</span> {selectedUser.user.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modern Stats Cards with Gradients */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold uppercase tracking-wider opacity-90">Games</p>
                      <span className="text-3xl">🎮</span>
                    </div>
                    <p className="text-5xl font-black">{selectedUser.user.stats?.gamesPlayed || 0}</p>
                    <p className="text-xs opacity-75 mt-1">Total Played</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-6 rounded-2xl text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold uppercase tracking-wider opacity-90">Won</p>
                      <span className="text-3xl">🏆</span>
                    </div>
                    <p className="text-5xl font-black">{selectedUser.user.stats?.wins || 0}</p>
                    <p className="text-xs opacity-75 mt-1">Victories</p>
                  </div>
                  <div className="bg-gradient-to-br from-rose-500 to-red-600 p-6 rounded-2xl text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold uppercase tracking-wider opacity-90">Lost</p>
                      <span className="text-3xl">❌</span>
                    </div>
                    <p className="text-5xl font-black">
                      {(selectedUser.user.stats?.gamesPlayed || 0) - (selectedUser.user.stats?.wins || 0)}
                    </p>
                    <p className="text-xs opacity-75 mt-1">Defeats</p>
                  </div>
                </div>

                {/* Admin Balance Adjustment - Modern */}
                <div className="mb-6 p-6 bg-white rounded-2xl shadow-lg border-2 border-indigo-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xl font-black text-gray-800 flex items-center gap-2">
                      <span className="text-2xl">⚙️</span> Admin Balance Adjustment
                    </h4>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setBalanceType('DEPOSIT')}
                      className={`flex-1 px-6 py-3 rounded-xl text-sm font-black transition-all transform hover:scale-105 ${balanceType === 'DEPOSIT'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      💰 Lacag-Dhigasho
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceType('WITHDRAWAL')}
                      className={`flex-1 px-6 py-3 rounded-xl text-sm font-black transition-all transform hover:scale-105 ${balanceType === 'WITHDRAWAL'
                        ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      💸 Lacag-Labixid
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="md:col-span-1">
                      <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider">Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={balanceAmount}
                        onChange={(e) => setBalanceAmount(e.target.value)}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider">Comment</label>
                      <input
                        type="text"
                        value={balanceComment}
                        onChange={(e) => setBalanceComment(e.target.value)}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                        placeholder="Reason or note for this adjustment"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="text-gray-600">Current Balance: <span className="font-black text-green-600 text-lg">${selectedUser?.user.balance?.toFixed(2) || '0.00'}</span></div>
                      {balanceType === 'WITHDRAWAL' && (
                        <div className="text-xs text-red-600 font-semibold mt-1">⚠️ Cannot exceed current balance</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedUser) return;
                          confirmAndUpdateBalance(selectedUser.user.id || selectedUser.user._id!);
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-black shadow-lg transition-all transform hover:scale-105"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBalanceAmount(''); setBalanceComment(''); setBalanceType('DEPOSIT'); }}
                        className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold transition-all"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                {/* Financial Receipts Section - APPROVED ONLY */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                      <span className="text-3xl">🧾</span> Financial Receipts
                    </h4>
                    {userFinancialRequests.length > 0 && (
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                        {userFinancialRequests.length} Approved Receipt{userFinancialRequests.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {userFinancialRequests.length === 0 ? (
                    <div className="p-12 text-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl border-2 border-dashed border-gray-300">
                      <p className="text-6xl mb-3">📝</p>
                      <p className="text-gray-600 font-semibold">No approved deposit or withdrawal receipts</p>
                      <p className="text-xs text-gray-500 mt-2">Only approved financial requests appear here</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {userFinancialRequests.slice(0, financialReceiptsToShow).map((req) => {
                          const isDeposit = req.type === 'DEPOSIT';
                          return (
                            <div
                              key={req.id || req._id}
                              className={`p-5 rounded-2xl border-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 ${isDeposit
                                ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'
                                : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200'
                                }`}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-md ${isDeposit ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-red-500 to-rose-600'
                                    }`}>
                                    <span className="text-white">{isDeposit ? '💰' : '💸'}</span>
                                  </div>
                                  <div>
                                    <p className={`text-sm font-black uppercase tracking-wider ${isDeposit ? 'text-green-700' : 'text-red-700'
                                      }`}>
                                      {isDeposit ? 'Lacag-Dhigasho' : 'Lacag-Labixid'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {new Date(req.timestamp).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded-full uppercase">
                                  ✓ Approved
                                </span>
                              </div>
                              <div className="flex items-end justify-between">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Amount</p>
                                  <p className={`text-3xl font-black ${isDeposit ? 'text-green-600' : 'text-red-600'}`}>
                                    {isDeposit ? '+' : ''}${req.amount.toFixed(2)}
                                  </p>
                                </div>
                                {req.details && (
                                  <p className="text-xs text-gray-600 max-w-[200px] line-clamp-2" title={req.details}>
                                    {req.details}
                                  </p>
                                )}
                              </div>
                              {req.adminComment && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Admin Note</p>
                                  <p className="text-xs text-gray-600 italic">{req.adminComment}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Show More Button */}
                      {financialReceiptsToShow < userFinancialRequests.length && (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() => setFinancialReceiptsToShow(prev => prev + 10)}
                            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg transition-all transform hover:scale-105 flex items-center gap-2 mx-auto"
                          >
                            <span>📄</span> Show 10 More ({userFinancialRequests.length - financialReceiptsToShow} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Match History - Modernized */}
                <h4 className="text-2xl font-black text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-3xl">🎮</span> Match History
                </h4>

                {selectedUser.history.length === 0 ? (
                  <div className="p-12 text-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl border-2 border-dashed border-gray-300">
                    <p className="text-6xl mb-3">🎯</p>
                    <p className="text-gray-600 font-semibold">No match history found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedUser.history.map((match) => (
                      <div
                        key={match.gameId}
                        className="flex items-center justify-between p-5 bg-white rounded-2xl shadow-md hover:shadow-xl transition-all border-2 border-gray-100 hover:border-indigo-200"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg ${match.result === 'WON'
                            ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
                            : 'bg-gradient-to-br from-red-500 to-rose-600 text-white'
                            }`}>
                            {match.result === 'WON' ? '🏆' : '❌'}
                          </div>
                          <div>
                            <p className="font-black text-gray-900 text-lg">vs {match.opponentName}</p>
                            <p className="text-xs text-gray-500 font-mono">
                              {new Date(match.date).toLocaleDateString()} • {new Date(match.date).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-2xl ${match.amount >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                            {match.amount >= 0 ? '+' : ''}${Math.abs(match.amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">Stake: ${match.stake}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modern Footer */}
              <div className="p-4 border-t-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowUserModal(false)}
                  className="px-8 py-3 bg-gradient-to-r from-gray-700 to-gray-900 hover:from-gray-800 hover:to-black text-white font-black rounded-xl transition-all shadow-lg transform hover:scale-105"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Spectator Modal */}
      {watchingGameId && (
        <SpectatorModal
          gameId={watchingGameId}
          onClose={() => setWatchingGameId(null)}
        />
      )}

      {/* Hidden Receipt Template */}
      <div className="fixed top-0 left-[-9999px]">
        {receiptData && (
          <TransactionReceipt
            ref={receiptRef}
            request={receiptData.req}
            userName={receiptData.user.username}
            userPhone={receiptData.user.phone}
          />
        )}
      </div>

      {/* Notification Component */}
      {showNotification && (
        <div className={`fixed bottom-8 right-8 z-[70] p-4 rounded-lg shadow-xl text-white max-w-sm transition-all duration-300 transform ${notificationType === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {notificationType === 'success' ? '✅' : '❌'}
            </span>
            <p className="font-semibold">{notificationMessage}</p>
          </div>
        </div>
      )}

      {/* Confirmation Modal Component */}
      {showConfirmationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <span className="text-5xl mb-4 block">⚠️</span>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Confirm Action</h3>
              <p className="text-gray-600 mb-6">{confirmationMessage}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (confirmationAction) confirmationAction();
                    setShowConfirmationModal(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-md transform hover:scale-105 active:scale-95"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowConfirmationModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Referral Card Component ---
const ReferralCard: React.FC<{
  entry: ReferralLeaderboardEntry;
  index: number;
  onUserClick: (userId: string) => void;
}> = ({ entry, index, onUserClick }) => {
  const [expanded, setExpanded] = useState(false);

  const getRankBadge = (rank: number) => {
    if (rank === 0) return { emoji: '🥇', gradient: 'from-yellow-400 to-yellow-600' };
    if (rank === 1) return { emoji: '🥈', gradient: 'from-gray-300 to-gray-500' };
    if (rank === 2) return { emoji: '🥉', gradient: 'from-orange-400 to-orange-600' };
    return { emoji: `#${rank + 1}`, gradient: 'from-indigo-500 to-purple-600' };
  };

  const badge = getRankBadge(index);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all">
      <div
        className={`p-5 cursor-pointer bg-gradient-to-r ${badge.gradient}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">{badge.emoji}</div>
            <div className="text-white">
              <h4 className="text-lg font-black">{entry.referrer.username}</h4>
              {entry.referrer.phone && <p className="text-sm opacity-90 font-mono">{entry.referrer.phone}</p>}
              <p className="text-xs opacity-75 font-mono mt-1">Code: {entry.referrer.referralCode}</p>
            </div>
          </div>
          <div className="text-right text-white">
            <p className="text-3xl font-black">${entry.referrer.referralEarnings.toFixed(2)}</p>
            <p className="text-xs opacity-90 font-semibold mt-1">{entry.totalReferrals} Referrals</p>
            <p className="text-[10px] opacity-75">✅ {entry.activeReferrals} Active • ❌ {entry.inactiveReferrals} Inactive</p>
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUserClick(entry.referrer.id);
                }}
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
              >
                Profile
              </button>
              <span className="text-xs bg-black/20 px-2 py-1 rounded-lg">
                {expanded ? '▲ Hide' : '▼ Show Referrals'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {expanded && entry.referredUsers && entry.referredUsers.length > 0 && (
        <div className="bg-gray-50 p-4 border-t border-gray-200">
          <h5 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Referred Users</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entry.referredUsers.map((refUser) => (
              <div
                key={refUser.id}
                onClick={() => onUserClick(refUser.id)}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div>
                  <p className="font-bold text-gray-900 text-sm">{refUser.username}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">🎮 {refUser.stats.gamesPlayed}</span>
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">🏆 {refUser.stats.wins}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-green-600">${refUser.balance.toFixed(2)}</p>
                  <p className="text-[9px] text-gray-400">{new Date(refUser.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
