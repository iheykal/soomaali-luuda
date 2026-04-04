require('dotenv').config();
const mongoose = require('mongoose');
const Revenue = require('./models/Revenue');

async function calculateProfitability() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log("Connected to database. Calculating profitability...");

        const revenueData = await Revenue.aggregate([
            {
                $group: {
                    _id: null,
                    totalCommission: { $sum: "$amount" },
                    totalGemRevenue: { $sum: "$gemRevenue" },
                    totalPotPlayed: { $sum: "$totalPot" },
                    totalGames: { $sum: 1 }
                }
            }
        ]);

        if (revenueData.length > 0) {
            const data = revenueData[0];
            console.log("\n==============================");
            console.log("      PROFITABILITY REPORT    ");
            console.log("==============================");
            console.log(`Total Games Played: ${data.totalGames}`);
            console.log(`Total Pot Size (Wagered): $${(data.totalPotPlayed || 0).toFixed(2)}`);
            console.log(`Total Commission (Platform Fee): $${(data.totalCommission || 0).toFixed(2)}`);
            console.log(`Total Gem Revenue: $${(data.totalGemRevenue || 0).toFixed(2)}`);
            console.log(`------------------------------`);
            console.log(`Total Platform Profit: $${((data.totalCommission || 0) + (data.totalGemRevenue || 0)).toFixed(2)}`);
            console.log("==============================\n");
        } else {
            console.log("No revenue data found in the database. The game has not generated any profit yet.");
        }

    } catch (error) {
        console.error("Error calculating profitability:", error);
    } finally {
        await mongoose.connection.close();
    }
}

calculateProfitability();
