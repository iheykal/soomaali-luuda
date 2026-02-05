const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    userId: String,
    username: String,
    socketId: String,
    symbol: { type: String, enum: ['X', 'O'] },
    isDisconnected: { type: Boolean, default: false }
}, { _id: false });

const TicTacToeGameSchema = new mongoose.Schema({
    gameId: { type: String, unique: true, required: true },
    gameType: { type: String, default: 'TIC_TAC_TOE' },
    players: [PlayerSchema],

    // Game State
    board: {
        type: [[String]], // 3x3 grid: [['', 'X', ''], ['O', '', 'X'], ...]
        default: [['', '', ''], ['', '', ''], ['', '', '']]
    },
    currentPlayerIndex: { type: Number, default: 0 },
    turnState: {
        type: String,
        enum: ['MOVING', 'GAMEOVER'],
        default: 'MOVING'
    },
    winner: { type: String, default: null }, // userId or 'DRAW'
    winningLine: { type: [[Number]], default: null }, // [[r1,c1], [r2,c2], [r3,c3]]
    message: String,

    // Three Men's Morris fields
    gamePhase: {
        type: String,
        enum: ['PLACEMENT', 'MOVEMENT'],
        default: 'PLACEMENT'
    },
    piecesPlaced: {
        X: { type: Number, default: 0 },
        O: { type: Number, default: 0 }
    },
    selectedPiece: { type: [Number], default: null }, // [row, col] or null

    // Financial & Status (same pattern as Ludo)
    status: {
        type: String,
        enum: ['WAITING', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
        default: 'WAITING'
    },
    stake: { type: Number, default: 0.05 }, // Fixed $0.05 per player
    settlementProcessed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    optimisticConcurrency: false,
    toJSON: { flattenMaps: true },
    toObject: { flattenMaps: true }
});

// ===== INDEX OPTIMIZATION =====
// Compound index for finding active/completed games sorted by date
TicTacToeGameSchema.index({ status: 1, createdAt: -1 });

// Compound index for finding user's active games
TicTacToeGameSchema.index({ 'players.userId': 1, status: 1 });

// TTL index: Auto-delete completed games after 7 days (shorter than Ludo since games are quick)
TicTacToeGameSchema.index(
    { createdAt: 1 },
    {
        expireAfterSeconds: 604800, // 7 days
        partialFilterExpression: { status: 'COMPLETED' }
    }
);

module.exports = mongoose.model('TicTacToeGame', TicTacToeGameSchema);
