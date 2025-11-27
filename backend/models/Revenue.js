const mongoose = require('mongoose');

const RevenueSchema = new mongoose.Schema({
  gameId: { type: String, required: true },
  amount: { type: Number, required: true }, // The 10% commission
  totalPot: { type: Number, required: true }, // Total stake from all players
  winnerId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  reason: { type: String, default: 'Game Commission' }
});

// ===== INDEX OPTIMIZATION =====
// Index for revenue reports sorted by date
RevenueSchema.index({ timestamp: -1 });

// Index for finding revenue by game
RevenueSchema.index({ gameId: 1 });

module.exports = mongoose.model('Revenue', RevenueSchema);




