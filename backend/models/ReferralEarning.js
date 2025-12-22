const mongoose = require('mongoose');

const ReferralEarningSchema = new mongoose.Schema({
    referrer: {
        type: String,
        ref: 'User',
        required: true,
        index: true
    },
    referred: {
        type: String,
        ref: 'User',
        required: true
    },
    gameId: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    platformRake: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for efficient referrer queries
ReferralEarningSchema.index({ referrer: 1, createdAt: -1 });

module.exports = mongoose.model('ReferralEarning', ReferralEarningSchema);
