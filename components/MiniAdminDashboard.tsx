import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../lib/apiConfig';

interface ActiveGame {
    gameId: string;
    status: string;
    stake: number;
    players: Array<{ username: string; color: string }>;
    createdAt: string;
}

interface PendingRequest {
    _id: string;
    shortId?: number;
    userName: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    amount: number;
    paymentMethod?: string;
    timestamp: string;
    details?: string;
}

interface MiniAdminDashboardProps {
    onClose: () => void;
}

const MiniAdminDashboard: React.FC<MiniAdminDashboardProps> = ({ onClose }) => {
    const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
    const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
    const [loadingGames, setLoadingGames] = useState(true);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [activeTab, setActiveTab] = useState<'games' | 'requests'>('games');
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    const getToken = () => localStorage.getItem('ludo_token') || '';

    const fetchActiveGames = useCallback(async () => {
        setLoadingGames(true);
        try {
            const res = await fetch(`${API_URL}/admin/active-games`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setActiveGames(data.games || []);
            }
        } catch (err) {
            console.error('Failed to fetch active games:', err);
        } finally {
            setLoadingGames(false);
        }
    }, []);

    const fetchPendingRequests = useCallback(async () => {
        setLoadingRequests(true);
        try {
            const res = await fetch(`${API_URL}/admin/financial-requests?status=PENDING&limit=50`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setPendingRequests(data.requests || []);
            }
        } catch (err) {
            console.error('Failed to fetch pending requests:', err);
        } finally {
            setLoadingRequests(false);
        }
    }, []);

    const refresh = useCallback(() => {
        fetchActiveGames();
        fetchPendingRequests();
        setLastRefreshed(new Date());
    }, [fetchActiveGames, fetchPendingRequests]);

    useEffect(() => {
        refresh();
        // Auto-refresh every 30 seconds
        const interval = setInterval(refresh, 30_000);
        return () => clearInterval(interval);
    }, [refresh]);

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleTimeString('so-SO', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('so-SO', { month: 'short', day: 'numeric' }) + ' ' + formatTime(dateStr);
    };

    const playerColorClass: Record<string, string> = {
        red: 'bg-red-500',
        blue: 'bg-blue-500',
        green: 'bg-green-500',
        yellow: 'bg-yellow-500',
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 shadow-lg flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🛡️</span>
                    <div>
                        <h1 className="text-white font-black text-lg leading-none">Admin Panel</h1>
                        <p className="text-amber-100 text-[10px] uppercase tracking-widest font-semibold">Read-only View</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={refresh}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-bold transition-all"
                    >
                        <span className="text-sm">🔄</span>
                        Refresh
                    </button>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-bold text-sm transition-all"
                    >
                        ✕ Close
                    </button>
                </div>
            </div>

            {/* Last refreshed */}
            <div className="px-4 py-1.5 bg-slate-800/80 border-b border-slate-700/50 flex-shrink-0">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest">
                    Last updated: {lastRefreshed.toLocaleTimeString()} — auto-refresh every 30 s
                </p>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-slate-700 flex-shrink-0 bg-slate-800">
                <button
                    onClick={() => setActiveTab('games')}
                    className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-b-2 ${
                        activeTab === 'games'
                            ? 'border-amber-500 text-amber-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <span>🎲</span>
                    Active Games
                    {!loadingGames && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                            activeGames.length > 0 ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                            {activeGames.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-b-2 ${
                        activeTab === 'requests'
                            ? 'border-amber-500 text-amber-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <span>📋</span>
                    Pending Requests
                    {!loadingRequests && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                            pendingRequests.length > 0 ? 'bg-orange-500/20 text-orange-400 animate-pulse' : 'bg-slate-700 text-slate-400'
                        }`}>
                            {pendingRequests.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">

                {/* ── ACTIVE GAMES TAB ── */}
                {activeTab === 'games' && (
                    <div>
                        {loadingGames ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-slate-400 text-sm">Loading active games...</p>
                            </div>
                        ) : activeGames.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                                <span className="text-5xl">😴</span>
                                <p className="text-slate-400 font-bold">No active games right now</p>
                                <p className="text-slate-600 text-sm">Games will appear here when players are matched</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-4">
                                    {activeGames.length} game{activeGames.length !== 1 ? 's' : ''} in progress
                                </p>
                                {activeGames.map((game) => (
                                    <div
                                        key={game.gameId}
                                        className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3"
                                    >
                                        {/* Game ID + Stake */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-white font-bold text-sm flex items-center gap-1.5">
                                                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse inline-block" />
                                                    LIVE
                                                </p>
                                                <p className="text-slate-500 text-[10px] font-mono mt-0.5">{game.gameId}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-yellow-400 font-black text-lg">${(game.stake || 0).toFixed(2)}</p>
                                                <p className="text-slate-500 text-[10px] uppercase tracking-wider">Stake</p>
                                            </div>
                                        </div>

                                        {/* Players */}
                                        {game.players && game.players.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {game.players.map((p, i) => (
                                                    <div key={i} className="flex items-center gap-1.5 bg-slate-700/60 rounded-full px-2.5 py-1">
                                                        <span className={`w-2.5 h-2.5 rounded-full ${playerColorClass[p.color] || 'bg-slate-400'}`} />
                                                        <span className="text-slate-200 text-xs font-medium">{p.username || 'Player'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Time */}
                                        <p className="text-slate-600 text-[10px]">Started: {formatDate(game.createdAt)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── PENDING REQUESTS TAB ── */}
                {activeTab === 'requests' && (
                    <div>
                        {loadingRequests ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-slate-400 text-sm">Loading pending requests...</p>
                            </div>
                        ) : pendingRequests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                                <span className="text-5xl">✅</span>
                                <p className="text-slate-400 font-bold">No pending requests</p>
                                <p className="text-slate-600 text-sm">All requests have been processed</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-4">
                                    {pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''} awaiting approval
                                </p>
                                {pendingRequests.map((req) => (
                                    <div
                                        key={req._id}
                                        className={`bg-slate-800 border rounded-xl p-4 flex flex-col gap-2 ${
                                            req.type === 'DEPOSIT' ? 'border-green-500/30' : 'border-red-500/30'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-lg ${req.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'}`}>
                                                    {req.type === 'DEPOSIT' ? '⬇️' : '⬆️'}
                                                </span>
                                                <div>
                                                    <p className="text-white font-bold text-sm">{req.userName}</p>
                                                    <p className={`text-xs font-bold uppercase tracking-wider ${
                                                        req.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {req.type}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-black text-xl ${req.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'}`}>
                                                    ${req.amount.toFixed(2)}
                                                </p>
                                                {req.shortId && (
                                                    <p className="text-slate-500 text-[10px] font-mono">#{req.shortId}</p>
                                                )}
                                            </div>
                                        </div>

                                        {req.paymentMethod && (
                                            <p className="text-slate-400 text-xs flex items-center gap-1">
                                                <span>💳</span> {req.paymentMethod}
                                            </p>
                                        )}
                                        {req.details && (
                                            <p className="text-slate-500 text-xs truncate">{req.details}</p>
                                        )}

                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-slate-600 text-[10px]">{formatDate(req.timestamp)}</p>
                                            <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-yellow-400 text-[10px] font-bold uppercase tracking-wider">
                                                Pending
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MiniAdminDashboard;
