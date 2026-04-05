const path = require('path');
const mongoose = require('mongoose');

const User = require('./models/User');
const Revenue = require('./models/Revenue');

const MONGO_URI = 'mongodb+srv://ludo:ilyaas@laandhuu-online.6lc4tez.mongodb.net/ludo?appName=laandhuu-online';

async function syncGems() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        const users = await User.find({ 'transactions.type': 'gem_purchase' });
        let newRecords = 0;

        for (const user of users) {
            const gemTransactions = user.transactions.filter(t => t.type === 'gem_purchase');
            
            for (const tx of gemTransactions) {
                // Find existing revenue record for this exact transaction time (+/- 1 second)
                const txDate = new Date(tx.timestamp || tx.createdAt);
                
                const existing = await Revenue.findOne({
                    gameId: 'STORE',
                    winnerId: String(user._id),
                    timestamp: { 
                        $gte: new Date(txDate.getTime() - 1000), 
                        $lte: new Date(txDate.getTime() + 1000) 
                    }
                });

                if (!existing) {
                    let dollarAmount = 0;
                    
                    // Try to parse dollar amount from description "Purchased 150 gems package for $1.00"
                    const descMatch = tx.description?.match(/\$([0-9.]+)/);
                    if (descMatch && descMatch[1]) {
                        dollarAmount = parseFloat(descMatch[1]);
                    } else if (tx.amount) {
                         // Fallback heuristic: 1 gem = mostly ~0.008$ - 0.01$ but we can just map the packages
                         // Packages: 50 -> $0.35, 150 -> $1.00, 400 -> $2.50, 800 -> $4.50
                         if (tx.amount === 50) dollarAmount = 0.35;
                         else if (tx.amount === 150) dollarAmount = 1.00;
                         else if (tx.amount === 400) dollarAmount = 2.50;
                         else if (tx.amount === 800) dollarAmount = 4.50;
                         else dollarAmount = (tx.amount / 100); // generic fallback
                    }

                    if (dollarAmount > 0) {
                        const gemRevenueRecord = new Revenue({
                            gameId: 'STORE',
                            gameType: 'LUDO',
                            amount: 0,
                            gemRevenue: dollarAmount,
                            totalPot: 0,
                            winnerId: user._id,
                            reason: 'Premium Gem Store Purchase (Synced)',
                            timestamp: txDate
                        });
                        await gemRevenueRecord.save();
                        console.log(`✨ Synced missing gem revenue: +$${dollarAmount} for ${user.username}`);
                        newRecords++;
                    }
                }
            }
        }

        console.log(`🎉 Done! Created ${newRecords} missing Revenue records.`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

syncGems();
