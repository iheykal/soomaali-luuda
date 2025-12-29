const mongoose = require('mongoose');
const User = require('./backend/models/User');

const MONGO_URI = 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function findUser() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const phoneInput = '252615552432';
        // Try different formats potentially stored
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
            console.log('FULL_USER_DETAILS:', JSON.stringify(user, null, 2));
        } else {
            console.log('USER_NOT_FOUND');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

findUser();
