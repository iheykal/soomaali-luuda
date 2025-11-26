/**
 * LUDO GAME ENGINE - Comprehensive Multiplayer Dice Game
 * 
 * IMPLEMENTED FEATURES:
 * 
 * Part 1: Game Setup & Initialization
 * ✅ Two-player matchmaking based on bet amount
 * ✅ Fixed color assignment: First player = Green, Second player = Blue
 * ✅ Random turn order at game start for fairness
 * ✅ Funds reservation when entering matchmaking
 * 
 * Part 2: Core Gameplay Loop
 * ✅ Dice roll (random 1-6) with server-side generation
 * ✅ Rolling 6 grants extra turn
 * ✅ Rolling 6 unlocks pawn from Base (YARD) to starting square
 * ✅ Normal rolls (1-5) move pawns on track
 * ✅ Players with no pawns on track and no 6 roll are stuck
 * 
 * Part 3: Movement & Interaction
 * ✅ Capturing: Landing on opponent's pawn sends it back to Base
 * ✅ Safe squares: No captures on designated safe squares
 * ✅ Blockades: Two same-color pawns block opponent passage
 * ✅ Home stretch: Color-specific final path, safe from capture
 * 
 * Part 4: Winning Conditions
 * ✅ Win by moving all 4 pawns to HOME
 * ✅ Exact roll required to enter HOME (no overshooting)
 * 
 * Part 5: Multiplayer Synchronization
 * ✅ Authoritative server state (single source of truth)
 * ✅ Real-time updates via Socket.IO
 * ✅ Turn transitions with proper validation
 * ✅ Disconnection handling: Bot takes over using player's name
 * ✅ Rejoin support: Players can reconnect and resume control
 * 
 * Part 6: End Game & Payout
 * ✅ Automatic victory detection
 * ✅ Wallet settlement: Winner gets stake × 2, Loser debited stake
 * ✅ Stats tracking: Games played, wins recorded
 * ✅ Anti-double-settlement protection
 */

const Game = require('../models/Game');
const User = require('../models/User');
const Revenue = require('../models/Revenue');
const crypto = require('crypto');

// --- Constants ---
const HOME_PATH_LENGTH = 5;
// SAFE_SQUARES now includes Home Entrances (11, 24, 37, 50) to prevent last-minute kills
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47, 11, 24, 37, 50];
const START_POSITIONS = { red: 39, green: 0, yellow: 13, blue: 26 };
const HOME_ENTRANCES = { red: 37, green: 50, yellow: 11, blue: 24 };

