import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/apiConfig';
import { useAuth } from '../context/AuthContext';
import type { Player, PlayerColor } from '../types';
import MatchRequestList from './MatchRequestList';
import { Loader2, X } from 'lucide-react';

interface MultiplayerLobbyProps {
    onStartGame: (players: Player[], config: { gameId: string, localPlayerColor: PlayerColor, sessionId: string, stake: number }) => void;
    onExit: () => void;
}

interface MatchRequest {
    requestId: string;
    userId: string;
    userName: string;
    stake: number;
    timeRemaining: number;
    canAccept: boolean;
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
        onMouseDown={onClick}
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
            Win: ${(amount * 0.8).toFixed(2)}
        </div>
    </button>
);

// --- Main Component ---

const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ onStartGame, onExit }) => {
    const [status, setStatus] = useState<'SELECT' | 'CREATING' | 'WAITING' | 'STARTING'>('SELECT');
    const [selectedStake, setSelectedStake] = useState<number | null>(null);
    const [activeRequests, setActiveRequests] = useState<MatchRequest[]>([]);
    const [myRequestId, setMyRequestId] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
    const matchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const { user } = useAuth();

    const sessionId = getSessionId();
    const socketRef = useRef<Socket | null>(null);

    // Initialize Socket.IO connection
    useEffect(() => {
        const existingSocket = (window as any).matchmakingSocket;
        if (existingSocket && existingSocket.connected) {
            console.log('🔄 Reusing global matchmaking socket connection');
            socketRef.current = existingSocket;
        } else {
            const socketUrl = SOCKET_URL;
            console.log('🔌 Creating new Socket.IO connection for matchmaking:', socketUrl);
            socketRef.current = io(socketUrl, {
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                transports: ['websocket', 'polling'],
                forceNew: false
            });
            (window as any).matchmakingSocket = socketRef.current;
        }

        const socket = socketRef.current;
        const userId = user?._id || user?.id || sessionId;

        // Helper to register user for notifications
        const registerUser = () => {
            if (userId) {
                console.log('👤 Registering user for matchmaking notifications:', userId);
                socket.emit('register_user', { userId });
            }
        };

        socket.on('connect', () => {
            console.log('✅ Connected to matchmaking server, socket ID:', socket.id);

            // Register for notifications
            registerUser();

            // Fetch active requests on connect
            socket.emit('get_active_requests', { userId });
        });

        // Handle reconnection
        socket.on('reconnect', (attemptNumber: number) => {
            console.log(`🔄 Reconnected to matchmaking server after ${attemptNumber} attempt(s)`);

            // Re-register after reconnection (CRITICAL for Render/production)
            registerUser();

            // Re-fetch active requests
            socket.emit('get_active_requests', { userId });
        });

        // Listen for registration confirmation
        socket.on('registration_confirmed', ({ userId: confirmedUserId, room, socketId }: any) => {
            console.log(`✅ Registration confirmed for user ${confirmedUserId} in room ${room}, socket ${socketId}`);
        });

        // Monitor connection state
        socket.on('disconnect', (reason: string) => {
            console.warn(`⚠️ Disconnected from matchmaking server. Reason: ${reason}`);
            if (reason === 'io server disconnect') {
                // Server disconnected us, reconnect manually
                socket.connect();
            }
        });

        socket.on('connect_error', (error: Error) => {
            console.error('❌ Connection error:', error.message);
        });

        // Periodic re-registration to ensure we stay in the room (every 30 seconds)
        const reregistrationInterval = setInterval(() => {
            if (socket.connected && userId) {
                console.log('🔄 Periodic re-registration');
                registerUser();
            }
        }, 30000);

        // --- Match Request Events ---

        socket.on('active_requests', ({ requests }: { requests: MatchRequest[] }) => {
            setActiveRequests(requests);
        });

        socket.on('new_match_request', ({ request }: { request: MatchRequest }) => {
            // Filter out own requests if they come through broadcast
            const currentUserId = user?._id || user?.id || sessionId;
            if (request.userId === currentUserId) return;

            // Check if user has balance to accept
            const userBalance = user?.balance || 0;
            const enhancedRequest = {
                ...request,
                canAccept: userBalance >= request.stake,
                timeRemaining: 120 // Fresh request (2 minutes)
            };

            setActiveRequests(prev => {
                // Avoid duplicates
                if (prev.find(r => r.requestId === request.requestId)) return prev;
                return [...prev, enhancedRequest];
            });
        });

        socket.on('match_request_removed', ({ requestId }: { requestId: string }) => {
            setActiveRequests(prev => prev.filter(r => r.requestId !== requestId));
        });

        socket.on('match_request_created', ({ requestId }: { requestId: string }) => {
            setMyRequestId(requestId);
            setStatus('WAITING');
            setStatusMessage('Waiting for opponent...');

            // Clear any existing timeout
            if (matchTimeoutRef.current) {
                clearTimeout(matchTimeoutRef.current);
            }
        });

        socket.on('match_request_cancel_success', () => {
            setMyRequestId(null);
            setStatus('SELECT');
            setSelectedStake(null);
            setStatusMessage('');
        });

        socket.on('match_request_accepted', ({ requestId, acceptorName }: { requestId: string, acceptorName: string }) => {
            if (requestId === myRequestId) {
                setStatusMessage('Match accepted! Starting...');
                // Game start logic handled by match_found/game_created event

                // Set a timeout in case match_found never arrives (5 seconds)
                if (matchTimeoutRef.current) {
                    clearTimeout(matchTimeoutRef.current);
                }
                matchTimeoutRef.current = setTimeout(() => {
                    console.error('⏰ Timeout: match_found event not received within 5 seconds');
                    setStatusMessage('Match creation timed out. Please try again.');
                    setTimeout(() => {
                        setStatus('SELECT');
                        setMyRequestId(null);
                        setStatusMessage('');
                    }, 2000);
                }, 5000);
            }
        });

        // --- Game Start Events ---

        socket.on('match_found', ({ gameId, playerColor, opponent, stake }: any) => {
            console.log('✅ Match found!', { gameId, playerColor, opponent, stake });
            setStatus('STARTING');

            // Clear timeout since we received match_found successfully
            if (matchTimeoutRef.current) {
                clearTimeout(matchTimeoutRef.current);
                matchTimeoutRef.current = null;
            }

            // Clean up socket listeners but keep connection for a moment
            if (socketRef.current) {
                socketRef.current.off('match_found');
                socketRef.current.off('active_requests');
                socketRef.current.off('new_match_request');
            }

            // Start game
            const defaultPlayers: Player[] = [
                { color: 'green', isAI: false },
                { color: 'blue', isAI: false }
            ];

            startCountdown(() => {
                // CRITICAL: Use _id for playerId
                const playerId = user?._id || user?.id || sessionId;
                onStartGame(defaultPlayers, { gameId, localPlayerColor: playerColor, sessionId, playerId, stake });
            });
        });

        socket.on('ERROR', ({ message }: any) => {
            console.error('Matchmaking error:', message);
            setStatusMessage(`Error: ${message}`);

            // Clear timeout on error
            if (matchTimeoutRef.current) {
                clearTimeout(matchTimeoutRef.current);
                matchTimeoutRef.current = null;
            }

            // Reset to SELECT state after showing error
            setTimeout(() => {
                setStatus('SELECT');
                setMyRequestId(null);
                setSelectedStake(null);
                setStatusMessage('');
            }, 3000);
        });

        return () => {
            // Cleanup timeout on unmount
            if (matchTimeoutRef.current) {
                clearTimeout(matchTimeoutRef.current);
            }

            // Clear re-registration interval
            clearInterval(reregistrationInterval);

            if (socketRef.current) {
                socketRef.current.off('connect');
                socketRef.current.off('reconnect');
                socketRef.current.off('disconnect');
                socketRef.current.off('connect_error');
                socketRef.current.off('registration_confirmed');
                socketRef.current.off('active_requests');
                socketRef.current.off('new_match_request');
                socketRef.current.off('match_request_removed');
                socketRef.current.off('match_request_created');
                socketRef.current.off('match_request_cancel_success');
                socketRef.current.off('match_request_accepted');
                socketRef.current.off('match_found');
                socketRef.current.off('ERROR');
            }
        };
    }, [user, sessionId, onStartGame, myRequestId]);

    // Cleanup timer for request expiration visualization
    useEffect(() => {
        const timer = setInterval(() => {
            setActiveRequests(prev => prev.map(req => ({
                ...req,
                timeRemaining: Math.max(0, req.timeRemaining - 1)
            })).filter(req => req.timeRemaining > 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const startCountdown = (onComplete: () => void) => {
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

    const handleCreateRequest = (amount: number) => {
        if (!socketRef.current || !socketRef.current.connected) {
            setStatusMessage('Not connected to server');
            return;
        }

        // CRITICAL: Use _id for MongoDB lookup, fallback to id, then sessionId for guests
        const userId = user?._id || user?.id || sessionId;
        const userName = user?.username || 'Player';

        // Check if user has sufficient balance
        const userBalance = user?.balance || 0;
        if (userBalance < amount) {
            console.log('⚠️ Insufficient balance:', { userBalance, required: amount });
            setShowInsufficientBalanceModal(true);
            return;
        }

        // Super Admin check
        if (user && ((user.role && user.role.toString().toLowerCase().includes('super')) || (user as any).isSuperAdmin)) {
            setStatusMessage('Super Admin accounts cannot participate.');
            return;
        }

        // AUTO-ACCEPT LOGIC: Check if there's an existing request with the same stake
        const matchingRequest = activeRequests.find(req =>
            req.stake === amount &&
            req.canAccept &&
            req.userId !== userId
        );

        if (matchingRequest) {
            console.log('🎯 Auto-accepting matching request:', matchingRequest.requestId);
            handleAcceptRequest(matchingRequest.requestId);
            return;
        }

        console.log('🎮 Creating match request:', { stake: amount, userId, isAuthenticated: !!user });
        setSelectedStake(amount);
        setStatus('CREATING');
        setStatusMessage('Creating match request...');

        socketRef.current.emit('create_match_request', {
            stake: amount,
            userId,
            userName
        });
    };

    const handleAcceptRequest = (requestId: string) => {
        if (!socketRef.current || !socketRef.current.connected) return;

        // CRITICAL: Use _id for MongoDB lookup
        const userId = user?._id || user?.id || sessionId;
        const userName = user?.username || 'Player';

        console.log('🤝 Accepting match request:', requestId, { userId, isAuthenticated: !!user });
        socketRef.current.emit('accept_match_request', {
            requestId,
            userId,
            userName
        });
    };

    const handleCancelRequest = () => {
        if (myRequestId && socketRef.current) {
            // CRITICAL: Use _id for MongoDB lookup
            const userId = user?._id || user?.id || sessionId;
            socketRef.current.emit('cancel_match_request', {
                requestId: myRequestId,
                userId
            });
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 relative overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/30 rounded-full blur-3xl"></div>
            </div>

            {countdown !== null && <CountdownOverlay count={countdown} />}

            {/* Insufficient Balance Modal */}
            {showInsufficientBalanceModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4" onClick={() => setShowInsufficientBalanceModal(false)}>
                    <div className="bg-gradient-to-br from-red-500 via-red-600 to-orange-600 rounded-3xl max-w-md w-full p-8 shadow-2xl animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="bg-white/20 backdrop-blur-sm rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                                <span className="text-6xl">😟</span>
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-4">Waanka xunnahay!</h2>
                            <p className="text-xl text-white/95 mb-6 leading-relaxed">
                                Lacag kuguma jirto ee fadlan ku shubo
                            </p>
                            <div className="bg-white/10 rounded-xl p-4 mb-6 backdrop-blur-sm">
                                <p className="text-white/80 text-sm mb-1">Your Balance</p>
                                <p className="text-3xl font-bold text-white">${(user?.balance || 0).toFixed(2)}</p>
                            </div>
                            <button
                                onClick={() => setShowInsufficientBalanceModal(false)}
                                className="w-full bg-white hover:bg-gray-100 text-red-600 font-bold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105"
                            >
                                Fahantay (OK)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="z-10 w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Create Request */}
                <div className="text-center lg:text-left">
                    <h1 className="text-5xl font-black text-white mb-2 tracking-tight">Multiplayer Arena</h1>
                    <p className="text-slate-400 text-lg mb-8">Create a request or join an existing game.</p>

                    {status === 'SELECT' ? (
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold text-white mb-4">Create Match Request</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {BET_OPTIONS.map((amount) => (
                                    <BetCard
                                        key={amount}
                                        amount={amount}
                                        onClick={() => handleCreateRequest(amount)}
                                        disabled={(user?.balance || 0) < amount}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : status === 'WAITING' || status === 'CREATING' ? (
                        <div className="bg-slate-800/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-700 animate-in zoom-in duration-300 text-center">
                            <div className="relative w-20 h-20 mx-auto mb-4">
                                <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-ping"></div>
                                <Loader2 className="w-full h-full text-cyan-500 animate-spin p-2" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">{statusMessage}</h2>
                            <p className="text-slate-400 mb-6">Stake: <span className="text-cyan-400 font-bold">${selectedStake?.toFixed(2)}</span></p>

                            <button
                                onClick={handleCancelRequest}
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full font-medium transition-colors flex items-center gap-2 mx-auto"
                            >
                                <X className="w-4 h-4" /> Cancel Request
                            </button>
                        </div>
                    ) : null}

                    {status === 'SELECT' && (
                        <button
                            onClick={onExit}
                            className="mt-12 text-slate-500 hover:text-white transition-colors font-medium flex items-center gap-2"
                        >
                            <span>&larr; Back to Menu</span>
                        </button>
                    )}
                </div>

                {/* Right Column: Active Requests List */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-3xl border border-slate-700 p-6 h-[500px] overflow-hidden flex flex-col">
                    <MatchRequestList
                        requests={activeRequests}
                        onAccept={handleAcceptRequest}
                        currentUserId={user?.id || sessionId}
                    />
                </div>
            </div>
        </div>
    );
};

export default MultiplayerLobby;
