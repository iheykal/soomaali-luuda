const express = require('express');
const router = express.Router();
const User = require('./models/User');
const ReferralEarning = require('./models/ReferralEarning');
const { validateReferralCode } = require('./utils/referralUtils');

// Helper function to remove trailing slashes from URLs
const stripTrailingSlash = (url) => {
    if (!url) return url;
    return url.replace(/\/+$/, '');
};

// Middleware to authenticate user (assumed to be passed from server.js)
// You'll need to import or define authenticateToken middleware

/**
 * GET /api/referrals/stats
 * Get user's referral statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        let user = await User.findById(userId)
            .populate('referredUsers', 'username createdAt stats')
            .select('referralCode referralEarnings referredUsers');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get count of referred users
        const referredCount = user.referredUsers?.length || 0;

        // Calculate share URL - MUST use environment variable in production
        let frontendUrl = process.env.FRONTEND_URL;
        if (!frontendUrl) {
            console.error('⚠️ FRONTEND_URL not set in environment variables!');
            return res.status(500).json({ error: 'Server configuration error: FRONTEND_URL not set' });
        }

        // Remove trailing slash to prevent double slashes in URLs
        frontendUrl = stripTrailingSlash(frontendUrl);

        // Auto-generate referral code if user doesn't have one
        if (!user.referralCode) {
            console.log(`⚠️ User ${userId} has no referral code, generating one...`);
            const { generateUniqueReferralCode } = require('./utils/referralUtils');
            user.referralCode = await generateUniqueReferralCode();
            user.referralEarnings = user.referralEarnings || 0;
            user.referredUsers = user.referredUsers || [];
            await user.save();
            console.log(`✅ Generated referral code ${user.referralCode} for user ${userId}`);
        }

        const shareUrl = `${frontendUrl}/signup?ref=${user.referralCode}`;

        res.json({
            code: user.referralCode,
            shareUrl,
            totalEarnings: user.referralEarnings || 0,
            referredCount,
            referredUsers: user.referredUsers || []
        });
    } catch (error) {
        console.error('Error fetching referral stats:', error);
        res.status(500).json({ error: 'Failed to fetch referral statistics' });
    }
});

/**
 * GET /api/referrals/earnings
 * Get paginated list of referral earnings
 */
router.get('/earnings', async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const total = await ReferralEarning.countDocuments({ referrer: userId });

        // Get earnings with referred user details
        const earnings = await ReferralEarning.find({ referrer: userId })
            .populate('referred', 'username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const pages = Math.ceil(total / limit);

        res.json({
            earnings,
            pagination: {
                page,
                limit,
                total,
                pages
            }
        });
    } catch (error) {
        console.error('Error fetching referral earnings:', error);
        res.status(500).json({ error: 'Failed to fetch referral earnings' });
    }
});

/**
 * GET /api/referrals/code
 * Get just the user's referral code
 */
router.get('/code', async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        let user = await User.findById(userId).select('referralCode');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Use environment variable - no hardcoded fallback
        let frontendUrl = process.env.FRONTEND_URL;
        if (!frontendUrl) {
            console.error('⚠️ FRONTEND_URL not set in environment variables!');
            return res.status(500).json({ error: 'Server configuration error: FRONTEND_URL not set' });
        }

        // Remove trailing slash to prevent double slashes in URLs
        frontendUrl = stripTrailingSlash(frontendUrl);

        // Auto-generate referral code if user doesn't have one
        if (!user.referralCode) {
            console.log(`⚠️ User ${userId} has no referral code, generating one...`);
            const { generateUniqueReferralCode } = require('./utils/referralUtils');
            user.referralCode = await generateUniqueReferralCode();
            await user.save();
            console.log(`✅ Generated referral code ${user.referralCode} for user ${userId}`);
        }

        const shareUrl = `${frontendUrl}/signup?ref=${user.referralCode}`;

        res.json({
            code: user.referralCode,
            shareUrl
        });
    } catch (error) {
        console.error('Error fetching referral code:', error);
        res.status(500).json({ error: 'Failed to fetch referral code' });
    }
});

/**
 * POST /api/referrals/validate
 * Validate a referral code (public endpoint for signup form)
 */
router.post('/validate', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Referral code is required' });
        }

        const referrer = await validateReferralCode(code);

        if (referrer) {
            res.json({
                valid: true,
                referrerName: referrer.username
            });
        } else {
            res.json({
                valid: false,
                referrerName: null
            });
        }
    } catch (error) {
        console.error('Error validating referral code:', error);
        res.status(500).json({ error: 'Failed to validate referral code' });
    }
});

module.exports = router;
