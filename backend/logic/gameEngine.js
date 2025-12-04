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
 * ✅ Capturing: Landing on single opponent pawn sends it back to Base
 * ✅ Safe blocks: 2+ opponent pawns form protective block (no capture, pawns coexist)
 * ✅ Safe squares: No captures on designated safe squares
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
// SAFE_SQUARES: Traditional safe zones only (removed home entrances 11, 24, 37, 50)`r`n// Home entrances now follow smart combat rules: single pawn = kill, 2+ pawns = coexist
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
const START_POSITIONS = { red: 39, green: 0, yellow: 13, blue: 26 };
const HOME_ENTRANCES = { red: 37, green: 50, yellow: 11, blue: 24 };

// --- Wallet Settlement Function ---
const processGameSettlement = async (game) => {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`💰 SETTLEMENT STARTED for game ${game.gameId}`);
        console.log(`${'='.repeat(80)}`);

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

        // STRICT VALIDATION: Get winner and verify identity
        const winnerColor = game.winners[0];
        const winnerPlayer = game.players.find(p => p.color === winnerColor);

        if (!winnerPlayer || !winnerPlayer.userId || winnerPlayer.isAI) {
            console.error(`🚨 PAYMENT BLOCKED: Invalid winner player for game ${game.gameId}`);
            return;
        }

        // CRITICAL: Verify winner actually has ALL 4 pawns in HOME before ANY payment
        const winnerTokens = game.tokens.filter(t => t.color === winnerColor);
        const allInHome = winnerTokens.length === 4 && winnerTokens.every(t => t.position.type === 'HOME');

        if (!allInHome) {
            console.error(`🚨 PAYMENT BLOCKED: Winner ${winnerColor} does not have all 4 pawns in HOME! Game ${game.gameId}`);
            console.error(`🚨 Winner tokens status:`, winnerTokens.map(t => ({ id: t.id, position: t.position })));
            return;
        }

        console.log(`✅ VALIDATION PASSED: Winner ${winnerColor} has all 4 pawns in HOME`);

        // STRICT VALIDATION: Get loser - must be different human player
        const loserPlayer = game.players.find(p =>
            p.userId &&
            !p.isAI &&
            p.userId !== winnerPlayer.userId &&
            p.color !== winnerColor
        );

        if (!loserPlayer || !loserPlayer.userId) {
            console.error(`🚨 PAYMENT BLOCKED: Invalid loser player for game ${game.gameId}`);
            return;
        }

        console.log(`💰 STRICT VALIDATION PASSED - Processing settlement for game ${game.gameId}:`);
        console.log(`   Winner: ${winnerPlayer.userId} (${winnerColor})`);
        console.log(`   Loser: ${loserPlayer.userId} (${loserPlayer.color})`);
        console.log(`   Stake: $${game.stake}`);

        // Fetch user documents using VALIDATED userIds
        const winner = await User.findById(winnerPlayer.userId);
        const loser = await User.findById(loserPlayer.userId);
        const stake = game.stake;

        // Final safety check: ensure we got the correct users
        if (!winner) {
            console.error(`🚨 PAYMENT BLOCKED: Winner user ${winnerPlayer.userId} not found in database`);
            return;
        }

        if (!loser) {
            console.error(`🚨 PAYMENT BLOCKED: Loser user ${loserPlayer.userId} not found in database`);
            return;
        }

        // ============================================================================
        // DETAILED PRE-SETTLEMENT AUDIT
        // ============================================================================
        console.log(`\n📊 PRE-SETTLEMENT BALANCES:`);
        console.log(`   Winner (${winner.username}):`);
        console.log(`      - Balance: $${winner.balance.toFixed(2)}`);
        console.log(`      - Reserved: $${winner.reservedBalance.toFixed(2)}`);
        console.log(`      - Total Available: $${(winner.balance).toFixed(2)}`);
        console.log(`   Loser (${loser.username}):`);
        console.log(`      - Balance: $${loser.balance.toFixed(2)}`);
        console.log(`      - Reserved: $${loser.reservedBalance.toFixed(2)}`);
        console.log(`      - Total Available: $${(loser.balance).toFixed(2)}`);

        // ============================================================================
        // SETTLEMENT CALCULATIONS
        // ============================================================================
        const totalPot = stake * 2;
        const commission = totalPot * 0.10;
        const winnings = totalPot - commission; // Winner gets 1.8 * stake
        const profit = winnings - stake; // Winner's net profit is 0.8 * stake

        console.log(`\n🧮 SETTLEMENT CALCULATIONS:`);
        console.log(`   Stake per player: $${stake.toFixed(2)}`);
        console.log(`   Total pot (stake × 2): $${totalPot.toFixed(2)}`);
        console.log(`   Commission (10%): $${commission.toFixed(2)}`);
        console.log(`   Winnings (pot - commission): $${winnings.toFixed(2)}`);
        console.log(`   Net profit (winnings - stake): $${profit.toFixed(2)}`);

        // ============================================================================
        // VALIDATION: Check reserved balance
        // ============================================================================
        if (winner.reservedBalance < stake) {
            console.error(`🚨 CRITICAL ERROR: Winner's reserved balance ($${winner.reservedBalance}) is less than stake ($${stake})!`);
            console.error(`   This should NEVER happen! Investigation required.`);
            // We'll continue but log this as critical
        }
        if (loser.reservedBalance < stake) {
            console.error(`🚨 CRITICAL ERROR: Loser's reserved balance ($${loser.reservedBalance}) is less than stake ($${stake})!`);
            console.error(`   This should NEVER happen! Investigation required.`);
        }

        // ============================================================================
        // PROCESS WINNER PAYOUT
        // ============================================================================
        console.log(`\n💰 PROCESSING WINNER PAYOUT:`);
        const winnerBalanceBefore = winner.balance;
        const winnerReservedBefore = winner.reservedBalance;

        winner.balance += winnings;
        winner.reservedBalance -= stake;

        console.log(`   Balance change: $${winnerBalanceBefore.toFixed(2)} + $${winnings.toFixed(2)} = $${winner.balance.toFixed(2)}`);
        console.log(`   Reserved change: $${winnerReservedBefore.toFixed(2)} - $${stake.toFixed(2)} = $${winner.reservedBalance.toFixed(2)}`);
        console.log(`   Net effect: +$${profit.toFixed(2)} (profit only, stake was already in reserved)`);

        if (!winner.stats) winner.stats = {};
        winner.stats.gamesPlayed = (winner.stats.gamesPlayed || 0) + 1;
        winner.stats.wins = (winner.stats.wins || 0) + 1;
        winner.stats.gamesWon = (winner.stats.gamesWon || 0) + 1;
        winner.stats.totalWinnings = (winner.stats.totalWinnings || 0) + profit;

        // Record TWO transactions for clarity
        winner.transactions.push({
            type: 'game_win',
            amount: profit,
            matchId: game.gameId,
            description: `Profit from winning game ${game.gameId} (Total pot: $${totalPot.toFixed(2)}, Commission: $${commission.toFixed(2)})`
        });
        winner.transactions.push({
            type: 'match_unstake',
            amount: stake,
            matchId: game.gameId,
            description: `Stake returned from winning game ${game.gameId}`
        });

        console.log(`   📝 Transactions recorded:`);
        console.log(`      1. game_win: +$${profit.toFixed(2)}`);
        console.log(`      2. match_unstake: +$${stake.toFixed(2)}`);
        console.log(`      Total shown in transactions: +$${(profit + stake).toFixed(2)}`);

        await winner.save();

        try {
            const revenue = new Revenue({
                gameId: game.gameId,
                amount: commission,
                totalPot: totalPot,
                winnerId: winner._id,
                timestamp: new Date(),
                reason: `Game ${game.gameId} completed - ${winner.username} won`,
                gameDetails: {
                    players: game.players.map(p => ({
                        userId: p.userId,
                        username: p.username || `Player ${p.color}`,
                        color: p.color
                    })),
                    winner: {
                        userId: winner._id,
                        username: winner.username,
                        color: game.players.find(p => p.userId === winner._id.toString())?.color || 'unknown'
                    },
                    stake: stake,
                    gameId: game.gameId
                }
            });
            await revenue.save();
            console.log(`   💵 Revenue recorded: $${commission.toFixed(2)} with game details`);
        } catch (revError) {
            console.error(`   ❌ Error recording revenue for game ${game.gameId}:`, revError);
        }

        // ============================================================================
        // PROCESS LOSER DEDUCTION
        // ============================================================================
        console.log(`\n💸 PROCESSING LOSER DEDUCTION:`);
        const loserBalanceBefore = loser.balance;
        const loserReservedBefore = loser.reservedBalance;

        loser.reservedBalance -= stake;

        console.log(`   Balance change: $${loserBalanceBefore.toFixed(2)} (no change - stake was in reserved)`);
        console.log(`   Reserved change: $${loserReservedBefore.toFixed(2)} - $${stake.toFixed(2)} = $${loser.reservedBalance.toFixed(2)}`);
        console.log(`   Net effect: -$${stake.toFixed(2)} (stake consumed from reserved)`);

        if (!loser.stats) loser.stats = {};
        loser.stats.gamesPlayed = (loser.stats.gamesPlayed || 0) + 1;
        loser.stats.gamesLost = (loser.stats.gamesLost || 0) + 1;
        loser.stats.totalLosses = (loser.stats.totalLosses || 0) + stake;

        loser.transactions.push({
            type: 'game_loss',
            amount: -stake,
            matchId: game.gameId,
            description: `Lost game ${game.gameId} - stake consumed`
        });

        console.log(`   📝 Transaction recorded: game_loss: -$${stake.toFixed(2)}`);

        await loser.save();

        game.settlementProcessed = true;
        game.message = `${winner.username} won $${profit.toFixed(2)} dollars`;

        // ============================================================================
        // POST-SETTLEMENT AUDIT
        // ============================================================================
        console.log(`\n📊 POST-SETTLEMENT BALANCES:`);
        console.log(`   Winner (${winner.username}):`);
        console.log(`      - Balance: $${winner.balance.toFixed(2)} (was $${winnerBalanceBefore.toFixed(2)})`);
        console.log(`      - Reserved: $${winner.reservedBalance.toFixed(2)} (was $${winnerReservedBefore.toFixed(2)})`);
        console.log(`      - Total Available: $${(winner.balance).toFixed(2)}`);
        console.log(`      - ✅ Net gain: +$${(winner.balance - winnerBalanceBefore).toFixed(2)}`);
        console.log(`   Loser (${loser.username}):`);
        console.log(`      - Balance: $${loser.balance.toFixed(2)} (was $${loserBalanceBefore.toFixed(2)})`);
        console.log(`      - Reserved: $${loser.reservedBalance.toFixed(2)} (was $${loserReservedBefore.toFixed(2)})`);
        console.log(`      - Total Available: $${(loser.balance).toFixed(2)}`);
        console.log(`      - ✅ Balance unchanged (stake was already reserved)`);

        console.log(`\n✅ SETTLEMENT COMPLETE FOR GAME ${game.gameId}`);
        console.log(`${'='.repeat(80)}\n`);

        // Return settlement data for win notification
        return {
            winnerId: winner._id.toString(),
            winnerUsername: winner.username,
            grossWin: totalPot,
            netAmount: winnings,
            commission: commission,
            stake: stake
        };
    } catch (error) {
        console.error(`❌ Error processing settlement for game ${game.gameId}:`, error);
        console.error(`Stack trace:`, error.stack);
        return null;
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
                console.log(`📋 Adding move: ${token.id} to PATH:${finalIndex}`);
                moves.push({ tokenId: token.id, finalPosition: { type: 'PATH', index: finalIndex } });
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

    // ATOMIC UPDATE: Replace game.save() with updateOne
    const playerIndex = game.players.findIndex(p => p.color === playerColor);
    if (playerIndex !== -1) {
        // Update existing player
        await Game.updateOne(
            { gameId, "players.color": playerColor },
            {
                $set: {
                    "players.$.socketId": socketId,
                    "players.$.username": username,
                    "players.$.isDisconnected": false,
                    message: `${username} reconnected!`
                }
            }
        );

        // Update in-memory object to return correct state
        game.players[playerIndex].socketId = socketId;
        game.players[playerIndex].username = username;
        game.players[playerIndex].isDisconnected = false;
        game.message = `${username} reconnected!`;
        console.log(`✅ Player ${userId} (${playerColor}) reconnected to game ${gameId} (Atomic Update)`);

    } else {
        // Add new player
        const newTokens = Array.from({ length: 4 }, (_, i) => ({
            id: `${playerColor}-${i}`,
            color: playerColor,
            position: { type: 'YARD', index: i }
        }));

        const newPlayer = {
            color: playerColor,
            userId,
            username,
            socketId,
            isAI: false,
            isDisconnected: false
        };

        if (game.isNew) {
            game.players.push(newPlayer);
            game.tokens.push(...newTokens);
            await game.save();
            console.log(`✅ Created new game ${gameId} with player ${userId} (${playerColor})`);
        } else {
            await Game.updateOne(
                { gameId },
                {
                    $push: {
                        players: newPlayer,
                        tokens: { $each: newTokens }
                    }
                }
            );

            // Update in-memory object
            game.players.push(newPlayer);
            game.tokens.push(...newTokens);
            console.log(`✅ Added new player ${userId} (${playerColor}) to game ${gameId} (Atomic Update)`);
        }
    }

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
            // ATOMIC UPDATE: Replace game.save()
            const disconnectMessage = `${player.username || player.color} disconnected. Bot taking over...`;

            await Game.updateOne(
                { gameId, "players.socketId": socketId },
                {
                    $set: {
                        "players.$.isDisconnected": true,
                        "players.$.socketId": null,
                        message: disconnectMessage
                    }
                }
            );

            // Update in-memory object
            player.isDisconnected = true;
            player.socketId = null;
            game.message = disconnectMessage;

            console.log(`[disconnect] Player ${player.color} in game ${gameId} marked as disconnected. (Atomic Update)`);

            return {
                state: game,
                isCurrentTurn: game.players[game.currentPlayerIndex].color === player.color
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

// --- Normal Gameplay (Human) ---

exports.handleRollDice = async (gameId, socketId) => {
    console.log(`🎲 handleRollDice called: gameId=${gameId}, socketId=${socketId}`);

    try {
        const game = await Game.findOne({ gameId });
        if (!game) {
            console.log(`❌ Game not found: ${gameId}`);
            return { success: false, message: 'Game not found' };
        }

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

        // --- Perform the roll and save the intermediate state ---
        executeRollDice(game); // Modifies 'game' in place. `diceValue` is now set.

        // ATOMIC UPDATE: Replace game.save()
        await Game.updateOne(
            { gameId },
            {
                $set: {
                    diceValue: game.diceValue,
                    turnState: game.turnState,
                    message: game.message,
                    legalMoves: game.legalMoves,
                    timer: game.timer,
                    lastEvent: game.lastEvent
                }
            }
        );

        const plainState = game.toObject ? game.toObject() : game;
        return { success: true, state: plainState };
    } catch (error) {
        console.error(`❌ Error in handleRollDice for game ${gameId}:`, error);
        return { success: false, message: error.message || 'Error rolling dice' };
    }
};

exports.handleMoveToken = async (gameId, socketId, tokenId) => {
    try {
        const game = await Game.findOne({ gameId });
        if (!game) return { success: false, message: 'Game not found' };

        const player = game.players[game.currentPlayerIndex];
        if (player.socketId !== socketId) return { success: false, message: 'Not your turn' };

        // Execute the move in memory
        const { success, state: updatedGameState, settlementPromise, message } = executeMoveToken(game, tokenId);

        if (!success) {
            return { success: false, message };
        }

        // If there's a settlement promise, await it and capture the data
        let settlementData = null;
        if (settlementPromise) {
            settlementData = await settlementPromise;
        }

        // Now, save the final state to the database
        // ATOMIC UPDATE: Replace game.save()
        await Game.updateOne(
            { gameId },
            {
                $set: {
                    tokens: updatedGameState.tokens,
                    turnState: updatedGameState.turnState,
                    currentPlayerIndex: updatedGameState.currentPlayerIndex,
                    diceValue: updatedGameState.diceValue,
                    legalMoves: updatedGameState.legalMoves,
                    message: updatedGameState.message,
                    timer: updatedGameState.timer,
                    winners: updatedGameState.winners,
                    status: updatedGameState.status,
                    settlementProcessed: updatedGameState.settlementProcessed,
                    lastEvent: updatedGameState.lastEvent
                }
            }
        );

        const plainState = updatedGameState.toObject ? updatedGameState.toObject() : updatedGameState;

        return { success: true, state: plainState, settlementData };
    } catch (error) {
        console.error(`❌ Error in handleMoveToken for game ${gameId}:`, error);
        return { success: false, message: error.message || 'Error moving token' };
    }
};

// --- Autopilot / Bot Logic ---

exports.handleAutoRoll = async (gameId, force = false) => {
    const game = await Game.findOne({ gameId });
    if (!game) return { success: false, message: 'Game not found' };

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return { success: false, message: 'No current player' };

    // The 'force' flag from the server timer overrides the socket check
    if (currentPlayer.socketId && !force) {
        console.log(`🚫 BLOCKED: Auto-roll for connected player ${currentPlayer.color}`);
        return { success: false, message: 'Cannot auto-roll for active player' };
    }

    if (game.turnState !== 'ROLLING') {
        return { success: false, message: 'Not in rolling state' };
    }

    console.log(`🤖 Auto-rolling for ${currentPlayer.color}...`);
    game.message = `${currentPlayer.color} (Auto) is rolling...`;

    // Perform the roll and calculate moves in memory
    executeRollDice(game); // Modifies 'game' in place

    // Save the state with the diceValue, so the frontend can animate it
    // ATOMIC UPDATE: Replace game.save()
    await Game.updateOne(
        { gameId },
        {
            $set: {
                diceValue: game.diceValue,
                turnState: game.turnState,
                message: game.message,
                legalMoves: game.legalMoves,
                timer: game.timer,
                lastEvent: game.lastEvent
            }
        }
    );

    return { success: true, state: game.toObject ? game.toObject() : game };
};

exports.handleAutoMove = async (gameId) => {
    const game = await Game.findOne({ gameId });
    if (!game) return { success: false, message: 'Game not found' };

    if (game.turnState !== 'MOVING') {
        return { success: false, message: 'Not in moving state' };
    }

    const moves = game.legalMoves;
    if (!moves || moves.length === 0) {
        // This case should ideally be handled by auto-passing the turn.
        // But if we get here, we pass the turn.
        console.log(`🤖 Auto-move called with no legal moves. Passing turn.`);
        const grantExtraTurn = game.diceValue === 6;
        const nextPlayerIndex = getNextPlayerIndex(game, game.currentPlayerIndex, grantExtraTurn);
        game.currentPlayerIndex = nextPlayerIndex;
        game.turnState = 'ROLLING';
        game.diceValue = null;
        game.legalMoves = [];

        // ATOMIC UPDATE: Replace game.save()
        await Game.updateOne(
            { gameId },
            {
                $set: {
                    currentPlayerIndex: game.currentPlayerIndex,
                    turnState: game.turnState,
                    diceValue: game.diceValue,
                    legalMoves: game.legalMoves
                }
            }
        );
        return { success: true, state: game.toObject ? game.toObject() : game };
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

    // ATOMIC UPDATE: Replace game.save()
    await Game.updateOne(
        { gameId },
        {
            $set: {
                tokens: game.tokens,
                turnState: game.turnState,
                currentPlayerIndex: game.currentPlayerIndex,
                diceValue: game.diceValue,
                legalMoves: game.legalMoves,
                message: game.message,
                timer: game.timer,
                winners: game.winners,
                status: game.status,
                settlementProcessed: game.settlementProcessed,
                lastEvent: game.lastEvent
            }
        }
    );

    return { success: true, state: game.toObject ? game.toObject() : game };
};

exports.handlePassTurn = async (gameId) => {
    const game = await Game.findOne({ gameId });
    if (!game) return { success: false, message: 'Game not found' };
    game.lastEvent = null;

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

    // ATOMIC UPDATE: Replace game.save()
    await Game.updateOne(
        { gameId },
        {
            $set: {
                currentPlayerIndex: game.currentPlayerIndex,
                turnState: game.turnState,
                diceValue: game.diceValue,
                legalMoves: game.legalMoves,
                message: game.message,
                lastEvent: game.lastEvent
            }
        }
    );
    return { success: true, state: game.toObject ? game.toObject() : game };
};


// --- Internal Logic (Shared) ---

function executeRollDice(game) {
    const player = game.players[game.currentPlayerIndex];
    const roll = crypto.randomInt(1, 7);
    game.lastEvent = null;

    console.log(`🎲 executeRollDice: player=${player.color}, roll=${roll}`);

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
    game.lastEvent = null; // Clear last event

    let captured = false;
    let killedTokenId = null; // Track killed token ID for audio

    // 🎯 ARROWS RULE: Check if pawn will land on special arrow squares BEFORE moving
    let arrowsTriggered = false;
    let actualFinalPosition = move.finalPosition; // Track actual position after potential teleport
    const ARROW_SQUARES = [4, 17, 30, 43]; // Absolute positions with arrow markers

    if (move.finalPosition.type === 'PATH' && ARROW_SQUARES.includes(move.finalPosition.index)) {
        // 🎯 Arrows Rule triggered! Jump to next square instead
        arrowsTriggered = true;
        const landedSquare = move.finalPosition.index;
        const newIndex = (landedSquare + 1) % 52;

        // Update the actual final position to the jumped position (5th square)
        actualFinalPosition = { type: 'PATH', index: newIndex };

        game.message = `🎯 Arrows Rule! ${player.username || player.color} landed on arrow square ${landedSquare}, jumps to ${newIndex} + EXTRA ROLL!`;
        console.log(`🎯 ARROWS RULE TRIGGERED: ${player.color} pawn ${tokenId} arrow square ${landedSquare} → jumping to ${newIndex}, granting extra turn`);
    }

    // 🏠 ENHANCED HOME ENTRY LOGGING - Debug "pawn straight to home" reports
    if (actualFinalPosition.type === 'HOME') {
        const movingToken = game.tokens.find(t => t.id === tokenId);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🏠 HOME ENTRY DETECTED`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   Token ID: ${tokenId}`);
        console.log(`   Player: ${player.username || player.color} (${player.color})`);
        console.log(`   Previous position:`, JSON.stringify(movingToken?.position));
        console.log(`   Dice value: ${game.diceValue}`);
        console.log(`   Move validated:`, JSON.stringify(move));
        console.log(`   Arrows triggered: ${arrowsTriggered}`);
        console.log(`${'='.repeat(60)}\n`);
    }

    // Now move the token ONCE to the ACTUAL final position (either normal or jumped)
    game.tokens = game.tokens.map(t => {
        if (t.id === tokenId) {
            t.position = actualFinalPosition;
        }
        return t;
    });

    // Capture Logic - NOW USES ACTUAL FINAL POSITION (after Arrows Rule teleport)
    if (actualFinalPosition.type === 'PATH' && !SAFE_SQUARES.includes(actualFinalPosition.index)) {
        const targetPos = actualFinalPosition.index;
        const opponentTokensAtTarget = game.tokens.filter(t =>
            t.color !== player.color &&
            t.position.type === 'PATH' &&
            t.position.index === targetPos
        );

        // ADD COMBAT BUG DEBUG LOGGING HERE
        console.log("=== COMBAT BUG DEBUG ===");
        console.log("Moving to:", targetPos);
        console.log("Is Safe Zone (from SAFE_SQUARES):", SAFE_SQUARES.includes(targetPos));
        const allOccupants = game.tokens.filter(t => t.position.type === 'PATH' && t.position.index === targetPos);
        console.log("Current Occupants (before potential kill):", allOccupants.map(o => ({ id: o.id, color: o.color, pos: o.position })));
        const hasOpponentOccupants = opponentTokensAtTarget.length > 0;
        console.log("Opponent Occupants (filtered for moving player):", opponentTokensAtTarget.map(o => ({ id: o.id, color: o.color })));
        console.log("Combat Should Trigger (conditions: !isSafeZone && hasOpponentOccupants):", !SAFE_SQUARES.includes(targetPos) && hasOpponentOccupants);
        console.log("--------------------------");


        // 🛡️ SAFE POSITION RULE: 2+ opponent pawns form a protective block (no capture)
        if (opponentTokensAtTarget.length === 1) {
            // ⚔️ Single opponent pawn - capture it!
            console.log(`⚔️ COMBAT: ${player.color} landed on ${targetPos} (Non-Safe). Capturing single opponent pawn.`);
            captured = true;
            game.lastEvent = 'CAPTURE';
            const victimToken = opponentTokensAtTarget[0];
            killedTokenId = victimToken.id; // Store for returning to caller
            game.tokens = game.tokens.map(t => {
                if (t.id === victimToken.id) {
                    // Send back to yard
                    return { ...t, position: { type: 'YARD', index: parseInt(t.id.split('-')[1]) } };
                }
                return t;
            });
            game.message = `⚔️ ${player.username || player.color} captured ${victimToken.color} pawn!`;
        } else if (opponentTokensAtTarget.length >= 2) {
            // 🛡️ Safe block - 2+ opponent pawns protect each other
            console.log(`🛡️ SAFE BLOCK: ${player.color} joined position ${targetPos} with ${opponentTokensAtTarget.length} opponent pawns. All pawns safe!`);
            const opponentColor = opponentTokensAtTarget[0].color;
            game.message = `🛡️ Safe position! ${player.username || player.color} joined the ${opponentColor} block`;
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
            const winnerColor = game.winners[0];
            const winnerPlayer = game.players.find(p => p.color === winnerColor);
            const winnerName = winnerPlayer ? (winnerPlayer.username || winnerPlayer.color) : winnerColor;
            const totalPot = (game.stake || 0) * game.players.length;
            const winnings = totalPot * 0.9;
            game.message = `Ciyaarta way dhamaatay, waxaana badiyay ${winnerName} wuxuuna ku guuleystay $${winnings} oo dollar`;

            // Instead of awaiting, we get the promise to be handled by the async caller.
            settlementPromise = processGameSettlement(game);

            // Set turn state to GAMEOVER
            game.turnState = 'GAMEOVER';
            return { success: true, state: game, settlementPromise, killedTokenId };
        }
    }

    const grantExtraTurn = game.diceValue === 6 || captured || move.finalPosition.type === 'HOME' || arrowsTriggered;

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

    return { success: true, state: game, settlementPromise, killedTokenId };
}
