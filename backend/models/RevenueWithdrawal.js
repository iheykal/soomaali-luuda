const mongoose = require('mongoose');

const RevenueWithdrawalSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  adminId: { type: String, required: true }, // User ID of the admin who withdrew
  adminName: { type: String, required: true }, // Username of the admin
  destination: { type: String, required: true }, // e.g., "Bank Transfer", "Crypto Wallet"
  reference: { type: String }, // Transaction ID or note
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['COMPLETED', 'PENDING', 'FAILED'], default: 'COMPLETED' }
});

module.exports = mongoose.model('RevenueWithdrawal', RevenueWithdrawalSchema);

