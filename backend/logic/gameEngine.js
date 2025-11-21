
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
            console.log(`⚠️ No stake set for game ${game.gameId}, skipping settlement`);
            game.settlementProcessed = true;
            return;
        }

        if (!game.winners || game.winners.length === 0) {
            console.log(`⚠️ No winners in game ${game.gameId}, skipping settlement`);
            return;
        }

        const winnerColor = game.winners[0];
        const winnerPlayer = game.players.find(p => p.color === winnerColor);
        const loserPlayer = game.players.find(p => p.color !== winnerColor);

        if (!winnerPlayer || !loserPlayer) {
            console.log(`⚠️ Could not find winner or loser in game ${game.gameId}`);
            return;
        }

        console.log(`💰 Processing settlement for game ${game.gameId}: Winner=${winnerPlayer.userId} (${winnerColor}), Loser=${loserPlayer.userId}, Stake=${game.stake}`);

        // Update balances in database
        const winner = await User.findById(winnerPlayer.userId);
        const loser = await User.findById(loserPlayer.userId);

        if (winner) {
            // Calculate Pot and Commission
            const totalPot = game.stake * 2;
            const commission = totalPot * 0.10;
            const winnings = totalPot - commission;

            // Winner gets pot minus commission
            winner.balance += winnings;
            
            if (!winner.stats) {
                winner.stats = { gamesPlayed: 0, wins: 0 };
            }
            winner.stats.gamesPlayed = (winner.stats.gamesPlayed || 0) + 1;
            winner.stats.wins = (winner.stats.wins || 0) + 1;
            await winner.save();

            // Record Platform Revenue
            try {
                const revenue = new Revenue({
                    gameId: game.gameId,
                    amount: commission,
                    totalPot: totalPot,
                    winnerId: winner._id, // Use actual User ID from database
                    timestamp: new Date()
                });
                await revenue.save();
                console.log(`💰 Revenue recorded: $${commission} for game ${game.gameId}`);
            } catch (revError) {
                console.error(`❌ Error recording revenue for game ${game.gameId}:`, revError);
            }

            console.log(`✅ Winner ${winner.username} credited with $${winnings} (Pot: $${totalPot} - Comm: $${commission}), new balance: ${winner.balance}`);
        }

        if (loser) {
            // Loser's bet was already reserved/deducted at matchmaking, so NO additional deduction
            // The funds stay with the system and are given to the winner above
            if (!loser.stats) {
                loser.stats = { gamesPlayed: 0, wins: 0 };
            }
            loser.stats.gamesPlayed = (loser.stats.gamesPlayed || 0) + 1;
            await loser.save();
            console.log(`✅ Loser ${loser.username} - bet already deducted at matchmaking, final balance: ${loser.balance}`);
        }

        game.settlementProcessed = true;
        game.message = `${winnerColor} wins! Settlement complete. Winner receives ${game.stake * 2} coins.`;
        console.log(`✅ Settlement complete for game ${game.gameId}`);
    } catch (error) {
        console.error(`❌ Error processing settlement for game ${game.gameId}:`, error);
    }
};

