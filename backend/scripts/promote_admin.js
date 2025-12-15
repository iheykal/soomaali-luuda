require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

const targetUserId = 'u582323';

async function promoteUser() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        console.log(`Searching for user with ID: ${targetUserId}...`);
        // Try finding by _id or custom id field if schema differs
        let user = await User.findById(targetUserId);

        // Fallback search if not found directly by ID (sometimes ID has prefix or is stored in a different field)
        if (!user) {
            console.log(`User not found by _id. Trying query...`);
            user = await User.findOne({ $or: [{ _id: targetUserId }, { userId: targetUserId }] });
        }

        if (!user) {
            console.error(`❌ User ${targetUserId} not found!`);
            process.exit(1);
        }

        console.log(`Found user: ${user.username} (Role: ${user.role})`);

        if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
            console.log(`User is already ${user.role}. No change needed.`);
        } else {
            user.role = 'ADMIN';
            await user.save();
            console.log(`✅ User ${user.username} promoted to ADMIN successfully.`);
        }

    } catch (error) {
        console.error('Error promoting user:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

promoteUser();
