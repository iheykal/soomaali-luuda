
socket.on('watch_game', async ({ gameId }) => {
    socket.join(gameId);
    const Game = require('./models/Game');
    try {
        const game = await Game.findOne({ gameId });
        if (game) {
            socket.emit('GAME_STATE_UPDATE', { state: game.toObject ? game.toObject() : game });
        } else {
            socket.emit('ERROR', { message: 'Game not found' });
        }
    } catch (error) { console.error(error); }
});

socket.on('join_game', async ({ gameId, userId, playerColor }) => {
    socket.join(gameId);
    socket.gameId = gameId;
    if (pendingDisconnects.has(userId)) {
        const pending = pendingDisconnects.get(userId);
        if (pending && pending.gameId === gameId) {
            clearTimeout(pending.timeoutId);
            pendingDisconnects.delete(userId);
        }
    }
    const result = await gameEngine.handleJoinGame(gameId, userId, playerColor, socket.id);
    if (result.success && result.state) {
        const plainState = result.state.toObject ? result.state.toObject() : result.state;
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
        if (result.state.status === 'ACTIVE' && result.state.turnState === 'ROLLING') {
            const currentPlayer = result.state.players[result.state.currentPlayerIndex];
            if (currentPlayer && currentPlayer.userId === userId && !currentPlayer.isAI) {
                scheduleHumanPlayerAutoRoll(gameId);
            }
        }
    } else {
        socket.emit('ERROR', { message: result.message || 'Failed to join game.' });
    }
});

socket.on('roll_dice', async ({ gameId }) => {
    if (humanPlayerTimers.has(gameId)) {
        clearTimeout(humanPlayerTimers.get(gameId));
        humanPlayerTimers.delete(gameId);
    }
    const Game = require('./models/Game');
    const gameBeforeRoll = await Game.findOne({ gameId });
    if (gameBeforeRoll) {
        const currentPlayer = gameBeforeRoll.players[gameBeforeRoll.currentPlayerIndex];
        if (currentPlayer && currentPlayer.socketId === socket.id && currentPlayer.isDisconnected) {
            await Game.updateOne({ gameId, 'players.socketId': socket.id }, { $set: { 'players.$.isDisconnected': false } });
        }
    }

    const result = await gameEngine.handleRollDice(gameId, socket.id);
    if (!result) return socket.emit('ERROR', { message: 'Failed to roll dice' });

    if (result.success) {
        const gameState = result.state.toObject ? result.state.toObject() : result.state;
        if (gameState.diceValue !== null && gameState.diceValue !== undefined) gameState.diceValue = Number(gameState.diceValue);

        io.to(gameId).emit('GAME_STATE_UPDATE', { state: gameState });

        if (gameState.legalMoves && gameState.legalMoves.length > 0) {
            const currentPlayer = gameState.players[gameState.currentPlayerIndex];
            if (currentPlayer && !currentPlayer.isAI && !currentPlayer.isDisconnected) {
                scheduleHumanPlayerAutoMove(gameId);
            }
        } else if (gameState.legalMoves && gameState.legalMoves.length === 0 && gameState.diceValue !== null) {
            if (humanPlayerTimers.has(gameId)) { clearTimeout(humanPlayerTimers.get(gameId)); humanPlayerTimers.delete(gameId); }
            setTimeout(async () => {
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
                    if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) scheduleAutoTurn(gameId, 1500);
                    else if (nextPlayer) scheduleHumanPlayerAutoRoll(gameId);
                }
            }, 1200);
        }

        const gameRecord = await Game.findOne({ gameId });
        if (gameRecord && result.state.turnState === 'ROLLING') {
            const nextPlayer = gameRecord.players[gameRecord.currentPlayerIndex];
            if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) scheduleAutoTurn(gameId);
            else if (nextPlayer) scheduleHumanPlayerAutoRoll(gameId);
        }

    } else {
        socket.emit('ERROR', { message: result.message || 'Failed to roll dice' });
        if (result.message === 'Wait for animation' || result.message === 'Not rolling state') {
            const Game = require('./models/Game');
            const currentGame = await Game.findOne({ gameId });
            if (currentGame) socket.emit('GAME_STATE_UPDATE', { state: currentGame.toObject ? currentGame.toObject() : currentGame });
        }
    }
});

