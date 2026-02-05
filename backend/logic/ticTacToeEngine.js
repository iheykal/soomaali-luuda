/**
 * TIC-TAC-TOE GAME ENGINE
 * 
 * FEATURES:
 * ✅ Two-player matchmaking
 * ✅ Server-side game validation
 * ✅ Win detection (rows, columns, diagonals)
 * ✅ Draw detection
 * ✅ Automatic settlement with 10% rake
 * ✅ Disconnection handling with simple AI
 * ✅ Revenue tracking
 */

const TicTacToeGame = require('../models/TicTacToeGame');
const User = require('../models/User');
const Revenue = require('../models/Revenue');

// --- Constants ---
const WINNING_COMBINATIONS = [
    // Rows
    [[0, 0], [0, 1], [0, 2]],
    [[1, 0], [1, 1], [1, 2]],
    [[2, 0], [2, 1], [2, 2]],
    // Columns
    [[0, 0], [1, 0], [2, 0]],
    [[0, 1], [1, 1], [2, 1]],
    [[0, 2], [1, 2], [2, 2]],
    // Diagonals
    [[0, 0], [1, 1], [2, 2]],
    [[0, 2], [1, 1], [2, 0]]
];

// --- Three Men's Morris Helper Functions ---
/**
 * Check if two cells are adjacent (horizontally or vertically or diagonal through center)
 */
function isAdjacent(from, to) {
    const [r1, c1] = from;
    const [r2, c2] = to;

    // Horizontal/vertical adjacent
    if (r1 === r2 && Math.abs(c1 - c2) === 1) return true;
    if (c1 === c2 && Math.abs(r1 - r2) === 1) return true;

    // Diagonal through center
    if (r1 === 1 && c1 === 1) {
        // From center to corners
        if ((r2 === 0 || r2 === 2) && (c2 === 0 || c2 === 2)) return true;
    }
    if (r2 === 1 && c2 === 1) {
        // From corners to center
        if ((r1 === 0 || r1 === 2) && (c1 === 0 || c1 === 2)) return true;
    }

    return false;
}

/**
 * Get all adjacent empty cells for a position
 */
function getAdjacentCells(board, row, col) {
    const adjacent = [];
    const directions = [
        [-1, 0], // up
        [1, 0],  // down
        [0, -1], // left
        [0, 1],  // right
        // Diagonals (will process logic inside loop)
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;

        if (newRow >= 0 && newRow < 3 && newCol >= 0 && newCol < 3) {
            // Check if it's a valid adjacency (grid + diagonals limit)
            if (isAdjacent([row, col], [newRow, newCol])) {
                if (board[newRow][newCol] === '') {
                    adjacent.push([newRow, newCol]);
                }
            }
        }
    }

    return adjacent;
}

/**
 * Count pieces for each player
 */
function countPieces(board) {
    let xCount = 0;
    let oCount = 0;

    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            if (board[r][c] === 'X') xCount++;
            if (board[r][c] === 'O') oCount++;
        }
    }

    return { X: xCount, O: oCount };
}


