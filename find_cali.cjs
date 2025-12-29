const mongoose = require('mongoose');
const User = require('./backend/models/User'); // Adjust path as needed
require('dotenv').config({ path: './backend/.env' }); // Adjust path as needed

// Fallback URI if .env fails
const MONGO_URI = process.env.CONNECTION_URI || process.env.MONGO_URI || 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function findCali() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        // Case-insensitive search for username containing 'cali'
        const users = await User.find({ username: { $regex: 'cali', $options: 'i' } });

        console.log('Found users:', users.map(u => ({
            id: u._id,
            username: u.username,
            phone: u.phone,
            role: u.role
        })));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

findCali();
