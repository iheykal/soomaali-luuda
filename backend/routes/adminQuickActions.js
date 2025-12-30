const express = require('express');
const router = express.Router();
const User = require('../models/User');
const FinancialRequest = require('../models/FinancialRequest');
const Revenue = require('../models/Revenue'); // Optional: for logging transaction if needed

// GET /api/admin/quick/user/:userId
// Fetch user details for quick action
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // 1. Try EXACT Match first (ID or Phone)
        const exactMatch = await User.findOne({
            $or: [
                { _id: userId },
                { phone: userId }
            ]
        }).select('username phone balance avatar role');

        if (exactMatch) {
            return res.json({
                success: true,
                user: {
                    userId: exactMatch._id,
                    username: exactMatch.username,
                    phone: exactMatch.phone,
                    balance: exactMatch.balance,
                    avatar: exactMatch.avatar,
                    role: exactMatch.role
                }
            });
        }

        // 2. Try PARTIAL Match
        // Logic: Clean non-digits to handle +252, 061, etc.
        const cleanedInput = userId.replace(/\D/g, '');

        // Define what to search for
        let searchRegex;
        if (cleanedInput.length >= 5) {
            // If input has significant digits, specifically look for the last 5 digits
            // This satisfies "if 5 digits of the number match... show it"
            const last5 = cleanedInput.slice(-5);
            searchRegex = new RegExp(last5, 'i');
        } else if (userId.length >= 3) {
            // Fallback for short manual searches (names or short fragments)
            searchRegex = new RegExp(userId, 'i');
        }

        if (searchRegex) {

            // Search for partial matches using the determined regex
            const candidates = await User.find({
                phone: { $regex: searchRegex }
            })
                .select('username phone balance avatar role')
                .limit(10); // increased limit slightly to safeguard against 'last 5 digits' collisions

            if (candidates.length > 0) {
                // If exactly one match, just return it as 'user'
                if (candidates.length === 1) {
                    const match = candidates[0];
                    return res.json({
                        success: true,
                        user: {
                            userId: match._id,
                            username: match.username,
                            phone: match.phone,
                            balance: match.balance,
                            avatar: match.avatar,
                            role: match.role
                        }
                    });
                }

                // If multiple matches, return as 'matches' list
                return res.json({
                    success: true,
                    matches: candidates.map(u => ({
                        userId: u._id,
                        username: u.username,
                        phone: u.phone,
                        balance: u.balance,
                        avatar: u.avatar,
                        role: u.role
                    }))
                });
            }
        }

        // No result found
        return res.status(404).json({ success: false, error: 'User not found' });

    } catch (error) {
        console.error('Quick Action - User Lookup Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user details' });
    }
});

// POST /api/admin/quick/transaction
// Perform direct deposit or withdrawal and create a receipt record
router.post('/transaction', async (req, res) => {
    try {
        const { userId, type, amount, adminId } = req.body;

        if (!userId || !type || !amount) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (type === 'WITHDRAWAL' && user.balance < numAmount) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }

        // Get admin info for approverName
        let approverName = 'Admin';
        if (adminId) {
            const adminUser = await User.findById(adminId).select('username');
            if (adminUser) {
                approverName = adminUser.username;
            }
        }

        // Perform atomic update
        const update = type === 'DEPOSIT'
            ? { $inc: { balance: numAmount } }
            : { $inc: { balance: -numAmount } };

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            update,
            { new: true }
        );

        // Generate sequential shortId for receipt
        const lastRequest = await FinancialRequest.findOne().sort({ shortId: -1 }).select('shortId');
        const nextShortId = (lastRequest?.shortId || 1000) + 1;

        // Create FinancialRequest record for receipt generation
        const financialRequest = new FinancialRequest({
            userId: user._id.toString(),
            userName: user.username,
            shortId: nextShortId,
            type: type,
            paymentMethod: 'Quick Admin Action',
            amount: numAmount,
            status: 'APPROVED',
            details: `Quick Admin ${type} by ${approverName}`,
            timestamp: new Date(),
            adminComment: `Processed via Quick Admin Actions`,
            processedBy: adminId || 'admin',
            approverName: approverName
        });

        await financialRequest.save();
        // Log the transaction
        console.log(`[QuickAction] Admin ${adminId} (${req.user.id}) performed ${type} of $${numAmount} for user ${userId}`);

        // Emit socket event to notify user of balance update (triggers auto-refresh)
        const io = req.app.get('io');
        if (io) {
            io.to(userId).emit('balance_updated', {
                newBalance: user.balance,
                type,
                amount: numAmount,
                message: type === 'DEPOSIT' ? 'Your account has been credited' : 'Withdrawal processed'
            });
        }

        res.json({
            success: true,
            newBalance: updatedUser.balance,
            message: `${type} of $${numAmount} successful`,
            request: {
                id: financialRequest._id.toString(),
                shortId: financialRequest.shortId,
                type: financialRequest.type,
                amount: financialRequest.amount,
                status: financialRequest.status,
                timestamp: financialRequest.timestamp,
                userName: financialRequest.userName,
                approverName: financialRequest.approverName,
                userPhone: user.phone
            }
        });

    } catch (error) {
        console.error('Quick Action - Transaction Error:', error);
        res.status(500).json({ success: false, error: 'Transaction failed' });
    }
});

module.exports = router;

