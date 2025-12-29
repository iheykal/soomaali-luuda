const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

const RevenueSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    amount: Number
}, { strict: false });

const Revenue = mongoose.model('Revenue', RevenueSchema);

if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI missing");
    process.exit(1);
}

function getDateRange(timeRange) {
    const now = new Date();
    let startDate = null;

    switch (timeRange) {
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(0);
            break;
    }
    return { startDate, endDate: now };
}

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Connected');
        const { startDate, endDate } = getDateRange('30d');
        console.log(`Query Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

        try {
            const results = await Revenue.aggregate([
                {
                    $match: {
                        timestamp: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$timestamp' },
                            month: { $month: '$timestamp' },
                            day: { $dayOfMonth: '$timestamp' }
                        },
                        totalRevenue: { $sum: '$amount' },
                        gamesCount: { $sum: 1 }
                    }
                }
            ]);

            console.log('Results count:', results.length);
            console.log('Sample result:', results[0]);

            // Debug: Check if any documents match date manually
            const count = await Revenue.countDocuments({
                timestamp: { $gte: startDate, $lte: endDate }
            });
            console.log('Direct Count Check:', count);

        } catch (err) {
            console.error(err);
        } finally {
            mongoose.connection.close();
        }
    });