socket.on('move_token', async ({ gameId, tokenId }) => {
    if (humanPlayerTimers.has(gameId)) { clearTimeout(humanPlayerTimers.get(gameId)); humanPlayerTimers.delete(gameId); }

    const Game = require('./models/Game');
    const result = await gameEngine.handleMoveToken(gameId, socket.id, tokenId);

    if (result.success) {
        const plainState = result.state.toObject ? result.state.toObject() : result.state;
        if (result.killedTokenId) io.to(gameId).emit('TOKEN_KILLED', { killedTokenId: result.killedTokenId });

        if (plainState.turnState !== 'ROLLING' && plainState.diceValue === null) plainState.turnState = 'ROLLING';
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: plainState });
        if (result.settlementData) {
            const winnerPlayer = plainState.players.find(p => p.userId === result.settlementData.winnerId);
            if (winnerPlayer && winnerPlayer.socketId) io.to(winnerPlayer.socketId).emit('win_notification', result.settlementData);
            else io.to(gameId).emit('win_notification', result.settlementData);
        }

        const gameRecord = await Game.findOne({ gameId });
        if (gameRecord && plainState.turnState === 'ROLLING') {
            const nextPlayer = gameRecord.players[gameRecord.currentPlayerIndex];
            if (nextPlayer && (nextPlayer.isAI || nextPlayer.isDisconnected)) scheduleAutoTurn(gameId);
            else if (nextPlayer) scheduleHumanPlayerAutoRoll(gameId);
        }
    } else {
        socket.emit('ERROR', { message: result.message });
    }
});

socket.on('send_chat_message', async ({ gameId, userId, message }) => {
    const Game = require('./models/Game');
    const game = await Game.findOne({ gameId });
    if (game) {
        const player = game.players.find(p => p.userId === userId);
        if (player) {
            const chatData = { userId, playerColor: player.color, playerName: player.username || player.userId, message, timestamp: Date.now() };
            io.to(gameId).emit('chat_message', chatData);
        }
    }
});

socket.on('disconnect', async () => {
    // Keep removing from matchmaking queue logic if it was there? Yes.
    // Assuming removeFromQueue is global
    if (typeof removeFromQueue === 'function') removeFromQueue(socket.id);

    if (socket.gameId) {
        const gameId = socket.gameId;
        const Game = require('./models/Game');
        const game = await Game.findOne({ gameId });
        if (game) {
            const player = game.players.find(p => p.socketId === socket.id);
            if (player && player.userId) {
                const userId = player.userId;
                const disconnectTimeout = setTimeout(async () => {
                    pendingDisconnects.delete(userId);
                    if (typeof clearAllTimersForGame === 'function') clearAllTimersForGame(gameId);
                    const result = await gameEngine.handleDisconnect(gameId, socket.id);
                    if (result) {
                        io.to(gameId).emit('GAME_STATE_UPDATE', { state: result.state });
                        if (result.isCurrentTurn) scheduleAutoTurn(gameId, 1000);
                    }
                }, 15000);
                pendingDisconnects.set(userId, { timeoutId: disconnectTimeout, gameId });
                return;
            }
        }
        if (typeof clearAllTimersForGame === 'function') clearAllTimersForGame(gameId);
        const result = await gameEngine.handleDisconnect(gameId, socket.id);
        if (result) {
            io.to(gameId).emit('GAME_STATE_UPDATE', { state: result.state });
            if (result.isCurrentTurn) scheduleAutoTurn(gameId, 1000);
        }
    }
});
