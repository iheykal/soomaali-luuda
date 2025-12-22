/**
 * Migration script to add referral codes to existing users
 * Run this once to backfill referral codes for all existing users
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const { generateUniqueReferralCode } = require('../utils/referralUtils');

// Load environment variables
require('dotenv').config();

const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo-master';

async function migrateReferralCodes() {
    try {
        console.log('🔄 Starting referral code migration...');
        console.log(`🔗 Connecting to MongoDB: ${MONGO_URI}`);

        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        console.log('✅ MongoDB connected');

        // Find all users without a referral code
        const usersWithoutCode = await User.find({
            $or: [
                { referralCode: { $exists: false } },
                { referralCode: null }
            ]
        });

        console.log(`📊 Found ${usersWithoutCode.length} users without referral codes`);

        if (usersWithoutCode.length === 0) {
            console.log('✅ All users already have referral codes!');
            process.exit(0);
        }

        let successCount = 0;
        let errorCount = 0;

        for (const user of usersWithoutCode) {
            try {
                // Generate unique code
                const code = await generateUniqueReferralCode();

                // Update user
                user.referralCode = code;
                user.referralEarnings = user.referralEarnings || 0;
                user.referredUsers = user.referredUsers || [];

                await user.save();

                console.log(`✅ Generated code ${code} for user ${user.username} (${user._id})`);
                successCount++;
            } catch (error) {
                console.error(`❌ Error generating code for user ${user._id}:`, error.message);
                errorCount++;
            }
        }

        console.log(`\n📊 Migration Results:`);
        console.log(`   ✅ Success: ${successCount} users`);
        console.log(`   ❌ Errors: ${errorCount} users`);
        console.log(`\n✅ Referral code migration complete!`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run the migration
migrateReferralCodes();
