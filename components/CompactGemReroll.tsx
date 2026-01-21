import React, { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

interface CompactGemRerollProps {
    gameId: string;
    userId: string;
    socket: any;
    userGems: number;
    rerollsUsed: number;
    maxRerolls?: number;
    currentPlayerTurn: boolean;
    turnState: string;
    onRerollSuccess?: () => void;
}

const CompactGemReroll: React.FC<CompactGemRerollProps> = ({
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
    const [showError, setShowError] = useState<string | null>(null);

    const GEM_COST = 1;
    const canReroll = userGems >= GEM_COST && rerollsUsed < maxRerolls && currentPlayerTurn;

    React.useEffect(() => {
        if (!socket) return;

        const handleRerollSuccess = () => {
            setLoading(false);
            if (onRerollSuccess) onRerollSuccess();
        };

        const handleError = (data: any) => {
            setLoading(false);
            setShowError(data.message);
            setTimeout(() => setShowError(null), 3000);
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
        setShowError(null);
        socket.emit('use_gem_reroll', { gameId, userId });
    };

    // Don't show if not player's turn
    if (!currentPlayerTurn) return null;

    // Only show after a dice roll
    if (turnState === 'ROLLING' || turnState === 'ANIMATING') return null;

    return (
        <div className="relative">
            {/* Error Toast */}
            {showError && (
                <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-xl text-sm z-50 animate-bounce">
                    {showError}
                </div>
            )}

            {/* Compact Button */}
            <button
                onClick={handleReroll}
                disabled={!canReroll || loading}
                className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-white shadow-lg transition-all ${canReroll && !loading
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:scale-105 cursor-pointer'
                    : 'bg-gray-600 opacity-50 cursor-not-allowed'
                    }`}
                title={`Gem Re-roll (${rerollsUsed}/${maxRerolls} used)`}
            >
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-white/20 rounded-md">
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <RotateCcw className={`w-4 h-4 ${canReroll ? 'group-hover:rotate-180 transition-transform duration-700' : ''}`} />
                        )}
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold uppercase tracking-tighter text-white opacity-80 leading-none">Undo</span>
                        <span className="text-sm font-black text-white leading-tight">{rerollsUsed}/{maxRerolls}</span>
                    </div>
                </div>
            </button>
        </div>
    );
};

export default CompactGemReroll;
