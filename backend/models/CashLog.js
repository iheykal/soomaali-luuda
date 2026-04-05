const mongoose = require('mongoose');

// Tracks real-world cash movements:
//   evc_received  → money received from players via EVC Plus
//   bank_deposit  → money moved from EVC wallet into bank account
const CashLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['evc_received', 'bank_deposit'],
    required: true
  },
  amount:    { type: Number, required: true, min: 0 },
  note:      { type: String, default: '' },        // Optional note, e.g. player name
  createdBy: { type: String, required: true },     // Admin userId
  createdAt: { type: Date, default: Date.now }
});

CashLogSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('CashLog', CashLogSchema);
