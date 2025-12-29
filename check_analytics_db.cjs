const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

const GameSchema = new mongoose.Schema({}, { strict: false });
const RevenueSchema = new mongoose.Schema({
    timestamp: mongoose.Schema.Types.Mixed // Use Mixed to catch whatever is there
}, { strict: false });

const Game = mongoose.model('Game', GameSchema);
const Revenue = mongoose.model('Revenue', RevenueSchema);

if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not defined");
    process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Connected');
        try {
            const lastRev = await Revenue.findOne().sort({ _id: -1 }); // Sort by ID to get inserted last, unrelated to timestamp
            if (lastRev) {
                console.log('Last Rev ID:', lastRev._id);
                console.log('Timestamp field:', lastRev.timestamp);
                console.log('Type:', typeof lastRev.timestamp);
                if (lastRev.timestamp && lastRev.timestamp.constructor) {
                    console.log('Constructor:', lastRev.timestamp.constructor.name);
                }
            } else {
                console.log('No revenue found');
            }
        } catch (err) {
            console.error(err);
        } finally {
            mongoose.connection.close();
        }
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
