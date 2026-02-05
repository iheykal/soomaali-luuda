import { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import type { TicTacToeState } from '../types';
import { SOCKET_URL } from '../lib/apiConfig';

interface TicTacToeConfig {
    gameId: string;
    playerId: string;
    sessionId: string;
    isSpectator?: boolean;
    onRematchStart?: (gameId: string) => void;
}

export interface UseTicTacToeLogicReturn {
    state: TicTacToeState | null;
    makeMove: (row: number, col: number) => void;
    requestRematch: () => void;
    isMyTurn: boolean;
    mySymbol: 'X' | 'O' | null;
    rematchRequested: boolean;
    opponentRematchRequested: boolean;
    timeLeft: number;
    error: string | null;
}

export const useTicTacToeLogic = (config?: TicTacToeConfig): UseTicTacToeLogicReturn => {
    const [state, setState] = useState<TicTacToeState | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number>(10);
    const [error, setError] = useState<string | null>(null);
    const canMakeMoveRef = useRef(true);
    const [rematchRequested, setRematchRequested] = useState(false);
    const [opponentRematchRequested, setOpponentRematchRequested] = useState(false);

    // This useMemo is now redundant as isMyTurn is a state variable
    // const isMyTurn = useMemo(() => {
    //     if (!state || !mySymbol) return false;
    //     const currentPlayer = state.players[state.currentPlayerIndex];
    //     return currentPlayer?.symbol === mySymbol && state.turnState !== 'GAMEOVER';
    // }, [state, mySymbol]);

    const makeMove = useCallback((row: number, col: number) => {
        if (!socket || !isMyTurn || !state || !canMakeMoveRef.current) return;
        console.log('📤 Sending move: row=' + row + ', col=' + col);
        canMakeMoveRef.current = false; // Prevent multiple moves
        socket.emit('ttt_make_move', { gameId: state.gameId, row, col });
    }, [socket, isMyTurn, state]);

    const requestRematch = useCallback(() => {
        if (!socket || !state) return;
        console.log('🔄 Requesting rematch for game:', state.gameId);
        setRematchRequested(true);
        socket.emit('ttt_request_rematch', { gameId: state.gameId });
    }, [socket, state]);

    // Initialize socket connection
    useEffect(() => {
        if (!config?.gameId || !config?.playerId) return;

        console.log(`🎮 Initializing tic-tac-toe socket for game ${config.gameId}`);
        const newSocket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true
        });
        setSocket(newSocket);

        // Join game
        newSocket.emit('ttt_join_game', {
            gameId: config.gameId,
            userId: config.playerId
        });

        // Listen for game state updates
        newSocket.on('ttt_game_update', (newState: TicTacToeState) => {
            console.log('📡 Received tic-tac-toe state update:', newState);
            setState(newState);

            // Determine if it's my turn
            const player = newState.players.find(p => p.userId === config.playerId);
            if (player) {
                setMySymbol(player.symbol);
                const currentPlayer = newState.players[newState.currentPlayerIndex];
                setIsMyTurn(currentPlayer?.symbol === player.symbol && newState.turnState !== 'GAMEOVER');
            } else {
                setIsMyTurn(false);
            }

            // Reset canMakeMoveRef when state updates (after a move or opponent's move)
            canMakeMoveRef.current = true;

            // If game just finished, refresh user data (for balance updates)
            if (newState.turnState === 'GAMEOVER') {
                window.dispatchEvent(new Event('LUDO_REFRESH_USER'));
            }
        });

        // Listen for errors
        newSocket.on('ttt_error', (error: { message: string }) => {
            console.error('❌ Tic-tac-toe error:', error.message);
            // Don't show error if game is over (expected)
            if (!error.message.includes('not active')) {
                setError(error.message);
                setTimeout(() => setError(null), 3000);
            }
        });

        // Listen for win notifications
        newSocket.on('win_notification', (data: any) => {
            console.log('🎉 Tic-tac-toe win notification:', data);
            // Trigger global user refresh to update balance in UI
            window.dispatchEvent(new Event('LUDO_REFRESH_USER'));
        });

        // Listen for rematch events
        newSocket.on('ttt_rematch_requested', (data: { userId: string }) => {
            console.log('🔄 Opponent requested rematch:', data);
            setOpponentRematchRequested(true);
        });

        newSocket.on('ttt_rematch_start', (data: { gameId: string }) => {
            console.log('🎮 Starting rematch, new game:', data.gameId);
            // Reset rematch state and join new game
            setRematchRequested(false);
            setOpponentRematchRequested(false);

            // Notify parent to switch game ID
            if (config.onRematchStart) {
                config.onRematchStart(data.gameId);
            }
        });

        newSocket.on('ttt_rematch_cancelled', () => {
            console.log('❌ Rematch cancelled by opponent');
            setRematchRequested(false);
            setOpponentRematchRequested(false);
        });

        return () => {
            console.log('🔌 Closing tic-tac-toe socket');
            newSocket.close();
        };
    }, [config?.gameId, config?.playerId]);

    // Turn timer effect
    useEffect(() => {
        if (!state || !isMyTurn || state.turnState === 'GAMEOVER') {
            setTimeLeft(10);
            return;
        }

        setTimeLeft(10);
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    // Auto-move when time runs out
                    handleAutoMove();
                    return 10;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isMyTurn, state?.currentPlayerIndex, state?.turnState]); // Added state.turnState to dependencies

    const handleAutoMove = useCallback(() => {
        if (!state || !socket || !config || !mySymbol || !isMyTurn) return;

        // Helper for adjacency check (matching backend logic)
        const isAdjacent = (from: [number, number], to: [number, number]) => {
            const [r1, c1] = from;
            const [r2, c2] = to;
            // Horizontal/Vertical
            if (r1 === r2 && Math.abs(c1 - c2) === 1) return true;
            if (c1 === c2 && Math.abs(r1 - r2) === 1) return true;
            // Diagonal through center
            if (r1 === 1 && c1 === 1) {
                if ((r2 === 0 || r2 === 2) && (c2 === 0 || c2 === 2)) return true;
            }
            if (r2 === 1 && c2 === 1) {
                if ((r1 === 0 || r1 === 2) && (c1 === 0 || c1 === 2)) return true;
            }
            return false;
        };

        const availableMoves: [number, number][] = [];

        if (state.gamePhase === 'PLACEMENT') {
            // Find empty cells
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    if (state.board[r][c] === '') {
                        availableMoves.push([r, c]);
                    }
                }
            }
        } else if (state.gamePhase === 'MOVEMENT') {
            if (state.selectedPiece) {
                // Piece selected: Move to random adjacent empty cell
                const [r, c] = state.selectedPiece;
                for (let nr = 0; nr < 3; nr++) {
                    for (let nc = 0; nc < 3; nc++) {
                        if (state.board[nr][nc] === '' && isAdjacent([r, c], [nr, nc])) {
                            availableMoves.push([nr, nc]);
                        }
                    }
                }
            } else {
                // No piece selected: Select a random piece that has valid moves
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        if (state.board[r][c] === mySymbol) {
                            // Check if this piece has valid moves
                            let hasMoves = false;
                            for (let nr = 0; nr < 3; nr++) {
                                for (let nc = 0; nc < 3; nc++) {
                                    if (state.board[nr][nc] === '' && isAdjacent([r, c], [nr, nc])) {
                                        hasMoves = true;
                                        break;
                                    }
                                }
                            }
                            if (hasMoves) {
                                availableMoves.push([r, c]);
                            }
                        }
                    }
                }
            }
        }

        if (availableMoves.length > 0) {
            const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
            console.log('⏱️ Auto-moving due to timeout:', randomMove);
            makeMove(randomMove[0], randomMove[1]);
        }
    }, [state, socket, config, mySymbol, isMyTurn, makeMove]);


    return {
        state,
        makeMove,
        requestRematch,
        isMyTurn,
        mySymbol,
        rematchRequested,
        opponentRematchRequested,
        timeLeft,
        error
    };
};
