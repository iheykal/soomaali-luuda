const express = require('express');
const router = express.Router();
const { smartUserSync } = require('../utils/userSync');

/**
 * PUBLIC WATCH MODE - Live Matches List
 * Returns a filtered list of active games for any user to spectate.
 */
router.get('/live', async (req, res) => {
    try {
        const Game = require('../models/Game');
        const activeGames = await Game.find(
            { status: 'ACTIVE' },
            {
                gameId: 1,
                stake: 1,
                'players.username': 1,
                'players.color': 1,
                'players.isAI': 1,
                createdAt: 1
            }
        ).sort({ createdAt: -1 });

        res.json({ success: true, games: activeGames });
    } catch (e) {
        console.error("Live Games Error:", e);
        res.status(500).json({ success: false, error: 'Failed to fetch live matches' });
    }
});

// Check if user has an active game (for rejoin functionality)
router.get('/check-active/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ hasActiveGame: false, game: null, message: 'User ID required' });
        }

        const Game = require('../models/Game');

        // Find any ACTIVE game where this user is a player and hasn't won yet
        const activeGame = await Game.findOne({
            status: 'ACTIVE',
            'players.userId': userId,
            $expr: {
                $not: {
                    $in: [
                        {
                            $arrayElemAt: [
                                '$players.color',
                                { $indexOfArray: ['$players.userId', userId] }
                            ]
                        },
                        { $ifNull: ['$winners', []] }
                    ]
                }
            }
        }).sort({ updatedAt: -1 }); // Get most recent game

        if (!activeGame) {
            return res.json({ hasActiveGame: false, game: null });
        }

        // Find the player's info
        const player = activeGame.players.find(p => p.userId?.toString() === userId);

        if (!player) {
            return res.json({ hasActiveGame: false, game: null });
        }

        // Check if player has all pawns home (finished)
        const allPawnsHome = activeGame.tokens
            .filter(t => t.color === player.color)
            .every(t => t.position.type === 'HOME');

        res.json({
            hasActiveGame: true,
            game: {
                gameId: activeGame.gameId,
                playerColor: player.color,
                isDisconnected: player.isDisconnected || false,
                status: activeGame.status,
                stake: activeGame.stake || 0,
                allPawnsHome,
                winners: activeGame.winners || []
            }
        });
    } catch (error) {
        console.error('Error checking active game:', error);
        res.status(500).json({ hasActiveGame: false, game: null, message: 'Server error' });
    }
});

// Rejoin an active game
router.post('/rejoin', async (req, res) => {
    try {
        const { gameId, userId, userName } = req.body;

        if (!gameId || !userId) {
            return res.status(400).json({ success: false, message: 'Game ID and User ID required' });
        }

        const Game = require('../models/Game');
        const game = await Game.findOne({ gameId });

        if (!game) {
            return res.status(404).json({ success: false, message: 'Game not found' });
        }

        if (game.status !== 'ACTIVE') {
            return res.status(400).json({ success: false, message: 'Game is not active' });
        }

        // Find the player
        const player = game.players.find(p => p.userId?.toString() === userId);

        if (!player) {
            return res.status(403).json({ success: false, message: 'You are not in this game. You may need to login again.' });
        }

        // Smart user sync: Create or update user in database to prevent duplicates
        // This ensures users are properly matched to existing accounts
        const syncResult = await smartUserSync(userId, userName, 'game-rejoin');
        if (!syncResult.success) {
            console.warn(`⚠️ User sync failed for ${userId}, continuing with rejoin anyway`);
        }

        // Check if all their pawns are home
        const allPawnsHome = game.tokens
            .filter(t => t.color === player.color)
            .every(t => t.position.type === 'HOME');

        // Check if player is in winners (or should be)
        let hasWon = game.winners && game.winners.includes(player.color);

        if (allPawnsHome && !hasWon) {
            // Mark as winner if not already (rejoin check)
            game.winners.push(player.color);
            // If it's a 2-player game, or last player home, end it
            if (game.winners.length >= game.players.length - 1) {
                game.status = 'COMPLETED';
                game.turnState = 'GAMEOVER';
                game.message = `${player.color} wins! All pawns reached home.`;
            }
            await game.save();
            hasWon = true;
            console.log(`🏆 Player ${userId} rejoined with all pawns home, marking as winner`);
        }

        res.json({
            success: true,
            gameId: game.gameId,
            playerColor: player.color,
            allPawnsHome,
            canRejoin: game.status === 'ACTIVE' && !hasWon
        });
    } catch (error) {
        console.error('Error rejoining game:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
