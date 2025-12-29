const mongoose = require('mongoose');
const User = require('./backend/models/User');

const MONGO_URI = 'mongodb://localhost:27017/ludo-master';

async function findUser() {
    try {
        // Try without options first, common for local
        await mongoose.connect(MONGO_URI);
        console.log('Connected to Local DB');

        const phoneInput = '252615552432';
        const searchQueries = [
            { phone: phoneInput },
            { phone: '+' + phoneInput },
            { phone: new RegExp(phoneInput) }
        ];

        const user = await User.findOne({
            $or: searchQueries
        });

        if (user) {
            console.log('USER_FOUND:', user.username);
        } else {
            console.log('USER_NOT_FOUND_LOCAL');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await mongoose.disconnect();
    }
}

findUser();
