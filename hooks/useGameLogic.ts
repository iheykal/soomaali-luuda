import { useReducer, useCallback, useEffect, useRef } from 'react';
import type { GameState, Player, PlayerColor, Token, LegalMove, TokenPosition, MultiplayerMessage, MultiplayerGame } from '../types';
import { PLAYER_COLORS, START_POSITIONS, HOME_ENTRANCES, HOME_PATH_LENGTH, SAFE_SQUARES, ARROW_SQUARES } from '../lib/boardLayout';
import { SOCKET_URL } from '../lib/apiConfig';
import { io, Socket } from 'socket.io-client';
import { debugService } from '../services/debugService';
import { audioService } from '../services/audioService';

// --- Constants ---
// Reduce timers to make gameplay feel snappier while keeping server limits
const ROLL_TIME_LIMIT = 5;  // Match backend (5s)
const MOVE_TIME_LIMIT = 12; // Match backend (12s)

// --- Socket Service Wrapper ---
let socket: Socket | null = null;

// --- Game Logic ---
export type Action =
    | { type: 'START_GAME'; players: Player[]; initialState?: GameState }
    | { type: 'ROLL_DICE'; value: number }
    | { type: 'SET_LEGAL_MOVES_AND_PROCEED'; moves: LegalMove[] }
    | { type: 'MOVE_TOKEN'; move: LegalMove }
    | { type: 'NEXT_TURN'; grantExtraTurn: boolean }
    | { type: 'ANIMATION_COMPLETE' }
    | { type: 'AI_THINKING' }
    | { type: 'SET_STATE'; state: GameState }
    | { type: 'RESET_GAME' };

const initialState: GameState = {
    players: [],
    tokens: [],
    currentPlayerIndex: 0,
    diceValue: null,
    turnState: 'ROLLING',
    message: 'Welcome to Ludo!',
    gameStarted: false,
    winners: [],
    legalMoves: [],
    timer: ROLL_TIME_LIMIT,
    stake: 0,
};

