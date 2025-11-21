
const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
  id: String,
  color: String,
  position: {
    type: { type: String, enum: ['YARD', 'PATH', 'HOME_PATH', 'HOME'] },
    index: Number // Index on path (0-51) or home path (0-5) or yard (0-3)
  }
}, { _id: false });

const PlayerSchema = new mongoose.Schema({
  color: String,
  userId: String, // References User ID or 'guest'
  username: String, // Store username for easy access
  socketId: String,
  isAI: { type: Boolean, default: false },
  hasFinished: { type: Boolean, default: false },
  isDisconnected: { type: Boolean, default: false }
}, { _id: false });

const GameSchema = new mongoose.Schema({
  gameId: { type: String, unique: true, required: true },
  players: [PlayerSchema],
  tokens: [TokenSchema],
  
  // Game State
  currentPlayerIndex: { type: Number, default: 0 },
  diceValue: { type: Number, default: null },
  turnState: { type: String, enum: ['ROLLING', 'MOVING', 'ANIMATING', 'GAMEOVER'], default: 'ROLLING' },
  gameStarted: { type: Boolean, default: false },
  winners: [String],
  message: String,
  
  // Legal moves calculated by server
  legalMoves: [{
    tokenId: String,
    finalPosition: {
       type: { type: String },
       index: Number
    }
  }],

  status: { type: String, enum: ['WAITING', 'ACTIVE', 'COMPLETED'], default: 'WAITING' },
  stake: { type: Number, default: 0 },
  settlementProcessed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema);
