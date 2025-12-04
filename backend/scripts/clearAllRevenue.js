// Script to DELETE ALL revenue and withdrawal records
// ⚠️ WARNING: This is a DESTRUCTIVE operation and cannot be undone!
// Use with caution - this will delete ALL revenue history

// Load environment variables from .env file
require('dotenv').config();

const mongoose = require('mongoose');
const Revenue = require('../models/Revenue');
const RevenueWithdrawal = require('../models/RevenueWithdrawal');

// MongoDB connection string from environment variables
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ ERROR: No MongoDB connection string found!');
    console.error('   Please set CONNECTION_URI or MONGO_URI in your .env file');
    process.exit(1);
}

async function clearAllRevenue() {
    try {
        console.log('⚠️  WARNING: This will DELETE ALL revenue and withdrawal records!');
        console.log('🔄 Connecting to MongoDB...');

        // Connect to MongoDB
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Count existing records
        const revenueCount = await Revenue.countDocuments();
        const withdrawalCount = await RevenueWithdrawal.countDocuments();

        console.log(`\n📊 Current Records:`);
        console.log(`   Revenue entries: ${revenueCount}`);
        console.log(`   Withdrawal entries: ${withdrawalCount}`);
        console.log(`   Total to delete: ${revenueCount + withdrawalCount}`);

        // Delete all revenue records
        const revenueResult = await Revenue.deleteMany({});
        console.log(`\n🗑️  Deleted ${revenueResult.deletedCount} revenue records`);

        // Delete all withdrawal records
        const withdrawalResult = await RevenueWithdrawal.deleteMany({});
        console.log(`🗑️  Deleted ${withdrawalResult.deletedCount} withdrawal records`);

        console.log(`\n✅ All revenue data cleared successfully!`);
        console.log(`   Total deleted: ${revenueResult.deletedCount + withdrawalResult.deletedCount} records`);

    } catch (error) {
        console.error('❌ Clear operation failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Run the clear operation
if (require.main === module) {
    console.log('⚠️⚠️⚠️  DANGER ZONE  ⚠️⚠️⚠️');
    console.log('This script will permanently delete ALL revenue records!');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');

    setTimeout(() => {
        clearAllRevenue()
            .then(() => process.exit(0))
            .catch(err => {
                console.error(err);
                process.exit(1);
            });
    }, 5000);
}

module.exports = clearAllRevenue;
