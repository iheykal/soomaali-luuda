const mongoose = require('mongoose');
const User = require('./backend/models/User');

const MONGO_URI = 'mongodb+srv://ludo:ilyaas@ludo.1umgvpn.mongodb.net/ludo?retryWrites=true&w=majority&appName=ludo';

async function findUser() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to Atlas DB');

        const phoneInput = '252615552432';
        // Try explicit formats
        const searchQueries = [
            { phone: phoneInput },
            { phone: '+' + phoneInput },
            { username: phoneInput } // Sometimes username is the phone
        ];

        const user = await User.findOne({
            $or: searchQueries
        });

        if (user) {
            console.log('USER_FOUND_NAME:', user.username);
            console.log('USER_ID:', user._id);
        } else {
            console.log('USER_NOT_FOUND_ATLAS');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

findUser();
