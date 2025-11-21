import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '../../services/adminAPI';
import type { User, FinancialRequest, Revenue, RevenueWithdrawal, GameState, UserDetailsResponse } from '../../types';
import Board from '../GameBoard';
import { useGameLogic } from '../../hooks/useGameLogic';
import html2canvas from 'html2canvas';
import TransactionReceipt from '../TransactionReceipt';

// --- Spectator Modal Component ---
const SpectatorModal: React.FC<{ gameId: string; onClose: () => void }> = ({ gameId, onClose }) => {
  const { state, handleAnimationComplete } = useGameLogic({
    gameId,
    isSpectator: true
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col h-[90vh]">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <h3 className="text-xl font-bold text-gray-900">LIVE Spectator View - Game #{gameId}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden bg-slate-800 flex flex-col md:flex-row">
           {/* Game Board Area */}
           <div className="flex-1 flex items-center justify-center p-4 overflow-auto relative">
               {/* Status Overlay */}
               <div className="absolute top-4 left-4 bg-white/90 p-4 rounded-xl shadow-lg z-10 backdrop-blur-sm border border-white/20 max-w-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full ${
                        state.players[state.currentPlayerIndex]?.color === 'red' ? 'bg-red-500' :
                        state.players[state.currentPlayerIndex]?.color === 'green' ? 'bg-green-500' :
                        state.players[state.currentPlayerIndex]?.color === 'yellow' ? 'bg-yellow-500' :
                        'bg-blue-500'
                    }`}></div>
                    <p className="font-bold text-gray-800 uppercase text-sm">Current Turn</p>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{state.message || 'Waiting for move...'}</p>
                  
                  {state.diceValue && (
                    <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg">
                        <span className="text-2xl">🎲</span>
                        <span className="text-xl font-black text-slate-800">{state.diceValue}</span>
                    </div>
                  )}
               </div>

               <div className="w-full max-w-[600px] aspect-square shadow-2xl rounded-full overflow-hidden border-4 border-slate-700">
                 <Board 
                    gameState={state}
                    onMoveToken={() => {}} // Spectators can't move
                    onAnimationComplete={handleAnimationComplete}
                    isMyTurn={false} // Always false for spectators
                    perspectiveColor={state.players[state.currentPlayerIndex]?.color || 'red'}
                 />
               </div>
           </div>
           
           {/* Sidebar Info */}
           <div className="w-full md:w-80 bg-slate-900 text-white p-6 border-l border-slate-700 overflow-y-auto">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Players</h4>
                <div className="space-y-3">
                    {state.players.map((p, i) => (
                        <div key={i} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            i === state.currentPlayerIndex 
                                ? 'bg-slate-800 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]' 
                                : 'bg-slate-800/50 border-slate-700'
                        }`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                                    p.color === 'green' ? 'bg-green-500 text-white' : 
                                    p.color === 'blue' ? 'bg-blue-500 text-white' : 
                                    p.color === 'red' ? 'bg-red-500 text-white' : 
                                    'bg-yellow-500 text-black'
                                }`}>
                                    {p.color.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-200 capitalize">{p.color}</p>
                                    <div className="flex items-center gap-1 text-[10px]">
                                        {p.isAI ? (
                                            <span className="text-purple-400">🤖 Bot</span>
                                        ) : (
                                            <span className="text-blue-400">👤 Human</span>
                                        )}
                                        {p.isDisconnected && <span className="text-red-400 ml-1">⚠️ Offline</span>}
                                    </div>
                                </div>
                            </div>
                            {i === state.currentPlayerIndex && (
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            )}
                        </div>
                    ))}
                </div>
                
                <div className="mt-8 pt-8 border-t border-slate-800">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Game Info</h4>
                    <div className="space-y-2 text-sm text-slate-400">
                        <div className="flex justify-between">
                            <span>State:</span>
                            <span className="text-white">{state.turnState}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Status:</span>
                            <span className="text-white">{state.gameStarted ? 'In Progress' : 'Waiting'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Pot:</span>
                            <span className="text-green-400 font-mono">${((state.stake || 0) * 2).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
           </div>
        </div>
      </div>
    </div>
  );
};

interface SuperAdminDashboardProps {
  onExit: () => void;
}

type AdminTab = 'dashboard' | 'users' | 'games' | 'wallet' | 'revenue' | 'settings';

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onExit }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [revenueStats, setRevenueStats] = useState<{ totalRevenue: number; totalWithdrawn: number; netRevenue: number; history: Revenue[]; withdrawals: RevenueWithdrawal[]; filter?: string } | null>(null);
  const [revenueFilter, setRevenueFilter] = useState<string>('all');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDestination, setWithdrawDestination] = useState('');
  const [withdrawReference, setWithdrawReference] = useState('');
  const [activeGames, setActiveGames] = useState<GameState[]>([]);
  
  // Spectator State
  const [watchingGameId, setWatchingGameId] = useState<string | null>(null);
  
  // Live Duration State
  const [currentTime, setCurrentTime] = useState(Date.now());

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

  // Receipt Generation State
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<{ req: FinancialRequest, user: { username: string, phone?: string } } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [phoneSearchQuery, setPhoneSearchQuery] = useState<string>('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usersData = await adminAPI.getAllUsers();
      setUsers(usersData);
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
      alert('Withdrawal successful!');
    } catch (err: any) {
      alert('Withdrawal failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenue = useCallback(async (filter: string = revenueFilter) => {
    setLoading(true);
    try {
        const stats = await adminAPI.getRevenueStats(filter);
        setRevenueStats(stats);
        setRevenueFilter(filter);
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

  const handleUserClick = async (userId: string) => {
      setLoading(true);
      try {
          const details = await adminAPI.getUserDetails(userId);
          setSelectedUser(details);
          setShowUserModal(true);
      } catch (err: any) {
          alert('Failed to fetch user details: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!confirm('Are you sure you want to delete this game? This action cannot be undone.')) return;
    
    setLoading(true);
    try {
      await adminAPI.deleteGame(gameId);
      alert('Game deleted successfully');
      fetchActiveGames();
    } catch (err: any) {
      alert('Error deleting game: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRequest = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
      if (!confirm(`Are you sure you want to ${action} this request?`)) return;
      
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
          alert(`Request ${action}D successfully`);
      } catch (err: any) {
          alert(`Failed to process: ${err.message}`);
      }
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

  // Fetch data based on active tab
  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'dashboard') {
      fetchUsers();
    }
    if (activeTab === 'wallet' || activeTab === 'dashboard') {
        fetchRequests();
    }
    if (activeTab === 'revenue' || activeTab === 'dashboard') {
        fetchRevenue();
    }
    if (activeTab === 'games' || activeTab === 'dashboard') {
        fetchActiveGames();
    }
  }, [activeTab, fetchUsers, fetchRequests, fetchRevenue, fetchActiveGames]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        const pendingRequestsCount = requests.filter(r => r.status === 'PENDING').length;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
              <button
                onClick={fetchUsers}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            </div>
            
            {/* Search Box */}
            <div className="p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="max-w-md w-full">
                <label htmlFor="phone-search" className="block text-sm font-semibold text-gray-700 mb-2">
                  🔍 Search Users
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-lg">📞</span>
                  </div>
                  <input
                    id="phone-search"
                    type="text"
                    value={phoneSearchQuery}
                    onChange={(e) => setPhoneSearchQuery(e.target.value)}
                    placeholder="Search by name or phone number..."
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
                    Showing results matching: <span className="font-semibold text-green-600">{phoneSearchQuery}</span>
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
              // Fuzzy search function for phone numbers and names
              const fuzzyMatch = (phone: string | undefined, username: string | undefined, query: string): boolean => {
                if (!query) return true;
                
                const queryLower = query.toLowerCase();
                
                // Check phone number
                if (phone) {
                  const phoneDigits = phone.replace(/\D/g, '');
                  const queryDigits = query.replace(/\D/g, '');
                  if (phoneDigits.includes(queryDigits) || phone.toLowerCase().includes(queryLower)) {
                    return true;
                  }
                }
                
                // Check username
                if (username && username.toLowerCase().includes(queryLower)) {
                  return true;
                }
                
                return false;
              };
              
              // Filter users based on search
              const filteredUsers = phoneSearchQuery.trim()
                ? users.filter(user => fuzzyMatch(user.phone, user.username, phoneSearchQuery))
                : users;
              
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
                      {filteredUsers.map((user) => (
                        <div
                          key={user.id || user._id}
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
                              <h3 className="text-base font-bold text-gray-900 truncate group-hover:text-green-600 transition-colors">
                                {user.username || 'Unknown User'}
                              </h3>
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
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                              user.role === 'SUPER_ADMIN' 
                                ? 'bg-purple-100 text-purple-800'
                                : user.role === 'ADMIN'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.role || 'USER'}
                            </span>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                              user.status === 'Active'
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
                  {filteredUsers.length > 0 && (
                    <div className="mt-6 text-center">
                      <p className="text-sm text-gray-500">
                        Showing <span className="font-semibold text-gray-900">{filteredUsers.length}</span> of <span className="font-semibold text-gray-900">{users.length}</span> users
                      </p>
                    </div>
                  )}
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
                                                        <p className="text-sm font-bold text-gray-700">{p.username || p.color}</p>
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
          { value: 'thisWeek', label: 'This Week' },
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
                            <span>💸</span> Withdraw
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
                                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all ${
                                        revenueFilter === option.value
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
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Game</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Amt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white text-sm">
                                    {revenueStats?.history.slice(0, 10).map((rev) => (
                                        <tr key={rev._id || rev.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                                {new Date(rev.timestamp).toLocaleDateString()}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-gray-500 text-xs">{rev.gameId}</td>
                                            <td className="px-3 py-2 text-green-600 font-bold text-right">+${rev.amount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {(!revenueStats?.history || revenueStats.history.length === 0) && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500">No revenue yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
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
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                        wd.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
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
                                <h3 className="text-xl font-bold text-gray-900">Withdraw Revenue</h3>
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
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
                  <p className="text-xs text-gray-600 mt-1">Total</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{requests.filter(r => r.status === 'PENDING').length}</p>
                  <p className="text-xs text-yellow-600 mt-1">Pending</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{requests.filter(r => r.status === 'APPROVED').length}</p>
                  <p className="text-xs text-green-600 mt-1">Approved</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{requests.filter(r => r.status === 'REJECTED').length}</p>
                  <p className="text-xs text-red-600 mt-1">Rejected</p>
                </div>
              </div>
              
              {/* Filter buttons */}
              <div className="flex gap-2 flex-wrap">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      filterStatus === status
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
                        {requests.filter(r => r.status === status).length}
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
                      .filter(req => filterStatus === 'ALL' || req.status === filterStatus)
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
                          <div className={`p-4 border-b ${statusStyle.border} ${
                            isDeposit ? 'bg-gradient-to-r from-green-50 to-green-100' : 'bg-gradient-to-r from-red-50 to-red-100'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                                  isDeposit 
                                    ? 'bg-green-500 text-white' 
                                    : 'bg-red-500 text-white'
                                }`}>
                                  <span className="text-2xl">
                                    {isDeposit ? '💰' : '💸'}
                                  </span>
                                </div>
                                <div>
                                  <p className={`text-sm font-bold uppercase tracking-wider ${
                                    isDeposit ? 'text-green-700' : 'text-red-700'
                                  }`}>
                                    {req.type}
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
                              <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusStyle.badge} flex items-center gap-1`}>
                                <span>{statusStyle.icon}</span>
                                {req.status}
                              </span>
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
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${
              activeTab === 'dashboard' 
                ? 'bg-green-600 text-white shadow-md font-semibold' 
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <span className="text-lg sm:text-xl">📊</span> 
            <span>Dashboard</span>
          </button>
          
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${
              activeTab === 'users' 
                ? 'bg-green-600 text-white shadow-md font-semibold' 
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <span className="text-lg sm:text-xl">👥</span> 
            <span>Users</span>
          </button>
          
          <button
            onClick={() => setActiveTab('games')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${
              activeTab === 'games' 
                ? 'bg-green-600 text-white shadow-md font-semibold' 
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <span className="text-lg sm:text-xl">🎮</span> 
            <span>Active Games</span>
          </button>
          
          <button
            onClick={() => setActiveTab('wallet')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${
              activeTab === 'wallet' 
                ? 'bg-green-600 text-white shadow-md font-semibold' 
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <span className="text-lg sm:text-xl">💰</span> 
            <span>Wallet Requests</span>
          </button>

          <button
            onClick={() => setActiveTab('revenue')}
            className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${
              activeTab === 'revenue' 
                ? 'bg-green-600 text-white shadow-md font-semibold' 
                : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <span className="text-lg sm:text-xl">📈</span> 
            <span>Revenue</span>
          </button>
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
        
        {/* User Details Modal */}
        {showUserModal && selectedUser && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                        <h3 className="text-2xl font-bold text-gray-900">User Profile</h3>
                        <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto custom-scrollbar">
                        {/* User Stats Header */}
                        <div className="flex items-center gap-6 mb-8">
                            <div className="w-24 h-24 rounded-full bg-slate-200 overflow-hidden border-4 border-white shadow-lg">
                                <img src={selectedUser.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.user.username}`} alt="Avatar" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-gray-900">{selectedUser.user.username}</h2>
                                <p className="text-gray-500 font-mono text-sm mb-2">ID: {selectedUser.user.id || selectedUser.user._id}</p>
                                <div className="flex gap-3">
                                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-bold">
                                        Balance: ${selectedUser.user.balance?.toFixed(2)}
                                    </span>
                                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-bold">
                                        Role: {selectedUser.user.role}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                                <p className="text-xs uppercase font-bold text-slate-500 mb-1">Games Played</p>
                                <p className="text-3xl font-black text-slate-800">{selectedUser.user.stats?.gamesPlayed || 0}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-center">
                                <p className="text-xs uppercase font-bold text-green-600 mb-1">Won</p>
                                <p className="text-3xl font-black text-green-700">{selectedUser.user.stats?.wins || 0}</p>
                            </div>
                            <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-center">
                                <p className="text-xs uppercase font-bold text-red-600 mb-1">Lost</p>
                                <p className="text-3xl font-black text-red-700">
                                    {(selectedUser.user.stats?.gamesPlayed || 0) - (selectedUser.user.stats?.wins || 0)}
                                </p>
                            </div>
                        </div>

                        {/* Match History */}
                        <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span>📜</span> Match History
                        </h4>
                        
                        {selectedUser.history.length === 0 ? (
                            <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                                <p className="text-gray-500">No match history found.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedUser.history.map((match) => (
                                    <div key={match.gameId} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold ${
                                                match.result === 'WON' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                            }`}>
                                                {match.result === 'WON' ? 'W' : 'L'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">vs {match.opponentName}</p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(match.date).toLocaleDateString()} at {new Date(match.date).toLocaleTimeString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold text-lg ${
                                                match.amount >= 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                                {match.amount >= 0 ? '+' : ''}${Math.abs(match.amount).toFixed(2)}
                                            </p>
                                            <p className="text-xs text-gray-400">Stake: ${match.stake}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                        <button 
                            onClick={() => setShowUserModal(false)} 
                            className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-lg transition-colors"
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
    </div>
  );
};

export default SuperAdminDashboard;
