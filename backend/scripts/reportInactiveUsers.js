
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI;
const INACTIVE_DAYS = process.env.INACTIVE_DAYS ? parseInt(process.env.INACTIVE_DAYS) : 30; // Default 30 days

if (!MONGO_URI) {
    console.error('❌ ERROR: No MongoDB connection string found!');
    console.error('   Please set CONNECTION_URI or MONGO_URI in your .env file');
    process.exit(1);
}

// Game related transaction types
const GAME_TRANSACTION_TYPES = [
    'game_win',
    'game_loss',
    'game_refund',
    'match_stake',
    'match_unstake',
    'gem_re_roll' // If this exists or similar
];

// Helper to format currency
const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Helper to format date
const formatDate = (date) => {
    return date ? new Date(date).toISOString().split('T')[0] : 'N/A';
};

async function findInactiveUsers() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        console.log(`🔍 Searching for users with balance > 0 who haven't played in ${INACTIVE_DAYS} days...`);

        // Find users with positive balance
        // We project specific fields to avoid loading massive transaction arrays if not needed, 
        // but here we actually NEED the transactions to check dates.
        const users = await User.find({
            balance: { $gt: 0 }
        });

        console.log(`📊 Found ${users.length} users with positive balance. Checking activity...`);

        const inactiveUsers = [];
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - (INACTIVE_DAYS * 24 * 60 * 60 * 1000));

        for (const user of users) {
            // If transactions is undefined/null, handle it
            const transactions = user.transactions || [];

            // Filter game transactions
            const gameTransactions = transactions
                .filter(t => GAME_TRANSACTION_TYPES.includes(t.type) || t.description?.toLowerCase().includes('game') || t.matchId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort desc

            const lastGameActivity = gameTransactions.length > 0 ? gameTransactions[0].createdAt : null;

            // Condition: 
            // 1. No game transactions ever (but has balance? maybe deposit/referral)
            // 2. Last game transaction is older than cutoff

            if (!lastGameActivity || new Date(lastGameActivity) < cutoffDate) {
                inactiveUsers.push({
                    username: user.username,
                    email: user.email,
                    balance: user.balance,
                    lastGameDate: lastGameActivity ? formatDate(lastGameActivity) : 'Never Played',
                    lastGameType: gameTransactions.length > 0 ? gameTransactions[0].type : 'N/A',
                    daysSinceLastGame: lastGameActivity
                        ? Math.floor((now - new Date(lastGameActivity)) / (1000 * 60 * 60 * 24))
                        : 'N/A'
                });
            }
        }

        // Output results
        console.log('\n===============================================================');
        console.log(`📉 INACTIVE USERS REPORT (> ${INACTIVE_DAYS} days idle)`);
        console.log('===============================================================');

        if (inactiveUsers.length === 0) {
            console.log('✅ No inactive users found with positive balance.');
        } else {
            // Sort by balance desc
            inactiveUsers.sort((a, b) => b.balance - a.balance);

            console.table(inactiveUsers.map(u => ({
                Username: u.username,
                Balance: formatMoney(u.balance),
                'Last Played': u.lastGameDate,
                'Days Idle': u.daysSinceLastGame
            })));

            const totalAtRisk = inactiveUsers.reduce((sum, u) => sum + u.balance, 0);
            console.log(`\n💰 Total Inactive Balance: ${formatMoney(totalAtRisk)}`);
            console.log(`👥 Count: ${inactiveUsers.length} users`);

            // Breakdown for users with balance < 0.25
            const lowBalanceUsers = inactiveUsers.filter(u => u.balance < 0.25);
            const lowBalanceTotal = lowBalanceUsers.reduce((sum, u) => sum + u.balance, 0);

            console.log('\n---------------------------------------------------------------');
            console.log(`📉 LOW BALANCE BREAKDOWN (< $0.25)`);
            console.log('---------------------------------------------------------------');
            console.log(`👥 Count: ${lowBalanceUsers.length} users`);
            console.log(`💰 Total Balance: ${formatMoney(lowBalanceTotal)}`);
        }

    } catch (error) {
        console.error('❌ Script failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run if called directly
if (require.main === module) {
    findInactiveUsers();
}

module.exports = findInactiveUsers;
