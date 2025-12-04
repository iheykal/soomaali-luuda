// Backfill script to populate gameDetails for existing revenue records
// Run this once to fix existing revenue records that don't have player/winner information

// Load environment variables from .env file
require('dotenv').config();

const mongoose = require('mongoose');
const Revenue = require('../models/Revenue');
const Game = require('../models/Game');
const User = require('../models/User');

// MongoDB connection string from environment variables (same as server.js)
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ ERROR: No MongoDB connection string found!');
    console.error('   Please set CONNECTION_URI or MONGO_URI in your .env file');
    process.exit(1);
}

async function backfillRevenueGameDetails() {
    try {
        console.log('🔄 Starting revenue gameDetails backfill...');

        // Connect to MongoDB (same as server.js)
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Find all revenue records without gameDetails
        const revenuesWithoutDetails = await Revenue.find({
            gameDetails: { $exists: false }
        });

        console.log(`📊 Found ${revenuesWithoutDetails.length} revenue records without gameDetails`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const revenue of revenuesWithoutDetails) {
            try {
                // Find the corresponding game
                const game = await Game.findOne({ gameId: revenue.gameId });

                if (!game) {
                    console.log(`⚠️  Game not found for revenue ${revenue._id} (gameId: ${revenue.gameId})`);
                    skippedCount++;
                    continue;
                }

                // Find the winner user
                const winner = await User.findById(revenue.winnerId);
                if (!winner) {
                    console.log(`⚠️  Winner not found for revenue ${revenue._id} (winnerId: ${revenue.winnerId})`);
                    skippedCount++;
                    continue;
                }

                // Find winner's color from game
                const winnerPlayer = game.players.find(p => p.userId === winner._id.toString());

                // Build gameDetails
                const gameDetails = {
                    players: game.players.map(p => ({
                        userId: p.userId,
                        username: p.username || `Player ${p.color}`,
                        color: p.color
                    })),
                    winner: {
                        userId: winner._id,
                        username: winner.username,
                        color: winnerPlayer?.color || 'unknown'
                    },
                    stake: game.stake || 0,
                    gameId: game.gameId
                };

                // Update the revenue record
                revenue.gameDetails = gameDetails;
                if (!revenue.reason) {
                    revenue.reason = `Game ${game.gameId} completed - ${winner.username} won`;
                }
                await revenue.save();

                updatedCount++;
                console.log(`✅ Updated revenue ${revenue._id} for game ${game.gameId}`);

            } catch (error) {
                console.error(`❌ Error processing revenue ${revenue._id}:`, error.message);
                skippedCount++;
            }
        }

        console.log('\n📊 Backfill Summary:');
        console.log(`   Total processed: ${revenuesWithoutDetails.length}`);
        console.log(`   Successfully updated: ${updatedCount}`);
        console.log(`   Skipped: ${skippedCount}`);
        console.log('✅ Backfill complete!');

    } catch (error) {
        console.error('❌ Backfill failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run the backfill
if (require.main === module) {
    backfillRevenueGameDetails()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = backfillRevenueGameDetails;
