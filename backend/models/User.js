
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  _id: String, // Explicitly define _id as String to allow frontend-generated IDs (e.g., 'u123456')
  username: { type: String, required: true, unique: true },
  phone: { type: String, sparse: true, unique: true }, // Phone number for login - sparse allows multiple nulls
  password: { type: String, required: true }, 
  email: { type: String },
  balance: { type: Number, default: 100.00 },
  reservedBalance: { type: Number, default: 0 }, // For holding bets during matches
  avatar: { type: String },
  role: { type: String, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], default: 'USER' },
  status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 }, // Kept for compatibility, 'gamesWon' is preferred
    gamesWon: { type: Number, default: 0 },
    gamesLost: { type: Number, default: 0 },
    totalWinnings: { type: Number, default: 0 },
    totalLosses: { type: Number, default: 0 },
  },
  transactions: [{
      type: {
          type: String,
          enum: ['deposit', 'withdrawal', 'game_win', 'game_loss', 'game_refund', 'match_stake', 'match_unstake']
      },
      amount: Number,
      matchId: String,
      description: String,
      createdAt: { type: Date, default: Date.now }
  }]
}, { _id: false }); // Important: Disable auto-generated ObjectId to use our String _id

module.exports = mongoose.model('User', UserSchema);