// --- Wallet Settlement Function ---
const processGameSettlement = async (gameObj) => {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`💰 TIC-TAC-TOE SETTLEMENT STARTED for game ${gameObj.gameId}`);
        console.log(`${'='.repeat(80)}`);

        // ATOMIC LOCK: Try to set settlementProcessed to true ONLY IF it is currently false
        const game = await TicTacToeGame.findOneAndUpdate(
            {
                _id: gameObj._id,
                $or: [
                    { settlementProcessed: false },
                    { settlementProcessed: { $exists: false } }
                ]
            },
            { $set: { settlementProcessed: true } },
            { new: true }
        );

        if (!game) {
            console.log(`⚠️ Settlement ALREADY processed for game ${gameObj.gameId} (Atomic Lock Rejection)`);
            return null;
        }

        console.log(`✅ ATOMIC LOCK ACQUIRED: Proceeding with settlement for game ${game.gameId}`);

        if (!game.stake || game.stake <= 0) {
            console.log(`⚠️ No stake set for game ${game.gameId}, skipping settlement.`);
            return;
        }

        if (!game.winner || game.winner === 'DRAW') {
            console.log(`⚠️ No winner (draw or null) in game ${game.gameId}, skipping settlement`);
            return;
        }

        // Get winner and loser
        const winnerPlayer = game.players.find(p => p.userId === game.winner);
        const loserPlayer = game.players.find(p => p.userId !== game.winner);

        if (!winnerPlayer || !winnerPlayer.userId || !loserPlayer || !loserPlayer.userId) {
            console.error(`🚨 PAYMENT BLOCKED: Invalid winner/loser for game ${game.gameId}`);
            return;
        }

        console.log(`💰 VALIDATION PASSED - Processing settlement for game ${game.gameId}:`);
        console.log(`   Winner: ${winnerPlayer.userId} (${winnerPlayer.symbol})`);
        console.log(`   Loser: ${loserPlayer.userId} (${loserPlayer.symbol})`);
        console.log(`   Stake: $${game.stake}`);

        // Fetch user documents
        const winner = await User.findById(winnerPlayer.userId);
        const loser = await User.findById(loserPlayer.userId);
        const stake = game.stake; // $0.05

        if (!winner) {
            console.error(`🚨 PAYMENT BLOCKED: Winner user ${winnerPlayer.userId} not found in database`);
            return;
        }

        if (!loser) {
            console.error(`🚨 PAYMENT BLOCKED: Loser user ${loserPlayer.userId} not found in database`);
            return;
        }

        // ============================================================================
        // SETTLEMENT CALCULATIONS
        // ============================================================================
        // ============================================================================
        // SETTLEMENT CALCULATIONS
        // ============================================================================
        const totalPot = Number((stake * 2).toFixed(2));          // $0.10
        const commission = Number((totalPot * 0.10).toFixed(2));   // $0.01
        const winnings = Number((totalPot - commission).toFixed(2)); // $0.09
        const profit = Number((winnings - stake).toFixed(2));      // $0.04

        console.log(`\n🧮 SETTLEMENT CALCULATIONS (DEBUG):`);
        console.log(`   Stake Input: ${stake} (Type: ${typeof stake})`);
        console.log(`   Total Pot: ${totalPot}`);
        console.log(`   Commission: ${commission}`);
        console.log(`   Winnings (To Add): ${winnings}`);
        console.log(`   Profit (Net): ${profit}`);

        // ============================================================================
        // VALIDATION: Check reserved balance
        // ============================================================================
        if (winner.reservedBalance < stake) {
            console.error(`🚨 CRITICAL ERROR: Winner's reserved balance ($${winner.reservedBalance}) is less than stake ($${stake})!`);
        }
        if (loser.reservedBalance < stake) {
            console.error(`🚨 CRITICAL ERROR: Loser's reserved balance ($${loser.reservedBalance}) is less than stake ($${stake})!`);
        }

        // ============================================================================
        // PROCESS WINNER PAYOUT (ATOMIC UPDATE)
        // ============================================================================
        console.log(`\n💰 PROCESSING WINNER PAYOUT (ATOMIC):`);
        console.log(`   BEFORE UPDATE - Winner Balance: $${winner.balance}, Reserved: $${winner.reservedBalance}`);

        const winnerUpdate = {
            $inc: {
                balance: winnings,
                "stats.ticTacToe.gamesPlayed": 1,
                "stats.ticTacToe.wins": 1,
                "stats.gamesPlayed": 1,
                "stats.wins": 1,
                reservedBalance: -stake,
                xp: 50
            },
            $push: {
                transactions: {
                    $each: [
                        {
                            type: 'game_win',
                            amount: profit,
                            matchId: game.gameId,
                            description: `JAR win (Pot: $${totalPot.toFixed(2)}, Rake: $${commission.toFixed(2)})`,
                            timestamp: new Date()
                        },
                        {
                            type: 'match_unstake',
                            amount: stake,
                            matchId: game.gameId,
                            description: `Stake returned from JAR game ${game.gameId}`,
                            timestamp: new Date()
                        }
                    ]
                }
            }
        };

        console.log(`   UPDATE OPERATION: balance +$${winnings}, reservedBalance -$${stake}`);
        const winnerResult = await User.updateOne({ _id: winner._id }, winnerUpdate);

        if (winnerResult.modifiedCount !== 1) {
            console.error(`🚨 CRITICAL: Atomic update failed for winner ${winner._id}. Manual check required.`);
        } else {
            // Fetch updated winner to verify
            const updatedWinner = await User.findById(winner._id);
            console.log(`✅ ATOMIC PAYOUT SUCCESS: +$${winnings.toFixed(2)} added to user ${winner._id}`);
            console.log(`   AFTER UPDATE - Winner Balance: $${updatedWinner.balance}, Reserved: $${updatedWinner.reservedBalance}`);
            console.log(`   EXPECTED - Balance: $${winner.balance + winnings}, Reserved: $${winner.reservedBalance - stake}`);
        }

        // ============================================================================
        // RECORD REVENUE
        // ============================================================================
        try {
            const revenue = new Revenue({
                gameId: game.gameId,
                gameType: 'TIC_TAC_TOE',
                amount: commission,
                gemRevenue: 0, // Tic-tac-toe doesn't have gem re-rolls
                totalPot: totalPot,
                winnerId: winner._id,
                timestamp: new Date(),
                reason: `JAR game ${game.gameId} - ${winner.username} won`,
                gameDetails: {
                    players: game.players.map(p => ({
                        userId: p.userId,
                        username: p.username || `Player ${p.symbol}`,
                        color: p.symbol // Use symbol instead of color for tic-tac-toe
                    })),
                    winner: {
                        userId: winner._id,
                        username: winner.username,
                        color: winnerPlayer.symbol
                    },
                    stake: stake,
                    gameId: game.gameId
                }
            });
            await revenue.save();
            console.log(`   💵 Revenue recorded: Rake=$${commission.toFixed(2)} for tic-tac-toe`);
        } catch (revError) {
            console.error(`   ❌ Error recording revenue for game ${game.gameId}:`, revError);
        }

        // ============================================================================
        // PROCESS LOSER DEDUCTION (ATOMIC UPDATE)
        // ============================================================================
        console.log(`\n💸 PROCESSING LOSER DEDUCTION (ATOMIC):`);

        const loserUpdate = {
            $inc: {
                "stats.ticTacToe.gamesPlayed": 1,
                "stats.ticTacToe.losses": 1,
                "stats.gamesPlayed": 1,
                reservedBalance: -stake,
                xp: 10
            },
            $push: {
                transactions: {
                    type: 'game_loss',
                    amount: -stake,
                    matchId: game.gameId,
                    description: `Lost JAR game ${game.gameId}`,
                    timestamp: new Date()
                }
            }
        };

        const loserResult = await User.updateOne({ _id: loser._id }, loserUpdate);

        if (loserResult.modifiedCount !== 1) {
            console.error(`🚨 CRITICAL: Atomic update failed for loser ${loser._id}`);
        } else {
            console.log(`✅ ATOMIC DEDUCTION SUCCESS: Stake consumed for user ${loser._id}`);
        }

        // Update game message
        game.message = `${winner.username} won $${winnings.toFixed(2)} (net +$${profit.toFixed(2)})`;
        await TicTacToeGame.updateOne({ _id: game._id }, { $set: { message: game.message } });

        console.log(`\n✅ TIC-TAC-TOE SETTLEMENT COMPLETE FOR GAME ${game.gameId}`);
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
        console.error(`❌ Error processing tic-tac-toe settlement for game ${gameObj.gameId}:`, error);
        console.error(`Stack trace:`, error.stack);
        return null;
    }
};

