
const mongoose = require('mongoose');

const FinancialRequestSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // ID from User model
  userName: String, // Snapshot of name at request time
  shortId: { type: Number }, // Sequential ID for receipts
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL'], required: true },
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  details: String,
  timestamp: { type: Date, default: Date.now },
  adminComment: String
});

module.exports = mongoose.model('FinancialRequest', FinancialRequestSchema);
