const express = require('express');
const router = express.Router();
const FinancialRequest = require('../models/FinancialRequest');

/**
 * GET /api/public/withdrawals/testimonials
 * Get recent approved withdrawal requests for testimonials
 * Public endpoint - no authentication required
 */
router.get('/testimonials', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        // Fetch recent approved withdrawals
        const withdrawals = await FinancialRequest.find({
            type: 'WITHDRAWAL',
            status: 'APPROVED'
        })
            .sort({ processedAt: -1 })
            .limit(limit)
            .select('userName phone amount processedAt')
            .lean();

        // Mask phone numbers for privacy (show only first 3 and last 2 digits)
        const testimonials = withdrawals.map(withdrawal => {
            let maskedPhone = '';
            if (withdrawal.phone) {
                const phone = withdrawal.phone.toString();
                if (phone.length >= 5) {
                    maskedPhone = phone.substring(0, 3) + '****' + phone.substring(phone.length - 2);
                } else {
                    maskedPhone = phone.substring(0, 1) + '***';
                }
            }

            return {
                userName: withdrawal.userName || 'User',
                phone: maskedPhone,
                amount: withdrawal.amount,
                date: withdrawal.processedAt
            };
        });

        res.json({
            success: true,
            testimonials
        });
    } catch (error) {
        console.error('Testimonials fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch testimonials'
        });
    }
});

module.exports = router;