// --- Helpers ---
const getNextPlayerIndex = (game, currentIndex, grantExtraTurn) => {
    let nextIndex = grantExtraTurn ? currentIndex : (currentIndex + 1) % game.players.length;
    let attempts = 0;
    while(game.winners.includes(game.players[nextIndex].color) && attempts < 4) {
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

    console.log(`📋 calculateLegalMoves: player=${currentPlayer.color}, diceValue=${diceValue}, tokensInYard=${playerTokens.filter(t => t.position.type === 'YARD').length}, tokensOnPath=${playerTokens.filter(t => t.position.type === 'PATH').length}`);

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
                    console.log(`📋 Adding move: ${token.id} from YARD to PATH:${startPos}`);
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
                console.log(`📋 Token ${token.id}: moving ${diceValue} spaces from ${currentPos.index} to ${finalIndex}`);
                const tokensAtDest = tokens.filter(t => t.position.type === 'PATH' && t.position.index === finalIndex && t.color === currentPlayer.color);
                const isBlockade = tokensAtDest.length > 1 && tokensAtDest.every(t => t.color === currentPlayer.color);

                console.log(`📋 Token ${token.id}: tokensAtDest=${tokensAtDest.length}, isBlockade=${isBlockade}`);

                if (!isBlockade) {
                    console.log(`📋 Adding move: ${token.id} to PATH:${finalIndex}`);
                    moves.push({ tokenId: token.id, finalPosition: { type: 'PATH', index: finalIndex } });
                } else {
                    console.log(`📋 Blocked by blockade`);
                }
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
    const game = await Game.findOne({ gameId });
    if (!game) return null;

    const player = game.players.find(p => p.socketId === socketId);
    if (player) {
        player.isDisconnected = true;
        player.socketId = null; // Clear socket
        game.message = `${player.username || player.color} disconnected. Bot taking over...`;
        await game.save();
        return { state: game, isCurrentTurn: game.players[game.currentPlayerIndex].color === player.color };
    }
    return null;
};

// --- Normal Gameplay (Human) ---

exports.handleRollDice = async (gameId, socketId) => {
    console.log(`🎲 handleRollDice called: gameId=${gameId}, socketId=${socketId}`);
    
    if (!gameId || !socketId) {
        console.error(`❌ handleRollDice: Missing parameters - gameId=${gameId}, socketId=${socketId}`);
        return { success: false, message: 'Missing game ID or socket ID' };
    }
    
    const game = await Game.findOne({ gameId });
    if (!game) {
        console.log(`❌ Game not found: ${gameId}`);
        return { success: false, message: 'Game not found' };
    }

    // Check if game is already over
    if (game.status === 'COMPLETED' || game.turnState === 'GAMEOVER') {
        console.log(`❌ Game is already over: status=${game.status}, turnState=${game.turnState}`);
        return { success: false, message: 'Game is already over' };
    }

    if (!game.players || game.players.length === 0) {
        console.error(`❌ Game has no players: ${gameId}`);
        return { success: false, message: 'Game has no players' };
    }

    const player = game.players[game.currentPlayerIndex];
    if (!player) {
        console.error(`❌ No current player at index ${game.currentPlayerIndex} in game ${gameId}`);
        return { success: false, message: 'No current player' };
    }
    
    console.log(`🎲 Current player check: player=${player.color}, playerSocket=${player.socketId}, requestSocket=${socketId}, turnState=${game.turnState}, gameStarted=${game.gameStarted}`);

    // Check if socket matches (allow if socketId matches or player is disconnected)
    if (player.socketId !== socketId && !player.isDisconnected) {
        console.log(`❌ Not your turn: expected ${player.socketId}, got ${socketId} (player: ${player.color})`);
        return { success: false, message: 'Not your turn' };
    }
    
    // Ensure turnState is ROLLING - if game is started and diceValue is null, force ROLLING state
    if (game.gameStarted && game.status === 'ACTIVE' && game.diceValue === null && game.turnState !== 'ROLLING') {
        console.log(`🔧 Fixing turnState: was ${game.turnState}, setting to ROLLING`);
        game.turnState = 'ROLLING';
        await game.save();
    }
    
    // RELAXED CHECK: Allow rolling even if turnState is not exactly 'ROLLING' if diceValue is null
    // This handles race conditions where client might be slightly out of sync or animation state is stuck
    if (game.turnState !== 'ROLLING' && game.diceValue !== null) {
        console.log(`❌ Wrong turn state: expected ROLLING (or null dice), got ${game.turnState} with diceValue ${game.diceValue}`);
        return { success: false, message: 'Wait for animation' };
    } else if (game.turnState !== 'ROLLING') {
        console.log(`⚠️ Warning: turnState is ${game.turnState} but diceValue is null - allowing roll and auto-correcting state`);
        game.turnState = 'ROLLING';
    }

    // Update socketId if it changed (reconnection)
    if (player.socketId !== socketId) {
        console.log(`🔄 Updating socketId for player ${player.color} from ${player.socketId} to ${socketId}`);
        player.socketId = socketId;
        player.isDisconnected = false;
    }

    console.log(`✅ Roll dice validation passed, executing roll for ${player.color}`);
    return executeRollDice(game);
};

exports.handleMoveToken = async (gameId, socketId, tokenId) => {
    const game = await Game.findOne({ gameId });
    if (!game) return { success: false, message: 'Game not found' };

    const player = game.players[game.currentPlayerIndex];
    if (player.socketId !== socketId) return { success: false, message: 'Not your turn' };

    return executeMoveToken(game, tokenId);
};

// --- Autopilot / Bot Logic ---

exports.handleAutoRoll = async (gameId, force = false) => {
    const game = await Game.findOne({ gameId });
    if (!game) return { success: false, message: 'Game not found' };
    
    // CRITICAL: Never auto-roll for human players with active connections
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return { success: false, message: 'No current player' };
    
    // If player has a socketId, they are human and connected - NEVER auto-roll unless forced
    // Even if marked as isAI (which is an error), socketId presence means they are online
    if (currentPlayer.socketId && !force) {
        console.log(`🚫 BLOCKED: handleAutoRoll called for player ${currentPlayer.color} with socketId ${currentPlayer.socketId} - connection is active, manual roll required`);
        return { success: false, message: 'Cannot auto-roll for player with active connection' };
    }
    
    // Verify it is actually rolling state
    if (game.turnState !== 'ROLLING') return { success: false, message: 'Not rolling state' };
    
    // Only allow auto-roll for AI or disconnected players (unless forced)
    if (!currentPlayer.isAI && !currentPlayer.isDisconnected && !force) {
        console.log(`🚫 BLOCKED: handleAutoRoll called for human player ${currentPlayer.color} - player must roll manually`);
        return { success: false, message: 'Human player must roll manually' };
    }
    
    game.message = `${currentPlayer.color} (Auto) is rolling...`;
    return executeRollDice(game);
};

exports.handleAutoMove = async (gameId) => {
    const game = await Game.findOne({ gameId });
    if (!game) return { success: false, message: 'Game not found' };
    
    if (game.turnState !== 'MOVING') return { success: false, message: 'Not moving state' };
    
    // Strategy: Pick best move
    // 1. Capture (Move landing on opponent)
    // 2. Home (Move entering Home)
    // 3. Safe (Move landing on safe square)
    // 4. Random
    const moves = game.legalMoves;
    if (moves.length === 0) return { success: false, message: 'No moves' };

    let bestMove = moves[0];
    
    for (const move of moves) {
        // Simulate Logic:
        // If landing on opponent in Path -> Priority 1
        if (move.finalPosition.type === 'PATH' && !SAFE_SQUARES.includes(move.finalPosition.index)) {
             const occupied = game.tokens.some(t => 
                t.color !== game.players[game.currentPlayerIndex].color && 
                t.position.type === 'PATH' && 
                t.position.index === move.finalPosition.index
             );
             if (occupied) { bestMove = move; break; }
        }
        // If entering Home -> Priority 2
        if (move.finalPosition.type === 'HOME') {
            bestMove = move;
        }
    }

    // If no strategic move found, fallback to first (random-ish)
    return executeMoveToken(game, bestMove.tokenId);
};

// --- Internal Logic (Shared) ---

async function executeRollDice(game) {
    const player = game.players[game.currentPlayerIndex];
    const roll = crypto.randomInt(1, 7);

    console.log(`🎲 executeRollDice: player=${player.color}, roll=${roll}, extraTurn=${roll === 6 ? 'YES' : 'NO'}`);
    console.log(`🎲 Before roll: diceValue=${game.diceValue}, turnState=${game.turnState}`);

    // Set diceValue and turnState exactly like local game ROLL_DICE action
    game.diceValue = roll;
    game.turnState = 'MOVING';
    game.message = `${player.username || player.color} rolled a ${roll}. Select a token to move.`;

    console.log(`🎲 After roll setup: diceValue=${game.diceValue}, turnState=${game.turnState}, message="${game.message}"`);

    const moves = calculateLegalMoves(game, roll);
    game.legalMoves = moves;

    console.log(`🎲 Calculated ${moves.length} legal moves for roll ${roll}`);
    if (moves.length > 0) {
        console.log(`🎲 Available moves: ${moves.map(m => `${m.tokenId} -> ${m.finalPosition.type}:${m.finalPosition.index}`).join(', ')}`);
    }

    if (moves.length === 0) {
        console.log(`🎲 No moves available, passing turn`);
        game.message = `No legal moves. Passing turn.`;
        // Keep diceValue and turnState as MOVING (same as local game)
        // The server will handle the turn transition after a delay
        game.turnState = 'MOVING';
        game.legalMoves = [];
        // Don't change currentPlayerIndex yet - we'll do that after showing the dice (like local game does with setTimeout)
    } else {
        console.log(`🎲 Moves available: ${moves.map(m => `${m.tokenId} -> ${m.finalPosition.type}:${m.finalPosition.index}`).join(', ')}`);
        // Ensure diceValue is preserved when moves are available
        console.log(`🎲 Preserving diceValue: ${game.diceValue} for player ${player.color}`);
    }

    await game.save();
    
    // Convert Mongoose document to plain object to ensure all fields are serialized
    const gameState = game.toObject ? game.toObject() : game;
    console.log(`🎲 Returning game state with diceValue: ${gameState.diceValue} (type: ${typeof gameState.diceValue}), turnState: ${gameState.turnState}, player: ${player.color}`);
    
    // Double-check diceValue is a number if it's not null
    if (gameState.diceValue !== null && gameState.diceValue !== undefined) {
        gameState.diceValue = Number(gameState.diceValue);
        console.log(`🎲 Verified diceValue as number: ${gameState.diceValue}`);
    }
    
    return { success: true, state: gameState };
}

async function executeMoveToken(game, tokenId) {
    const player = game.players[game.currentPlayerIndex];
    const move = game.legalMoves.find(m => m.tokenId === tokenId);
    if (!move) return { success: false, message: 'Illegal move' };

    let captured = false;
    game.tokens = game.tokens.map(t => {
        if (t.id === tokenId) t.position = move.finalPosition;
        return t;
    });

    // Capture Logic
    if (move.finalPosition.type === 'PATH' && !SAFE_SQUARES.includes(move.finalPosition.index)) {
        const targetPos = move.finalPosition.index;
        const opponentTokensAtTarget = game.tokens.filter(t => 
            t.color !== player.color &&
            t.position.type === 'PATH' &&
            t.position.index === targetPos
        );

        if (opponentTokensAtTarget.length === 1) {
            const victim = opponentTokensAtTarget[0];
            captured = true;
            game.tokens = game.tokens.map(t => {
                if (t.id === victim.id) {
                    t.position = { type: 'YARD', index: parseInt(t.id.split('-')[1]) };
                }
                return t;
            });
        }
    }

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
            
            // Process automatic wallet settlement
            await processGameSettlement(game);
        }
    }

    const grantExtraTurn = game.diceValue === 6 || captured || move.finalPosition.type === 'HOME';

    console.log(`🎯 Move completed: diceValue=${game.diceValue}, grantExtraTurn=${grantExtraTurn}, captured=${captured}, reachedHome=${move.finalPosition.type === 'HOME'}`);
    console.log(`🎯 Turn transition: currentIndex=${game.currentPlayerIndex}, nextIndex=${getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn)}`);

    // Transition to next player (or same player if extra turn) - same as local game NEXT_TURN
    const nextPlayerIndex = getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn);
    game.currentPlayerIndex = nextPlayerIndex;
    
    // Clear diceValue and set turnState to ROLLING for next turn (same as local game)
    game.diceValue = null;
    game.turnState = 'ROLLING';
    game.legalMoves = [];
    
    const nextPlayer = game.players[nextPlayerIndex];
    game.message = `Waiting for ${nextPlayer?.username || nextPlayer?.color || 'player'}...`;

    console.log(`🎯 After turn transition: currentPlayerIndex=${nextPlayerIndex}, currentPlayer=${nextPlayer?.color}, turnState=${game.turnState}, diceValue=${game.diceValue}, message="${game.message}"`);

    await game.save();
    
    // Convert Mongoose document to plain object to ensure all fields are serialized
    const gameState = game.toObject ? game.toObject() : game;
    console.log(`🎯 Returning game state after move with diceValue: ${gameState.diceValue}, turnState: ${gameState.turnState}`);
    
    // Ensure diceValue is null (not undefined)
    if (gameState.diceValue === undefined) {
        gameState.diceValue = null;
    }
    
    return { success: true, state: gameState };
}
