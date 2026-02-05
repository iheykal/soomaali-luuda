import React from 'react';
import { User } from '../types';
import {
    X,
    TrendingUp,
    Zap,
    Trophy,
    Gamepad2,
    TrendingDown,
    Medal,
    DollarSign,
    Wallet,
    ArrowRight
} from 'lucide-react';

interface PlayerStatsModalProps {
    user: User;
    onClose: () => void;
}

const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ user, onClose }) => {
    const stats = user.stats || { gamesPlayed: 0, wins: 0, gamesWon: 0, gamesLost: 0, totalWinnings: 0, totalLosses: 0 };

    // Normalize stats
    const wins = stats.wins || stats.gamesWon || 0;
    const gamesPlayed = stats.gamesPlayed || 0;
    const losses = stats.gamesLost || Math.max(0, gamesPlayed - wins);
    const totalWinnings = stats.totalWinnings || 0;
    const totalLosses = stats.totalLosses || 0;
    const netEarnings = totalWinnings - totalLosses;

    const winRate = gamesPlayed > 0
        ? Math.round((wins / gamesPlayed) * 100)
        : 0;

    // Calculate Rank based on wins (Example logic)
    let rank = "Rookie";
    if (wins >= 50) rank = "Elite";
    else if (wins >= 20) rank = "Pro";
    else if (wins >= 10) rank = "Expert";
    else if (wins >= 5) rank = "Advanced";

    // Calculate circle stroke offset
    // Circumference = 2 * PI * r = 2 * 3.14159 * 40 ≈ 251.2
    const circumference = 251.2;
    const strokeDashoffset = circumference - (winRate / 100) * circumference;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="w-full max-w-md bg-[#111827] rounded-[40px] shadow-2xl overflow-hidden border border-slate-800 relative animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-6 right-6 z-10">
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="pt-12 pb-8 flex flex-col items-center border-b border-slate-800"

                >
                    <div className="relative mb-4">
                        <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-[#3B82F6] to-cyan-400 shadow-xl">
                            <img
                                alt={user.username}
                                className="w-full h-full rounded-full bg-slate-800 object-cover"
                                src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                            />
                        </div>
                        <div className="absolute bottom-1 right-1 w-6 h-6 bg-[#10B981] border-4 border-[#111827] rounded-full"></div>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">{user.username}</h1>

                    {/* Level and Rank Display */}
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[#3B82F6] text-sm font-mono font-bold">
                            Lvl {user.level || 1}
                        </p>
                        <span className="text-slate-600">•</span>
                        <p className="text-slate-400 text-sm font-semibold">
                            {(() => {
                                const level = user.level || 1;
                                if (level >= 100) return 'Ludo God';
                                if (level >= 50) return 'Grandmaster';
                                if (level >= 25) return 'Master';
                                if (level >= 10) return 'Challenger';
                                return 'Novice';
                            })()}
                        </p>
                    </div>

                    {/* XP Progress Bar */}
                    <div className="w-full max-w-xs mt-3">
                        {(() => {
                            const level = user.level || 1;
                            const totalXp = user.xp || 0;

                            // Calculate XP for current level boundaries
                            const calculateXpForLevel = (lvl: number) => Math.floor(500 * Math.pow(lvl, 1.5));
                            const getTotalXpForLevel = (lvl: number) => {
                                let total = 0;
                                for (let i = 1; i < lvl; i++) {
                                    total += calculateXpForLevel(i + 1);
                                }
                                return total;
                            };

                            const xpForPreviousLevel = level > 1 ? getTotalXpForLevel(level) : 0;
                            const xpForNextLevel = getTotalXpForLevel(level + 1);
                            const xpInCurrentLevel = totalXp - xpForPreviousLevel;
                            const xpNeededForNextLevel = xpForNextLevel - xpForPreviousLevel;
                            const percentage = Math.min(100, Math.max(0, Math.floor((xpInCurrentLevel / xpNeededForNextLevel) * 100)));

                            return (
                                <>
                                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-gradient-to-r from-[#3B82F6] to-cyan-400 h-full rounded-full transition-all duration-500 ease-out"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 text-center font-mono">
                                        {xpInCurrentLevel.toLocaleString()} / {xpNeededForNextLevel.toLocaleString()} XP
                                    </p>
                                </>
                            );
                        })()}
                    </div>

                    <p className="text-slate-400 text-xs mt-2 font-medium">
                        Joined {new Date(user.joined || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>

                <div className="p-6 grid grid-cols-2 gap-4">
                    <div className="col-span-2 bg-slate-800/50 rounded-3xl p-6 flex items-center justify-between border border-slate-800">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Win Rate</p>
                            <h2 className="text-4xl font-extrabold text-white">{winRate}<span className="text-[#3B82F6]">%</span></h2>
                            <p className="text-xs text-[#10B981] mt-2 flex items-center font-semibold">
                                <TrendingUp className="w-4 h-4 mr-1" />
                                {winRate >= 50 ? 'Top 10% Global' : 'Keep Pushing'}
                            </p>
                        </div>
                        <div className="relative flex items-center justify-center w-24 h-24">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle className="text-slate-700" cx="48" cy="48" fill="transparent" r="40" stroke="currentColor" strokeWidth="8"></circle>
                                <circle
                                    className="text-[#3B82F6] transition-all duration-1000 ease-out"
                                    cx="48" cy="48"
                                    fill="transparent" r="40"
                                    stroke="currentColor"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                    strokeWidth="8"
                                ></circle>
                            </svg>
                            <Zap className="absolute text-[#3B82F6] w-8 h-8" fill="currentColor" />
                        </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Trophy className="text-amber-400 w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Wins</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{wins}</p>
                    </div>

                    <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Gamepad2 className="text-[#3B82F6] w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Games</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{gamesPlayed}</p>
                    </div>

                    <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-800">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingDown className="text-[#EF4444] w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Losses</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{losses}</p>
                    </div>

                    <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Medal className="text-purple-500 w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{rank}</p>
                    </div>
                </div>

                <div className="px-6 pb-10">

                </div>
            </div>
        </div>
    );
};

export default PlayerStatsModal;