const _reducer = (state: GameState, action: Action): GameState => {
    switch (action.type) {
        case 'START_GAME': {
            if (action.initialState) {
                return action.initialState;
            }
            const tokens: Token[] = action.players.flatMap(p =>
                Array.from({ length: 4 }, (_, i) => ({
                    id: `${p.color}-${i}`,
                    color: p.color,
                    position: { type: 'YARD', index: i },
                }))
            );
            return {
                ...initialState,
                gameStarted: true,
                players: action.players,
                tokens,
                currentPlayerIndex: 0,
                turnState: 'ROLLING',
                message: '',
                timer: ROLL_TIME_LIMIT,
            };
        }

        case 'SET_STATE':
            // Completely replace the state with server state
            // Server is the source of truth for multiplayer games
            const serverState = action.state;
            const shouldBeStarted = serverState.gameStarted !== undefined
                ? serverState.gameStarted
                : (serverState.status === 'ACTIVE' && serverState.players?.length >= 2);

            // Ensure diceValue is properly handled
            // Server sends diceValue as:
            // - number (1-6) when a dice is rolled (turnState: MOVING)
            // - null when starting a new turn (turnState: ROLLING)
            // - undefined might occur in edge cases - treat as null
            let diceValue: number | null = null;

            if (serverState.diceValue !== undefined && serverState.diceValue !== null) {
                // Server sent a valid dice value (1-6)
                diceValue = Number(serverState.diceValue);
                console.log(`🔄 SET_STATE: Received valid diceValue from server: ${diceValue}`);
            } else if (serverState.diceValue === null) {
                // Server explicitly cleared dice value
                diceValue = null;
                console.log(`🔄 SET_STATE: Server cleared diceValue (new turn)`);
            } else {
                // Server didn't send diceValue (undefined) - keep current state
                diceValue = state.diceValue;
                console.log(`🔄 SET_STATE: Server didn't send diceValue, keeping current: ${diceValue}`);
            }

            // Ensure turnState is valid - if game is started and diceValue is null, turnState should be ROLLING
            let finalTurnState = serverState.turnState;

            // FIX: If diceValue is null (no active roll), we MUST be in ROLLING state to allow the player to roll.
            // This overrides 'MOVING' or other states if the dice has been cleared.
            if (shouldBeStarted && diceValue === null && serverState.turnState !== 'GAMEOVER') {
                if (finalTurnState !== 'ROLLING') {
                    console.log(`🔧 Fixing turnState in frontend: was ${finalTurnState}, setting to ROLLING (cause: diceValue is null)`);
                    finalTurnState = 'ROLLING';
                }
            }

            // Additional check: If message says "Waiting for X" and turnState is not ROLLING, fix it
            if (serverState.message && serverState.message.includes('Waiting for') && finalTurnState !== 'ROLLING') {
                console.log(`🔧 Fixing turnState: message indicates waiting for player, setting to ROLLING`);
                finalTurnState = 'ROLLING';
            }

            // Ensure diceValue is properly handled for animation
            if (diceValue !== null && diceValue !== undefined && typeof diceValue === 'number' && diceValue >= 1 && diceValue <= 6) {
                console.log(`🎲 Frontend received valid dice value: ${diceValue} for animation`);
            }

            console.log(`🔄 SET_STATE complete: diceValue=${diceValue}, turnState=${finalTurnState}, currentPlayer=${serverState.players?.[serverState.currentPlayerIndex]?.color}, gameStarted=${shouldBeStarted}`);

            // Ensure stake is preserved
            // Backend sends stake in GAME_STATE_UPDATE. We must prioritize it.
            const stake = serverState.stake !== undefined ? serverState.stake : state.stake;

            // SYNC TIMER: Use server timer if available to keep devices in sync
            // But if server doesn't send it (undefined), keep local.
            // We trust the server's authoritative timer to fix drift.
            let timer = serverState.timer !== undefined ? serverState.timer : state.timer;

            // Reset timer locally if turn changed and server didn't send timer
            if (serverState.timer === undefined) {
                if (finalTurnState === 'ROLLING' && serverState.currentPlayerIndex !== state.currentPlayerIndex) {
                    timer = ROLL_TIME_LIMIT;
                } else if (finalTurnState === 'MOVING' && diceValue !== null && diceValue !== state.diceValue) {
                    timer = MOVE_TIME_LIMIT;
                }
            }

            return {
                ...serverState,
                // Explicitly set diceValue
                diceValue: diceValue,
                // Ensure turnState is valid
                turnState: finalTurnState,
                // Use server's legalMoves
                legalMoves: serverState.legalMoves || [],
                timer: timer,
                // If game was already started locally, keep it started even if server sends false temporarily
                gameStarted: state.gameStarted ? (shouldBeStarted || state.gameStarted) : shouldBeStarted,
                stake: stake
            };

        case 'RESET_GAME':
            return initialState;

        case 'ROLL_DICE': {
            return {
                ...state,
                diceValue: action.value,
                turnState: 'MOVING',
                message: `${state.players[state.currentPlayerIndex].color} rolled a ${action.value}. Select a token to move.`,
                timer: MOVE_TIME_LIMIT,
            };
        }

        case 'SET_LEGAL_MOVES_AND_PROCEED': {
            if (action.moves.length === 0) {
                return {
                    ...state,
                    legalMoves: [],
                    message: `No legal moves. Passing turn.`,
                    timer: ROLL_TIME_LIMIT, // Reset timer for next player immediately
                }
            }
            return { ...state, legalMoves: action.moves, timer: MOVE_TIME_LIMIT };
        }

        case 'MOVE_TOKEN': {
            // In multiplayer, this is just an optimistic update OR driven by server state
            // For simplicity, we let the server state override this via SET_STATE usually.
            // But for local play, we calculate.

            const { move } = action;
            const diceValue = state.diceValue!;
            const currentPlayerColor = state.players[state.currentPlayerIndex].color;
            let captured = false;

            let newTokens = state.tokens.map(t =>
                t.id === move.tokenId ? { ...t, position: move.finalPosition } : { ...t }
            );

            // 🎯 ARROWS RULE: Check if pawn landed on arrow square
            let arrowsTriggered = false;
            if (move.finalPosition.type === 'PATH') {
                if (ARROW_SQUARES.includes(move.finalPosition.index)) {
                    // 🎯 Arrows Rule triggered!
                    arrowsTriggered = true;
                    const newIndex = (move.finalPosition.index + 1) % 52;
                    newTokens = newTokens.map(t => {
                        if (t.id === move.tokenId) {
                            return { ...t, position: { type: 'PATH', index: newIndex } };
                        }
                        return t;
                    });
                    // IMPORTANT: Update message so GameBoard detects it for animation
                    state.message = `🎯 Arrows Rule! ${currentPlayerColor} landed on arrow square!`;
                    console.log(`🎯 ARROWS RULE (Offline): ${currentPlayerColor} pawn ${move.tokenId} landed on arrow square (${move.finalPosition.index}), auto-jumped to (${newIndex})`);
                }
            }

            if (move.finalPosition.type === 'PATH' && !SAFE_SQUARES.includes(move.finalPosition.index)) {
                const targetPos = move.finalPosition.index;
                const opponentTokensAtTarget = newTokens.filter(t =>
                    t.color !== currentPlayerColor &&
                    t.position.type === 'PATH' &&
                    t.position.index === targetPos
                );

                const isBlockade = opponentTokensAtTarget.length > 1 &&
                    opponentTokensAtTarget.every(t => t.color === opponentTokensAtTarget[0].color);

                if (!isBlockade && opponentTokensAtTarget.length > 0) {
                    newTokens = newTokens.map(t => {
                        if (opponentTokensAtTarget.some(ot => ot.id === t.id)) {
                            captured = true;
                            return { ...t, position: { type: 'YARD', index: parseInt(t.id.split('-')[1]) } };
                        }
                        return t;
                    });

                    // Play kill sound effect when capture happens
                    if (captured) {
                        audioService.play('tokenKilled');
                    }
                }
            }

            const grantExtraTurn = diceValue === 6 || captured || move.finalPosition.type === 'HOME' || arrowsTriggered;

            const winners = [...state.winners];
            const playerTokens = newTokens.filter(t => t.color === currentPlayerColor);
            if (playerTokens.every(t => t.position.type === 'HOME')) {
                if (!winners.includes(currentPlayerColor)) {
                    winners.push(currentPlayerColor);
                }
            }

            const isGameOver = state.players.length - winners.length <= 1;

            if (isGameOver) {
                const remainingPlayer = state.players.find(p => !winners.includes(p.color));
                if (remainingPlayer) winners.push(remainingPlayer.color);

                return {
                    ...state,
                    tokens: newTokens,
                    winners,
                    turnState: 'GAMEOVER',
                    message: `${winners[0]} is the winner!`,
                };
            }

            return {
                ...state,
                tokens: newTokens,
                winners,
                turnState: 'ANIMATING',
                message: `${currentPlayerColor} is moving...`,
                legalMoves: [],
                _pendingExtraTurn: grantExtraTurn,
            };
        }

        case 'ANIMATION_COMPLETE': {
            return {
                ...state,
                ...getNextTurnState(state, state._pendingExtraTurn || false),
                _pendingExtraTurn: undefined,
            };
        }

        case 'NEXT_TURN': {
            return { ...state, ...getNextTurnState(state, action.grantExtraTurn) };
        }

        case 'AI_THINKING': {
            return { ...state, message: `${state.players[state.currentPlayerIndex].color} (Computer) is thinking...` };
        }

        default:
            return state;
    }
};

