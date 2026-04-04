const mongoose = require('mongoose');

const LoanSchema = new mongoose.Schema({
  userId: { type: String, required: true, ref: 'User' },
  username: { type: String, required: true },
  phone: { type: String },
  amount: { type: Number, required: true }, // loan amount in $
  balanceAtLoan: { type: Number }, // player's balance before the loan was given
  note: { type: String }, // optional admin note
  status: {
    type: String,
    enum: ['OUTSTANDING', 'SETTLED'],
    default: 'OUTSTANDING'
  },
  grantedBy: { type: String }, // admin username who gave the loan
  grantedByUserId: { type: String },
  grantedAt: { type: Date, default: Date.now },
  settledAt: { type: Date },
  settledBy: { type: String } // admin username who settled it
}, {
  timestamps: true
});

// Indexes for fast lookups
LoanSchema.index({ userId: 1, status: 1 });
LoanSchema.index({ status: 1, grantedAt: -1 });

module.exports = mongoose.model('Loan', LoanSchema);
