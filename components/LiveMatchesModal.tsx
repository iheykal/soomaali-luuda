import React, { useState, useEffect } from 'react';
import { API_URL } from '../lib/apiConfig';
import { instrumentedFetch } from '../services/apiService';

interface LiveMatchesModalProps {
    onClose: () => void;
    onWatch: (gameId: string) => void;
}

const LiveMatchesModal: React.FC<LiveMatchesModalProps> = ({ onClose, onWatch }) => {
    const [liveGames, setLiveGames] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLiveGames = async () => {
        // Only set loading true if we don't have data yet to prevent flickers on refresh
        if (liveGames.length === 0) setLoading(true);

        try {
            const url = `${API_URL || 'http://localhost:5000/api'}/game/live`;
            const { responseData } = await instrumentedFetch(url, { method: 'GET' });
            if (responseData.success) {
                setLiveGames(responseData.games || []);
            } else {
                throw new Error(responseData.error || 'Failed to fetch matches');
            }
        } catch (err: any) {
            console.error('Error fetching live games:', err);
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLiveGames();
        const interval = setInterval(fetchLiveGames, 15000); // Auto-refresh every 15s
        return () => clearInterval(interval);
    }, []);

    const getDuration = (createdAt: string) => {
        const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
        const mins = Math.floor(diff / 60);
        return `${mins}m`;
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[100] p-2 sm:p-4 overflow-hidden">
            <div className="bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.9)] w-full max-w-xl flex flex-col max-h-[95vh] animate-in fade-in zoom-in duration-500">

                {/* Header - Compact for mobile */}
                <div className="p-5 sm:p-8 pb-3 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
                            <span className="text-xl sm:text-2xl animate-pulse">📡</span>
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-none uppercase">Ciyaaraha Socda</h2>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                <p className="text-[8px] sm:text-[9px] text-blue-200/50 font-bold uppercase tracking-[0.1em]">Live Watch Mode</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/50 hover:text-white flex items-center justify-center transition-all active:scale-95 group"
                    >
                        <span className="text-2xl sm:text-3xl font-light group-hover:rotate-90 transition-transform duration-300">&times;</span>
                    </button>
                </div>

                {/* Content - Modern List */}
                <div className="px-4 sm:px-8 py-2 overflow-y-auto custom-scrollbar flex-1">
                    {loading && liveGames.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-blue-100/40 font-bold text-[10px] tracking-widest uppercase">Raadinaya...</p>
                        </div>
                    ) : error ? (
                        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                            <p className="text-red-200 text-xs font-bold mb-3">{error}</p>
                            <button onClick={fetchLiveGames} className="px-5 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-[10px] text-white font-bold transition-all">TRY AGAIN</button>
                        </div>
                    ) : liveGames.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="text-5xl mb-4 grayscale opacity-20 transform hover:scale-110 transition-transform cursor-default">🎮</div>
                            <p className="text-white font-black text-lg mb-1">Ciyaar ma jirto</p>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest leading-relaxed">No matches are active at this moment</p>
                        </div>
                    ) : (
                        <div className="space-y-3 pb-6">
                            {liveGames.map((game) => (
                                <div key={game.gameId} className="relative group">
                                    <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[1.5rem] sm:rounded-[2rem]"></div>
                                    <div className="bg-white/5 border border-white/10 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-5 relative transition-all duration-300 group-hover:border-white/20 shadow-xl">

                                        <div className="flex flex-col gap-4">
                                            {/* Players Section */}
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className="flex items-center -space-x-2 sm:-space-x-3 shrink-0">
                                                        {game.players.slice(0, 2).map((p: any, i: number) => (
                                                            <div key={i} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-[3px] border-[#0f172a] flex items-center justify-center relative shadow-lg ${p.color === 'red' ? 'bg-red-600' :
                                                                p.color === 'green' ? 'bg-green-600' :
                                                                    p.color === 'yellow' ? 'bg-yellow-500' : 'bg-blue-600'
                                                                }`}>
                                                                <span className="text-white text-sm sm:text-base font-black uppercase">{p.username?.charAt(0) || 'P'}</span>
                                                                {p.isAI && <div className="absolute -top-1 -right-1 bg-white text-[6px] text-black font-black px-1 rounded-sm">AI</div>}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md">
                                                                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                                <span className="text-[7px] font-black text-red-500 uppercase tracking-widest">Live</span>
                                                            </div>
                                                            <span className="text-[8px] sm:text-[9px] font-bold text-white/30 tracking-tight uppercase">ID: {game.gameId?.slice(-6).toUpperCase()}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="text-white font-black text-sm sm:text-base truncate">{game.players[0]?.username || 'Player 1'}</span>
                                                            <span className="text-white/20 text-[10px] font-bold shrink-0">VS</span>
                                                            <span className="text-white font-black text-sm sm:text-base truncate">{game.players[1]?.username || 'Player 2'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[8px] sm:text-[9px] font-bold text-white/30 flex items-center gap-1 uppercase">
                                                                <span>⏱️</span> {getDuration(game.createdAt)} ago
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Stake - Floating style */}
                                                <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full shrink-0">
                                                    <span className="text-emerald-400 font-black text-xs sm:text-sm tracking-tighter">${game.stake?.toFixed(2)}</span>
                                                </div>
                                            </div>

                                            {/* Action Button - Full width on simple container */}
                                            <button
                                                onClick={() => onWatch(game.gameId)}
                                                className="w-full py-2.5 sm:py-3 bg-white text-black font-black text-xs sm:text-sm rounded-xl sm:rounded-2xl hover:bg-blue-600 hover:text-white transition-all active:scale-[0.98] shadow-lg shadow-white/5 uppercase"
                                            >
                                                Daawo Hadda (Watch)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer - Minimal */}
                <div className="p-4 sm:p-6 pt-0">
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex items-center justify-between">
                        <p className="text-[7px] sm:text-[8px] text-white/20 font-black uppercase tracking-[0.2em] px-2 truncate">
                            GLOBAL SPECTATOR NETWORK • SECURE STREAM
                        </p>
                        <div className="flex gap-1.5 shrink-0 px-2">
                            <div className="h-1 w-1 rounded-full bg-green-500/50"></div>
                            <div className="h-1 w-1 rounded-full bg-white/5"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveMatchesModal;
