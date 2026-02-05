// Migration script to award retroactive XP to existing users
// Run this once after deploying the XP system

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { awardXp, getLevelFromXp } = require('../utils/xpSystem');

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ ERROR: No MongoDB connection string found!');
    console.error('   Please set CONNECTION_URI or MONGO_URI in your .env file');
    process.exit(1);
}

async function migrateXp() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        console.log('🔍 Finding users without XP/Level data...');

        // Find users who don't have xp/level set (or have defaults)
        const users = await User.find({
            $or: [
                { xp: { $exists: false } },
                { level: { $exists: false } },
                { xp: 0, level: 1 }
            ]
        });

        console.log(`📊 Found ${users.length} users to migrate`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const user of users) {
            try {
                const stats = user.stats || {};
                const wins = stats.wins || stats.gamesWon || 0;
                const gamesPlayed = stats.gamesPlayed || 0;
                const losses = stats.gamesLost || Math.max(0, gamesPlayed - wins);

                // Calculate retroactive XP: Wins = 100 XP, Losses = 25 XP
                const retroactiveXp = (wins * 100) + (losses * 25);

                if (retroactiveXp === 0) {
                    // User has never played, skip migration
                    user.xp = 0;
                    user.level = 1;
                    await user.save();
                    skippedCount++;
                    continue;
                }

                // Award the XP (this will handle level calculation)
                const result = awardXp(user, retroactiveXp);

                // Save the user
                await user.save();

                migratedCount++;
                console.log(`✅ Migrated ${user.username}: ${retroactiveXp} XP → Level ${result.newLevel} (+${result.gemsAwarded} gems)`);

            } catch (error) {
                console.error(`❌ Error migrating user ${user._id}:`, error.message);
                skippedCount++;
            }
        }

        console.log('\n===============================================================');
        console.log('📊 MIGRATION SUMMARY');
        console.log('===============================================================');
        console.log(`✅ Successfully migrated: ${migratedCount} users`);
        console.log(`⏭️  Skipped (no games): ${skippedCount} users`);
        console.log(`🎮 Total processed: ${users.length} users`);
        console.log('===============================================================');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run if called directly
if (require.main === module) {
    migrateXp()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = migrateXp;
