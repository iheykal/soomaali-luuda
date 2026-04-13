const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const Revenue = require('../models/Revenue');
const FinancialRequest = require('../models/FinancialRequest');
const CashLog = require('../models/CashLog');

/**
 * GET /api/admin/analytics/today
 * Get today's analytics from 12:00 AM to current time
 * - Money flow transactions
 * - Rake earnings
 * - Total deposits
 * - Amount played from deposits
 */
router.get('/today', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || 'today';
        let startOfDay, endOfDay;
        const now = new Date();

        if (timeRange === 'yesterday') {
            startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
            endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        } else {
            // today
            startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        }

        // 1. Money Flow Transactions (all wallet credits in time range)
        // Include:
        // - approved FinancialRequest deposits
        // - direct credits recorded in User.transactions (deposit/admin_deposit)
        const todayDeposits = await FinancialRequest.aggregate([
            {
                $match: {
                    type: 'DEPOSIT',
                    status: 'APPROVED',
                    timestamp: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const todayDirectDeposits = await User.aggregate([
            { $unwind: '$transactions' },
            {
                $match: {
                    'transactions.type': { $in: ['deposit', 'admin_deposit'] },
                    $expr: {
                        $and: [
                            { $gte: ['$transactions.createdAt', startOfDay] },
                            { $lte: ['$transactions.createdAt', endOfDay] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$transactions.amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const todayWithdrawals = await FinancialRequest.aggregate([
            {
                $match: {
                    type: 'WITHDRAWAL',
                    status: 'APPROVED',
                    timestamp: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // 2. Today's Rake (Revenue from games)
        const todayRake = await Revenue.aggregate([
            {
                $match: {
                    timestamp: { $gte: startOfDay, $lte: endOfDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRake: { $sum: '$amount' },
                    totalPot: { $sum: '$totalPot' },
                    gamesCount: { $sum: 1 }
                }
            }
        ]);

        // 3. Today's Games Played
        const todayGames = await Game.aggregate([
            {
                $match: {
                    createdAt: { $gte: startOfDay, $lte: endOfDay },
                    status: { $in: ['ACTIVE', 'COMPLETED'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalGames: { $sum: 1 },
                    totalStake: { $sum: { $multiply: ['$stake', 2] } }
                }
            }
        ]);

        // Calculate metrics
        const depositsFr = todayDeposits[0] || { totalAmount: 0, count: 0 };
        const depositsDirect = todayDirectDeposits[0] || { totalAmount: 0, count: 0 };
        const deposits = {
            totalAmount: (depositsFr.totalAmount || 0) + (depositsDirect.totalAmount || 0),
            count: (depositsFr.count || 0) + (depositsDirect.count || 0)
        };
        const withdrawals = todayWithdrawals[0] || { totalAmount: 0, count: 0 };
        const rake = todayRake[0] || { totalRake: 0, totalPot: 0, gamesCount: 0 };
        const games = todayGames[0] || { totalGames: 0, totalStake: 0 };

        // Calculate how much of deposits is being played
        const depositPlayRate = deposits.totalAmount > 0
            ? (games.totalStake / deposits.totalAmount) * 100
            : 0;

        // OPTIONAL OVERRIDE:
        // Show "Total Deposits" as current unbanked EVC wallet balance (what's still in EVC now),
        // so it matches the EVC→Bank tracker without touching player balances.
        const totalBankDepositedAgg = await CashLog.aggregate([
            { $match: { type: 'bank_deposit' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const bankDepositedTotal = totalBankDepositedAgg[0]?.total || 0;

        // Compute total EVC received (all-time) using same logic as accounting summary (wallet credits only; gems excluded)
        const allTimeFrAgg = await FinancialRequest.aggregate([
            { $match: { type: 'DEPOSIT', status: 'APPROVED' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const allTimeTxAgg = await User.aggregate([
            { $unwind: '$transactions' },
            { $match: { 'transactions.type': { $in: ['deposit', 'admin_deposit'] } } },
            { $group: { _id: null, total: { $sum: '$transactions.amount' } } }
        ]);
        const totalEvcReceived = (allTimeFrAgg[0]?.total || 0) + (allTimeTxAgg[0]?.total || 0);
        const unbankedEvc = Math.max(0, totalEvcReceived - bankDepositedTotal);

        const realDepositsAmount = deposits.totalAmount; // Keep track of the real deposits
        // Override displayed deposits amount to unbanked EVC value ONLY if it's today
        // But let's actually just pass both and let the frontend decide or show both!
        if (timeRange === 'today') {
            deposits.totalAmount = unbankedEvc; 
        }

        // Calculate net money flow (Deposits - Withdrawals)
        const netFlow = realDepositsAmount - withdrawals.totalAmount;

        res.json({
            success: true,
            timeRange: 'today',
            data: {
                // Money Flow
                moneyFlow: {
                    deposits: {
                        amount: deposits.totalAmount, // This might be unbanked EVC if today, but frontend will now use realAmount
                        realAmount: realDepositsAmount,
                        count: deposits.count
                    },
                    withdrawals: {
                        amount: withdrawals.totalAmount,
                        count: withdrawals.count
                    },
                    netFlow: netFlow,
                    totalTransactions: deposits.count + withdrawals.count
                },

                // Rake Earnings
                rake: {
                    totalEarned: rake.totalRake,
                    fromGamesCount: rake.gamesCount,
                    totalPotValue: rake.totalPot
                },

                // Gameplay Activity
                gameplay: {
                    totalGames: games.totalGames,
                    totalStaked: games.totalStake,
                    depositsPlayed: games.totalStake, // Amount from deposits that went into games
                    depositsPlayedPercentage: depositPlayRate.toFixed(2),
                    rakeFromDeposits: rake.totalRake // Rake earned from deposits being played
                }
            }
        });
    } catch (error) {
        console.error('Today analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch today analytics' });
    }
});

/**
 * GET /api/admin/analytics/today/daily-registrants
 * Get users who registered and made their first deposit in the given time frame.
 */
router.get('/today/daily-registrants', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || 'today';
        let startOfRange, endOfRange;
        const now = new Date();
        
        if (timeRange && timeRange.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const tDate = new Date(timeRange);
            startOfRange = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate(), 0, 0, 0, 0);
            endOfRange = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate(), 23, 59, 59, 999);
        } else {
            switch (timeRange) {
                case 'yesterday':
                    startOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
                    endOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
                    break;
                case '7d':
                    startOfRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    endOfRange = now;
                    break;
                case '30d':
                    startOfRange = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    endOfRange = now;
                    break;
                case 'today':
                default:
                    startOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    endOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
            }
        }

        const users = await User.find({
            createdAt: { $gte: startOfRange, $lte: endOfRange }
        });

        const userIds = users.map(u => u._id);

        const depositsFr = await FinancialRequest.find({
             type: 'DEPOSIT',
             status: 'APPROVED',
             userId: { $in: userIds }
        });

        const depositedUserIds = new Set(depositsFr.map(req => req.userId));

        const dailyRegistrants = users.filter(user => {
             if (depositedUserIds.has(user._id)) return true;
             
             if (user.transactions && user.transactions.length > 0) {
                 return user.transactions.some(tx => 
                     (tx.type === 'deposit' || tx.type === 'admin_deposit')
                 );
             }
             return false;
        });

        res.json({
            success: true,
            timeRange: timeRange,
            count: dailyRegistrants.length,
            data: dailyRegistrants.map(u => ({
                id: u._id,
                username: u.username,
                phone: u.phone,
                balance: u.balance,
                joinedAt: u.createdAt
            }))
        });

    } catch (error) {
        console.error('Daily registrants error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch daily registrants' });
    }
});

module.exports = router;