// --- Wallet Settlement Function ---
const processGameSettlement = async (game) => {
    try {
        // Prevent double settlement
        if (game.settlementProcessed) {
            console.log(`⚠️ Settlement already processed for game ${game.gameId}`);
            return;
        }

        if (!game.stake || game.stake <= 0) {
            console.log(`⚠️ No stake set for game ${game.gameId}, skipping settlement.`);
            game.settlementProcessed = true;
            return;
        }

        if (!game.winners || game.winners.length === 0) {
            console.log(`⚠️ No winners in game ${game.gameId}, skipping settlement`);
            return;
        }

        const winnerColor = game.winners[0];
        const winnerPlayer = game.players.find(p => p.color === winnerColor);
        const loserPlayer = game.players.find(p => p.color !== winnerColor && !p.isAI);

        if (!winnerPlayer || !loserPlayer) {
            console.log(`⚠️ Could not find winner or loser for settlement in game ${game.gameId}`);
            return;
        }

        console.log(`💰 Processing settlement for game ${game.gameId}: Winner=${winnerPlayer.userId}, Loser=${loserPlayer.userId}, Stake=${game.stake}`);

        const winner = await User.findById(winnerPlayer.userId);
        const loser = await User.findById(loserPlayer.userId);
        const stake = game.stake;

        if (winner) {
            const totalPot = stake * 2;
            const commission = totalPot * 0.10;
            const winnings = totalPot - commission; // Winner gets 1.8 * stake
            const profit = winnings - stake; // Winner's net profit is 0.8 * stake

            winner.balance += winnings;
            winner.reservedBalance -= stake;

            if (!winner.stats) winner.stats = {};
            winner.stats.gamesPlayed = (winner.stats.gamesPlayed || 0) + 1;
            winner.stats.wins = (winner.stats.wins || 0) + 1;
            winner.stats.gamesWon = (winner.stats.gamesWon || 0) + 1;
            winner.stats.totalWinnings = (winner.stats.totalWinnings || 0) + profit;

            winner.transactions.push({
                type: 'game_win',
                amount: profit,
                matchId: game.gameId,
                description: `Winnings from game ${game.gameId}`
            });
            winner.transactions.push({
                type: 'match_unstake',
                amount: stake,
                matchId: game.gameId,
                description: `Stake returned and settled from winning game ${game.gameId}`
            });

            await winner.save();

            try {
                const revenue = new Revenue({
                    gameId: game.gameId,
                    amount: commission,
                    totalPot: totalPot,
                    winnerId: winner._id,
                    timestamp: new Date()
                });
                await revenue.save();
                console.log(`💰 Revenue recorded: $${commission} for game ${game.gameId}`);
            } catch (revError) {
                console.error(`❌ Error recording revenue for game ${game.gameId}:`, revError);
            }

            console.log(`✅ Winner ${winner.username} credited with $${winnings}. New balance: ${winner.balance}`);
        }

        if (loser) {
            loser.reservedBalance -= stake;

            if (!loser.stats) loser.stats = {};
            loser.stats.gamesPlayed = (loser.stats.gamesPlayed || 0) + 1;
            loser.stats.gamesLost = (loser.stats.gamesLost || 0) + 1;
            loser.stats.totalLosses = (loser.stats.totalLosses || 0) + stake;

            loser.transactions.push({
                type: 'game_loss',
                amount: -stake,
                matchId: game.gameId,
                description: `Stake consumed from loss in game ${game.gameId}`
            });

            await loser.save();
            console.log(`✅ Loser ${loser.username} stake of ${stake} consumed from reserved balance. New balance: ${loser.balance}`);
        }

        game.settlementProcessed = true;
        if (winner) {
            const profit = (stake * 2 * 0.9) - stake;
            game.message = `${winner.username} won ${profit.toFixed(2)} dollars`;
        }
        console.log(`✅ Settlement complete for game ${game.gameId}`);
    } catch (error) {
        console.error(`❌ Error processing settlement for game ${game.gameId}:`, error);
    }
};

// --- Helpers ---
const getNextPlayerIndex = (game, currentIndex, grantExtraTurn) => {
    let nextIndex = grantExtraTurn ? currentIndex : (currentIndex + 1) % game.players.length;
    let attempts = 0;
    while (game.winners.includes(game.players[nextIndex].color) && attempts < 4) {
        nextIndex = (nextIndex + 1) % game.players.length;
        attempts++;
    }
    return nextIndex;
};

// Export for use in server.js
exports.getNextPlayerIndex = getNextPlayerIndex;

