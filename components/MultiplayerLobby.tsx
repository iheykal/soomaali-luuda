import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMatchmaking } from '../hooks/useMatchmaking';
import type { Player, PlayerColor } from '../types';

interface MultiplayerLobbyProps {
  onStartGame: (players: Player[], config: { gameId: string, localPlayerColor: PlayerColor, sessionId: string }) => void;
  onExit: () => void;
}

const BET_OPTIONS = [0.25, 0.50, 1.00];

const getSessionId = () => {
    let id = sessionStorage.getItem('ludoSessionId');
    if (!id) {
        id = Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('ludoSessionId', id);
    }
    return id;
};

// --- Helper Components ---

const CountdownOverlay: React.FC<{ count: number }> = ({ count }) => (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] backdrop-blur-sm">
        <div className="text-center animate-in fade-in zoom-in duration-300">
            <div className="text-[12rem] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-cyan-600 animate-bounce drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                {count > 0 ? count : 'GO!'}
            </div>
            <p className="text-white text-2xl mt-4 font-bold tracking-[0.5em] uppercase animate-pulse">Match Starting</p>
        </div>
    </div>
);

const BetCard: React.FC<{ amount: number; onClick: () => void; disabled: boolean }> = ({ amount, onClick, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`
            relative group flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-300
            ${disabled ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed' : 'border-slate-600 bg-slate-800 hover:border-cyan-400 hover:bg-slate-750 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer active:scale-95'}
        `}
    >
        <div className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Stake</div>
        <div className={`text-4xl font-black ${disabled ? 'text-slate-500' : 'text-white group-hover:text-cyan-300'}`}>
            ${amount.toFixed(2)}
        </div>
        <div className="mt-4 px-3 py-1 rounded-full bg-slate-900 text-xs text-slate-500 font-mono border border-slate-700 group-hover:border-cyan-500/50 transition-colors">
            Win: ${(amount * 2 * 0.9).toFixed(2)}
        </div>
    </button>
);

// --- Main Component ---

