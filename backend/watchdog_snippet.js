
// --- Lightweight Watchdog (Restored & Optimized) ---
// Checks every 10 seconds for games that are "stuck" (no activity for > 20s) due to dropped events.
setInterval(async () => {
    try {
        const Game = require('./models/Game'); // Ensure model is available
        const gameEngine = require('./logic/gameEngine');
        const now = Date.now();
        const stalledThreshold = 20000; // 20 seconds without activity

        const activeGames = await Game.find({ status: 'ACTIVE' });

        for (const game of activeGames) {
            const lastActivity = game.updatedAt ? new Date(game.updatedAt).getTime() : 0;
            const isStalled = (now - lastActivity) > stalledThreshold;

            if (isStalled) {
                const currentPlayer = game.players[game.currentPlayerIndex];
                // Only kickstart if it's AI or Disconnected
                if (currentPlayer && (currentPlayer.isAI || currentPlayer.isDisconnected)) {
                    console.log(`🐕 Watchdog: Kickstarting stalled game ${game.gameId} for ${currentPlayer.color}`);
                    if (game.turnState === 'ROLLING') {
                        await gameEngine.handleAutoRoll(game.gameId, true);
                    } else if (game.turnState === 'MOVING') {
                        await gameEngine.handleAutoMove(game.gameId);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Watchdog error:', error);
    }
}, 10000);