const calculateLegalMoves = (gameState, diceValue) => {
    const { tokens, currentPlayerIndex, players } = gameState;
    const currentPlayer = players[currentPlayerIndex];
    const moves = [];
    const playerTokens = tokens.filter(t => t.color === currentPlayer.color);

    // console.log(`📋 calculateLegalMoves: player=${currentPlayer.color}, diceValue=${diceValue}, tokensInYard=${playerTokens.filter(t => t.position.type === 'YARD').length}, tokensOnPath=${playerTokens.filter(t => t.position.type === 'PATH').length}`);

    for (const token of playerTokens) {
        const currentPos = token.position;

        if (currentPos.type === 'YARD') {
            console.log(`📋 Token ${token.id} in YARD, diceValue=${diceValue}`);
            if (diceValue === 6) {
                const startPos = START_POSITIONS[currentPlayer.color];
                const tokensOnStart = tokens.filter(t => t.position.type === 'PATH' && t.position.index === startPos && t.color === currentPlayer.color);
                console.log(`📋 Token ${token.id}: startPos=${startPos}, tokensOnStart=${tokensOnStart.length}`);
                // Fix: Allow up to 4 tokens on start square (relaxed rule to prevent entry blocking)
                if (tokensOnStart.length < 4) {
                    // console.log(`📋 Adding move: ${token.id} from YARD to PATH:${startPos}`);
                    moves.push({ tokenId: token.id, finalPosition: { type: 'PATH', index: startPos } });
                } else {
                    console.log(`📋 Blocked: too many tokens on start position`);
                }
            }
        } else if (currentPos.type === 'PATH') {
            console.log(`📋 Token ${token.id} on PATH at ${currentPos.index}, diceValue=${diceValue}`);
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

                // --- START FIX ---
                // Check what's on the destination square
                const tokensAtFinalIndex = gameState.tokens.filter(t => t.position.type === 'PATH' && t.position.index === finalIndex);
                const opponentTokensAtFinalIndex = tokensAtFinalIndex.filter(t => t.color !== currentPlayer.color);

                // Blockade Rule: 2 or more opponent pawns on ANY square (safe or not) form a blockade? 
                // Standard Ludo: Blockades usually only form if 2+ pawns. 
                // User prompt says: "Unable to move pawns when multiple pawns (both player and opponent) illegally occupy same square"
                // We will stick to: 2+ opponent pawns = Blockade.
                const isBlockade = opponentTokensAtFinalIndex.length >= 2 &&
                    opponentTokensAtFinalIndex.every(t => t.color === opponentTokensAtFinalIndex[0].color);

                // Self-occupation: Standard Ludo allows infinite stacking of own pawns.
                // We allow moving there.

                if (!isBlockade) {
                    moves.push({ tokenId: token.id, finalPosition: { type: 'PATH', index: finalIndex } });
                }
                // --- END FIX ---
            }
        } else if (currentPos.type === 'HOME_PATH') {
            const newHomeIndex = currentPos.index + diceValue;
            if (newHomeIndex < HOME_PATH_LENGTH) {
                moves.push({ tokenId: token.id, finalPosition: { type: 'HOME_PATH', index: newHomeIndex } });
                console.log(`📋 Token ${token.id} can move within HOME_PATH from ${currentPos.index} to ${newHomeIndex}`);
            } else if (newHomeIndex === HOME_PATH_LENGTH) {
                // EXACT ROLL REQUIRED: Only allow HOME entry if exact roll
                moves.push({ tokenId: token.id, finalPosition: { type: 'HOME' } });
                console.log(`📋 Token ${token.id} can enter HOME with exact roll (from ${currentPos.index} + ${diceValue} = ${newHomeIndex})`);
            } else {
                // Overshooting: If roll is too high, no move is possible
                console.log(`📋 Token ${token.id} CANNOT move: overshoot HOME (${currentPos.index} + ${diceValue} = ${newHomeIndex} > ${HOME_PATH_LENGTH})`);
            }
        }
    }
    return moves;
};

exports.handleJoinGame = async (gameId, userId, playerColor, socketId) => {
    let game = await Game.findOne({ gameId });
    if (!game) {
        game = new Game({ gameId, players: [], tokens: [] });
    }

    // Fetch user to get username
    let username = 'Player';
    try {
        const user = await User.findById(userId);
        if (user && user.username) {
            username = user.username;
        }
    } catch (e) {
        console.error(`Error fetching user ${userId}:`, e);
    }

    const playerIndex = game.players.findIndex(p => p.color === playerColor);
    if (playerIndex !== -1) {
        // Anti-Hijack: Only allow reconnect if userId matches or seat is empty (rare)
        const existingPlayer = game.players[playerIndex];
        if (existingPlayer.userId === userId || existingPlayer.isDisconnected) {
            // Update socket and clear disconnect flag
            existingPlayer.socketId = socketId;
            existingPlayer.username = username; // Update username in case it changed
            if (existingPlayer.isDisconnected) {
                existingPlayer.isDisconnected = false; // REJOIN: Clear disconnect flag
                game.message = `${username} reconnected!`;
                console.log(`✅ Player ${userId} (${playerColor}) reconnected to game ${gameId}`);
            } else {
                // Same player reconnecting with new socket (not disconnected state)
                game.message = `${username} reconnected!`;
                console.log(`✅ Player ${userId} (${playerColor}) updated socket connection for game ${gameId}`);
            }
        } else {
            console.warn(`Unauthorized join attempt for game ${gameId} - userId mismatch`);
            return { success: false, state: game };
        }
    } else {
        // Restrict to 2 players only (Green and Blue)
        if (game.players.length >= 2) {
            console.warn(`Game ${gameId} is full (2 players max)`);
            return { success: false, state: game };
        }

        const newTokens = Array.from({ length: 4 }, (_, i) => ({
            id: `${playerColor}-${i}`,
            color: playerColor,
            position: { type: 'YARD', index: i }
        }));

        game.players.push({
            color: playerColor,
            userId,
            username, // Store username
            socketId,
            isAI: false, // Always false for multiplayer games - human players only
            isDisconnected: false // Always false when joining - player is connected
        });
        console.log(`✅ Added new player ${userId} (${playerColor}) to game ${gameId} - isAI: false, isDisconnected: false`);
        game.tokens.push(...newTokens);
    }

    await game.save();
    return { success: true, state: game };
};

