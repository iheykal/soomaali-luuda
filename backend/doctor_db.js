const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const User = require('./models/User');

async function repair() {
    console.log('🔍 Starting Database Doctor...');

    try {
        // Support multiple common env names
        const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/ludo';

        // Log URI (masking password for safety)
        const maskedUri = mongoUri.replace(/:([^:@]{1,})@/, ':****@');
        console.log(`🔌 Attempting to connect to: ${maskedUri}`);

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000 // Error out faster if can't connect
        });
        console.log('✅ Connected to MongoDB');

        const users = await User.find({});
        console.log(`📊 Found ${users.length} users. Checking for corruption...`);

        let fixedCount = 0;
        let totalIssues = 0;

        for (const user of users) {
            let hasIssue = false;

            // Check Balance
            if (user.balance === undefined || user.balance === null || isNaN(user.balance)) {
                console.log(`⚠️ User ${user.username} (${user._id}) has invalid balance: ${user.balance}. Resetting to 0.`);
                user.balance = 0;
                hasIssue = true;
            }

            // Check Gems
            if (user.gems === undefined || user.gems === null || isNaN(user.gems)) {
                console.log(`⚠️ User ${user.username} (${user._id}) has invalid gems: ${user.gems}. Initializing to 0.`);
                user.gems = 0;
                hasIssue = true;
            }

            // Check ReservedBalance
            if (user.reservedBalance === undefined || user.reservedBalance === null || isNaN(user.reservedBalance)) {
                user.reservedBalance = 0;
            }

            if (hasIssue) {
                await user.save();
                fixedCount++;
                totalIssues++;
            }
        }

        console.log('\n✨ Repair Complete!');
        console.log(`✅ Users Processed: ${users.length}`);
        console.log(`🛠️ Users Fixed: ${fixedCount}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error during repair:', error);
        process.exit(1);
    }
}

repair();
