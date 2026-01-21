// ===== GEM RE-ROLL SOCKET HANDLER =====
// This handler should be added to server.js in the socket.on('connection') block
// Insert after the 'send_chat_message' handler

socket.on('use_gem_reroll', async ({ gameId }) => {
    console.log(`💎 GEM RE-ROLL REQUEST from ${socket.id} for game ${gameId}`);
    try {
        const userId = socket.data.userId;
        if (!userId) return socket.emit('ERROR', { message: 'Authentication required' });

        const user = await User.findById(userId);
        if (!user) return socket.emit('ERROR', { message: 'User not found' });

        // Check gem balance (1 gem = $0.01)
        const GEM_COST = 1;
        if (user.gems < GEM_COST) {
            return socket.emit('ERROR', { message: 'Insufficient gems. Purchase gems to use re-roll.' });
        }

        const game = await Game.findOne({ gameId });
        if (!game || game.status !== 'ACTIVE') {
            return socket.emit('ERROR', { message: 'Game not found or not active' });
        }

        // Verify it's this player's turn
        const currentPlayer = game.players[game.currentPlayerIndex];
        if (!currentPlayer || String(currentPlayer.userId) !== String(userId)) {
            return socket.emit('ERROR', { message: 'Not your turn' });
        }

        // Check re-roll limit (max 5 per game per player)
        const MAX_REROLLS = 5;
        let rerollCount = 0;
        if (game.rerollsUsed) {
            if (game.rerollsUsed instanceof Map) {
                rerollCount = game.rerollsUsed.get(userId) || 0;
            } else {
                rerollCount = game.rerollsUsed[userId] || 0;
            }
        }

        if (rerollCount >= MAX_REROLLS) {
            return socket.emit('ERROR', { message: `Maximum ${MAX_REROLLS} re-rolls per game reached` });
        }

        // Deduct gem from user
        user.gems -= GEM_COST;
        user.transactions.push({
            type: 'gem_usage',
            amount: -GEM_COST,
            matchId: gameId,
            description: `Used gem for re-roll in game ${gameId}`,
            createdAt: new Date()
        });
        await user.save();

        // Update re-roll count
        if (!game.rerollsUsed) {
            game.rerollsUsed = new Map();
        }
        if (game.rerollsUsed instanceof Map) {
            game.rerollsUsed.set(userId, rerollCount + 1);
        } else {
            game.rerollsUsed[userId] = rerollCount + 1;
        }

        // Grant re-roll: Reset turn state to ROLLING
        game.turnState = 'ROLLING';
        game.diceValue = null;
        game.legalMoves = [];
        game.message = `${currentPlayer.username || currentPlayer.color} used a gem to re-roll! 💎`;
        game.timer = 7; // Reset timer for roll

        game.markModified('rerollsUsed');
        await game.save();

        console.log(`✅ Gem re-roll granted to ${userId}. Gems remaining: ${user.gems}, Re-rolls used: ${rerollCount + 1}/${MAX_REROLLS}`);

        // Emit updated game state
        const updatedState = game.toObject ? game.toObject() : game;
        io.to(gameId).emit('GAME_STATE_UPDATE', { state: updatedState });

        // Emit gem update to player
        socket.emit('gem_reroll_success', {
            gemsRemaining: user.gems,
            rerollsUsed: rerollCount + 1,
            rerollsRemaining: MAX_REROLLS - (rerollCount + 1)
        });

        // Restart turn timer
        if (!currentPlayer.isAI && !currentPlayer.isDisconnected) {
            scheduleHumanPlayerAutoRoll(gameId);
        }

    } catch (error) {
        console.error('Gem re-roll error:', error);
        socket.emit('ERROR', { message: 'Failed to process gem re-roll' });
    }
});