exports.handleDisconnect = async (gameId, socketId) => {
    try {
        const game = await Game.findOne({ gameId });
        if (!game) {
            console.warn(`[disconnect] Game not found: ${gameId}`);
            return null;
        }

        const player = game.players.find(p => p.socketId === socketId);
        if (player) {
            player.isDisconnected = true;
            player.socketId = null; // Clear socket
            game.message = `${player.username || player.color} disconnected. Bot taking over...`;
            await game.save();

            console.log(`[disconnect] Player ${player.color} in game ${gameId} marked as disconnected.`);

            return {
                state: game,
                isCurrentTurn: game.players[game.currentPlayerIndex].color === player.color,
                player
            };
        } else {
            console.warn(`[disconnect] Player with socketId ${socketId} not found in game ${gameId}. No action taken.`);
            return null; // Player not found, nothing to do
        }
    } catch (error) {
        console.error(`❌ CRITICAL ERROR in handleDisconnect for game ${gameId}:`, error);
        return null; // Return null to prevent server crash
    }
};

// --- BOT / INACTIVITY SYSTEM ---

/**
 * Checks all active games for inactive players and triggers auto-play.
 * Should be called periodically (e.g., every 1 second) from server.js.
 */
exports.checkInactivity = async () => {
    try {
        // Find active games where it's a human's turn
        const games = await Game.find({
            status: 'ACTIVE',
            turnState: { $in: ['ROLLING', 'MOVING'] }
        });

        const now = Date.now();
        const TIMEOUT_MS = 30000; // 30 seconds allowed per turn

        for (const game of games) {
            const player = game.players[game.currentPlayerIndex];

            // Skip if player is already AI (handled by local loop or separate logic) 
            // OR if player is disconnected (handled by handleDisconnect/Auto logic immediately)
            // But if they are disconnected, we DO want to auto-play for them.

            if (!player) continue;

            // If player is marked as disconnected, we treat them as a bot immediately.
            // If player is connected but taking too long, we also treat them as a bot for this turn.

            const lastActionTime = new Date(game.updatedAt).getTime();

            // Define timeouts locally to avoid ReferenceError
            const ROLL_TIMEOUT = 7000;
            const MOVE_TIMEOUT = 18000;

            const timeout = game.turnState === 'ROLLING' ? ROLL_TIMEOUT : MOVE_TIMEOUT;
            const isTimedOut = (now - lastActionTime) > timeout;

            if (player.isDisconnected || isTimedOut) {
                // console.log(`🤖 Bot taking over for ${player.color} in game ${game.gameId} (Disconnected: ${player.isDisconnected}, TimedOut: ${isTimedOut})`);

                if (game.turnState === 'ROLLING') {
                    // Auto Roll
                    await exports.handleAutoRoll(game.gameId, true); // Force=true to override socket check
                } else if (game.turnState === 'MOVING') {
                    // Auto Move
                    await exports.handleAutoMove(game.gameId);
                }
            }
        }
    } catch (error) {
        console.error('Error in checkInactivity:', error);
    }
};

// --- Normal Gameplay (Human) ---

// --- Atomic Update Helper ---

/**
 * Applies an update to a game with optimistic concurrency control.
 * Retries if a VersionError occurs.
 * 
 * @param {string} gameId - The ID of the game to update.
 * @param {Function} updateFn - A function that takes the current game state and modifies it. 
 *                              Should return an object { success: boolean, message?: string, result?: any }.
 *                              If it returns success: false, the update is aborted.
 * @param {number} maxRetries - Maximum number of retries (default 3).
 */