// --- Game Refund Function (for draws) ---
const processGameRefund = async (gameId) => {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 TIC-TAC-TOE REFUND STARTED for game ${gameId}`);
        console.log(`${'='.repeat(80)}`);

        const game = await TicTacToeGame.findOneAndUpdate(
            {
                gameId: gameId,
                $or: [
                    { settlementProcessed: false },
                    { settlementProcessed: { $exists: false } }
                ]
            },
            {
                $set: {
                    settlementProcessed: true,
                    status: 'COMPLETED',
                    message: 'Game ended in a draw. Stake refunded to all players.'
                }
            },
            { new: true }
        );

        if (!game) {
            console.log(`⚠️ Refund ALREADY processed for game ${gameId}`);
            return { success: false, message: 'Already processed' };
        }

        if (!game.stake || game.stake <= 0) {
            console.log(`⚠️ No stake to refund for game ${gameId}`);
            return { success: true, message: 'No stake to refund' };
        }

        const stake = game.stake;
        console.log(`💰 Processing refunds for draw. Stake per player: $${stake.toFixed(2)}`);

        for (const player of game.players) {
            if (player.userId) {
                try {
                    const user = await User.findOneAndUpdate(
                        { _id: player.userId },
                        {
                            $inc: {
                                balance: stake,
                                reservedBalance: -stake,
                                "stats.ticTacToe.draws": 1
                            },
                            $push: {
                                transactions: {
                                    type: 'refund',
                                    amount: stake,
                                    matchId: gameId,
                                    description: `Refund for draw in JAR game ${gameId}`,
                                    timestamp: new Date()
                                }
                            }
                        },
                        { new: true }
                    );

                    if (user) {
                        console.log(`   ✅ Atomic Refund: $${stake.toFixed(2)} to ${user.username || player.symbol}`);
                    } else {
                        console.error(`   🚨 User not found for refund: ${player.userId}`);
                    }
                } catch (err) {
                    console.error(`   ❌ Failed to process refund for player ${player.userId}:`, err);
                }
            }
        }

        console.log(`✅ REFUND COMPLETED for tic-tac-toe game ${gameId}`);
        return { success: true, message: 'Refund completed' };

    } catch (error) {
        console.error(`❌ CRITICAL ERROR in refund for game ${gameId}:`, error);
        return { success: false, message: error.message };
    }
};

// --- Helpers ---

/**
 * Check for winner on the board
 * @returns {Object|null} { symbol: 'X' or 'O', line: [positions] } or null
 */
const checkWinner = (board) => {
    for (const combo of WINNING_COMBINATIONS) {
        const [[r1, c1], [r2, c2], [r3, c3]] = combo;
        const val = board[r1][c1];

        if (val && val === board[r2][c2] && val === board[r3][c3]) {
            return {
                symbol: val,
                line: combo
            };
        }
    }
    return null;
};

/**
 * Check if board is full (draw)
 */
const isBoardFull = (board) => {
    return board.every(row => row.every(cell => cell !== ''));
};

/**
 * Get valid moves (empty cells)
 */
const getValidMoves = (board) => {
    const moves = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (board[row][col] === '') {
                moves.push({ row, col });
            }
        }
    }
    return moves;
};

// --- Game Handlers ---

/**
 * Create a new game with matched players
 */
exports.createGame = async (gameId, players, stakeRaw) => {
    const stake = Number(stakeRaw);
    const successfulDeductions = [];

    try {
        // 1. Process Stakes (Atomic Deduction)
        if (stake > 0) {
            console.log(`💰 Processing initial stake ($${stake}) for TTT game ${gameId}`);

            for (const p of players) {
                const userBefore = await User.findById(p.userId);
                console.log(`   Player ${p.username} BEFORE stake: Balance=$${userBefore?.balance}, Reserved=$${userBefore?.reservedBalance}`);

                const user = await User.findOneAndUpdate(
                    {
                        _id: p.userId,
                        balance: { $gte: stake } // Atomic check for sufficient balance
                    },
                    {
                        $inc: {
                            balance: -stake,
                            reservedBalance: stake
                        },
                        $push: {
                            transactions: {
                                type: 'match_stake',
                                amount: -stake,
                                matchId: gameId,
                                description: `Stake for JAR game ${gameId}`,
                                timestamp: new Date()
                            }
                        }
                    },
                    { new: true }
                );

                if (!user) {
                    console.error(`❌ Insufficient funds for user ${p.username} (${p.userId})`);
                    throw new Error(`User ${p.username} has insufficient block funds`);
                }

                successfulDeductions.push(p.userId);
                console.log(`   ✅ Deduced $${stake} from ${p.username}`);
            }
        }

        // 2. Create Game Document
        const game = new TicTacToeGame({
            gameId,
            players: players.map((p, i) => ({
                userId: p.userId,
                username: p.username,
                symbol: i === 0 ? 'X' : 'O',
                socketId: null, // Will be updated when they join room
                isDisconnected: false
            })),
            board: [['', '', ''], ['', '', ''], ['', '', '']],
            currentPlayerIndex: 0,
            turnState: 'MOVING',  // Fixed: Changed from 'PLAYING' to 'MOVING'
            status: 'ACTIVE',      // Fixed: Changed from 'IN_PROGRESS' to 'ACTIVE'
            stake,
            // Three Men's Morris fields
            gamePhase: 'PLACEMENT',
            piecesPlaced: { X: 0, O: 0 },
            selectedPiece: null,
            message: `Game started! ${players[0].username}'s turn`
        });

        await game.save();
        console.log(`✅ Created TTT game ${gameId} for ${players[0].username} vs ${players[1].username}`);
        return { success: true, game };

    } catch (error) {
        console.error('Error creating TTT game:', error);

        // 3. Rollback Deductions if failed
        if (successfulDeductions.length > 0) {
            console.log('🔄 Rolling back stakes due to creation failure...');
            for (const userId of successfulDeductions) {
                await User.updateOne(
                    { _id: userId },
                    {
                        $inc: { balance: stake, reservedBalance: -stake },
                        $push: {
                            transactions: {
                                type: 'refund',
                                amount: stake,
                                matchId: gameId,
                                description: `Refund for failed TTT game creation`,
                                timestamp: new Date()
                            }
                        }
                    }
                );
            }
            console.log('✅ Rollback complete');
        }

        return { success: false, message: error.message };
    }
};

