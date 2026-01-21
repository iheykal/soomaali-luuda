const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const User = require('./models/User');

async function check() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ludo';
        await mongoose.connect(mongoUri);

        console.log('--- USER DATA DIAGNOSTIC ---');
        const users = await User.find({}).limit(5);

        if (users.length === 0) {
            console.log('❌ No users found in database.');
        }

        users.forEach(u => {
            console.log(`User: ${u.username} (${u._id})`);
            console.log(`  Balance: ${u.balance} (Type: ${typeof u.balance})`);
            console.log(`  Gems: ${u.gems} (Type: ${typeof u.gems})`);
            console.log(`  Raw Object Key Balance Exist: ${Object.keys(u.toObject()).includes('balance')}`);
            console.log('---------------------------');
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

check();