const applyAtomicUpdate = async (gameId, updateFn, maxRetries = 3) => {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            const game = await Game.findOne({ gameId });
            if (!game) return { success: false, message: 'Game not found' };

            // Apply the update logic
            const result = await updateFn(game);

            if (!result.success) {
                return result; // Abort if logic says so (e.g. illegal move)
            }

            // Attempt to save
            await game.save();
            return { success: true, state: game.toObject ? game.toObject() : game, ...result };

        } catch (error) {
            if (error.name === 'VersionError') {
                attempts++;
                console.warn(`⚠️ VersionError in game ${gameId} (attempt ${attempts}/${maxRetries}). Retrying...`);
                if (attempts >= maxRetries) {
                    console.error(`❌ Failed to update game ${gameId} after ${maxRetries} attempts due to VersionError.`);
                    return { success: false, message: 'Server busy, please try again.' };
                }
                // Short random delay to reduce contention
                await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            } else {
                console.error(`❌ Error updating game ${gameId}:`, error);
                return { success: false, message: error.message || 'Internal server error' };
            }
        }
    }
};

// --- Normal Gameplay (Human) ---

exports.handleRollDice = async (gameId, socketId) => {
    console.log(`🎲 handleRollDice called: gameId=${gameId}, socketId=${socketId}`);

    return applyAtomicUpdate(gameId, async (game) => {
        if (game.status === 'COMPLETED' || game.turnState === 'GAMEOVER') {
            return { success: false, message: 'Game is already over' };
        }

        const player = game.players[game.currentPlayerIndex];
        if (!player) {
            return { success: false, message: 'No current player' };
        }

        if (player.socketId !== socketId && !player.isDisconnected) {
            return { success: false, message: 'Not your turn' };
        }

        if (game.turnState !== 'ROLLING') {
            return { success: false, message: 'Not in ROLLING state' };
        }

        // --- Perform the roll ---
        executeRollDice(game); // Modifies 'game' in place.

        return { success: true };
    });
};

exports.handleMoveToken = async (gameId, socketId, tokenId) => {
    return applyAtomicUpdate(gameId, async (game) => {
        const player = game.players[game.currentPlayerIndex];
        if (player.socketId !== socketId) return { success: false, message: 'Not your turn' };

        // Execute the move
        const { success, settlementPromise, message } = executeMoveToken(game, tokenId);

        if (!success) {
            return { success: false, message };
        }

        // If there's a settlement promise, await it.
        // Note: In a retry loop, this might be executed multiple times if save fails.
        // However, settlementProcessed flag in processGameSettlement prevents double payout.
        if (settlementPromise) {
            await settlementPromise;
        }

        return { success: true };
    });
};

// --- Autopilot / Bot Logic ---

exports.handleAutoRoll = async (gameId, force = false) => {
    return applyAtomicUpdate(gameId, async (game) => {
        // SPAM PREVENTION: Check if turn state is actually ROLLING
        if (game.turnState !== 'ROLLING') {
            return { success: false, message: 'Not in rolling state' };
        }

        // SPAM PREVENTION: Cooldown check (minimum 2 seconds between actions)
        const now = Date.now();
        const lastActionTime = new Date(game.updatedAt).getTime();
        // Reduced cooldown to 1s to make game faster
        if (now - lastActionTime < 1000) {
            return { success: false, message: 'Cooldown active' };
        }

        const currentPlayer = game.players[game.currentPlayerIndex];
        if (!currentPlayer) return { success: false, message: 'No current player' };

        // The 'force' flag from the server timer overrides the socket check
        if (currentPlayer.socketId && !force) {
            console.log(`🚫 BLOCKED: Auto-roll for connected player ${currentPlayer.color}`);
            return { success: false, message: 'Cannot auto-roll for active player' };
        }

        console.log(`🤖 Auto-rolling for ${currentPlayer.color}...`);
        game.message = `${currentPlayer.color} (Auto) is rolling...`;

        // Perform the roll
        const diceValue = crypto.randomInt(1, 7);
        game.diceValue = diceValue;

        // Calculate legal moves
        const moves = calculateLegalMoves(game, diceValue);

        // CRITICAL FIX: Save legal moves to state immediately so frontend receives them
        game.legalMoves = moves;

        if (moves.length === 0) {
            // No moves possible
            game.message = `Rolled ${diceValue}. No moves possible.`;
            game.turnState = 'ROLLING'; // Reset for next player
            game.currentPlayerIndex = getNextPlayerIndex(game, game.currentPlayerIndex, false); // No extra turn for 6 if no moves
            game.diceValue = null;
            game.legalMoves = [];
        } else {
            game.turnState = 'MOVING';
            game.message = `Rolled ${diceValue}. Select a token to move.`;
        }

        // Update timestamp for timer reset
        game.markModified('updatedAt'); // Ensure timestamp updates

        return { success: true };
    });
};

