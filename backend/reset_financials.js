const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const FinancialRequest = require('./models/FinancialRequest');
const Revenue = require('./models/Revenue');
const Expense = require('./models/Expense');
const CashLog = require('./models/CashLog');
const Loan = require('./models/Loan');
const ReferralEarning = require('./models/ReferralEarning');
const RevenueWithdrawal = require('./models/RevenueWithdrawal');

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://ludo:ilyaas@laandhuu-online.6lc4tez.mongodb.net/ludo?appName=laandhuu-online';

async function resetEverything() {
    console.log('🛑 STARTING FULL PLATFORM FINANCIAL RESET...');
    console.log('📦 Connecting to MongoDB...');

    try {
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB.');

        // 1. Reset Users
        console.log('👤 Resetting all user balances and transaction histories...');
        const userResult = await User.updateMany(
            {},
            {
                $set: {
                    balance: 0,
                    gems: 0,
                    reservedBalance: 0,
                    transactions: []
                }
            }
        );
        console.log(`✅ Updated ${userResult.modifiedCount} users.`);

        // 2. Wipe Financial Requests
        console.log('📑 Deleting all Financial Requests (Deposits/Withdrawals)...');
        const frResult = await FinancialRequest.deleteMany({});
        console.log(`✅ Deleted ${frResult.deletedCount} requests.`);

        // 3. Wipe Revenue
        console.log('💰 Deleting all Revenue (Rake/Gems) records...');
        const revResult = await Revenue.deleteMany({});
        console.log(`✅ Deleted ${revResult.deletedCount} revenue records.`);

        // 4. Wipe Expenses
        console.log('🧾 Deleting all Expense logs...');
        const expResult = await Expense.deleteMany({});
        console.log(`✅ Deleted ${expResult.deletedCount} expenses.`);

        // 5. Wipe Cash Logs
        console.log('📱 Deleting all EVC/Bank Cash Logs...');
        const clResult = await CashLog.deleteMany({});
        console.log(`✅ Deleted ${clResult.deletedCount} cash logs.`);

        // 6. Wipe Loans
        console.log('🏦 Deleting all Loan records...');
        const loanResult = await Loan.deleteMany({});
        console.log(`✅ Deleted ${loanResult.deletedCount} loans.`);

        // 7. Wipe Referrals
        console.log('🔗 Deleting all Referral Earning records...');
        const refResult = await ReferralEarning.deleteMany({});
        console.log(`✅ Deleted ${refResult.deletedCount} referrals.`);

        // 8. Wipe Revenue Withdrawals
        console.log('💸 Deleting all Revenue Withdrawal records...');
        const rwResult = await RevenueWithdrawal.deleteMany({});
        console.log(`✅ Deleted ${rwResult.deletedCount} revenue withdrawals.`);

        console.log('\n🎉 --- FULL RESET COMPLETE ---');
        console.log('Total Platform Balance is now $0.00');
        console.log('Everything is fresh for a new start!');

    } catch (error) {
        console.error('❌ RESET FAILED:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

resetEverything();
