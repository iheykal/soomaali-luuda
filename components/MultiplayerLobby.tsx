
import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/apiConfig';
import { useAuth } from '../context/AuthContext';
import type { Player, PlayerColor, MultiplayerGame, GameState, MultiplayerMessage } from '../types';
import { PLAYER_TAILWIND_COLORS, PLAYER_COLORS } from '../lib/boardLayout';

interface MultiplayerLobbyProps {
  onStartGame: (players: Player[], config: { gameId: string, localPlayerColor: PlayerColor, sessionId: string }) => void;
  onExit: () => void;
}

interface QueueItem {
    gameId: string;
    stake: number;
    hostSessionId: string;
    timestamp: number;
}

const BET_OPTIONS = [0.25, 0.50, 1.00];
const QUEUE_KEY = 'ludo_matchmaking_queue';

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
    const [status, setStatus] = useState<'SELECT' | 'SEARCHING' | 'FOUND' | 'STARTING'>('SELECT');
    const [selectedStake, setSelectedStake] = useState<number | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const { user } = useAuth();
    
    const sessionId = getSessionId();
    const socketRef = useRef<Socket | null>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);

    // Initialize Socket.IO connection for matchmaking
    useEffect(() => {
        // Check if we already have a connection from another tab
        const existingSocket = (window as any).matchmakingSocket;
        if (existingSocket && existingSocket.connected) {
            console.log('🔄 Reusing global matchmaking socket connection');
            socketRef.current = existingSocket;
            return;
        }

        const socketUrl = SOCKET_URL;

        console.log('🔌 Creating new Socket.IO connection for matchmaking:', socketUrl);
        socketRef.current = io(socketUrl, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: false
        });

        // Store globally to prevent multiple connections
        (window as any).matchmakingSocket = socketRef.current;

        const socket = socketRef.current;
        
        socket.on('connect', () => {
            console.log('✅ Connected to matchmaking server, socket ID:', socket.id);
            // Clear any previous error messages on successful connection
            if (status === 'SEARCHING' && statusMessage.includes('Error')) {
                setStatusMessage('Searching for an opponent...');
            }
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Matchmaking socket connection error:', error);
            console.error('❌ Attempted URL:', socketUrl);
            setStatusMessage(`Connection error to ${socketUrl}. Please ensure the backend is running and accessible.`);
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log('🔄 Reconnected to matchmaking server after', attemptNumber, 'attempt(s)');
        });

        socket.on('reconnect_attempt', (attemptNumber) => {
            console.log('🔄 Matchmaking reconnection attempt', attemptNumber);
        });

        socket.on('reconnect_error', (error) => {
            console.error('❌ Matchmaking reconnection error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Disconnected from matchmaking server:', reason);
            if (reason === 'io server disconnect') {
                console.log('⚠️ Server disconnected, attempting to reconnect...');
                socket.connect();
            }
        });
        
        // Listen for match found event
        socket.on('match_found', ({ gameId, playerColor, opponent, stake }: any) => {
            console.log('✅ Match found!', { gameId, playerColor, opponent, stake });
            setStatus('FOUND');
            setStatusMessage(`Opponent Found! (${opponent.userName || opponent.userId})`);

            // Clean up matchmaking socket to avoid conflicts
            // But don't disconnect immediately - let the game socket connect first
            if (socketRef.current) {
                socketRef.current.off('match_found');
                socketRef.current.off('searching');
                socketRef.current.off('search_cancelled');
                socketRef.current.off('ERROR');

                // Disconnect after a short delay to allow game socket to connect
                // This prevents conflicts between matchmaking and game sockets
                setTimeout(() => {
                    if (socketRef.current && socketRef.current.connected) {
                        console.log('🔌 Disconnecting matchmaking socket after match found');
                        socketRef.current.disconnect();
                    }
                }, 2000); // 2 second delay
            }

            // Immediately start the game after a short delay
            setTimeout(() => {
                console.log('🚀 Starting game after match found...');
                // Two-player game: Green and Blue (placeholder, server will sync actual state)
                const defaultPlayers: Player[] = [
                    { color: 'green', isAI: false },
                    { color: 'blue', isAI: false }
                ];

                startCountdown(() => {
                    console.log('🎯 Calling onStartGame with multiplayer config');
                    const playerId = user?.id || sessionId; // prefer authenticated user id
                    onStartGame(defaultPlayers, { gameId, localPlayerColor: playerColor, sessionId, playerId });
                });
            }, 1000); // 1 second delay to allow both players to receive the match_found event
        });
        
        // Listen for searching status
        socket.on('searching', ({ stake, message }: any) => {
            console.log('🔍 Searching...', { stake, message });
            setStatus('SEARCHING');
            setStatusMessage(message || 'Searching for opponent...');
        });
        
        // Listen for search cancelled
        socket.on('search_cancelled', () => {
            console.log('❌ Search cancelled');
            setStatus('SELECT');
            setSelectedStake(null);
        });
        
        // Listen for errors
        socket.on('ERROR', ({ message }: any) => {
            console.error('Matchmaking error:', message);

            // Provide user-friendly error messages and decide whether the UI should
            // return to the selection screen or remain (transient) searching.
            let userMessage = message;
            let resetToSelect = true;

            if (message.includes('User not found')) {
                userMessage = 'Authentication error. Please try logging in again.';
                // After showing the message, return to selection (and clear message shortly)
                setTimeout(() => {
                    setStatus('SELECT');
                    setStatusMessage('');
                }, 3000);
            } else if (message.includes('Insufficient funds')) {
                userMessage = 'Insufficient balance. Please deposit funds or choose a lower stake.';
            } else if (message.includes('Failed to enter matchmaking')) {
                // This looks like a transient network/back-end problem; keep the UI in SEARCHING
                // and show a retrying message so user knows we are attempting recovery.
                userMessage = 'Connection issue while entering matchmaking. Retrying...';
                resetToSelect = false;
                setStatus('SEARCHING');
            } else if (message.toLowerCase().includes('super admin')) {
                // Server-enforced restriction; show message and return to selector
                userMessage = 'Super Admin accounts cannot participate in matchmaking.';
            }

            setStatusMessage(`Error: ${userMessage}`);
            if (resetToSelect) setStatus('SELECT'); // Only reset for non-transient errors
        });
        
        return () => {
            console.log('Cleaning up matchmaking socket connection');
            if (socketRef.current) {
                // Only disconnect if this is the last reference
                const globalSocket = (window as any).matchmakingSocket;
                if (globalSocket === socketRef.current) {
                    if (socketRef.current.connected) {
                        socketRef.current.emit('cancel_search');
                    }
                    socketRef.current.disconnect();
                    (window as any).matchmakingSocket = null;
                }
                socketRef.current = null;
            }
            if (channelRef.current) {
                channelRef.current.close();
                channelRef.current = null;
            }
        };
    }, [user, sessionId, onStartGame]);

    const removeFromQueue = (gameId: string) => {
        try {
            const queueStr = localStorage.getItem(QUEUE_KEY);
            if (queueStr) {
                const queue: QueueItem[] = JSON.parse(queueStr);
                const newQueue = queue.filter(i => i.gameId !== gameId);
                localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
            }
        } catch (e) { console.error(e); }
    };

    const startCountdown = (onComplete: () => void) => {
        setStatus('STARTING');
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
        // Validate socket connection
        if (!socketRef.current || !socketRef.current.connected) {
            setStatusMessage('Not connected to server. Please wait...');
            console.warn('⚠️ Cannot search for match: Socket not connected');
            return;
        }

        // Get user identifier - prefer authenticated user, fallback to session ID
        const userId = user?.id || sessionId;
        const userName = user?.username || 'Player';
        
        // Validate we have at least a session ID
        if (!userId) {
            setStatusMessage('Error: Unable to identify user. Please refresh the page.');
            console.error('❌ Cannot start matchmaking: No user ID or session ID available');
            return;
        }

        // Prevent special accounts (super admin) from entering matchmaking
        // Server enforces this and returns an error; handle it earlier in the client to avoid a failed socket round-trip
        if (user && ((user.role && user.role.toString().toLowerCase().includes('super')) || (user as any).isSuperAdmin)) {
            console.warn('⚠️ Super Admin attempted to enter matchmaking - blocked on client');
            setStatusMessage('Super Admin accounts cannot participate in matchmaking.');
            setStatus('SELECT');
            return;
        }

        console.log('🎮 Starting matchmaking:', { 
            stake: amount, 
            userId, 
            userName, 
            isAuthenticated: !!user?.id,
            socketConnected: socketRef.current.connected 
        });

        setSelectedStake(amount);
        setStatus('SEARCHING');
        setStatusMessage('Searching for an opponent...');

        // Search for match via Socket.IO
        try {
            socketRef.current.emit('search_match', {
                stake: amount,
                userId: userId,
                userName: userName
            });
        } catch (error) {
            console.error('❌ Error emitting search_match:', error);
            setStatusMessage('Error: Failed to start matchmaking. Please try again.');
            setStatus('SELECT');
        }

        // Match found event is handled in the socket connection useEffect
    };

    const handleCancel = () => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('cancel_search', { userId: user?.id || getSessionId(), stake: selectedStake });
        }
        setStatus('SELECT');
        setSelectedStake(null);
        setStatusMessage('');
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
                <p className="text-slate-400 text-lg mb-12">Select your stake to find an opponent instantly.</p>

                {status === 'SELECT' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {BET_OPTIONS.map((amount) => (
                            <BetCard 
                                key={amount} 
                                amount={amount} 
                                onClick={() => handleBetSelection(amount)} 
                                disabled={false}
                            />
                        ))}
                    </div>
                )}

                {(status === 'SEARCHING' || status === 'FOUND') && (
                    <div className="bg-slate-800/80 backdrop-blur-md p-10 rounded-3xl shadow-2xl border border-slate-700 max-w-md mx-auto animate-in zoom-in duration-300">
                         <div className="relative w-24 h-24 mx-auto mb-6">
                            {status === 'SEARCHING' ? (
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
                         <h2 className="text-2xl font-bold text-white mb-2">{statusMessage}</h2>
                         <p className="text-slate-400 mb-6">Stake: <span className="text-cyan-400 font-bold">${selectedStake?.toFixed(2)}</span></p>
                         
                         {status === 'SEARCHING' && (
                             <button 
                                onClick={handleCancel}
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full font-medium transition-colors"
                            >
                                Cancel Search
                            </button>
                         )}
                    </div>
                )}

                {status === 'SELECT' && (
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