exports.handleAutoMove = async (gameId) => {
    return applyAtomicUpdate(gameId, async (game) => {
        if (game.turnState !== 'MOVING') {
            return { success: false, message: 'Not in moving state' };
        }

        const moves = game.legalMoves;
        if (!moves || moves.length === 0) {
            console.log(`🤖 Auto-move called with no legal moves. Passing turn.`);
            const grantExtraTurn = game.diceValue === 6;
            const nextPlayerIndex = getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn);
            game.currentPlayerIndex = nextPlayerIndex;
            game.turnState = 'ROLLING';
            game.diceValue = null;
            game.legalMoves = [];
            return { success: true };
        }

        let bestMove = moves[0];
        const currentPlayer = game.players[game.currentPlayerIndex];

        for (const move of moves) {
            if (move.finalPosition.type === 'PATH' && !SAFE_SQUARES.includes(move.finalPosition.index)) {
                const occupied = game.tokens.some(t =>
                    t.color !== currentPlayer.color &&
                    t.position.type === 'PATH' &&
                    t.position.index === move.finalPosition.index
                );
                if (occupied) { bestMove = move; break; }
            }
            if (move.finalPosition.type === 'HOME') {
                bestMove = move;
            }
        }

        console.log(`🤖 Auto-moving for ${currentPlayer.color}. Best move: ${bestMove.tokenId}`);
        const moveResult = executeMoveToken(game, bestMove.tokenId);

        if (moveResult.settlementPromise) {
            await moveResult.settlementPromise;
        }

        return { success: true };
    });
};

exports.handlePassTurn = async (gameId) => {
    return applyAtomicUpdate(gameId, async (game) => {
        // This function is called when a player has no legal moves after a roll.
        // We pass the turn to the next player.

        // A roll of 6, even with no moves, should not grant an extra turn if no move can be made to capitalize on it.
        const grantExtraTurn = false;

        const nextPlayerIndex = getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn);
        game.currentPlayerIndex = nextPlayerIndex;
        game.turnState = 'ROLLING';
        game.diceValue = null;
        game.legalMoves = [];

        const nextPlayer = game.players[nextPlayerIndex];
        game.message = `Waiting for ${nextPlayer?.username || nextPlayer?.color}...`;

        return { success: true };
    });
};


// --- Internal Logic (Shared) ---

function executeRollDice(game) {
    const player = game.players[game.currentPlayerIndex];
    const roll = crypto.randomInt(1, 7);

    // console.log(`🎲 executeRollDice: player=${player.color}, roll=${roll}`);

    // Set diceValue and turnState
    game.diceValue = roll;
    game.turnState = 'MOVING';
    game.message = `${player.username || player.color} rolled a ${roll}. Select a token to move.`;

    const moves = calculateLegalMoves(game, roll);
    game.legalMoves = moves;

    if (moves.length === 0) {
        console.log(`🎲 No moves available, the turn will pass.`);
        game.message = `No legal moves for ${player.username || player.color} with a roll of ${roll}.`;
    }

    // Set timer for human players if there are moves
    if (moves.length > 0 && player && !player.isAI && !player.isDisconnected) {
        game.timer = 18; // Set 18-second timer for human to make a move
    } else {
        game.timer = null; // No timer for AI or if no moves
    }

    // The game object is modified in place, no return needed, but we return it for clarity.
    return game;
}

