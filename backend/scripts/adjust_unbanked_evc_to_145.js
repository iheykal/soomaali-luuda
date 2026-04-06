const mongoose = require('mongoose');
const CashLog = require('../models/CashLog');
const FinancialRequest = require('../models/FinancialRequest');
const User = require('../models/User');

const TARGET = 1.45;
const MONGO_URI =
  process.env.CONNECTION_URI ||
  process.env.MONGO_URI ||
  'mongodb+srv://ludo:ilyaas@laandhuu-online.6lc4tez.mongodb.net/ludo?appName=laandhuu-online';

async function main() {
  await mongoose.connect(MONGO_URI);

  const fr = await FinancialRequest.aggregate([
    { $match: { type: 'DEPOSIT', status: 'APPROVED' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const tx = await User.aggregate([
    { $unwind: '$transactions' },
    { $match: { 'transactions.type': { $in: ['deposit', 'admin_deposit'] } } },
    { $group: { _id: null, total: { $sum: '$transactions.amount' } } },
  ]);

  const bank = await CashLog.aggregate([
    { $match: { type: 'bank_deposit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const totalEvc = Number(((fr[0]?.total || 0) + (tx[0]?.total || 0)).toFixed(2));
  const bankDeposited = Number((bank[0]?.total || 0).toFixed(2));
  const currentUnbanked = Number(Math.max(0, totalEvc - bankDeposited).toFixed(2));

  const desiredBankDeposited = Number((totalEvc - TARGET).toFixed(2));
  const delta = Number((desiredBankDeposited - bankDeposited).toFixed(2));

  if (Math.abs(delta) >= 0.01) {
    await CashLog.create({
      type: 'bank_deposit',
      amount: delta,
      note: `System adjustment: set unbanked EVC to $${TARGET.toFixed(2)}`,
      createdBy: 'SYSTEM_ADJUSTMENT',
      createdAt: new Date(),
    });
  }

  const bank2 = await CashLog.aggregate([
    { $match: { type: 'bank_deposit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const bankDeposited2 = Number((bank2[0]?.total || 0).toFixed(2));
  const unbanked2 = Number(Math.max(0, totalEvc - bankDeposited2).toFixed(2));

  console.log(
    JSON.stringify(
      {
        totalEvc,
        before: { bankDeposited, unbanked: currentUnbanked },
        deltaApplied: delta,
        after: { bankDeposited: bankDeposited2, unbanked: unbanked2 },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