/**
 * Handle player joining game
 */
exports.handleJoinGame = async (gameId, userId, socketId) => {
    let game = await TicTacToeGame.findOne({ gameId });
    if (!game) {
        game = new TicTacToeGame({ gameId, players: [] });
    }

    if (game.status === 'CANCELLED') {
        return { success: false, message: 'Game is cancelled' };
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

    // Check if player is rejoining
    const existingPlayerIndex = game.players.findIndex(p => p.userId === userId);

    if (existingPlayerIndex !== -1) {
        // Update existing player (rejoin)
        await TicTacToeGame.updateOne(
            { gameId, "players.userId": userId },
            {
                $set: {
                    "players.$.socketId": socketId,
                    "players.$.username": username,
                    "players.$.isDisconnected": false,
                    message: `${username} reconnected!`
                }
            }
        );

        game.players[existingPlayerIndex].socketId = socketId;
        game.players[existingPlayerIndex].username = username;
        game.players[existingPlayerIndex].isDisconnected = false;
        game.message = `${username} reconnected!`;
        console.log(`✅ Player ${userId} reconnected to tic-tac-toe game ${gameId}`);

    } else if (game.players.length < 2) {
        // Add new player
        const symbol = game.players.length === 0 ? 'X' : 'O';
        const newPlayer = {
            userId,
            username,
            socketId,
            symbol,
            isDisconnected: false
        };

        if (game.isNew) {
            game.players.push(newPlayer);
            await game.save();
            console.log(`✅ Created new tic-tac-toe game ${gameId} with player ${userId} (${symbol})`);
        } else {
            await TicTacToeGame.updateOne(
                { gameId },
                { $push: { players: newPlayer } }
            );
            game.players.push(newPlayer);
            console.log(`✅ Added player ${userId} (${symbol}) to tic-tac-toe game ${gameId}`);
        }
    } else {
        return { success: false, message: 'Game is full' };
    }

    return { success: true, state: game };
};

/**
 * Handle player move (Three Men's Morris variant)
 */
exports.handleMakeMove = async (gameId, socketId, row, col) => {
    const game = await TicTacToeGame.findOne({ gameId });

    // Validation
    if (!game || game.status !== 'ACTIVE') {
        return { success: false, message: 'Game not active' };
    }

    const player = game.players.find(p => p.socketId === socketId);
    if (!player) {
        return { success: false, message: 'Player not found' };
    }

    if (game.players[game.currentPlayerIndex].userId !== player.userId) {
        return { success: false, message: 'Not your turn' };
    }

    if (row < 0 || row > 2 || col < 0 || col > 2) {
        return { success: false, message: 'Invalid cell position' };
    }

    const symbol = player.symbol;
    const gamePhase = game.gamePhase || 'PLACEMENT';

    console.log(`🎮 ${player.username} (${symbol}) move: [${row},${col}] - Phase: ${gamePhase}`);

    // ========== PLACEMENT PHASE ==========
    if (gamePhase === 'PLACEMENT') {
        // Check if cell is empty
        if (game.board[row][col] !== '') {
            return { success: false, message: 'Cell already occupied' };
        }

        // Place the piece
        game.board[row][col] = symbol;

        // Update piece count
        if (!game.piecesPlaced) game.piecesPlaced = { X: 0, O: 0 };
        game.piecesPlaced[symbol]++;

        console.log(`📍 Placed ${symbol} at [${row},${col}]. Counts: X=${game.piecesPlaced.X}, O=${game.piecesPlaced.O}`);

        // Check for win
        const winResult = checkWinner(game.board);
        if (winResult) {
            game.winner = player.userId;
            game.winningLine = winResult.line;
            game.turnState = 'GAMEOVER';
            game.status = 'COMPLETED';
            game.message = `${player.username} wins!`;
            game.updatedAt = new Date();

            // CRITICAL: Save winner to database BEFORE settlement
            await game.save();
            console.log(`✅ Winner saved to database: ${game.winner}`);

            // Process settlement with 10% rake
            const settlementData = await processGameSettlement(game);

            return { success: true, state: game, settlementData };
        }

        // Check if placement phase is complete (both players placed 3 pieces)
        if (game.piecesPlaced.X === 3 && game.piecesPlaced.O === 3) {
            game.gamePhase = 'MOVEMENT';
            game.message = `Movement phase! ${player.username === game.players[0].username ? game.players[1].username : game.players[0].username}'s turn`;
            console.log(`🔄 Switching to MOVEMENT phase`);
        } else {
            game.message = `${player.username === game.players[0].username ? game.players[1].username : game.players[0].username}'s turn`;
        }

        // Switch turn
        game.currentPlayerIndex = game.currentPlayerIndex === 0 ? 1 : 0;
        await game.save();

        return { success: true, state: game };
    }

    // ========== MOVEMENT PHASE ==========
    if (gamePhase === 'MOVEMENT') {
        const selectedPiece = game.selectedPiece;

        // Case 1: No piece selected yet - SELECT a piece
        if (!selectedPiece) {
            // Must select own piece
            if (game.board[row][col] !== symbol) {
                return { success: false, message: 'Select one of your pieces' };
            }

            // Check if this piece has any valid moves
            const adjacentCells = getAdjacentCells(game.board, row, col);
            if (adjacentCells.length === 0) {
                return { success: false, message: 'This piece cannot move (no adjacent empty cells)' };
            }

            // Select the piece
            game.selectedPiece = [row, col];
            game.message = `${player.username}: Move selected piece to an adjacent cell`;
            await game.save();

            console.log(`👆 Selected piece at [${row},${col}]`);
            return { success: true, state: game };
        }

        // Case 2: Piece already selected - MOVE it
        const [fromRow, fromCol] = selectedPiece;

        // Check if clicking same piece (deselect)
        if (fromRow === row && fromCol === col) {
            game.selectedPiece = null;
            game.message = `${player.username}'s turn`;
            await game.save();
            console.log(`❌ Deselected piece`);
            return { success: true, state: game };
        }

        // Check if clicking another own piece (switch selection)
        if (game.board[row][col] === symbol) {
            // Check if new piece has valid moves
            const adjacentCells = getAdjacentCells(game.board, row, col);
            if (adjacentCells.length === 0) {
                return { success: false, message: 'This piece cannot move (no adjacent empty cells)' };
            }

            // Switch to the new piece
            game.selectedPiece = [row, col];
            game.message = `${player.username}: Move selected piece to an adjacent cell`;
            await game.save();
            console.log(`🔄 Switched selection to piece at [${row},${col}]`);
            return { success: true, state: game };
        }

        // Validate destination is empty
        if (game.board[row][col] !== '') {
            return { success: false, message: 'Destination cell must be empty' };
        }

        // Validate adjacency
        if (!isAdjacent(selectedPiece, [row, col])) {
            return { success: false, message: 'Can only move to adjacent cells (up/down/left/right)' };
        }

        // Execute the move
        game.board[row][col] = symbol;
        game.board[fromRow][fromCol] = '';
        game.selectedPiece = null;

        console.log(`➡️ Moved ${symbol} from [${fromRow},${fromCol}] to [${row},${col}]`);

        // Check for win
        const winResult = checkWinner(game.board);
        if (winResult) {
            game.winner = player.userId;
            game.winningLine = winResult.line;
            game.turnState = 'GAMEOVER';
            game.status = 'COMPLETED';
            game.message = `${player.username} wins!`;
            game.updatedAt = new Date();

            // CRITICAL: Save winner to database BEFORE settlement
            await game.save();
            console.log(`✅ Winner saved to database: ${game.winner}`);

            // Process settlement
            const settlementData = await processGameSettlement(game);

            return { success: true, state: game, settlementData };
        }

        // Switch turn
        game.currentPlayerIndex = game.currentPlayerIndex === 0 ? 1 : 0;
        const nextPlayer = game.players[game.currentPlayerIndex];
        game.message = `${nextPlayer.username}'s turn`;
        await game.save();

        return { success: true, state: game };
    }

    return { success: false, message: 'Invalid game phase' };
};

/**
 * Handle disconnection - Simple AI takes over
 */
exports.handleDisconnect = async (gameId, socketId) => {
    try {
        const game = await TicTacToeGame.findOne({ gameId });
        if (!game) {
            console.warn(`[disconnect] Tic-tac-toe game not found: ${gameId}`);
            return null;
        }

        if (game.status === 'CANCELLED' || game.status === 'COMPLETED') {
            console.log(`[disconnect] Game ${gameId} is ${game.status}. Ignoring disconnect.`);
            return null;
        }

        const player = game.players.find(p => p.socketId === socketId);
        if (player) {
            const disconnectMessage = `${player.username} disconnected. Bot taking over...`;

            await TicTacToeGame.updateOne(
                { gameId, "players.socketId": socketId },
                {
                    $set: {
                        "players.$.isDisconnected": true,
                        "players.$.socketId": null,
                        message: disconnectMessage
                    }
                }
            );

            player.isDisconnected = true;
            player.socketId = null;
            game.message = disconnectMessage;

            console.log(`🤖 Player disconnected. Bot will take over for ${player.username} in game ${gameId}`);
        }

        return game;
    } catch (error) {
        console.error(`Error handling disconnect for tic-tac-toe game ${gameId}:`, error);
        return null;
    }
};

/**
 * Simple AI move - makes random valid move
 */
exports.makeAIMove = async (gameId) => {
    const game = await TicTacToeGame.findOne({ gameId });
    if (!game || game.status !== 'ACTIVE' || game.turnState === 'GAMEOVER') {
        return null;
    }

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer.isDisconnected) {
        return null; // Only AI moves if player is disconnected
    }

    const validMoves = getValidMoves(game.board);
    if (validMoves.length === 0) {
        return null;
    }

    // Random move
    const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];

    console.log(`🤖 AI making move for ${currentPlayer.username} at ${randomMove.row},${randomMove.col}`);

    // Execute AI move (reuse handleMakeMove logic but without socket validation)
    return exports.handleMakeMove(gameId, currentPlayer.socketId || `AI-${currentPlayer.userId}`, randomMove.row, randomMove.col);
};

// Exports
exports.processGameSettlement = processGameSettlement;
exports.processGameRefund = processGameRefund;
exports.checkWinner = checkWinner;
exports.isBoardFull = isBoardFull;
