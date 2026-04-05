const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  name: { type: String, required: true },           // e.g. "Render Pro Plan"
  category: { type: String, default: 'other' }, // Free-form: predefined or custom
  amount: { type: Number, required: true, min: 0 }, // USD amount
  recurrence: {
    type: String,
    enum: ['monthly', 'yearly', 'one-time'],
    default: 'monthly'
  },
  paidAt: { type: Date, default: Date.now },        // When it was/is paid
  note: { type: String, default: '' },              // Optional note
  createdBy: { type: String, required: true },      // Admin userId who added it
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ExpenseSchema.index({ paidAt: -1 });
ExpenseSchema.index({ category: 1, paidAt: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