const reducer = (state: GameState, action: Action): GameState => {
    debugService.game({ action: action.type, payload: action });
    const newState = _reducer(state, action);
    debugService.game({ new_state: newState });
    return newState;
};


const getNextTurnState = (state: GameState, grantExtraTurn: boolean): Partial<GameState> => {
    let nextPlayerIndex = grantExtraTurn ? state.currentPlayerIndex : (state.currentPlayerIndex + 1) % state.players.length;

    while (state.winners.includes(state.players[nextPlayerIndex].color)) {
        nextPlayerIndex = (nextPlayerIndex + 1) % state.players.length;
    }

    return {
        currentPlayerIndex: nextPlayerIndex,
        diceValue: null,
        turnState: 'ROLLING',
        message: '',
        legalMoves: [],
        timer: ROLL_TIME_LIMIT,
    };
};

interface MultiplayerConfig {
    gameId: string;
    localPlayerColor?: PlayerColor;
    sessionId?: string;
    playerId?: string;
    isSpectator?: boolean;
}

export const useGameLogic = (multiplayerConfig?: MultiplayerConfig) => {
    console.log('🎯 useGameLogic initialized with config:', multiplayerConfig);
    const [state, dispatch] = useReducer(reducer, initialState);
    const isMultiplayer = !!multiplayerConfig;

    // The timer is now separated from the main state object to prevent re-rendering the entire board on each tick.
    const timer = state.timer;

    console.log('🎲 Game logic state:', {
        isMultiplayer,
        gameStarted: state.gameStarted,
        players: state.players?.length,
        currentPlayerIndex: state.currentPlayerIndex
    });

    // In multiplayer, 'isMyTurn' strictly depends on the server state matching our color
    const isMyTurn = isMultiplayer
        ? (multiplayerConfig?.isSpectator ? false : state.players?.[state.currentPlayerIndex]?.color === multiplayerConfig?.localPlayerColor)
        : true;

    // Debug logging for turn state
    const currentPlayerColor = state.players?.[state.currentPlayerIndex]?.color;
    console.log(`🎮 Turn state check: isMultiplayer=${isMultiplayer}, currentPlayerIndex=${state.currentPlayerIndex}, currentPlayerColor=${currentPlayerColor}, localPlayerColor=${multiplayerConfig?.localPlayerColor}, isMyTurn=${isMyTurn}, turnState=${state.turnState}, gameStarted=${state.gameStarted}`);

    const localDispatchRef = useRef(dispatch);
    localDispatchRef.current = dispatch;

    // --- Socket Connection Effect ---
    useEffect(() => {
        if (!isMultiplayer || !multiplayerConfig) {
            console.log('🎯 Skipping socket connection - not multiplayer or no config');
            return;
        }

        // Connect to Socket.io Server
        // Use SOCKET_URL from apiConfig for proper network IP detection
        const socketUrl = (import.meta as any).env?.VITE_USE_REAL_API === 'true'
            ? window.location.origin
            : SOCKET_URL;

        console.log('🔌 Connecting to Socket.IO for game:', socketUrl);

        // Exponential backoff for reconnection
        let reconnectionAttempt = 0;
        const calculateReconnectionDelay = () => {
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
            const delay = Math.min(1000 * Math.pow(2, reconnectionAttempt), 30000);
            reconnectionAttempt++;
            return delay;
        };

        // Try websocket first, but fallback to polling if websocket fails
        socket = io(socketUrl, {
            transports: ['polling', 'websocket'], // Try polling first, then upgrade
            reconnection: true, // Enable auto-reconnection
            reconnectionAttempts: Infinity, // Never stop trying to reconnect
            reconnectionDelay: 1000, // Start with 1s delay
            reconnectionDelayMax: 30000, // Max 30s between reconnection attempts
            timeout: 45000, // 45s connection timeout (matches server)
            // Additional stability settings
            forceNew: false, // Reuse existing connection if possible
            multiplex: true, // Allow multiplexing
            autoConnect: true, // Auto-connect on creation
            // Prevent disconnections during network hiccups
            upgrade: true, // Allow transport upgrades
            rememberUpgrade: true, // Remember the upgraded transport
        });

        // Heartbeat mechanism - send every 10 seconds
        let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
        const startHeartbeat = () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (socket && socket.connected) {
                    socket.emit('heartbeat');
                }
            }, 10000); // Every 10 seconds
        };

        // Track game for connection monitoring
        const trackGame = () => {
            if (socket && socket.connected && multiplayerConfig?.gameId) {
                socket.emit('track_game', { gameId: multiplayerConfig.gameId });
            }
        };

        // Join helpers: retry join_game until GAME_STATE_UPDATE is received
        const MAX_JOIN_ATTEMPTS = 3;
        const JOIN_WAIT_MS = 5000; // wait 5s for GAME_STATE_UPDATE before retrying

        const joinAttemptsRef: { current: number } = { current: 0 };
        let joinTimer: ReturnType<typeof setTimeout> | null = null;

        const scheduleJoinRetry = (emitJoin: () => void) => {
            if (joinTimer) {
                clearTimeout(joinTimer);
                joinTimer = null;
            }
            if (joinAttemptsRef.current >= MAX_JOIN_ATTEMPTS) {
                console.error('❌ Max join attempts reached for game', multiplayerConfig.gameId);
                return;
            }
            joinTimer = setTimeout(() => {
                joinAttemptsRef.current += 1;
                console.log('🔁 Re-attempting join_game (attempt', joinAttemptsRef.current + 1, ')');
                emitJoin();
            }, JOIN_WAIT_MS);
        };

        const clearJoinRetry = () => {
            if (joinTimer) {
                clearTimeout(joinTimer);
                joinTimer = null;
            }
            joinAttemptsRef.current = 0;
        };

        socket.on('connect', () => {
            debugService.socket({ event: 'connect', socketId: socket?.id });

            // Reset reconnection attempt counter on successful connection
            reconnectionAttempt = 0;

            // Start heartbeat
            startHeartbeat();

            // Track game
            trackGame();

            if (!socket || !socket.connected) {
                debugService.error('Socket not connected, cannot join game');
                return;
            }

            // Join the specific game room and start a small retry mechanism
            const emitJoin = () => {
                if (!socket) return;
                try {
                    if (multiplayerConfig.isSpectator) {
                        socket.emit('watch_game', { gameId: multiplayerConfig.gameId });
                    } else {
                        socket.emit('join_game', {
                            gameId: multiplayerConfig.gameId,
                            userId: multiplayerConfig.playerId || multiplayerConfig.sessionId,
                            playerColor: multiplayerConfig.localPlayerColor
                        });
                    }
                } catch (e) {
                    console.error('❌ Error emitting join_game:', e);
                }
            };

            // First immediate attempt
            joinAttemptsRef.current = 0;
            emitJoin();
            // Schedule retries if no GAME_STATE_UPDATE arrives
            scheduleJoinRetry(emitJoin);

            debugService.socket({ event: 'emit', type: 'join_game/watch_game', gameId: multiplayerConfig.gameId });
        });

        // 🟢 MANUAL CHECK: If socket is ALREADY connected, trigger join logic immediately
        if (socket.connected) {
            console.log('⚡ Socket already connected, forcing immediate join/watch...');
            // Need to wait a tick to ensure listeners are bound? Usually fine.
            // We duplicate the emitJoin logic here or make it a shared function. 
            // For safety, we'll just manually fire the 'connect' handler logic or similar.
            // Ideally, we refactor emitJoin out, but to minimize diff, let's just emit directly here.

            const manualEmit = () => {
                if (!socket) return;
                console.log('⚡ Manual emit for already connected socket');
                if (multiplayerConfig.isSpectator) {
                    socket.emit('watch_game', { gameId: multiplayerConfig.gameId });
                } else {
                    socket.emit('join_game', {
                        gameId: multiplayerConfig.gameId,
                        userId: multiplayerConfig.playerId || multiplayerConfig.sessionId,
                        playerColor: multiplayerConfig.localPlayerColor
                    });
                }
            };
            manualEmit();
        }

        socket.on('connect_error', (error) => {
            debugService.error({ event: 'connect_error', error });
        });

        socket.on('reconnect', (attemptNumber) => {
            debugService.socket({ event: 'reconnect', attemptNumber });
            console.log(`🔄 Reconnected after ${attemptNumber} attempts`);

            // Restart heartbeat
            startHeartbeat();

            // Track game again
            trackGame();

            if (multiplayerConfig) {
                // On reconnect, re-run the same join + retry logic as on connect
                const emitJoin = () => {
                    if (!socket) return;
                    if (multiplayerConfig.isSpectator) {
                        socket.emit('watch_game', { gameId: multiplayerConfig.gameId });
                    } else {
                        socket.emit('join_game', {
                            gameId: multiplayerConfig.gameId,
                            userId: multiplayerConfig.playerId || multiplayerConfig.sessionId,
                            playerColor: multiplayerConfig.localPlayerColor
                        });
                    }
                };
                joinAttemptsRef.current = 0;
                emitJoin();
                scheduleJoinRetry(emitJoin);
            }
        });

        socket.on('disconnect', (reason) => {
            debugService.socket({ event: 'disconnect', reason });
            console.log(`🔌 Disconnected: ${reason}`);

            // Stop heartbeat
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
        });

        // Handle heartbeat acknowledgment
        socket.on('heartbeat_ack', ({ timestamp }) => {
            // Heartbeat received - connection is alive
            debugService.socket({ event: 'heartbeat_ack', latency: Date.now() - timestamp });
        });

        socket.on('GAME_STATE_UPDATE', (data: { state: GameState }) => {
            debugService.socket({ event: 'receive', type: 'GAME_STATE_UPDATE', data });
            const correctedState = data.state.players
                ? { ...data.state, players: data.state.players.map(player => ({ ...player, isAI: false })) }
                : data.state;

            if (correctedState.diceValue !== undefined && correctedState.diceValue !== null) {
                correctedState.diceValue = Number(correctedState.diceValue);
            }

            // Play audio based on game events
            if (correctedState.lastEvent === 'CAPTURE') {
                console.log('🎵 KILL SOUND TRIGGERED by lastEvent');
                audioService.play('tokenKilled');
            } else if (correctedState.message) {
                const msg = correctedState.message.toLowerCase();

                // Token killed sound (fallback for older server versions)
                if (msg.includes('killed') || msg.includes('eliminated') || msg.includes('captured')) {
                    console.log('🎵 KILL SOUND TRIGGERED by message:', msg);
                    audioService.play('tokenKilled');
                }

                // Win sound
                if (msg.includes('win') || correctedState.turnState === 'GAMEOVER') {
                    audioService.play('win');
                }

                // Turn change sounds
                if (msg.includes('waiting for')) {
                    const isMyTurn = correctedState.players?.[correctedState.currentPlayerIndex]?.color === multiplayerConfig?.localPlayerColor;
                    if (isMyTurn) {
                        audioService.play('my_turn');
                    } else {
                        audioService.play('opp_turn');
                    }
                }
            }

            // Check if any token just entered HOME by comparing with previous state
            if (state.tokens && correctedState.tokens) {
                const newHomeTokens = correctedState.tokens.filter((newToken: Token) => {
                    const oldToken = state.tokens.find((t: Token) => t.id === newToken.id);
                    return oldToken &&
                        oldToken.position.type !== 'HOME' &&
                        newToken.position.type === 'HOME';
                });

                if (newHomeTokens.length > 0) {
                    audioService.play('inHome');
                }
            }

            localDispatchRef.current({ type: 'SET_STATE', state: correctedState });
            // On receiving authoritative state, clear any join retry timers
            try {
                clearJoinRetry();
            } catch (e) {
                // ignore
            }

            // CRITICAL: Always unlock processing when server sends an update
            // This prevents the game from getting stuck if optimistic update dependencies don't change
            setProcessing(false);
        });

        socket.on('TOKEN_KILLED', (data: { killedTokenId: string }) => {
            console.log('🎵 TOKEN_KILLED event received, playing kill sound for:', data.killedTokenId);
            audioService.play('tokenKilled');
        });

        socket.on('ERROR', (data: { message: string }) => {
            debugService.error({ event: 'receive', type: 'ERROR', data });
            console.error('❌ SOCKET ERROR:', data.message);

            // Show alert for critical gameplay errors to give user feedback
            if (data.message === 'Not your turn' || data.message.includes('blocked') || data.message.includes('Game not found')) {
                // Use a toast or non-blocking alert if possible, but built-in alert is fine for now
                // alert(data.message); 
                // Actually, alert might be annoying. Let's just ensure it's logged visibly.
            }
        });

        return () => {
            console.log('Cleaning up multiplayer socket connection');
            if (socket) {
                console.log('Disconnecting game socket');
                socket.disconnect();
                socket = null;
            }
        };
    }, [isMultiplayer, multiplayerConfig]);

    // --- Auto-Resync for Active Player (Anti-Stuck Loop) ---
    useEffect(() => {
        if (!isMultiplayer || !isMyTurn || !state.gameStarted || !multiplayerConfig?.gameId) return;

        // If it is my turn, we want to ensure we are perfectly synced.
        // We poll 'resync_game' every 5 seconds to catch any missed state updates (e.g. ghost timers).
        const resyncInterval = setInterval(() => {
            if (socket && socket.connected) {
                // console.log('🔄 Auto-resyncing state during my turn...'); 
                socket.emit('resync_game', { gameId: multiplayerConfig.gameId });
            }
        }, 5000);

        return () => clearInterval(resyncInterval);
    }, [isMultiplayer, isMyTurn, state.gameStarted, multiplayerConfig]);


    const calculateLegalMoves = useCallback((currentState: GameState, diceValue: number): LegalMove[] => {
        const { tokens, currentPlayerIndex, players } = currentState;
        if (!players[currentPlayerIndex]) return [];
        const currentPlayer = players[currentPlayerIndex];
        const moves: LegalMove[] = [];

        for (const token of tokens.filter(t => t.color === currentPlayer.color)) {
            const currentPos = token.position;

            if (currentPos.type === 'YARD') {
                if (diceValue === 6) {
                    const startPos = START_POSITIONS[currentPlayer.color];
                    const tokensOnStart = tokens.filter(t => t.position.type === 'PATH' && t.position.index === startPos && t.color === currentPlayer.color);
                    // Fix: Allow up to 4 tokens on start square (relaxed rule)
                    if (tokensOnStart.length < 4) {
                        moves.push({ tokenId: token.id, finalPosition: { type: 'PATH', index: startPos } });
                    }
                }
            } else if (currentPos.type === 'PATH') {
                const homeEntrance = HOME_ENTRANCES[currentPlayer.color];
                const distanceToHomeEntrance = (homeEntrance - currentPos.index + 52) % 52;

                if (diceValue > distanceToHomeEntrance) {
                    const stepsIntoHome = diceValue - distanceToHomeEntrance - 1;
                    if (stepsIntoHome < HOME_PATH_LENGTH) {
                        moves.push({ tokenId: token.id, finalPosition: { type: 'HOME_PATH', index: stepsIntoHome } });
                    } else if (stepsIntoHome === HOME_PATH_LENGTH) {
                        moves.push({ tokenId: token.id, finalPosition: { type: 'HOME' } });
                    }
                } else {
                    const finalIndex = (currentPos.index + diceValue) % 52;
                    moves.push({ tokenId: token.id, finalPosition: { type: 'PATH', index: finalIndex } });
                }
            } else if (currentPos.type === 'HOME_PATH') {
                const newHomeIndex = currentPos.index + diceValue;
                if (newHomeIndex < HOME_PATH_LENGTH) {
                    moves.push({ tokenId: token.id, finalPosition: { type: 'HOME_PATH', index: newHomeIndex } });
                } else if (newHomeIndex === HOME_PATH_LENGTH) {
                    moves.push({ tokenId: token.id, finalPosition: { type: 'HOME' } });
                }
            }
        }
        debugService.game({ event: 'legal_moves', moves });
        return moves;
    }, []);

    // Processing Ref to prevent double-actions while waiting for server
    const isProcessingRef = useRef(false);
    const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Reset processing flag when state updates from server
    useEffect(() => {
        isProcessingRef.current = false;
        if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
        }
    }, [state.diceValue, state.turnState, state.currentPlayerIndex]);

    const setProcessing = (value: boolean) => {
        isProcessingRef.current = value;
        if (value) {
            // Safety timeout: unlock after 2 seconds if server doesn't reply
            if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = setTimeout(() => {
                console.warn('⚠️ Safety timeout: Unlocking blocked interaction (server timeout)');
                isProcessingRef.current = false;
            }, 800); // Reduced to 800ms for responsiveness
            // Force re-render to reflect unlocked state if needed (usually state change handles this)
        } else {
            if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
                processingTimeoutRef.current = null;
            }
        }
    };

    const handleRollDice = useCallback(async () => {
        if (!state.gameStarted || isProcessingRef.current) {
            return;
        }

        if (isMultiplayer) {
            if (isMyTurn) {
                if (!socket || !socket.connected) {
                    debugService.error('Cannot roll dice: Socket not connected');
                    // alert('Socket not connected. Please check your internet connection and try again.');
                    return;
                }
                if (!multiplayerConfig || !multiplayerConfig.gameId) {
                    debugService.error('Cannot roll dice: Missing multiplayer config or gameId');
                    // alert('Cannot roll dice: Missing game configuration.');
                    return;
                }

                // Optimistic Update: Show rolling immediately
                setProcessing(true);
                // We dispatch a "fake" roll start to trigger animation or at least disable button
                // dispatch({ type: 'ROLL_DICE', value: 0 }); // 0 or null could signify "rolling" state if supported
                // Ideally, we just play the sound immediately
                audioService.play('diceRoll');

                debugService.socket({ event: 'emit', type: 'roll_dice', gameId: multiplayerConfig.gameId });
                socket.emit('roll_dice', { gameId: multiplayerConfig.gameId });
            }
            return;
        }

        if (state.turnState !== 'ROLLING') {
            return;
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        dispatch({ type: 'ROLL_DICE', value: roll });
        const moves = calculateLegalMoves(state, roll);
        dispatch({ type: 'SET_LEGAL_MOVES_AND_PROCEED', moves });
        if (moves.length === 0) {
            setTimeout(() => {
                dispatch({ type: 'NEXT_TURN', grantExtraTurn: roll === 6 });
            }, 300);
        }
    }, [state.gameStarted, state.turnState, isMyTurn, isMultiplayer, multiplayerConfig, socket, calculateLegalMoves]);

    const handleMoveToken = useCallback((tokenId: string) => {
        if (state.turnState !== 'MOVING' || isProcessingRef.current) return;

        if (isMultiplayer) {
            if (isMyTurn) {
                // Optimistic Update: Assume move is valid and update UI immediately
                const move = state.legalMoves.find(m => m.tokenId === tokenId);
                if (move) {
                    setProcessing(true);
                    // Dispatch local update immediately so user sees the token move
                    dispatch({ type: 'MOVE_TOKEN', move });
                    // Play sound immediately
                    audioService.play('tokenMove');

                    debugService.socket({ event: 'emit', type: 'move_token', gameId: multiplayerConfig.gameId, tokenId });
                    socket?.emit('move_token', { gameId: multiplayerConfig.gameId, tokenId });
                }
            }
            return;
        }

        const move = state.legalMoves.find(m => m.tokenId === tokenId);
        if (move) {
            dispatch({ type: 'MOVE_TOKEN', move });
            // Play token move sound for local game
            audioService.play('tokenMove');
        }
    }, [state.turnState, state.legalMoves, isMyTurn, isMultiplayer, multiplayerConfig, socket]);

    // --- AI Turn Logic (Local Game) ---
    const { currentPlayerIndex, turnState, gameStarted, players, legalMoves } = state;
    useEffect(() => {
        if (!gameStarted || isMultiplayer || turnState === 'GAMEOVER') return;

        const currentPlayer = players[currentPlayerIndex];
        if (!currentPlayer?.isAI) return;

        let timeoutId: ReturnType<typeof setTimeout>;

        if (turnState === 'ROLLING') {
            debugService.game({ event: 'ai_thinking', action: 'roll' });
            // faster AI roll for snappier local games
            timeoutId = setTimeout(() => {
                handleRollDice();
            }, 200);
        } else if (turnState === 'MOVING') {
            debugService.game({ event: 'ai_thinking', action: 'move' });
            // faster AI move
            timeoutId = setTimeout(() => {
                if (legalMoves.length > 0) {
                    const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
                    debugService.game({ event: 'ai_move', move: randomMove });
                    handleMoveToken(randomMove.tokenId);
                }
            }, 250);
        }

        return () => clearTimeout(timeoutId);
    }, [currentPlayerIndex, turnState, gameStarted, isMultiplayer, handleRollDice, handleMoveToken, players, legalMoves]);

    const startGame = (players: Player[], initialState?: GameState) => dispatch({ type: 'START_GAME', players, initialState });

    const setState = (newState: GameState) => dispatch({ type: 'SET_STATE', state: newState });

    const handleAnimationComplete = useCallback(() => {
        // In multiplayer, the server handles state transitions via updates. 
        // We might just need this for local cleaning or notifying server animation is done (if we were syncing perfectly)
        // For now, we rely on the fact that 'MOVE_TOKEN' response from server sets state to ROLLING immediately 
        // but we might want to delay that locally. 
        if (!isMultiplayer) {
            dispatch({ type: 'ANIMATION_COMPLETE' });
        }
    }, [isMultiplayer]);

    return { state, timer, startGame, handleRollDice, handleMoveToken, handleAnimationComplete, setState, isMyTurn, socket };
};
