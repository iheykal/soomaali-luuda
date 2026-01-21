import React, { useState, useEffect } from 'react';
import { Gem, RotateCcw, AlertCircle, Check } from 'lucide-react';

interface GemRerollButtonProps {
    gameId: string;
    userId: string;
    socket: any;
    userGems: number;
    rerollsUsed: number;
    maxRerolls: number;
    currentPlayerTurn: boolean;
    turnState: string;
    onRerollSuccess?: (data: { gemsRemaining: number; rerollsUsed: number; rerollsRemaining: number }) => void;
}

const GemRerollButton: React.FC<GemRerollButtonProps> = ({
    gameId,
    userId,
    socket,
    userGems,
    rerollsUsed,
    maxRerolls = 4,
    currentPlayerTurn,
    turnState,
    onRerollSuccess
}) => {
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const GEM_COST = 1;
    const canReroll = userGems >= GEM_COST && rerollsUsed < maxRerolls && currentPlayerTurn;

    useEffect(() => {
        if (!socket) return;

        const handleRerollSuccess = (data: any) => {
            setLoading(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
            if (onRerollSuccess) {
                onRerollSuccess(data);
            }
        };

        const handleError = (data: any) => {
            setLoading(false);
            setError(data.message);
            setTimeout(() => setError(null), 3000);
        };

        socket.on('gem_reroll_success', handleRerollSuccess);
        socket.on('ERROR', handleError);

        return () => {
            socket.off('gem_reroll_success', handleRerollSuccess);
            socket.off('ERROR', handleError);
        };
    }, [socket, onRerollSuccess]);

    const handleReroll = () => {
        if (!canReroll || loading) return;

        setLoading(true);
        setError(null);
        socket.emit('use_gem_reroll', { gameId, userId });
    };

    // Don't show button if not player's turn or in wrong state
    if (!currentPlayerTurn) return null;

    // Only show after a dice roll (when in MOVING state or after no legal moves)
    if (turnState === 'ROLLING' || turnState === 'ANIMATING') return null;

    return (
        <div className="relative">
            {/* Error Message */}
            {error && (
                <div className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-red-500/90 text-white rounded-lg shadow-lg text-sm flex items-center gap-2 animate-slide-down">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Success Message */}
            {showSuccess && (
                <div className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-green-500/90 text-white rounded-lg shadow-lg text-sm flex items-center gap-2 animate-bounce z-50">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>Re-roll granted! Roll again 🎲</span>
                </div>
            )}

            {/* Guide Arrow - Pulsing */}
            {canReroll && !loading && (
                <div className="absolute -left-12 top-1/2 -translate-y-1/2 hidden lg:flex items-center animate-pulse-horizontal">
                    <span className="text-4xl">➡️</span>
                </div>
            )}

            {/* Re-roll Button - COMPACT */}
            <button
                onClick={handleReroll}
                disabled={!canReroll || loading}
                className={`group relative w-full px-3 py-2 rounded-lg font-semibold text-white shadow-md transition-all transform overflow-hidden text-sm ${canReroll && !loading
                    ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:scale-105 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] cursor-pointer ring-1 ring-purple-400/40'
                    : 'bg-gray-600 opacity-50 cursor-not-allowed'
                    }`}
            >
                {/* Shine Animation */}
                {canReroll && !loading && (
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine" />
                )}

                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <div className="p-1.5 bg-white/20 rounded-md backdrop-blur-sm border border-white/30">
                                    <RotateCcw className={`w-4 h-4 ${!loading && canReroll ? 'group-hover:rotate-180 transition-transform duration-700' : ''}`} />
                                </div>
                                <div className="text-left">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-bold">Gem Re-roll</span>
                                    </div>
                                    <div className="text-[10px] text-white/80 flex items-center gap-1 font-medium">
                                        <Gem className="w-2.5 h-2.5 text-pink-300" />
                                        <span>Cost: <span className="font-bold">{GEM_COST}</span> gem</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {!loading && (
                        <div className="text-right pl-2 border-l border-white/20">
                            <div className="text-[9px] text-white/70 uppercase tracking-tight">Used</div>
                            <div className="text-lg font-black drop-shadow-md">{rerollsUsed}/{maxRerolls}</div>
                        </div>
                    )}
                </div>

                {/* Disabled Reason Tooltip */}
                {!canReroll && !loading && (
                    <div className="absolute bottom-full right-0 mb-2 p-3 bg-gray-900 text-white rounded-lg shadow-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {userGems < GEM_COST && `Need ${GEM_COST} gem (you have ${userGems})`}
                        {userGems >= GEM_COST && rerollsUsed >= maxRerolls && `Max ${maxRerolls} re-rolls per game reached`}
                    </div>
                )}
            </button>

            {/* Gem Balance Display - COMPACT */}
            <div className="mt-2 flex items-center justify-between text-xs px-1">
                <div className="flex items-center gap-1.5 text-purple-300">
                    <Gem className="w-3.5 h-3.5 text-purple-400" />
                    <span className="font-medium">Gems: <span className="font-bold text-white">{userGems}</span></span>
                </div>
            </div>
        </div>
    );
};

export default GemRerollButton;
