const mongoose = require('mongoose');

const RevenueSchema = new mongoose.Schema({
  gameId: { type: String, required: true },
  amount: { type: Number, required: true }, // The 10% commission (rake)
  gemRevenue: { type: Number, default: 0 }, // Revenue from gem re-rolls in this game
  totalPot: { type: Number, required: true }, // Total stake from all players
  winnerId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  reason: { type: String, default: 'Game Commission' },
  gameDetails: {
    type: {
      players: [{
        userId: String,
        username: String,
        color: String
      }],
      winner: {
        userId: String,
        username: String,
        color: String
      },
      stake: Number,
      gameId: String
    },
    required: false // Optional for backwards compatibility
  }
});

// ===== INDEX OPTIMIZATION =====
// Index for revenue reports sorted by date
RevenueSchema.index({ timestamp: -1 });

// Index for finding revenue by game
RevenueSchema.index({ gameId: 1 });

module.exports = mongoose.model('Revenue', RevenueSchema);