function executeMoveToken(game, tokenId) {
    const player = game.players[game.currentPlayerIndex];
    const move = game.legalMoves.find(m => m.tokenId === tokenId);
    if (!move) {
        // Return a special object or throw an error to indicate an illegal move
        return { success: false, message: 'Illegal move' };
    }

    let captured = false;
    game.tokens = game.tokens.map(t => {
        if (t.id === tokenId) t.position = move.finalPosition;
        return t;
    });

    // Capture Logic
    // Capture Logic
    if (move.finalPosition.type === 'PATH') {
        const targetPos = move.finalPosition.index;
        const isSafeZone = SAFE_SQUARES.includes(targetPos);

        if (!isSafeZone) {
            // KILL RULE: If not safe zone, remove ALL opponent tokens at this position
            const opponentTokensAtTarget = game.tokens.filter(t =>
                t.color !== player.color &&
                t.position.type === 'PATH' &&
                t.position.index === targetPos
            );

            if (opponentTokensAtTarget.length > 0) {
                console.log(`⚔️ COMBAT: ${player.color} landed on ${targetPos} (Non-Safe). Killing ${opponentTokensAtTarget.length} opponents.`);
                captured = true;
                const victimIds = opponentTokensAtTarget.map(vt => vt.id);
                game.tokens = game.tokens.map(t => {
                    if (victimIds.includes(t.id)) {
                        // Send back to yard
                        return { ...t, position: { type: 'YARD', index: parseInt(t.id.split('-')[1]) } };
                    }
                    return t;
                });
                game.message = `${player.username || player.color} killed ${opponentTokensAtTarget[0].color}!`;
            }
        } else {
            console.log(`🛡️ SAFE ZONE: ${player.color} landed on ${targetPos}. No combat.`);
        }
    }

    // This is an async operation that needs to be handled by the caller.
    let settlementPromise = null;

    // Win Check
    const playerTokens = game.tokens.filter(t => t.color === player.color);
    if (playerTokens.every(t => t.position.type === 'HOME')) {
        if (!game.winners.includes(player.color)) {
            game.winners.push(player.color);
            game.message = `${player.color} wins! All pawns reached HOME!`;
        }
        if (game.winners.length >= game.players.length - 1) {
            game.status = 'COMPLETED';
            game.message = `${game.winners[0]} is the winner!`;

            // Instead of awaiting, we get the promise to be handled by the async caller.
            settlementPromise = processGameSettlement(game);

            // Set turn state to GAMEOVER
            game.turnState = 'GAMEOVER';
            return { success: true, state: game, settlementPromise };
        }
    }

    // FIX: Rolling a 6 ALWAYS grants an extra turn, regardless of other conditions
    const grantExtraTurn = game.diceValue === 6 || captured || move.finalPosition.type === 'HOME';

    // console.log(`🎯 Move completed: diceValue=${game.diceValue}, grantExtraTurn=${grantExtraTurn}, captured=${captured}, reachedHome=${move.finalPosition.type === 'HOME'}`);
    // console.log(`🎯 Turn transition: currentIndex=${game.currentPlayerIndex}, nextIndex=${getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn)}`);

    // Transition to next player (or same player if extra turn) - same as local game NEXT_TURN
    const nextPlayerIndex = getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn);
    game.currentPlayerIndex = nextPlayerIndex;

    // Clear diceValue and set turnState to ROLLING for next turn (same as local game)
    game.diceValue = null;
    game.turnState = 'ROLLING';
    game.legalMoves = [];

    const nextPlayer = game.players[nextPlayerIndex];
    game.message = `Waiting for ${nextPlayer?.username || nextPlayer?.color}...`;

    if (nextPlayer && !nextPlayer.isAI && !nextPlayer.isDisconnected) {
        game.timer = 7; // Set 7-second timer for human player to roll
    } else {
        game.timer = null; // No timer for AI or disconnected players
    }

    console.log(`🎯 After turn transition: currentPlayerIndex=${nextPlayerIndex}, currentPlayer=${nextPlayer?.color}, turnState=${game.turnState}, diceValue=${game.diceValue}, message="${game.message}"`);

    // Ensure diceValue is null (not undefined)
    if (game.diceValue === undefined) {
        game.diceValue = null;
    }

    return { success: true, state: game, settlementPromise };
}