
const humanPlayerTimers = new Map(); // gameId -> timer reference
const timerBroadcasts = new Map(); // gameId -> { intervalId, timeLeft } for countdown broadcast
const activeAutoTurns = new Set();
const pendingDisconnects = new Map(); // userId -> { timeoutId, gameId }

// ===== AUTO-TURN TIMING CONSTANTS =====
const AUTO_TURN_DELAYS = {
    AI_ROLL: 1500,           // AI thinking time before rolling dice
    AI_MOVE: 1200,           // AI thinking time before selecting move
    AI_QUICK_MOVE: 200,      // Quick move immediately after roll (when in MOVING state)
    ANIMATION_WAIT: 500,     // Wait for frontend animation to complete
    STUCK_RECOVERY: 1000,    // Delay before recovering stuck game state
    NO_MOVES_DELAY: 1200     // Delay before auto-passing turn when no moves available
};

// ===== TIMER BROADCAST SYSTEM =====
const startTimerBroadcast = (gameId, initialTime, timerType = 'roll') => {
    stopTimerBroadcast(gameId);
    let timeLeft = initialTime;
    const intervalId = setInterval(async () => {
        timeLeft--;
        if (timeLeft <= 0) {
            stopTimerBroadcast(gameId);
            return;
        }
        io.to(gameId).emit('TIMER_TICK', { timer: timeLeft });
    }, 1000);
    timerBroadcasts.set(gameId, { intervalId, timeLeft: initialTime });
};

const stopTimerBroadcast = (gameId) => {
    if (timerBroadcasts.has(gameId)) {
        const { intervalId } = timerBroadcasts.get(gameId);
        clearInterval(intervalId);
        timerBroadcasts.delete(gameId);
    }
};

const clearAllTimersForGame = (gameId) => {
    if (humanPlayerTimers.has(gameId)) {
        clearTimeout(humanPlayerTimers.get(gameId));
        humanPlayerTimers.delete(gameId);
    }
    stopTimerBroadcast(gameId);
};

const scheduleHumanPlayerAutoRoll = (gameId) => {
    if (humanPlayerTimers.has(gameId)) {
        clearTimeout(humanPlayerTimers.get(gameId));
    }
    startTimerBroadcast(gameId, 7, 'roll');
    const timer = setTimeout(async () => {
        humanPlayerTimers.delete(gameId);
        const Game = require('./models/Game');
        const game = await Game.findOne({ gameId });
        if (!game || game.status !== 'ACTIVE' || game.turnState !== 'ROLLING') return;

        try {
            const result = await gameEngine.handleAutoRoll(gameId, true);
            if (result && result.success) {
                const gameState = result.state;
                io.to(gameId).emit('GAME_STATE_UPDATE', { state: gameState });
                if (gameState.legalMoves.length === 0) {
                    setTimeout(async () => {
                        const passTurnResult = await gameEngine.handlePassTurn(gameId); // Assume exists or handle via engine
                        // Fallback if handlePassTurn not handy: manually update
                        // Actually, gameEngine.handleAutoMove usually handles 'no moves' logic via calling getNextPlayer
                        // But let's trust the engine for now.
                        io.to(gameId).emit('GAME_STATE_UPDATE', { state: passTurnResult?.state || gameState });
                        if (passTurnResult?.state) {
                            const nextPlayer = passTurnResult.state.players[passTurnResult.state.currentPlayerIndex];
                            if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                                scheduleHumanPlayerAutoRoll(gameId);
                            }
                        }
                    }, 1200);
                } else if (gameState.legalMoves.length === 1) {
                    setTimeout(async () => {
                        const moveResult = await gameEngine.handleAutoMove(gameId);
                        if (moveResult.success) {
                            io.to(gameId).emit('GAME_STATE_UPDATE', { state: moveResult.state });
                            const nextPlayer = moveResult.state.players[moveResult.state.currentPlayerIndex];
                            if (moveResult.state.turnState === 'ROLLING' && nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                                scheduleHumanPlayerAutoRoll(gameId);
                            }
                        }
                    }, 1200);
                } else {
                    scheduleHumanPlayerAutoMove(gameId);
                }
            }
        } catch (error) { console.error(error); }
    }, 7000);
    humanPlayerTimers.set(gameId, timer);
};