const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ onStartGame, onExit }) => {
    const { user } = useAuth();
    const sessionId = getSessionId();

    const { 
        socket,
        connectionStatus, 
        error, 
        searchForMatch, 
        cancelSearch,
        reconnect,
    } = useMatchmaking();
    
    const [uiState, setUiState] = useState<'SELECT' | 'SEARCHING' | 'FOUND' | 'STARTING'>('SELECT');
    const [selectedStake, setSelectedStake] = useState<number | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [opponentName, setOpponentName] = useState('');

    useEffect(() => {
        if (!socket) return;

        const handleMatchFound = ({ gameId, playerColor, opponent, stake }: any) => {
            console.log('✅ Match found!', { gameId, playerColor, opponent, stake });
            setUiState('FOUND');
            setOpponentName(opponent.userName || opponent.userId);
            
            setTimeout(() => {
                const defaultPlayers: Player[] = [
                    { color: 'green', isAI: false },
                    { color: 'blue', isAI: false }
                ];
                startCountdown(() => {
                    onStartGame(defaultPlayers, { gameId, localPlayerColor: playerColor, sessionId });
                });
            }, 1000);
        };
        
        const handleSearchCancelled = () => {
            console.log('❌ Search cancelled by server or timeout.');
            setUiState('SELECT');
            setSelectedStake(null);
        };

        socket.on('match_found', handleMatchFound);
        socket.on('search_cancelled', handleSearchCancelled);

        return () => {
            socket.off('match_found', handleMatchFound);
            socket.off('search_cancelled', handleSearchCancelled);
        };

    }, [socket, onStartGame, sessionId]);

    const startCountdown = (onComplete: () => void) => {
        setUiState('STARTING');
        let count = 3;
        setCountdown(count);
        
        const timer = setInterval(() => {
            count--;
            if (count < 0) {
                clearInterval(timer);
                setCountdown(null);
                onComplete();
            } else {
                setCountdown(count);
            }
        }, 1000);
    };

    const handleBetSelection = (amount: number) => {
        if (connectionStatus !== 'connected') {
            console.warn('⚠️ Cannot search for match: Socket not connected');
            reconnect();
            return;
        }

        const userId = user?.id || sessionId;
        const userName = user?.username || 'Player';
        
        if (user && ((user.role && user.role.toString().toLowerCase().includes('super')) || (user as any).isSuperAdmin)) {
            console.warn('⚠️ Super Admin attempted to enter matchmaking - blocked on client');
            // Here you might want to show a message to the user
            return;
        }

        setSelectedStake(amount);
        setUiState('SEARCHING');
        searchForMatch({
            stake: amount,
            userId: userId,
            userName: userName
        });
    };

    const handleCancelSearch = () => {
        cancelSearch();
        setUiState('SELECT');
        setSelectedStake(null);
    };

    const isButtonDisabled = connectionStatus === 'connecting' || uiState === 'SEARCHING';

    const getStatusMessage = () => {
        if (uiState === 'FOUND') return `Opponent Found! (${opponentName})`;
        if (uiState === 'SEARCHING') return 'Searching for an opponent...';
        if (connectionStatus === 'connecting') return 'Connecting to server...';
        if (connectionStatus === 'error') return `Error: ${error}`;
        return 'Select your stake to find an opponent instantly.';
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 relative overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
                 <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-3xl"></div>
                 <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/30 rounded-full blur-3xl"></div>
            </div>

            {countdown !== null && <CountdownOverlay count={countdown} />}
            
            <div className="z-10 w-full max-w-3xl text-center">
                <h1 className="text-5xl font-black text-white mb-2 tracking-tight">Multiplayer Arena</h1>
                <p className="text-slate-400 text-lg mb-12">{getStatusMessage()}</p>
                
                {connectionStatus === 'error' && (
                    <div className="mb-8">
                        <button onClick={reconnect} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold">Retry Connection</button>
                    </div>
                )}

                {uiState === 'SELECT' && connectionStatus === 'connected' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {BET_OPTIONS.map((amount) => (
                            <BetCard 
                                key={amount} 
                                amount={amount} 
                                onClick={() => handleBetSelection(amount)} 
                                disabled={isButtonDisabled}
                            />
                        ))}
                    </div>
                )}

                {(uiState === 'SEARCHING' || uiState === 'FOUND') && (
                    <div className="bg-slate-800/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl border border-slate-700 max-w-md mx-auto animate-in zoom-in duration-300">
                         <div className="relative w-24 h-24 mx-auto mb-6">
                            {uiState === 'SEARCHING' ? (
                                <>
                                    <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-ping"></div>
                                    <div className="absolute inset-0 border-4 border-t-cyan-500 border-r-transparent border-b-cyan-500 border-l-transparent rounded-full animate-spin"></div>
                                    <div className="absolute inset-0 flex items-center justify-center text-3xl">🔍</div>
                                </>
                            ) : (
                                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-4xl text-white shadow-lg animate-bounce">
                                    ✓
                                </div>
                            )}
                         </div>
                         <h2 className="text-2xl font-bold text-white mb-2">{getStatusMessage()}</h2>
                         <p className="text-slate-400 mb-6">Stake: <span className="text-cyan-400 font-bold">${selectedStake?.toFixed(2)}</span></p>
                         
                         {uiState === 'SEARCHING' && (
                             <button 
                                onClick={handleCancelSearch}
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full font-medium transition-colors"
                            >
                                Cancel Search
                            </button>
                         )}
                    </div>
                )}

                {uiState === 'SELECT' && (
                    <button 
                        onClick={onExit}
                        className="text-slate-500 hover:text-white transition-colors font-medium flex items-center justify-center mx-auto space-x-2"
                    >
                        <span>&larr; Back to Menu</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default MultiplayerLobby;