const scheduleHumanPlayerAutoMove = (gameId) => {
    if (humanPlayerTimers.has(gameId)) {
        clearTimeout(humanPlayerTimers.get(gameId));
    }
    startTimerBroadcast(gameId, 18, 'move');
    const timer = setTimeout(async () => {
        humanPlayerTimers.delete(gameId);
        const Game = require('./models/Game');
        const game = await Game.findOne({ gameId });
        if (!game || game.status !== 'ACTIVE' || game.turnState !== 'MOVING') return;
        try {
            const result = await gameEngine.handleAutoMove(gameId);
            if (result && result.success) {
                const plainState = result.state;
                io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
                const nextPlayer = plainState.players[plainState.currentPlayerIndex];
                if (plainState.turnState === 'ROLLING') {
                    if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
                        scheduleHumanPlayerAutoRoll(gameId);
                    } else if (nextPlayer) {
                        scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_MOVE);
                    }
                }
            }
        } catch (error) { console.error(error); }
    }, 18000);
    humanPlayerTimers.set(gameId, timer);
};

const scheduleAutoTurn = async (gameId, delay = AUTO_TURN_DELAYS.AI_ROLL) => {
    const Game = require('./models/Game');
    try {
        const game = await Game.findOne({ gameId });
        if (game && game.gameStarted && game.status === 'ACTIVE') {
            const currentPlayer = game.players[game.currentPlayerIndex];
            if (currentPlayer && currentPlayer.socketId && !currentPlayer.isAI && !currentPlayer.isDisconnected) return;
        }
    } catch (err) { }
    if (activeAutoTurns.has(gameId)) return;
    activeAutoTurns.add(gameId);
    setTimeout(async () => {
        activeAutoTurns.delete(gameId);
        await runAutoTurn(gameId);
    }, delay);
};

const runAutoTurn = async (gameId) => {
    const Game = require('./models/Game');
    const gameRecord = await Game.findOne({ gameId });
    if (!gameRecord || !gameRecord.gameStarted || gameRecord.status !== 'ACTIVE') return;

    const currentPlayerFromDb = gameRecord.players[gameRecord.currentPlayerIndex];
    if (!currentPlayerFromDb) return;
    if (currentPlayerFromDb.socketId && !currentPlayerFromDb.isAI && !currentPlayerFromDb.isDisconnected) return;

    let result = await gameEngine.handleAutoRoll(gameId);
    if (!result.success) result = await gameEngine.handleAutoMove(gameId);

    if (result.success) {
        const plainState = result.state.toObject ? result.state.toObject() : result.state;
        if (plainState.diceValue !== null && plainState.diceValue !== undefined) plainState.diceValue = Number(plainState.diceValue);
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });

        if (plainState.legalMoves && plainState.legalMoves.length === 0 && plainState.diceValue !== null && plainState.turnState === 'MOVING') {
            setTimeout(async () => {
                // Pass turn logic
                const game = await Game.findOne({ gameId });
                if (game && game.turnState === 'MOVING' && game.legalMoves.length === 0) {
                    const nextPlayerIndex = gameEngine.getNextPlayerIndex(game, game.currentPlayerIndex, false);
                    game.currentPlayerIndex = nextPlayerIndex;
                    game.diceValue = null;
                    game.turnState = 'ROLLING';
                    game.legalMoves = [];
                    await game.save();
                    const updatedState = game.toObject ? game.toObject() : game;
                    io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });
                    const nextPlayer = game.players[nextPlayerIndex];
                    if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
                }
            }, 1200);
            return;
        }

        const game = result.state;
        if (game.turnState === 'MOVING') {
            scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_QUICK_MOVE);
        } else if (game.turnState === 'ROLLING') {
            const updatedGameRecord = await Game.findOne({ gameId });
            if (updatedGameRecord) {
                const nextPlayerIndex = updatedGameRecord.currentPlayerIndex;
                const nextPlayerFromDb = updatedGameRecord.players[nextPlayerIndex];
                if (nextPlayerFromDb && (nextPlayerFromDb.isAI || nextPlayerFromDb.isDisconnected)) {
                    scheduleAutoTurn(gameId, AUTO_TURN_DELAYS.AI_ROLL);
                } else if (nextPlayerFromDb && !nextPlayerFromDb.isAI && !nextPlayerFromDb.isDisconnected) {
                    scheduleHumanPlayerAutoRoll(gameId);
                }
            }
        }
    }
};
